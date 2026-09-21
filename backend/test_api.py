from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import Base, app, db_session, seed

# Isolated in-memory SQLite database for testing - prevents polluting clinic.db
TEST_DB_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)


@event.listens_for(test_engine, "connect")
def _sqlite_fk(dbapi_connection, _connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


# Initialize schema and seed default data in the in-memory test database
Base.metadata.create_all(test_engine)
with TestingSessionLocal() as session:
    seed(session)


def override_db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[db_session] = override_db_session

client = TestClient(app)


def login():
    res = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert res.status_code == 200, res.text
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_login_and_protected_routes():
    bad = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert bad.status_code == 401
    assert client.get("/api/patients").status_code == 401
    headers = login()
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["username"] == "admin"


def test_crud_search_dashboard_reports():
    headers = login()
    dash = client.get("/api/dashboard", headers=headers)
    assert dash.status_code == 200
    body = dash.json()
    assert "patients" in body and "schedule" in body

    created = client.post(
        "/api/patients",
        headers=headers,
        json={"name": "Test Patient", "age": 21, "gender": "Female", "phone": "9998887776", "address": "Test"},
    )
    assert created.status_code == 200, created.text
    pid = created.json()["id"]

    search = client.get("/api/patients", headers=headers, params={"q": "Test Patient"})
    assert search.status_code == 200
    assert any(row["id"] == pid for row in search.json())

    invalid = client.post(
        "/api/patients",
        headers=headers,
        json={"name": "X", "age": 200, "gender": "Male", "phone": "123", "address": ""},
    )
    assert invalid.status_code == 422

    doctors = client.get("/api/doctors", headers=headers).json()
    assert doctors
    did = doctors[0]["id"]
    today = date.today().isoformat()
    appt = client.post(
        "/api/appointments",
        headers=headers,
        json={
            "patient_id": pid,
            "doctor_id": did,
            "date": today,
            "time": "11:00",
            "reason": "Review",
            "status": "Scheduled",
        },
    )
    assert appt.status_code == 200, appt.text

    report = client.get(
        "/api/reports/appointments",
        headers=headers,
        params={"from_date": today, "to_date": today},
    )
    assert report.status_code == 200
    assert report.json()["total"] >= 1

    billing = client.get(
        "/api/reports/billing",
        headers=headers,
        params={"from_date": today, "to_date": today},
    )
    assert billing.status_code == 200

    updated = client.put(
        f"/api/patients/{pid}",
        headers=headers,
        json={"name": "Test Patient", "age": 22, "gender": "Female", "phone": "9998887776", "address": "Updated"},
    )
    assert updated.status_code == 200
    assert updated.json()["age"] == 22

    # Doctor CRUD & search
    doc_res = client.post(
        "/api/doctors",
        headers=headers,
        json={"name": "Dr. Test Specialist", "specialization": "Neurology", "phone": "9876501234", "available": True},
    )
    assert doc_res.status_code == 200
    doc_id = doc_res.json()["id"]

    doc_search = client.get("/api/doctors", headers=headers, params={"q": "Neurology"})
    assert doc_search.status_code == 200
    assert any(d["id"] == doc_id for d in doc_search.json())

    # Consultation CRUD
    consult = client.post(
        "/api/consultations",
        headers=headers,
        json={
            "patient_id": pid,
            "doctor_id": did,
            "appointment_id": appt.json()["id"],
            "diagnosis": "Seasonal Allergy",
            "notes": "Prescribed antihistamines",
            "date": today,
        },
    )
    assert consult.status_code == 200
    cid = consult.json()["id"]

    # Bill CRUD
    bill = client.post(
        "/api/bills",
        headers=headers,
        json={"patient_id": pid, "amount": 600.0, "description": "Consultation", "status": "Paid", "date": today},
    )
    assert bill.status_code == 200
    bid = bill.json()["id"]

    # Prescription CRUD
    rx = client.post(
        "/api/prescriptions",
        headers=headers,
        json={
            "patient_id": pid,
            "doctor_id": did,
            "medicine": "Cetirizine 10mg",
            "dosage": "1 tablet daily",
            "duration": "7 days",
            "notes": "At night",
            "date": today,
        },
    )
    assert rx.status_code == 200
    rx_id = rx.json()["id"]

    # Deletions of child records
    assert client.delete(f"/api/prescriptions/{rx_id}", headers=headers).status_code == 200
    assert client.delete(f"/api/bills/{bid}", headers=headers).status_code == 200
    assert client.delete(f"/api/consultations/{cid}", headers=headers).status_code == 200

    frontend = client.get("/")
    assert frontend.status_code == 200
    assert "Clinic Management System" in frontend.text


def test_logout():
    headers = login()
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200

    logout_res = client.post("/api/auth/logout", headers=headers)
    assert logout_res.status_code == 200

    me_after = client.get("/api/auth/me", headers=headers)
    assert me_after.status_code == 401
