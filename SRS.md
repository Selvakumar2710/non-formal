# Software Requirements Specification (SRS)

## Clinic Management System

**Version:** 1.0  
**Type:** Small college project  
**Frontend:** HTML, CSS, JavaScript  
**Backend:** FastAPI  
**Database:** SQLite  

---

## 1. Introduction

### 1.1 Purpose

This document specifies the software requirements for a Clinic Management System. The system helps clinic staff manage patients, doctors, appointments, consultations, billing, prescriptions, and reports from a single web application.

### 1.2 Scope

The system provides:

- Staff login and logout
- A dashboard with operational summary
- CRUD operations for patients, doctors, appointments, consultations, billing, and prescriptions
- Search on list screens
- Input validation
- Reports for appointments and billing
- REST API connectivity between the frontend and FastAPI backend
- Persistent storage in SQLite

The system does **not** include pharmacy inventory, laboratory, ICU/ward management, online patient self-booking, email/SMS, or payment gateways.

### 1.3 Intended users (actors)

| Actor | Description |
|-------|-------------|
| Clinic staff (Admin) | Authenticated user who uses all modules after login |

### 1.4 Definitions

| Term | Meaning |
|------|---------|
| CRUD | Create, Read, Update, Delete |
| Staff | Logged-in clinic administrator |

---

## 2. Overall description

### 2.1 Product perspective

The product is a three-tier application:

1. Browser frontend (HTML/CSS/JS)
2. FastAPI backend (REST API + authentication)
3. SQLite database

### 2.2 Product functions

1. Authenticate staff with username and password
2. Show dashboard counts and today’s appointments
3. Maintain patient records
4. Maintain doctor records
5. Schedule and manage appointments
6. Record consultation notes
7. Create and track bills
8. Record prescriptions
9. Generate appointment and billing reports
10. Search records and validate form input

### 2.3 User characteristics

Users are clinic staff familiar with basic computer use. The interface must be simple, professional, and usable on desktop, tablet, and mobile.

### 2.4 Constraints

- Features must stay within this SRS
- Default demo account: `admin` / `admin`
- All protected APIs require a valid login token

---

## 3. Functional requirements

### FR-01 Login

The system shall allow staff to log in with a valid username and password. Invalid credentials shall show an error and deny access.

### FR-02 Logout

The system shall allow logged-in staff to log out and return to the login screen. After logout, protected screens and APIs shall be inaccessible.

### FR-03 Authentication

The system shall require authentication for the dashboard and all data modules. Unauthenticated requests shall be rejected.

### FR-04 Dashboard

The system shall display a dashboard with:

- Total patients
- Total doctors
- Today’s appointments
- Total billed amount (paid)
- Today’s appointment list

### FR-05 Patient management

The system shall allow staff to add, view, update, and delete patients. Fields: name, age, gender, phone, address.

### FR-06 Patient search

The system shall allow staff to search patients by name or phone.

### FR-07 Doctor management

The system shall allow staff to add, view, update, and delete doctors. Fields: name, specialization, phone, availability.

### FR-08 Doctor search

The system shall allow staff to search doctors by name or specialization.

### FR-09 Appointment management

The system shall allow staff to add, view, update, and delete appointments. Fields: patient, doctor, date, time, reason, status (Scheduled, Completed, Cancelled).

### FR-10 Appointment search

The system shall allow staff to search appointments by patient name, doctor name, or status.

### FR-11 Consultation management

The system shall allow staff to add, view, update, and delete consultations. Fields: patient, doctor, optional appointment, diagnosis, notes, date.

### FR-12 Billing management

The system shall allow staff to add, view, update, and delete bills. Fields: patient, amount, description, status (Unpaid, Paid), date.

### FR-13 Prescription management

The system shall allow staff to add, view, update, and delete prescriptions. Fields: patient, doctor, medicine, dosage, duration, notes, date.

### FR-14 Reports

The system shall allow staff to view reports for:

- Appointments in a date range (counts by status)
- Billing in a date range (totals by status)

### FR-15 Validation

The system shall validate required fields, numeric amounts, age range, phone format, and related record existence (patient/doctor) on the server. The frontend shall also validate before submit.

### FR-16 API connectivity

The frontend shall perform login and all CRUD, search, dashboard, and report operations through the FastAPI REST API. Data shall be stored in SQLite.

---

## 4. Non-functional requirements

### NFR-01 Usability

The UI shall be modern, professional, responsive, and easy to use, with clear navigation and no page reload when switching modules.

### NFR-02 Performance

List screens shall load from the API for typical college-project data volumes without blocking the UI.

### NFR-03 Reliability

Invalid input shall not crash the application. Errors shall be shown as messages.

### NFR-04 Security (project level)

Passwords shall be stored hashed. API access shall use a bearer token issued at login.

---

## 5. External interfaces

### 5.1 User interface

- Login page
- Application shell: sidebar, header, content area
- Modules: Dashboard, Patients, Doctors, Appointments, Consultations, Billing, Prescriptions, Reports

### 5.2 Software interfaces

- FastAPI JSON REST API under `/api`
- SQLite file database

---

## 6. Out of scope

- Pharmacy / inventory
- Laboratory tests
- Ward / ICU / bed management
- Patient self-service portal
- Email, SMS, or payment gateway
- Multi-role permissions beyond a single staff admin account
