# Functional Requirements

## Clinic Management System

Source of truth together with `SRS.md`. Implementation must not add features outside this list.

| ID | Requirement | Module |
|----|-------------|--------|
| FR-01 | Staff login with username and password; reject invalid credentials | Authentication |
| FR-02 | Staff logout; clear session and return to login | Authentication |
| FR-03 | Protect dashboard and data APIs with authentication | Authentication |
| FR-04 | Dashboard: patient count, doctor count, today's appointments, paid billing total, today's schedule | Dashboard |
| FR-05 | Patient CRUD (name, age, gender, phone, address) | Patients |
| FR-06 | Search patients by name or phone | Patients |
| FR-07 | Doctor CRUD (name, specialization, phone, availability) | Doctors |
| FR-08 | Search doctors by name or specialization | Doctors |
| FR-09 | Appointment CRUD (patient, doctor, date, time, reason, status) | Appointments |
| FR-10 | Search appointments by patient, doctor, or status | Appointments |
| FR-11 | Consultation CRUD (patient, doctor, optional appointment, diagnosis, notes, date) | Consultations |
| FR-12 | Billing CRUD (patient, amount, description, status, date) | Billing |
| FR-13 | Prescription CRUD (patient, doctor, medicine, dosage, duration, notes, date) | Prescriptions |
| FR-14 | Reports: appointments and billing by date range | Reports |
| FR-15 | Client and server validation of required and format rules | All forms |
| FR-16 | Frontend talks to FastAPI; data persisted in SQLite | Integration |

## Validation rules

| Field | Rule |
|-------|------|
| Username, password | Required; login must match a stored user |
| Patient name | Required, 2–80 characters |
| Age | Required integer 0–120 |
| Gender | Male, Female, or Other |
| Phone | 10 digits |
| Doctor name | Required, 2–80 characters |
| Specialization | Required |
| Appointment date/time | Required |
| Appointment status | Scheduled, Completed, or Cancelled |
| Bill amount | Number greater than 0 |
| Bill status | Unpaid or Paid |
| Medicine, diagnosis | Required when creating prescription / consultation |

## Default account

| Username | Password | Role |
|----------|----------|------|
| admin | admin | Staff |

## API map

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Current user |
| GET | `/api/dashboard` | Dashboard data |
| GET/POST | `/api/patients` | List (optional `q`) / create |
| GET/PUT/DELETE | `/api/patients/{id}` | Read / update / delete |
| GET/POST | `/api/doctors` | List (optional `q`) / create |
| GET/PUT/DELETE | `/api/doctors/{id}` | Read / update / delete |
| GET/POST | `/api/appointments` | List (optional `q`) / create |
| GET/PUT/DELETE | `/api/appointments/{id}` | Read / update / delete |
| GET/POST | `/api/consultations` | List / create |
| GET/PUT/DELETE | `/api/consultations/{id}` | Read / update / delete |
| GET/POST | `/api/bills` | List / create |
| GET/PUT/DELETE | `/api/bills/{id}` | Read / update / delete |
| GET/POST | `/api/prescriptions` | List / create |
| GET/PUT/DELETE | `/api/prescriptions/{id}` | Read / update / delete |
| GET | `/api/reports/appointments` | Appointment report (`from_date`, `to_date`) |
| GET | `/api/reports/billing` | Billing report (`from_date`, `to_date`) |
