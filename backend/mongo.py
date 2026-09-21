from __future__ import annotations

import hashlib
import os
import secrets
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pymongo import MongoClient, ReturnDocument
from pymongo.collection import Collection
from pymongo.database import Database

MONGO_URI = os.getenv("MONGODB_URI", "mongodb://127.0.0.1:27017")
DB_NAME = os.getenv("DATABASE_NAME", "clinic_db")

_client: Optional[MongoClient] = None
_db: Optional[Database] = None


def hash_password(password: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), b"clinic-salt", 120_000).hex()


def get_client() -> MongoClient:
    global _client
    if _client is None:
        _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=2500)
    return _client


def get_db() -> Database:
    global _db
    if _db is None:
        client = get_client()
        _db = client[DB_NAME]
    return _db


def check_connection() -> Dict[str, Any]:
    try:
        client = get_client()
        client.admin.command("ping")
        return {
            "connected": True,
            "uri": MONGO_URI,
            "database": DB_NAME,
            "error": None,
        }
    except Exception as exc:
        return {
            "connected": False,
            "uri": MONGO_URI,
            "database": DB_NAME,
            "error": str(exc),
        }


def get_next_id(seq_name: str) -> int:
    db = get_db()
    counter = db.counters.find_one_and_update(
        {"_id": seq_name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int(counter["seq"])


def init_mongo() -> None:
    db = get_db()
    # Create indexes
    db.users.create_index("username", unique=True)
    db.tokens.create_index("token", unique=True)
    db.patients.create_index("id", unique=True)
    db.doctors.create_index("id", unique=True)
    db.appointments.create_index("id", unique=True)
    db.consultations.create_index("id", unique=True)
    db.bills.create_index("id", unique=True)
    db.prescriptions.create_index("id", unique=True)

    # Seed if users collection is empty
    if db.users.count_documents({}) == 0:
        seed_mongo(db)


def seed_mongo(db: Database) -> None:
    today_str = date.today().isoformat()

    # Initialize counter sequences
    db.counters.update_one({"_id": "users"}, {"$set": {"seq": 2}}, upsert=True)
    db.counters.update_one({"_id": "patients"}, {"$set": {"seq": 3}}, upsert=True)
    db.counters.update_one({"_id": "doctors"}, {"$set": {"seq": 2}}, upsert=True)
    db.counters.update_one({"_id": "appointments"}, {"$set": {"seq": 2}}, upsert=True)
    db.counters.update_one({"_id": "consultations"}, {"$set": {"seq": 1}}, upsert=True)
    db.counters.update_one({"_id": "bills"}, {"$set": {"seq": 1}}, upsert=True)
    db.counters.update_one({"_id": "prescriptions"}, {"$set": {"seq": 1}}, upsert=True)

    # Users
    db.users.insert_many([
        {
            "id": 1,
            "username": "admin",
            "password_hash": hash_password("admin"),
            "role": "Staff",
            "created_at": datetime.now().isoformat(),
        },
        {
            "id": 2,
            "username": "selvakumar",
            "password_hash": hash_password("admin"),
            "role": "Staff",
            "created_at": datetime.now().isoformat(),
        }
    ])

    # Patients
    patients = [
        {"id": 1, "name": "Karthik Raja", "age": 32, "gender": "Male", "phone": "9876543210", "address": "12 Anna Nagar, Chennai", "created_at": datetime.now().isoformat()},
        {"id": 2, "name": "Priya Sharma", "age": 28, "gender": "Female", "phone": "9123456780", "address": "45 MG Road, Coimbatore", "created_at": datetime.now().isoformat()},
        {"id": 3, "name": "Arun Kumar", "age": 45, "gender": "Male", "phone": "9000012345", "address": "8 Cross Street, Madurai", "created_at": datetime.now().isoformat()},
    ]
    db.patients.insert_many(patients)

    # Doctors
    doctors = [
        {"id": 1, "name": "Dr. R. Ananth", "specialization": "General Medicine", "phone": "9811122233", "available": True},
        {"id": 2, "name": "Dr. S. Meena", "specialization": "Pediatrics", "phone": "9822233344", "available": True},
    ]
    db.doctors.insert_many(doctors)

    # Appointments
    appts = [
        {
            "id": 1,
            "patient_id": 1,
            "doctor_id": 1,
            "date": today_str,
            "time": "09:30",
            "reason": "Fever and cough",
            "status": "Scheduled",
        },
        {
            "id": 2,
            "patient_id": 2,
            "doctor_id": 2,
            "date": today_str,
            "time": "10:15",
            "reason": "Child checkup",
            "status": "Scheduled",
        },
    ]
    db.appointments.insert_many(appts)

    # Consultations
    db.consultations.insert_one({
        "id": 1,
        "patient_id": 3,
        "doctor_id": 1,
        "appointment_id": None,
        "diagnosis": "Hypertension follow-up",
        "notes": "Continue current medication. Review in 2 weeks.",
        "date": today_str,
    })

    # Bills
    db.bills.insert_one({
        "id": 1,
        "patient_id": 1,
        "amount": 450.0,
        "description": "Consultation fee",
        "status": "Paid",
        "date": today_str,
    })

    # Prescriptions
    db.prescriptions.insert_one({
        "id": 1,
        "patient_id": 1,
        "doctor_id": 1,
        "medicine": "Paracetamol 500mg",
        "dosage": "1 tablet twice daily",
        "duration": "5 days",
        "notes": "After food",
        "date": today_str,
    })


# --- Authentication & Users ---


def find_user_by_username(username: str) -> Optional[Dict[str, Any]]:
    db = get_db()
    return db.users.find_one({"username": username.strip()})


def find_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    db = get_db()
    return db.users.find_one({"id": user_id})


def create_user(username: str, password: str, role: str = "Staff") -> Dict[str, Any]:
    db = get_db()
    user_id = get_next_id("users")
    doc = {
        "id": user_id,
        "username": username.strip(),
        "password_hash": hash_password(password),
        "role": role.strip() or "Staff",
        "created_at": datetime.now().isoformat(),
    }
    db.users.insert_one(doc)
    return doc


def create_token(user_id: int, username: str, role: str) -> str:
    db = get_db()
    token = secrets.token_hex(32)
    db.tokens.insert_one({
        "id": get_next_id("tokens"),
        "token": token,
        "user_id": user_id,
        "username": username,
        "role": role,
        "created_at": datetime.now().isoformat(),
    })
    return token


def get_user_by_token(token: str) -> Optional[Dict[str, Any]]:
    db = get_db()
    token_doc = db.tokens.find_one({"token": token})
    if not token_doc:
        return None
    return find_user_by_id(token_doc["user_id"])


def delete_token(token: str) -> bool:
    db = get_db()
    result = db.tokens.delete_one({"token": token})
    return result.deleted_count > 0


# --- Patients ---


def list_patients(q: str = "") -> List[Dict[str, Any]]:
    db = get_db()
    query: Dict[str, Any] = {}
    if q.strip():
        regex = {"$regex": q.strip(), "$options": "i"}
        query = {"$or": [{"name": regex}, {"phone": regex}]}
    cursor = db.patients.find(query, {"_id": 0}).sort("id", -1)
    return list(cursor)


def get_patient(patient_id: int) -> Optional[Dict[str, Any]]:
    db = get_db()
    return db.patients.find_one({"id": patient_id}, {"_id": 0})


def create_patient(data: Dict[str, Any]) -> Dict[str, Any]:
    db = get_db()
    new_id = get_next_id("patients")
    doc = {
        "id": new_id,
        "name": data["name"].strip(),
        "age": int(data["age"]),
        "gender": data["gender"],
        "phone": data["phone"].strip(),
        "address": data.get("address", "").strip(),
        "created_at": datetime.now().isoformat(),
    }
    db.patients.insert_one(doc)
    doc.pop("_id", None)
    return doc


def update_patient(patient_id: int, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    db = get_db()
    update_data = {
        "name": data["name"].strip(),
        "age": int(data["age"]),
        "gender": data["gender"],
        "phone": data["phone"].strip(),
        "address": data.get("address", "").strip(),
    }
    result = db.patients.update_one({"id": patient_id}, {"$set": update_data})
    if result.matched_count == 0:
        return None
    return get_patient(patient_id)


def delete_patient(patient_id: int) -> bool:
    db = get_db()
    # Check FK constraints
    if db.appointments.count_documents({"patient_id": patient_id}) > 0:
        raise ValueError("Cannot delete patient with linked appointments")
    if db.consultations.count_documents({"patient_id": patient_id}) > 0:
        raise ValueError("Cannot delete patient with linked consultations")
    if db.bills.count_documents({"patient_id": patient_id}) > 0:
        raise ValueError("Cannot delete patient with linked bills")
    if db.prescriptions.count_documents({"patient_id": patient_id}) > 0:
        raise ValueError("Cannot delete patient with linked prescriptions")

    result = db.patients.delete_one({"id": patient_id})
    return result.deleted_count > 0


# --- Doctors ---


def list_doctors(q: str = "") -> List[Dict[str, Any]]:
    db = get_db()
    query: Dict[str, Any] = {}
    if q.strip():
        regex = {"$regex": q.strip(), "$options": "i"}
        query = {"$or": [{"name": regex}, {"specialization": regex}]}
    cursor = db.doctors.find(query, {"_id": 0}).sort("id", -1)
    return list(cursor)


def get_doctor(doctor_id: int) -> Optional[Dict[str, Any]]:
    db = get_db()
    return db.doctors.find_one({"id": doctor_id}, {"_id": 0})


def create_doctor(data: Dict[str, Any]) -> Dict[str, Any]:
    db = get_db()
    new_id = get_next_id("doctors")
    doc = {
        "id": new_id,
        "name": data["name"].strip(),
        "specialization": data["specialization"].strip(),
        "phone": data["phone"].strip(),
        "available": bool(data.get("available", True)),
    }
    db.doctors.insert_one(doc)
    doc.pop("_id", None)
    return doc


def update_doctor(doctor_id: int, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    db = get_db()
    update_data = {
        "name": data["name"].strip(),
        "specialization": data["specialization"].strip(),
        "phone": data["phone"].strip(),
        "available": bool(data.get("available", True)),
    }
    result = db.doctors.update_one({"id": doctor_id}, {"$set": update_data})
    if result.matched_count == 0:
        return None
    return get_doctor(doctor_id)


def delete_doctor(doctor_id: int) -> bool:
    db = get_db()
    if db.appointments.count_documents({"doctor_id": doctor_id}) > 0:
        raise ValueError("Cannot delete doctor with linked appointments")
    if db.consultations.count_documents({"doctor_id": doctor_id}) > 0:
        raise ValueError("Cannot delete doctor with linked consultations")
    if db.prescriptions.count_documents({"doctor_id": doctor_id}) > 0:
        raise ValueError("Cannot delete doctor with linked prescriptions")

    result = db.doctors.delete_one({"id": doctor_id})
    return result.deleted_count > 0


# --- Appointments ---


def _hydrate_appointment(doc: Dict[str, Any]) -> Dict[str, Any]:
    patient = get_patient(doc["patient_id"])
    doctor = get_doctor(doc["doctor_id"])
    return {
        "id": doc["id"],
        "patient_id": doc["patient_id"],
        "doctor_id": doc["doctor_id"],
        "patient_name": patient["name"] if patient else "",
        "doctor_name": doctor["name"] if doctor else "",
        "date": doc["date"],
        "time": doc["time"],
        "reason": doc.get("reason", ""),
        "status": doc.get("status", "Scheduled"),
    }


def list_appointments(q: str = "") -> List[Dict[str, Any]]:
    db = get_db()
    cursor = db.appointments.find({}, {"_id": 0}).sort([("date", -1), ("time", -1)])
    hydrated = [_hydrate_appointment(doc) for doc in cursor]
    if q.strip():
        needle = q.strip().lower()
        hydrated = [
            row for row in hydrated
            if needle in row["patient_name"].lower()
            or needle in row["doctor_name"].lower()
            or needle in row["status"].lower()
        ]
    return hydrated


def get_appointment(appointment_id: int) -> Optional[Dict[str, Any]]:
    db = get_db()
    doc = db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not doc:
        return None
    return _hydrate_appointment(doc)


def create_appointment(data: Dict[str, Any]) -> Dict[str, Any]:
    db = get_db()
    new_id = get_next_id("appointments")
    doc = {
        "id": new_id,
        "patient_id": int(data["patient_id"]),
        "doctor_id": int(data["doctor_id"]),
        "date": str(data["date"]),
        "time": str(data["time"]).strip(),
        "reason": str(data.get("reason", "")).strip(),
        "status": str(data.get("status", "Scheduled")).strip(),
    }
    db.appointments.insert_one(doc)
    return _hydrate_appointment(doc)


def update_appointment(appointment_id: int, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    db = get_db()
    update_data = {
        "patient_id": int(data["patient_id"]),
        "doctor_id": int(data["doctor_id"]),
        "date": str(data["date"]),
        "time": str(data["time"]).strip(),
        "reason": str(data.get("reason", "")).strip(),
        "status": str(data.get("status", "Scheduled")).strip(),
    }
    result = db.appointments.update_one({"id": appointment_id}, {"$set": update_data})
    if result.matched_count == 0:
        return None
    return get_appointment(appointment_id)


def delete_appointment(appointment_id: int) -> bool:
    db = get_db()
    result = db.appointments.delete_one({"id": appointment_id})
    return result.deleted_count > 0


# --- Consultations ---


def _hydrate_consultation(doc: Dict[str, Any]) -> Dict[str, Any]:
    patient = get_patient(doc["patient_id"])
    doctor = get_doctor(doc["doctor_id"])
    return {
        "id": doc["id"],
        "patient_id": doc["patient_id"],
        "doctor_id": doc["doctor_id"],
        "appointment_id": doc.get("appointment_id"),
        "patient_name": patient["name"] if patient else "",
        "doctor_name": doctor["name"] if doctor else "",
        "diagnosis": doc.get("diagnosis", ""),
        "notes": doc.get("notes", ""),
        "date": doc["date"],
    }


def list_consultations(q: str = "") -> List[Dict[str, Any]]:
    db = get_db()
    cursor = db.consultations.find({}, {"_id": 0}).sort([("date", -1), ("id", -1)])
    hydrated = [_hydrate_consultation(doc) for doc in cursor]
    if q.strip():
        needle = q.strip().lower()
        hydrated = [
            row for row in hydrated
            if needle in row["patient_name"].lower()
            or needle in row["doctor_name"].lower()
            or needle in row["diagnosis"].lower()
        ]
    return hydrated


def create_consultation(data: Dict[str, Any]) -> Dict[str, Any]:
    db = get_db()
    new_id = get_next_id("consultations")
    doc = {
        "id": new_id,
        "patient_id": int(data["patient_id"]),
        "doctor_id": int(data["doctor_id"]),
        "appointment_id": int(data["appointment_id"]) if data.get("appointment_id") else None,
        "diagnosis": str(data["diagnosis"]).strip(),
        "notes": str(data.get("notes", "")).strip(),
        "date": str(data["date"]),
    }
    db.consultations.insert_one(doc)
    return _hydrate_consultation(doc)


def delete_consultation(consultation_id: int) -> bool:
    db = get_db()
    result = db.consultations.delete_one({"id": consultation_id})
    return result.deleted_count > 0


# --- Bills ---


def _hydrate_bill(doc: Dict[str, Any]) -> Dict[str, Any]:
    patient = get_patient(doc["patient_id"])
    return {
        "id": doc["id"],
        "patient_id": doc["patient_id"],
        "patient_name": patient["name"] if patient else "",
        "amount": float(doc["amount"]),
        "description": doc.get("description", ""),
        "status": doc.get("status", "Unpaid"),
        "date": doc["date"],
    }


def list_bills(q: str = "") -> List[Dict[str, Any]]:
    db = get_db()
    cursor = db.bills.find({}, {"_id": 0}).sort([("date", -1), ("id", -1)])
    hydrated = [_hydrate_bill(doc) for doc in cursor]
    if q.strip():
        needle = q.strip().lower()
        hydrated = [
            row for row in hydrated
            if needle in row["patient_name"].lower()
            or needle in row["description"].lower()
            or needle in row["status"].lower()
        ]
    return hydrated


def create_bill(data: Dict[str, Any]) -> Dict[str, Any]:
    db = get_db()
    new_id = get_next_id("bills")
    doc = {
        "id": new_id,
        "patient_id": int(data["patient_id"]),
        "amount": float(data["amount"]),
        "description": str(data.get("description", "")).strip(),
        "status": str(data.get("status", "Unpaid")).strip(),
        "date": str(data["date"]),
    }
    db.bills.insert_one(doc)
    return _hydrate_bill(doc)


def pay_bill(bill_id: int) -> Optional[Dict[str, Any]]:
    db = get_db()
    result = db.bills.update_one({"id": bill_id}, {"$set": {"status": "Paid"}})
    if result.matched_count == 0:
        return None
    doc = db.bills.find_one({"id": bill_id}, {"_id": 0})
    return _hydrate_bill(doc) if doc else None


def delete_bill(bill_id: int) -> bool:
    db = get_db()
    result = db.bills.delete_one({"id": bill_id})
    return result.deleted_count > 0


# --- Prescriptions ---


def _hydrate_prescription(doc: Dict[str, Any]) -> Dict[str, Any]:
    patient = get_patient(doc["patient_id"])
    doctor = get_doctor(doc["doctor_id"])
    return {
        "id": doc["id"],
        "patient_id": doc["patient_id"],
        "doctor_id": doc["doctor_id"],
        "patient_name": patient["name"] if patient else "",
        "doctor_name": doctor["name"] if doctor else "",
        "medicine": doc.get("medicine", ""),
        "dosage": doc.get("dosage", ""),
        "duration": doc.get("duration", ""),
        "notes": doc.get("notes", ""),
        "date": doc["date"],
    }


def list_prescriptions(q: str = "") -> List[Dict[str, Any]]:
    db = get_db()
    cursor = db.prescriptions.find({}, {"_id": 0}).sort([("date", -1), ("id", -1)])
    hydrated = [_hydrate_prescription(doc) for doc in cursor]
    if q.strip():
        needle = q.strip().lower()
        hydrated = [
            row for row in hydrated
            if needle in row["patient_name"].lower()
            or needle in row["doctor_name"].lower()
            or needle in row["medicine"].lower()
        ]
    return hydrated


def create_prescription(data: Dict[str, Any]) -> Dict[str, Any]:
    db = get_db()
    new_id = get_next_id("prescriptions")
    doc = {
        "id": new_id,
        "patient_id": int(data["patient_id"]),
        "doctor_id": int(data["doctor_id"]),
        "medicine": str(data["medicine"]).strip(),
        "dosage": str(data["dosage"]).strip(),
        "duration": str(data.get("duration", "")).strip(),
        "notes": str(data.get("notes", "")).strip(),
        "date": str(data["date"]),
    }
    db.prescriptions.insert_one(doc)
    return _hydrate_prescription(doc)


def delete_prescription(prescription_id: int) -> bool:
    db = get_db()
    result = db.prescriptions.delete_one({"id": prescription_id})
    return result.deleted_count > 0


# --- Dashboard ---


def get_dashboard() -> Dict[str, Any]:
    db = get_db()
    today_str = date.today().isoformat()
    patients_count = db.patients.count_documents({})
    doctors_count = db.doctors.count_documents({})
    today_appts_count = db.appointments.count_documents({"date": today_str})

    # Total revenue from Paid bills
    revenue_pipeline = [
        {"$match": {"status": "Paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    rev_result = list(db.bills.aggregate(revenue_pipeline))
    revenue = float(rev_result[0]["total"]) if rev_result else 0.0

    # Today's schedule
    today_appts_cursor = db.appointments.find({"date": today_str}, {"_id": 0}).sort("time", 1)
    schedule = [_hydrate_appointment(doc) for doc in today_appts_cursor]

    return {
        "patients": patients_count,
        "doctors": doctors_count,
        "today_appointments": today_appts_count,
        "revenue": revenue,
        "schedule": schedule,
    }


# --- Reports ---


def report_appointments(from_date: str, to_date: str) -> Dict[str, Any]:
    db = get_db()
    cursor = db.appointments.find(
        {"date": {"$gte": from_date, "$lte": to_date}},
        {"_id": 0}
    ).sort([("date", 1), ("time", 1)])
    rows = [_hydrate_appointment(doc) for doc in cursor]

    counts = {"Scheduled": 0, "Completed": 0, "Cancelled": 0}
    for row in rows:
        st = row.get("status", "Scheduled")
        counts[st] = counts.get(st, 0) + 1

    return {
        "from_date": from_date,
        "to_date": to_date,
        "total": len(rows),
        "counts": counts,
        "rows": rows,
    }


def report_billing(from_date: str, to_date: str) -> Dict[str, Any]:
    db = get_db()
    cursor = db.bills.find(
        {"date": {"$gte": from_date, "$lte": to_date}},
        {"_id": 0}
    ).sort("date", 1)
    rows = [_hydrate_bill(doc) for doc in cursor]

    paid_total = sum(b["amount"] for b in rows if b["status"] == "Paid")
    unpaid_total = sum(b["amount"] for b in rows if b["status"] == "Unpaid")

    return {
        "from_date": from_date,
        "to_date": to_date,
        "total_bills": len(rows),
        "paid_total": float(paid_total),
        "unpaid_total": float(unpaid_total),
        "grand_total": float(paid_total + unpaid_total),
        "rows": rows,
    }
