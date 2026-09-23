-- Supabase PostgreSQL Schema for Clinic Management System
-- Conforms strictly to SRS.md and REQUIREMENTS.md

-- 1. Users table (Staff & Admin Credentials)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(80) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) DEFAULT 'Staff' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. Patients table
CREATE TABLE IF NOT EXISTS patients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(80) NOT NULL CHECK (char_length(trim(name)) >= 2),
    age INT NOT NULL CHECK (age >= 0 AND age <= 120),
    gender VARCHAR(20) NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
    phone VARCHAR(20) NOT NULL CHECK (phone ~ '^[0-9]{10}$'),
    address TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. Doctors table
CREATE TABLE IF NOT EXISTS doctors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(80) NOT NULL CHECK (char_length(trim(name)) >= 2),
    specialization VARCHAR(100) NOT NULL CHECK (char_length(trim(specialization)) >= 2),
    phone VARCHAR(20) NOT NULL CHECK (phone ~ '^[0-9]{10}$'),
    available BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 4. Appointments table
CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    patient_id INT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    doctor_id INT NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
    date DATE NOT NULL,
    time VARCHAR(10) NOT NULL,
    reason TEXT DEFAULT '',
    status VARCHAR(20) DEFAULT 'Scheduled' NOT NULL CHECK (status IN ('Scheduled', 'Completed', 'Cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 5. Consultations table
CREATE TABLE IF NOT EXISTS consultations (
    id SERIAL PRIMARY KEY,
    patient_id INT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    doctor_id INT NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
    appointment_id INT REFERENCES appointments(id) ON DELETE SET NULL,
    diagnosis TEXT NOT NULL CHECK (char_length(trim(diagnosis)) >= 2),
    notes TEXT DEFAULT '',
    date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 6. Bills table
CREATE TABLE IF NOT EXISTS bills (
    id SERIAL PRIMARY KEY,
    patient_id INT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    description TEXT DEFAULT '',
    status VARCHAR(20) DEFAULT 'Unpaid' NOT NULL CHECK (status IN ('Unpaid', 'Paid')),
    date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 7. Prescriptions table
CREATE TABLE IF NOT EXISTS prescriptions (
    id SERIAL PRIMARY KEY,
    patient_id INT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    doctor_id INT NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
    medicine VARCHAR(200) NOT NULL CHECK (char_length(trim(medicine)) >= 2),
    dosage VARCHAR(100) NOT NULL CHECK (char_length(trim(dosage)) >= 1),
    duration VARCHAR(100) DEFAULT '',
    notes TEXT DEFAULT '',
    date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Performance and Foreign Key Indexes
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(name);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
CREATE INDEX IF NOT EXISTS idx_doctors_name ON doctors(name);
CREATE INDEX IF NOT EXISTS idx_doctors_spec ON doctors(specialization);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_consultations_patient ON consultations(patient_id);
CREATE INDEX IF NOT EXISTS idx_consultations_doctor ON consultations(doctor_id);
CREATE INDEX IF NOT EXISTS idx_bills_patient ON bills(patient_id);
CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(date);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor ON prescriptions(doctor_id);

-- Enable Row Level Security (RLS) policies for Supabase security best practices
-- Allow server backend (via service role or authenticated service) full access
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

-- Allow access policies
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_users') THEN
        CREATE POLICY service_all_users ON users FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_patients') THEN
        CREATE POLICY service_all_patients ON patients FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_doctors') THEN
        CREATE POLICY service_all_doctors ON doctors FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_appointments') THEN
        CREATE POLICY service_all_appointments ON appointments FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_consultations') THEN
        CREATE POLICY service_all_consultations ON consultations FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_bills') THEN
        CREATE POLICY service_all_bills ON bills FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_prescriptions') THEN
        CREATE POLICY service_all_prescriptions ON prescriptions FOR ALL USING (true);
    END IF;
END $$;

-- 8. Seed Initial Data (Preserves clinic history)
-- Default Staff/Admin user (username: admin, password: admin)
INSERT INTO users (id, username, password_hash, role)
VALUES (1, 'admin', 'ca2b06be3bc54dfb9ad82df6d4bf8de90c29f4bcae697858c8db1ffaa60b2403', 'Staff')
ON CONFLICT (username) DO NOTHING;

-- Initial Patients
INSERT INTO patients (id, name, age, gender, phone, address) VALUES
(1, 'Karthik Raja', 32, 'Male', '9876543210', '12 Anna Nagar, Chennai'),
(2, 'Priya Sharma', 28, 'Female', '9123456780', '45 MG Road, Coimbatore'),
(3, 'Arun Kumar', 45, 'Male', '9000012345', '8 Cross Street, Madurai')
ON CONFLICT (id) DO NOTHING;

-- Initial Doctors
INSERT INTO doctors (id, name, specialization, phone, available) VALUES
(1, 'Dr. R. Ananth', 'General Medicine', '9811122233', true),
(2, 'Dr. S. Meena', 'Pediatrics', '9822233344', true)
ON CONFLICT (id) DO NOTHING;

-- Initial Appointments
INSERT INTO appointments (id, patient_id, doctor_id, date, time, reason, status) VALUES
(1, 1, 1, CURRENT_DATE, '09:30', 'Fever and cough', 'Scheduled'),
(2, 2, 2, CURRENT_DATE, '10:15', 'Child checkup', 'Scheduled')
ON CONFLICT (id) DO NOTHING;

-- Initial Consultations
INSERT INTO consultations (id, patient_id, doctor_id, appointment_id, diagnosis, notes, date) VALUES
(1, 3, 1, NULL, 'Hypertension follow-up', 'Continue current medication. Review in 2 weeks.', CURRENT_DATE)
ON CONFLICT (id) DO NOTHING;

-- Initial Bills
INSERT INTO bills (id, patient_id, amount, description, status, date) VALUES
(1, 1, 450.00, 'Consultation fee', 'Paid', CURRENT_DATE)
ON CONFLICT (id) DO NOTHING;

-- Initial Prescriptions
INSERT INTO prescriptions (id, patient_id, doctor_id, medicine, dosage, duration, notes, date) VALUES
(1, 1, 1, 'Paracetamol 500mg', '1 tablet twice daily', '5 days', 'After food', CURRENT_DATE)
ON CONFLICT (id) DO NOTHING;

-- 9. Resynchronize Serial Primary Key Sequences
SELECT setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users), 1));
SELECT setval('patients_id_seq', COALESCE((SELECT MAX(id) FROM patients), 1));
SELECT setval('doctors_id_seq', COALESCE((SELECT MAX(id) FROM doctors), 1));
SELECT setval('appointments_id_seq', COALESCE((SELECT MAX(id) FROM appointments), 1));
SELECT setval('consultations_id_seq', COALESCE((SELECT MAX(id) FROM consultations), 1));
SELECT setval('bills_id_seq', COALESCE((SELECT MAX(id) FROM bills), 1));
SELECT setval('prescriptions_id_seq', COALESCE((SELECT MAX(id) FROM prescriptions), 1));
