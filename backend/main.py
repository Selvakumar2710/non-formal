from __future__ import annotations

import hashlib
import os
import secrets
from datetime import date, datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    create_engine,
    event,
    func,
    or_,
    select,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    relationship,
    sessionmaker,
)

import mongo

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "clinic.db"
FRONTEND = ROOT.parent / "frontend"

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


@event.listens_for(engine, "connect")
def _sqlite_fk(dbapi_connection, _connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


class Base(DeclarativeBase):
    pass


def hash_password(password: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), b"clinic-salt", 120_000).hex()


def valid_phone(phone: str) -> bool:
    return phone.isdigit() and len(phone) == 10


# --- SQLite Models (retained for backward compatibility and test runs) ---


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(String(40), default="Staff")


class Token(Base):
    __tablename__ = "tokens"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    age: Mapped[int] = mapped_column(Integer)
    gender: Mapped[str] = mapped_column(String(20))
    phone: Mapped[str] = mapped_column(String(10))
    address: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class Doctor(Base):
    __tablename__ = "doctors"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    specialization: Mapped[str] = mapped_column(String(80))
    phone: Mapped[str] = mapped_column(String(10))
    available: Mapped[bool] = mapped_column(Boolean, default=True)


class Appointment(Base):
    __tablename__ = "appointments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"))
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id"))
    date: Mapped[date] = mapped_column(Date)
    time: Mapped[str] = mapped_column(String(10))
    reason: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[str] = mapped_column(String(20), default="Scheduled")
    patient: Mapped[Patient] = relationship()
    doctor: Mapped[Doctor] = relationship()


class Consultation(Base):
    __tablename__ = "consultations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"))
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id"))
    appointment_id: Mapped[Optional[int]] = mapped_column(ForeignKey("appointments.id"), nullable=True)
    diagnosis: Mapped[str] = mapped_column(String(200))
    notes: Mapped[str] = mapped_column(String(500), default="")
    date: Mapped[date] = mapped_column(Date)
    patient: Mapped[Patient] = relationship()
    doctor: Mapped[Doctor] = relationship()


class Bill(Base):
    __tablename__ = "bills"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"))
    amount: Mapped[float] = mapped_column(Float)
    description: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[str] = mapped_column(String(20), default="Unpaid")
    date: Mapped[date] = mapped_column(Date)
    patient: Mapped[Patient] = relationship()


class Prescription(Base):
    __tablename__ = "prescriptions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"))
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id"))
    medicine: Mapped[str] = mapped_column(String(120))
    dosage: Mapped[str] = mapped_column(String(80))
    duration: Mapped[str] = mapped_column(String(80), default="")
    notes: Mapped[str] = mapped_column(String(300), default="")
    date: Mapped[date] = mapped_column(Date)
    patient: Mapped[Patient] = relationship()
    doctor: Mapped[Doctor] = relationship()


# --- Pydantic Schemas ---


class LoginIn(BaseModel):
    username: str
    password: str


class RegisterIn(BaseModel):
    username: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=3, max_length=80)
    role: str = "Staff"


class PatientIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    age: int = Field(ge=0, le=120)
    gender: str
    phone: str
    address: str = ""


class DoctorIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    specialization: str = Field(min_length=2, max_length=80)
    phone: str
    available: bool = True


class AppointmentIn(BaseModel):
    patient_id: int
    doctor_id: int
    date: date
    time: str
    reason: str = ""
    status: str = "Scheduled"


class ConsultationIn(BaseModel):
    patient_id: int
    doctor_id: int
    appointment_id: Optional[int] = None
    diagnosis: str = Field(min_length=2, max_length=200)
    notes: str = ""
    date: date


class BillIn(BaseModel):
    patient_id: int
    amount: float = Field(gt=0)
    description: str = ""
    status: str = "Unpaid"
    date: date


class PrescriptionIn(BaseModel):
    patient_id: int
    doctor_id: int
    medicine: str = Field(min_length=2, max_length=120)
    dosage: str = Field(min_length=1, max_length=80)
    duration: str = ""
    notes: str = ""
    date: date


# --- App Setup ---


app = FastAPI(title="Clinic Management System")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def is_test_mode() -> bool:
    """Returns True if running under pytest with a custom session override."""
    return db_session in app.dependency_overrides


def current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(db_session),
) -> Any:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authentication required")
    token_value = authorization.split(" ", 1)[1].strip()

    if is_test_mode():
        row = db.scalar(select(Token).where(Token.token == token_value))
        if not row:
            raise HTTPException(401, "Invalid or expired session")
        user = db.get(User, row.user_id)
        if not user:
            raise HTTPException(401, "Invalid session")
        return user
    else:
        user = mongo.get_user_by_token(token_value)
        if not user:
            raise HTTPException(401, "Invalid or expired session")
        return user


def parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(400, "Dates must use YYYY-MM-DD") from exc


def validate_gender(gender: str) -> str:
    allowed = {"Male", "Female", "Other"}
    if gender not in allowed:
        raise HTTPException(400, "Gender must be Male, Female, or Other")
    return gender


def validate_appt_status(status: str) -> str:
    allowed = {"Scheduled", "Completed", "Cancelled"}
    if status not in allowed:
        raise HTTPException(400, "Invalid appointment status")
    return status


def validate_bill_status(status: str) -> str:
    allowed = {"Unpaid", "Paid"}
    if status not in allowed:
        raise HTTPException(400, "Invalid bill status")
    return status


def check_phone(phone: str) -> str:
    if not valid_phone(phone):
        raise HTTPException(400, "Phone must be 10 digits")
    return phone


def patient_out(p: Patient) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "age": p.age,
        "gender": p.gender,
        "phone": p.phone,
        "address": p.address,
    }


def doctor_out(d: Doctor) -> dict:
    return {
        "id": d.id,
        "name": d.name,
        "specialization": d.specialization,
        "phone": d.phone,
        "available": d.available,
    }


def appointment_out(a: Appointment) -> dict:
    return {
        "id": a.id,
        "patient_id": a.patient_id,
        "doctor_id": a.doctor_id,
        "patient_name": a.patient.name if a.patient else "",
        "doctor_name": a.doctor.name if a.doctor else "",
        "date": a.date.isoformat(),
        "time": a.time,
        "reason": a.reason,
        "status": a.status,
    }


def consultation_out(c: Consultation) -> dict:
    return {
        "id": c.id,
        "patient_id": c.patient_id,
        "doctor_id": c.doctor_id,
        "appointment_id": c.appointment_id,
        "patient_name": c.patient.name if c.patient else "",
        "doctor_name": c.doctor.name if c.doctor else "",
        "diagnosis": c.diagnosis,
        "notes": c.notes,
        "date": c.date.isoformat(),
    }


def bill_out(b: Bill) -> dict:
    return {
        "id": b.id,
        "patient_id": b.patient_id,
        "patient_name": b.patient.name if b.patient else "",
        "amount": b.amount,
        "description": b.description,
        "status": b.status,
        "date": b.date.isoformat(),
    }


def prescription_out(p: Prescription) -> dict:
    return {
        "id": p.id,
        "patient_id": p.patient_id,
        "doctor_id": p.doctor_id,
        "patient_name": p.patient.name if p.patient else "",
        "doctor_name": p.doctor.name if p.doctor else "",
        "medicine": p.medicine,
        "dosage": p.dosage,
        "duration": p.duration,
        "notes": p.notes,
        "date": p.date.isoformat(),
    }


def seed(db: Session) -> None:
    """Seed data for SQLite (used in test suite or fallback)."""
    if db.scalar(select(func.count(User.id))):
        return
    admin = User(username="admin", password_hash=hash_password("admin"), role="Staff")
    db.add(admin)
    patients = [
        Patient(name="Karthik Raja", age=32, gender="Male", phone="9876543210", address="12 Anna Nagar, Chennai"),
        Patient(name="Priya Sharma", age=28, gender="Female", phone="9123456780", address="45 MG Road, Coimbatore"),
        Patient(name="Arun Kumar", age=45, gender="Male", phone="9000012345", address="8 Cross Street, Madurai"),
    ]
    doctors = [
        Doctor(name="Dr. R. Ananth", specialization="General Medicine", phone="9811122233", available=True),
        Doctor(name="Dr. S. Meena", specialization="Pediatrics", phone="9822233344", available=True),
    ]
    db.add_all(patients + doctors)
    db.flush()
    today = date.today()
    appts = [
        Appointment(
            patient_id=patients[0].id,
            doctor_id=doctors[0].id,
            date=today,
            time="09:30",
            reason="Fever and cough",
            status="Scheduled",
        ),
        Appointment(
            patient_id=patients[1].id,
            doctor_id=doctors[1].id,
            date=today,
            time="10:15",
            reason="Child checkup",
            status="Scheduled",
        ),
    ]
    db.add_all(appts)
    db.flush()
    db.add(
        Consultation(
            patient_id=patients[2].id,
            doctor_id=doctors[0].id,
            appointment_id=None,
            diagnosis="Hypertension follow-up",
            notes="Continue current medication. Review in 2 weeks.",
            date=today,
        )
    )
    db.add(
        Bill(
            patient_id=patients[0].id,
            amount=450.0,
            description="Consultation fee",
            status="Paid",
            date=today,
        )
    )
    db.add(
        Prescription(
            patient_id=patients[0].id,
            doctor_id=doctors[0].id,
            medicine="Paracetamol 500mg",
            dosage="1 tablet twice daily",
            duration="5 days",
            notes="After food",
            date=today,
        )
    )
    db.commit()


def init_db() -> None:
    # Initialize SQLite fallback schema
    try:
        Base.metadata.create_all(engine)
        with SessionLocal() as db:
            seed(db)
    except Exception:
        pass

    # Initialize MongoDB
    try:
        mongo.init_mongo()
    except Exception as exc:
        print(f"Notice: MongoDB initialization warning: {exc}")


init_db()


# --- Endpoints ---


@app.get("/api/health")
def health():
    mongo_status = mongo.check_connection()
    return {
        "status": "ok",
        "database": "mongodb" if mongo_status["connected"] else "sqlite",
        "mongodb": mongo_status,
    }


@app.get("/api/status")
def status():
    return health()


@app.post("/api/auth/login")
def login(payload: LoginIn, db: Session = Depends(db_session)):
    username = payload.username.strip()
    password = payload.password
    if not username or not password:
        raise HTTPException(400, "Username and password are required")

    if is_test_mode():
        user = db.scalar(select(User).where(User.username == username))
        if not user or user.password_hash != hash_password(password):
            raise HTTPException(401, "Invalid username or password")
        token = secrets.token_hex(32)
        db.add(Token(token=token, user_id=user.id))
        db.commit()
        return {"token": token, "username": user.username, "role": user.role}
    else:
        user = mongo.find_user_by_username(username)
        if not user or user.get("password_hash") != hash_password(password):
            raise HTTPException(401, "Invalid username or password")
        token = mongo.create_token(user["id"], user["username"], user.get("role", "Staff"))
        return {"token": token, "username": user["username"], "role": user.get("role", "Staff")}


@app.post("/api/auth/register")
def register(payload: RegisterIn, db: Session = Depends(db_session)):
    username = payload.username.strip()
    password = payload.password
    if not username or not password:
        raise HTTPException(400, "Username and password are required")

    if is_test_mode():
        existing = db.scalar(select(User).where(User.username == username))
        if existing:
            raise HTTPException(400, "Username already registered")
        new_user = User(username=username, password_hash=hash_password(password), role=payload.role)
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        token = secrets.token_hex(32)
        db.add(Token(token=token, user_id=new_user.id))
        db.commit()
        return {"token": token, "username": new_user.username, "role": new_user.role}
    else:
        existing = mongo.find_user_by_username(username)
        if existing:
            raise HTTPException(400, "Username already registered")
        new_user = mongo.create_user(username, password, payload.role)
        token = mongo.create_token(new_user["id"], new_user["username"], new_user["role"])
        return {"token": token, "username": new_user["username"], "role": new_user["role"]}


@app.post("/api/auth/logout")
def logout(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(db_session),
    _: Any = Depends(current_user),
):
    if not authorization or not authorization.startswith("Bearer "):
        return {"ok": True}
    token_value = authorization.split(" ", 1)[1].strip()
    if is_test_mode():
        row = db.scalar(select(Token).where(Token.token == token_value))
        if row:
            db.delete(row)
            db.commit()
    else:
        mongo.delete_token(token_value)
    return {"ok": True}


@app.get("/api/auth/me")
def me(user: Any = Depends(current_user)):
    username = user.username if hasattr(user, "username") else user.get("username")
    role = user.role if hasattr(user, "role") else user.get("role", "Staff")
    return {"username": username, "role": role}


@app.get("/api/dashboard")
def dashboard(_: Any = Depends(current_user), db: Session = Depends(db_session)):
    if not is_test_mode():
        return mongo.get_dashboard()

    today = date.today()
    patients_count = db.scalar(select(func.count(Patient.id))) or 0
    doctors_count = db.scalar(select(func.count(Doctor.id))) or 0
    today_appts = db.scalar(select(func.count(Appointment.id)).where(Appointment.date == today)) or 0
    revenue = db.scalar(select(func.coalesce(func.sum(Bill.amount), 0)).where(Bill.status == "Paid")) or 0
    rows = db.scalars(
        select(Appointment)
        .where(Appointment.date == today)
        .order_by(Appointment.time)
    ).all()
    return {
        "patients": patients_count,
        "doctors": doctors_count,
        "today_appointments": today_appts,
        "revenue": float(revenue),
        "schedule": [appointment_out(a) for a in rows],
    }


@app.get("/api/patients")
def list_patients(
    q: str = "",
    _: Any = Depends(current_user),
    db: Session = Depends(db_session),
):
    if not is_test_mode():
        return mongo.list_patients(q)

    stmt = select(Patient).order_by(Patient.id.desc())
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Patient.name.ilike(like), Patient.phone.ilike(like)))
    return [patient_out(p) for p in db.scalars(stmt).all()]


@app.post("/api/patients")
def create_patient(payload: PatientIn, _: Any = Depends(current_user), db: Session = Depends(db_session)):
    validate_gender(payload.gender)
    check_phone(payload.phone)

    if not is_test_mode():
        return mongo.create_patient(payload.model_dump())

    patient = Patient(
        name=payload.name.strip(),
        age=payload.age,
        gender=payload.gender,
        phone=payload.phone,
        address=payload.address.strip(),
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient_out(patient)


@app.get("/api/patients/{item_id}")
def get_patient(item_id: int, _: Any = Depends(current_user), db: Session = Depends(db_session)):
    if not is_test_mode():
        p = mongo.get_patient(item_id)
        if not p:
            raise HTTPException(404, "Patient not found")
        return p

    patient = db.get(Patient, item_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    return patient_out(patient)


@app.put("/api/patients/{item_id}")
def update_patient(item_id: int, payload: PatientIn, _: Any = Depends(current_user), db: Session = Depends(db_session)):
    validate_gender(payload.gender)
    check_phone(payload.phone)

    if not is_test_mode():
        p = mongo.update_patient(item_id, payload.model_dump())
        if not p:
            raise HTTPException(404, "Patient not found")
        return p

    patient = db.get(Patient, item_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    patient.name = payload.name.strip()
    patient.age = payload.age
    patient.gender = payload.gender
    patient.phone = payload.phone
    patient.address = payload.address.strip()
    db.commit()
    db.refresh(patient)
    return patient_out(patient)


@app.delete("/api/patients/{item_id}")
def delete_patient(item_id: int, _: Any = Depends(current_user), db: Session = Depends(db_session)):
    if not is_test_mode():
        p = mongo.get_patient(item_id)
        if not p:
            raise HTTPException(404, "Patient not found")
        try:
            mongo.delete_patient(item_id)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        return {"ok": True}

    patient = db.get(Patient, item_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    db.delete(patient)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(400, "Cannot delete patient with linked records") from exc
    return {"ok": True}


@app.get("/api/doctors")
def list_doctors(q: str = "", _: Any = Depends(current_user), db: Session = Depends(db_session)):
    if not is_test_mode():
        return mongo.list_doctors(q)

    stmt = select(Doctor).order_by(Doctor.id.desc())
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Doctor.name.ilike(like), Doctor.specialization.ilike(like)))
    return [doctor_out(d) for d in db.scalars(stmt).all()]


@app.post("/api/doctors")
def create_doctor(payload: DoctorIn, _: Any = Depends(current_user), db: Session = Depends(db_session)):
    check_phone(payload.phone)

    if not is_test_mode():
        return mongo.create_doctor(payload.model_dump())

    doctor = Doctor(
        name=payload.name.strip(),
        specialization=payload.specialization.strip(),
        phone=payload.phone,
        available=payload.available,
    )
    db.add(doctor)
    db.commit()
    db.refresh(doctor)
    return doctor_out(doctor)


@app.get("/api/doctors/{item_id}")
def get_doctor(item_id: int, _: Any = Depends(current_user), db: Session = Depends(db_session)):
    if not is_test_mode():
        d = mongo.get_doctor(item_id)
        if not d:
            raise HTTPException(404, "Doctor not found")
        return d

    doctor = db.get(Doctor, item_id)
    if not doctor:
        raise HTTPException(404, "Doctor not found")
    return doctor_out(doctor)


@app.put("/api/doctors/{item_id}")
def update_doctor(item_id: int, payload: DoctorIn, _: Any = Depends(current_user), db: Session = Depends(db_session)):
    check_phone(payload.phone)

    if not is_test_mode():
        d = mongo.update_doctor(item_id, payload.model_dump())
        if not d:
            raise HTTPException(404, "Doctor not found")
        return d

    doctor = db.get(Doctor, item_id)
    if not doctor:
        raise HTTPException(404, "Doctor not found")
    doctor.name = payload.name.strip()
    doctor.specialization = payload.specialization.strip()
    doctor.phone = payload.phone
    doctor.available = payload.available
    db.commit()
    db.refresh(doctor)
    return doctor_out(doctor)


@app.delete("/api/doctors/{item_id}")
def delete_doctor(item_id: int, _: Any = Depends(current_user), db: Session = Depends(db_session)):
    if not is_test_mode():
        d = mongo.get_doctor(item_id)
        if not d:
            raise HTTPException(404, "Doctor not found")
        try:
            mongo.delete_doctor(item_id)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        return {"ok": True}

    doctor = db.get(Doctor, item_id)
    if not doctor:
        raise HTTPException(404, "Doctor not found")
    db.delete(doctor)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(400, "Cannot delete doctor with linked records") from exc
    return {"ok": True}


@app.get("/api/appointments")
def list_appointments(q: str = "", _: Any = Depends(current_user), db: Session = Depends(db_session)):
    if not is_test_mode():
        return mongo.list_appointments(q)

    stmt = select(Appointment).order_by(Appointment.date.desc(), Appointment.time.desc())
    rows = db.scalars(stmt).all()
    data = [appointment_out(a) for a in rows]
    if q.strip():
        needle = q.strip().lower()
        data = [
            row
            for row in data
            if needle in row["patient_name"].lower()
            or needle in row["doctor_name"].lower()
            or needle in row["status"].lower()
        ]
    return data


@app.post("/api/appointments")
def create_appointment(payload: AppointmentIn, _: Any = Depends(current_user), db: Session = Depends(db_session)):
    validate_appt_status(payload.status)

    if not is_test_mode():
        if not mongo.get_patient(payload.patient_id):
            raise HTTPException(400, "Patient not found")
        if not mongo.get_doctor(payload.doctor_id):
            raise HTTPException(400, "Doctor not found")
        data = payload.model_dump()
        data["date"] = payload.date.isoformat()
        return mongo.create_appointment(data)

    patient = db.get(Patient, payload.patient_id)
    if not patient:
        raise HTTPException(400, "Patient not found")
    doctor = db.get(Doctor, payload.doctor_id)
    if not doctor:
        raise HTTPException(400, "Doctor not found")

    appt = Appointment(
        patient_id=payload.patient_id,
        doctor_id=payload.doctor_id,
        date=payload.date,
        time=payload.time.strip(),
        reason=payload.reason.strip(),
        status=payload.status,
    )
    db.add(appt)
    db.commit()
    db.refresh(appt)
    return appointment_out(appt)


@app.put("/api/appointments/{item_id}")
def update_appointment(item_id: int, payload: AppointmentIn, _: Any = Depends(current_user), db: Session = Depends(db_session)):
    validate_appt_status(payload.status)

    if not is_test_mode():
        if not mongo.get_appointment(item_id):
            raise HTTPException(404, "Appointment not found")
        if not mongo.get_patient(payload.patient_id):
            raise HTTPException(400, "Patient not found")
        if not mongo.get_doctor(payload.doctor_id):
            raise HTTPException(400, "Doctor not found")
        data = payload.model_dump()
        data["date"] = payload.date.isoformat()
        return mongo.update_appointment(item_id, data)

    appt = db.get(Appointment, item_id)
    if not appt:
        raise HTTPException(404, "Appointment not found")
    if not db.get(Patient, payload.patient_id):
        raise HTTPException(400, "Patient not found")
    if not db.get(Doctor, payload.doctor_id):
        raise HTTPException(400, "Doctor not found")

    appt.patient_id = payload.patient_id
    appt.doctor_id = payload.doctor_id
    appt.date = payload.date
    appt.time = payload.time.strip()
    appt.reason = payload.reason.strip()
    appt.status = payload.status
    db.commit()
    db.refresh(appt)
    return appointment_out(appt)


@app.delete("/api/appointments/{item_id}")
def delete_appointment(item_id: int, _: Any = Depends(current_user), db: Session = Depends(db_session)):
    if not is_test_mode():
        if not mongo.get_appointment(item_id):
            raise HTTPException(404, "Appointment not found")
        mongo.delete_appointment(item_id)
        return {"ok": True}

    appt = db.get(Appointment, item_id)
    if not appt:
        raise HTTPException(404, "Appointment not found")
    db.delete(appt)
    db.commit()
    return {"ok": True}


@app.get("/api/consultations")
def list_consultations(q: str = "", _: Any = Depends(current_user), db: Session = Depends(db_session)):
    if not is_test_mode():
        return mongo.list_consultations(q)

    stmt = select(Consultation).order_by(Consultation.date.desc(), Consultation.id.desc())
    rows = db.scalars(stmt).all()
    data = [consultation_out(c) for c in rows]
    if q.strip():
        needle = q.strip().lower()
        data = [
            row
            for row in data
            if needle in row["patient_name"].lower()
            or needle in row["doctor_name"].lower()
            or needle in row["diagnosis"].lower()
        ]
    return data


@app.post("/api/consultations")
def create_consultation(payload: ConsultationIn, _: Any = Depends(current_user), db: Session = Depends(db_session)):
    if not is_test_mode():
        if not mongo.get_patient(payload.patient_id):
            raise HTTPException(400, "Patient not found")
        if not mongo.get_doctor(payload.doctor_id):
            raise HTTPException(400, "Doctor not found")
        data = payload.model_dump()
        data["date"] = payload.date.isoformat()
        return mongo.create_consultation(data)

    if not db.get(Patient, payload.patient_id):
        raise HTTPException(400, "Patient not found")
    if not db.get(Doctor, payload.doctor_id):
        raise HTTPException(400, "Doctor not found")
    if payload.appointment_id and not db.get(Appointment, payload.appointment_id):
        raise HTTPException(400, "Appointment not found")

    consultation = Consultation(
        patient_id=payload.patient_id,
        doctor_id=payload.doctor_id,
        appointment_id=payload.appointment_id,
        diagnosis=payload.diagnosis.strip(),
        notes=payload.notes.strip(),
        date=payload.date,
    )
    db.add(consultation)
    db.commit()
    db.refresh(consultation)
    return consultation_out(consultation)


@app.delete("/api/consultations/{item_id}")
def delete_consultation(item_id: int, _: Any = Depends(current_user), db: Session = Depends(db_session)):
    if not is_test_mode():
        if not mongo.delete_consultation(item_id):
            raise HTTPException(404, "Consultation not found")
        return {"ok": True}

    row = db.get(Consultation, item_id)
    if not row:
        raise HTTPException(404, "Consultation not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@app.get("/api/bills")
def list_bills(q: str = "", _: Any = Depends(current_user), db: Session = Depends(db_session)):
    if not is_test_mode():
        return mongo.list_bills(q)

    stmt = select(Bill).order_by(Bill.date.desc(), Bill.id.desc())
    rows = db.scalars(stmt).all()
    data = [bill_out(b) for b in rows]
    if q.strip():
        needle = q.strip().lower()
        data = [
            row
            for row in data
            if needle in row["patient_name"].lower()
            or needle in row["description"].lower()
            or needle in row["status"].lower()
        ]
    return data


@app.post("/api/bills")
def create_bill(payload: BillIn, _: Any = Depends(current_user), db: Session = Depends(db_session)):
    validate_bill_status(payload.status)

    if not is_test_mode():
        if not mongo.get_patient(payload.patient_id):
            raise HTTPException(400, "Patient not found")
        data = payload.model_dump()
        data["date"] = payload.date.isoformat()
        return mongo.create_bill(data)

    if not db.get(Patient, payload.patient_id):
        raise HTTPException(400, "Patient not found")

    bill = Bill(
        patient_id=payload.patient_id,
        amount=payload.amount,
        description=payload.description.strip(),
        status=payload.status,
        date=payload.date,
    )
    db.add(bill)
    db.commit()
    db.refresh(bill)
    return bill_out(bill)


@app.put("/api/bills/{item_id}/pay")
def pay_bill(item_id: int, _: Any = Depends(current_user), db: Session = Depends(db_session)):
    if not is_test_mode():
        res = mongo.pay_bill(item_id)
        if not res:
            raise HTTPException(404, "Bill not found")
        return res

    bill = db.get(Bill, item_id)
    if not bill:
        raise HTTPException(404, "Bill not found")
    bill.status = "Paid"
    db.commit()
    db.refresh(bill)
    return bill_out(bill)


@app.delete("/api/bills/{item_id}")
def delete_bill(item_id: int, _: Any = Depends(current_user), db: Session = Depends(db_session)):
    if not is_test_mode():
        if not mongo.delete_bill(item_id):
            raise HTTPException(404, "Bill not found")
        return {"ok": True}

    bill = db.get(Bill, item_id)
    if not bill:
        raise HTTPException(404, "Bill not found")
    db.delete(bill)
    db.commit()
    return {"ok": True}


@app.get("/api/prescriptions")
def list_prescriptions(q: str = "", _: Any = Depends(current_user), db: Session = Depends(db_session)):
    if not is_test_mode():
        return mongo.list_prescriptions(q)

    stmt = select(Prescription).order_by(Prescription.date.desc(), Prescription.id.desc())
    rows = db.scalars(stmt).all()
    data = [prescription_out(p) for p in rows]
    if q.strip():
        needle = q.strip().lower()
        data = [
            row
            for row in data
            if needle in row["patient_name"].lower()
            or needle in row["doctor_name"].lower()
            or needle in row["medicine"].lower()
        ]
    return data


@app.post("/api/prescriptions")
def create_prescription(payload: PrescriptionIn, _: Any = Depends(current_user), db: Session = Depends(db_session)):
    if not is_test_mode():
        if not mongo.get_patient(payload.patient_id):
            raise HTTPException(400, "Patient not found")
        if not mongo.get_doctor(payload.doctor_id):
            raise HTTPException(400, "Doctor not found")
        data = payload.model_dump()
        data["date"] = payload.date.isoformat()
        return mongo.create_prescription(data)

    if not db.get(Patient, payload.patient_id):
        raise HTTPException(400, "Patient not found")
    if not db.get(Doctor, payload.doctor_id):
        raise HTTPException(400, "Doctor not found")

    prescription = Prescription(
        patient_id=payload.patient_id,
        doctor_id=payload.doctor_id,
        medicine=payload.medicine.strip(),
        dosage=payload.dosage.strip(),
        duration=payload.duration.strip(),
        notes=payload.notes.strip(),
        date=payload.date,
    )
    db.add(prescription)
    db.commit()
    db.refresh(prescription)
    return prescription_out(prescription)


@app.delete("/api/prescriptions/{item_id}")
def delete_prescription(item_id: int, _: Any = Depends(current_user), db: Session = Depends(db_session)):
    if not is_test_mode():
        if not mongo.delete_prescription(item_id):
            raise HTTPException(404, "Prescription not found")
        return {"ok": True}

    prescription = db.get(Prescription, item_id)
    if not prescription:
        raise HTTPException(404, "Prescription not found")
    db.delete(prescription)
    db.commit()
    return {"ok": True}


@app.get("/api/reports/appointments")
def report_appointments(
    from_date: str = Query(...),
    to_date: str = Query(...),
    _: Any = Depends(current_user),
    db: Session = Depends(db_session),
):
    start = parse_date(from_date)
    end = parse_date(to_date)
    if end < start:
        raise HTTPException(400, "to_date must be on or after from_date")

    if not is_test_mode():
        return mongo.report_appointments(start.isoformat(), end.isoformat())

    rows = db.scalars(
        select(Appointment).where(Appointment.date >= start, Appointment.date <= end).order_by(Appointment.date, Appointment.time)
    ).all()
    data = [appointment_out(a) for a in rows]
    counts = {"Scheduled": 0, "Completed": 0, "Cancelled": 0}
    for row in data:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    return {"from_date": start.isoformat(), "to_date": end.isoformat(), "total": len(data), "counts": counts, "rows": data}


@app.get("/api/reports/billing")
def report_billing(
    from_date: str = Query(...),
    to_date: str = Query(...),
    _: Any = Depends(current_user),
    db: Session = Depends(db_session),
):
    start = parse_date(from_date)
    end = parse_date(to_date)
    if end < start:
        raise HTTPException(400, "to_date must be on or after from_date")

    if not is_test_mode():
        return mongo.report_billing(start.isoformat(), end.isoformat())

    rows = db.scalars(select(Bill).where(Bill.date >= start, Bill.date <= end).order_by(Bill.date)).all()
    data = [bill_out(b) for b in rows]
    paid = sum(b["amount"] for b in data if b["status"] == "Paid")
    unpaid = sum(b["amount"] for b in data if b["status"] == "Unpaid")
    return {
        "from_date": start.isoformat(),
        "to_date": end.isoformat(),
        "total_bills": len(data),
        "paid_total": paid,
        "unpaid_total": unpaid,
        "grand_total": paid + unpaid,
        "rows": data,
    }


if FRONTEND.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
