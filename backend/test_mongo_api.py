from datetime import date
from fastapi.testclient import TestClient
import main
from main import app

client = TestClient(app)


def test_mongo_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["database"] == "mongodb"
    assert body["mongodb"]["connected"] is True


def test_mongo_login_admin():
    res = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert res.status_code == 200, res.text
    data = res.json()
    assert "token" in data
    assert data["username"] == "admin"
    assert data["role"] == "Staff"

    token = data["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Test me
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["username"] == "admin"

    # Test dashboard from mongo
    dash = client.get("/api/dashboard", headers=headers)
    assert dash.status_code == 200
    dash_data = dash.json()
    assert dash_data["patients"] >= 3
    assert dash_data["doctors"] >= 2


def test_mongo_register_and_login():
    import uuid
    new_user = f"user_{uuid.uuid4().hex[:6]}"
    reg = client.post("/api/auth/register", json={"username": new_user, "password": "password123", "role": "Staff"})
    assert reg.status_code == 200, reg.text
    data = reg.json()
    assert data["username"] == new_user

    # Login with new user
    login_res = client.post("/api/auth/login", json={"username": new_user, "password": "password123"})
    assert login_res.status_code == 200
    assert login_res.json()["username"] == new_user
