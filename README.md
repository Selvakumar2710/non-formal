# Clinic Management System

Web application for clinic staff to manage patients, doctors, appointments, consultations, billing, prescriptions, and reports.

**Scope:** `SRS.md` and `REQUIREMENTS.md` are the source of truth. Features outside those documents are not included.

## Stack

- Frontend: HTML, CSS, JavaScript (`frontend/`)
- Backend: FastAPI (`backend/main.py`)
- Database: MongoDB (`mongodb://127.0.0.1:27017/clinic_db`) with SQLite test fallback

## Requirements

- Python 3.10 or later
- MongoDB Server running on `127.0.0.1:27017`
- A modern browser

## Quick Start (Windows)

Simply double click `start_backend.bat` in the project root, or run:

```bash
.\start_backend.bat
```

This starts the backend on **http://127.0.0.1:8000**, connects to MongoDB, and serves the web frontend.

You can also run the frontend via VS Code Live Server or by opening `frontend/index.html` — API requests will automatically connect to `http://127.0.0.1:8000`.

## Login Credentials

| Username | Password | Role |
|----------|----------|------|
| admin | admin | Staff / Admin |
| selvakumar | admin | Staff |

*(You can also register new staff accounts directly from the login page!)*


## What you can do

- Sign in and sign out
- View the dashboard (counts and today's schedule)
- Add, edit, delete, and search patients and doctors
- Manage appointments, consultations, bills, and prescriptions
- Generate appointment and billing reports for a date range

## API check

```bash
curl http://127.0.0.1:8000/api/health
```

Interactive docs (after login is still required for data routes): http://127.0.0.1:8000/docs

## Project layout

```text
├── SRS.md
├── REQUIREMENTS.md
├── README.md
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── script.js
└── backend/
    ├── main.py
    ├── requirements.txt
    └── clinic.db          (created automatically)
```

## Notes

- Do not open `index.html` as a local file; use the server URL so API calls work.
- Sample records are inserted only on the first database create.
- Deleting a patient or doctor fails if other records still reference them.
