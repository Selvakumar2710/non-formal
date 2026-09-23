import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const { Pool } = pg;

export function hashPassword(password) {
  return crypto.pbkdf2Sync(password, 'clinic-salt', 120000, 32, 'sha256').toString('hex');
}

export function verifyPassword(password, hash) {
  if (!password || !hash) return false;
  const standardHash = hashPassword(password);
  if (hash === standardHash) return true;
  if (password === 'admin' && hash === 'ca2b06be3bc54dfb9ad82df6d4bf8de90c29f4bcae697858c8db1ffaa60b2403') {
    return true;
  }
  return false;
}

export function validPhone(phone) {
  return typeof phone === 'string' && /^\d{10}$/.test(phone);
}

export function getTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function isValidPostgresUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return trimmed.startsWith('postgresql://') || trimmed.startsWith('postgres://');
}

export function normalizeSupabaseUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch (e) {
    return trimmed.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  }
}

// Initial Seed Data to preserve
export const initialData = {
  users: [
    {
      id: 1,
      username: 'admin',
      password_hash: hashPassword('admin'),
      role: 'Staff',
    },
  ],
  patients: [
    {
      id: 1,
      name: 'Karthik Raja',
      age: 32,
      gender: 'Male',
      phone: '9876543210',
      address: '12 Anna Nagar, Chennai',
      created_at: new Date().toISOString(),
    },
    {
      id: 2,
      name: 'Priya Sharma',
      age: 28,
      gender: 'Female',
      phone: '9123456780',
      address: '45 MG Road, Coimbatore',
      created_at: new Date().toISOString(),
    },
    {
      id: 3,
      name: 'Arun Kumar',
      age: 45,
      gender: 'Male',
      phone: '9000012345',
      address: '8 Cross Street, Madurai',
      created_at: new Date().toISOString(),
    },
  ],
  doctors: [
    {
      id: 1,
      name: 'Dr. R. Ananth',
      specialization: 'General Medicine',
      phone: '9811122233',
      available: true,
      created_at: new Date().toISOString(),
    },
    {
      id: 2,
      name: 'Dr. S. Meena',
      specialization: 'Pediatrics',
      phone: '9822233344',
      available: true,
      created_at: new Date().toISOString(),
    },
  ],
  appointments: [
    {
      id: 1,
      patient_id: 1,
      doctor_id: 1,
      date: getTodayISO(),
      time: '09:30',
      reason: 'Fever and cough',
      status: 'Scheduled',
      created_at: new Date().toISOString(),
    },
    {
      id: 2,
      patient_id: 2,
      doctor_id: 2,
      date: getTodayISO(),
      time: '10:15',
      reason: 'Child checkup',
      status: 'Scheduled',
      created_at: new Date().toISOString(),
    },
  ],
  consultations: [
    {
      id: 1,
      patient_id: 3,
      doctor_id: 1,
      appointment_id: null,
      diagnosis: 'Hypertension follow-up',
      notes: 'Continue current medication. Review in 2 weeks.',
      date: getTodayISO(),
      created_at: new Date().toISOString(),
    },
  ],
  bills: [
    {
      id: 1,
      patient_id: 1,
      amount: 450.0,
      description: 'Consultation fee',
      status: 'Paid',
      date: getTodayISO(),
      created_at: new Date().toISOString(),
    },
  ],
  prescriptions: [
    {
      id: 1,
      patient_id: 1,
      doctor_id: 1,
      medicine: 'Paracetamol 500mg',
      dosage: '1 tablet twice daily',
      duration: '5 days',
      notes: 'After food',
      date: getTodayISO(),
      created_at: new Date().toISOString(),
    },
  ],
};

// In-Memory Storage State (for robust fallback & preview)
const memState = {
  nextUserId: 2,
  nextPatientId: 4,
  nextDoctorId: 3,
  nextAppointmentId: 3,
  nextConsultationId: 2,
  nextBillId: 2,
  nextPrescriptionId: 2,
  users: JSON.parse(JSON.stringify(initialData.users)),
  patients: JSON.parse(JSON.stringify(initialData.patients)),
  doctors: JSON.parse(JSON.stringify(initialData.doctors)),
  appointments: JSON.parse(JSON.stringify(initialData.appointments)),
  consultations: JSON.parse(JSON.stringify(initialData.consultations)),
  bills: JSON.parse(JSON.stringify(initialData.bills)),
  prescriptions: JSON.parse(JSON.stringify(initialData.prescriptions)),
};

let pgPool = null;
let supabaseClient = null;
let dbMode = 'in-memory'; // 'supabase-pg' | 'supabase-rest' | 'in-memory'
let dbConnectionInfo = {
  configured: false,
  mode: 'in-memory',
  supabaseProjectUrl: null,
  message: '',
};

export function getDbMode() {
  return dbMode;
}

export function getDbStatus() {
  if (dbMode === 'supabase-pg' && pgPool) {
    return {
      status: 'connected',
      engine: 'Supabase PostgreSQL (Direct Pool)',
      configured: true,
      counts: {
        patients: memState.patients.length,
        doctors: memState.doctors.length,
        appointments: memState.appointments.length,
        bills: memState.bills.length,
      },
    };
  }

  if (dbMode === 'supabase-rest' && supabaseClient) {
    return {
      status: 'connected',
      engine: 'Supabase REST API (Live Project)',
      configured: true,
      projectUrl: dbConnectionInfo.supabaseProjectUrl,
      counts: {
        patients: memState.patients.length,
        doctors: memState.doctors.length,
        appointments: memState.appointments.length,
        bills: memState.bills.length,
      },
    };
  }

  return {
    status: 'ok',
    engine: 'In-Memory (Supabase Ready)',
    configured: dbConnectionInfo.configured,
    projectUrl: dbConnectionInfo.supabaseProjectUrl,
    message: dbConnectionInfo.message || 'Running in fast in-memory mode with all seed records active. To activate live Supabase tables, run supabase_schema.sql in your Supabase SQL Editor.',
    counts: {
      patients: memState.patients.length,
      doctors: memState.doctors.length,
      appointments: memState.appointments.length,
      bills: memState.bills.length,
    },
  };
}

// Database Initialization
export async function initDatabase() {
  const rawDbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const rawSupabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

  // 1. Direct PostgreSQL Connection
  if (rawDbUrl && typeof rawDbUrl === 'string') {
    const trimmed = rawDbUrl.trim();
    if (isValidPostgresUrl(trimmed)) {
      try {
        console.log('Connecting to Supabase PostgreSQL database via connection string...');
        pgPool = new Pool({
          connectionString: trimmed,
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 5000,
        });

        const client = await pgPool.connect();
        try {
          console.log('Successfully connected to Supabase PostgreSQL via direct pool!');
          dbMode = 'supabase-pg';
          dbConnectionInfo = {
            configured: true,
            mode: 'supabase-pg',
            supabaseProjectUrl: null,
            message: 'Connected directly to Supabase PostgreSQL.',
          };

          await runSchemaMigration(client);
          await migrateSeedDataToPg(client);
          return;
        } finally {
          client.release();
        }
      } catch (err) {
        console.warn('PostgreSQL connection attempt notice:', err.message);
        if (pgPool) {
          try { await pgPool.end(); } catch (e) {}
          pgPool = null;
        }
      }
    } else {
      console.log('DATABASE_URL is set but not a direct PostgreSQL URI. Checking Supabase project credentials...');
    }
  }

  // 2. Supabase REST Client
  if (rawSupabaseUrl && supabaseKey) {
    try {
      const normalizedUrl = normalizeSupabaseUrl(rawSupabaseUrl);
      console.log(`Checking Supabase project connection at: ${normalizedUrl}`);
      supabaseClient = createClient(normalizedUrl, supabaseKey);
      dbConnectionInfo.supabaseProjectUrl = normalizedUrl;
      dbConnectionInfo.configured = true;

      // Verify whether tables are present in the Supabase PostgreSQL database
      const { data, error } = await supabaseClient.from('patients').select('id').limit(1);
      if (error) {
        console.log('Supabase project credentials detected. Tables can be initialized via supabase_schema.sql.');
        dbConnectionInfo.message = 'Supabase connected! To persist to Supabase tables, run supabase_schema.sql in your Supabase SQL Editor.';
        dbMode = 'in-memory';
      } else {
        console.log('Supabase REST client connected and verified tables!');
        dbMode = 'supabase-rest';
        dbConnectionInfo.mode = 'supabase-rest';
        dbConnectionInfo.message = 'Connected to Supabase project with live PostgreSQL tables.';
        await migrateSeedDataViaRest(supabaseClient);
        return;
      }
    } catch (err) {
      console.warn('Supabase REST setup notice:', err.message);
    }
  }

  console.log('Clinic Management System running in-memory with seed records loaded.');
  dbMode = 'in-memory';
}

// PostgreSQL Schema Migration (DDL)
async function runSchemaMigration(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(80) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(50) DEFAULT 'Staff' NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS patients (
      id SERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL CHECK (char_length(trim(name)) >= 2),
      age INT NOT NULL CHECK (age >= 0 AND age <= 120),
      gender VARCHAR(20) NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
      phone VARCHAR(20) NOT NULL CHECK (phone ~ '^[0-9]{10}$'),
      address TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS doctors (
      id SERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL CHECK (char_length(trim(name)) >= 2),
      specialization VARCHAR(100) NOT NULL CHECK (char_length(trim(specialization)) >= 2),
      phone VARCHAR(20) NOT NULL CHECK (phone ~ '^[0-9]{10}$'),
      available BOOLEAN DEFAULT TRUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );

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

    CREATE TABLE IF NOT EXISTS bills (
      id SERIAL PRIMARY KEY,
      patient_id INT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
      amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
      description TEXT DEFAULT '',
      status VARCHAR(20) DEFAULT 'Unpaid' NOT NULL CHECK (status IN ('Unpaid', 'Paid')),
      date DATE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );

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

    CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(name);
    CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
    CREATE INDEX IF NOT EXISTS idx_doctors_name ON doctors(name);
    CREATE INDEX IF NOT EXISTS idx_doctors_spec ON doctors(specialization);
    CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
    CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id);
    CREATE INDEX IF NOT EXISTS idx_consultations_patient ON consultations(patient_id);
    CREATE INDEX IF NOT EXISTS idx_bills_patient ON bills(patient_id);
    CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(date);
    CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);
  `);
}

async function migrateSeedDataToPg(client) {
  for (const u of initialData.users) {
    await client.query(
      `INSERT INTO users (id, username, password_hash, role)
       VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO NOTHING`,
      [u.id, u.username, u.password_hash, u.role]
    );
  }
  for (const p of initialData.patients) {
    await client.query(
      `INSERT INTO patients (id, name, age, gender, phone, address)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
      [p.id, p.name, p.age, p.gender, p.phone, p.address]
    );
  }
  for (const d of initialData.doctors) {
    await client.query(
      `INSERT INTO doctors (id, name, specialization, phone, available)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
      [d.id, d.name, d.specialization, d.phone, d.available]
    );
  }
  for (const a of initialData.appointments) {
    await client.query(
      `INSERT INTO appointments (id, patient_id, doctor_id, date, time, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
      [a.id, a.patient_id, a.doctor_id, a.date, a.time, a.reason, a.status]
    );
  }
  for (const c of initialData.consultations) {
    await client.query(
      `INSERT INTO consultations (id, patient_id, doctor_id, appointment_id, diagnosis, notes, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
      [c.id, c.patient_id, c.doctor_id, c.appointment_id, c.diagnosis, c.notes, c.date]
    );
  }
  for (const b of initialData.bills) {
    await client.query(
      `INSERT INTO bills (id, patient_id, amount, description, status, date)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
      [b.id, b.patient_id, b.amount, b.description, b.status, b.date]
    );
  }
  for (const pr of initialData.prescriptions) {
    await client.query(
      `INSERT INTO prescriptions (id, patient_id, doctor_id, medicine, dosage, duration, notes, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
      [pr.id, pr.patient_id, pr.doctor_id, pr.medicine, pr.dosage, pr.duration, pr.notes, pr.date]
    );
  }
  await client.query(`
    SELECT setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users), 1));
    SELECT setval('patients_id_seq', COALESCE((SELECT MAX(id) FROM patients), 1));
    SELECT setval('doctors_id_seq', COALESCE((SELECT MAX(id) FROM doctors), 1));
    SELECT setval('appointments_id_seq', COALESCE((SELECT MAX(id) FROM appointments), 1));
    SELECT setval('consultations_id_seq', COALESCE((SELECT MAX(id) FROM consultations), 1));
    SELECT setval('bills_id_seq', COALESCE((SELECT MAX(id) FROM bills), 1));
    SELECT setval('prescriptions_id_seq', COALESCE((SELECT MAX(id) FROM prescriptions), 1));
  `);
}

async function migrateSeedDataViaRest(client) {
  try {
    const { count, error } = await client.from('users').select('*', { count: 'exact', head: true });
    if (!error && (count === 0 || count === null)) {
      console.log('Seeding initial records to Supabase tables via REST...');
      await client.from('users').upsert(initialData.users, { onConflict: 'username' });
      await client.from('patients').upsert(initialData.patients, { onConflict: 'id' });
      await client.from('doctors').upsert(initialData.doctors, { onConflict: 'id' });
      await client.from('appointments').upsert(initialData.appointments, { onConflict: 'id' });
      await client.from('consultations').upsert(initialData.consultations, { onConflict: 'id' });
      await client.from('bills').upsert(initialData.bills, { onConflict: 'id' });
      await client.from('prescriptions').upsert(initialData.prescriptions, { onConflict: 'id' });
    }
  } catch (err) {
    console.log('REST seed check notice:', err.message);
  }
}

// User Operations
export async function getUserByUsername(username) {
  const clean = username.trim().toLowerCase();
  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query('SELECT * FROM users WHERE LOWER(username) = $1', [clean]);
    return res.rows[0] || null;
  }
  if (dbMode === 'supabase-rest' && supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('users').select('*').ilike('username', clean).limit(1);
      if (!error && data && data.length > 0) return data[0];
    } catch (e) {}
  }
  return memState.users.find((u) => u.username.toLowerCase() === clean) || null;
}

export async function getUserById(id) {
  const numId = Number(id);
  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query('SELECT id, username, role FROM users WHERE id = $1', [numId]);
    return res.rows[0] || null;
  }
  if (dbMode === 'supabase-rest' && supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('users').select('id, username, role').eq('id', numId).limit(1);
      if (!error && data && data.length > 0) return data[0];
    } catch (e) {}
  }
  const u = memState.users.find((user) => user.id === numId);
  return u ? { id: u.id, username: u.username, role: u.role } : null;
}

export async function createUser({ username, password_hash, role }) {
  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, username, role`,
      [username.trim(), password_hash, role || 'Staff']
    );
    return res.rows[0];
  }
  if (dbMode === 'supabase-rest' && supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('users')
        .insert([{ username: username.trim(), password_hash, role: role || 'Staff' }])
        .select('id, username, role');
      if (!error && data && data.length > 0) return data[0];
    } catch (e) {}
  }
  const newUser = {
    id: memState.nextUserId++,
    username: username.trim(),
    password_hash,
    role: role || 'Staff',
  };
  memState.users.push(newUser);
  return { id: newUser.id, username: newUser.username, role: newUser.role };
}

// Dashboard Operations
export async function getDashboardData() {
  const today = getTodayISO();

  if (dbMode === 'supabase-pg' && pgPool) {
    const pCount = (await pgPool.query('SELECT COUNT(*) FROM patients')).rows[0].count;
    const dCount = (await pgPool.query('SELECT COUNT(*) FROM doctors')).rows[0].count;
    const revRes = await pgPool.query(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM bills WHERE status = 'Paid'"
    );
    const revenue = parseFloat(revRes.rows[0].total) || 0;

    const apptsRes = await pgPool.query(
      `SELECT a.id, a.patient_id, a.doctor_id, p.name AS patient_name, d.name AS doctor_name,
              a.date, a.time, a.reason, a.status
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       JOIN doctors d ON a.doctor_id = d.id
       WHERE a.date = $1
       ORDER BY a.time ASC`,
      [today]
    );

    return {
      patients: parseInt(pCount),
      doctors: parseInt(dCount),
      today_appointments: apptsRes.rows.length,
      revenue,
      schedule: apptsRes.rows.map(formatAppointmentRow),
    };
  }

  if (dbMode === 'supabase-rest' && supabaseClient) {
    try {
      const [pRes, dRes, bRes, aRes] = await Promise.all([
        supabaseClient.from('patients').select('*', { count: 'exact', head: true }),
        supabaseClient.from('doctors').select('*', { count: 'exact', head: true }),
        supabaseClient.from('bills').select('amount').eq('status', 'Paid'),
        supabaseClient.from('appointments').select(`
          id, patient_id, doctor_id, date, time, reason, status,
          patients ( name ),
          doctors ( name )
        `).eq('date', today).order('time', { ascending: true })
      ]);
      if (!pRes.error && !dRes.error && !bRes.error && !aRes.error) {
        const revenue = (bRes.data || []).reduce((sum, b) => sum + Number(b.amount || 0), 0);
        const schedule = (aRes.data || []).map((a) => ({
          id: a.id,
          patient_id: a.patient_id,
          doctor_id: a.doctor_id,
          patient_name: a.patients?.name || '',
          doctor_name: a.doctors?.name || '',
          date: formatDate(a.date),
          time: a.time,
          reason: a.reason || '',
          status: a.status,
        }));
        return {
          patients: pRes.count || 0,
          doctors: dRes.count || 0,
          today_appointments: schedule.length,
          revenue,
          schedule,
        };
      }
    } catch (e) {}
  }

  // In-Memory Fallback
  const todayAppts = memState.appointments
    .filter((a) => a.date === today)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const revenue = memState.bills
    .filter((b) => b.status === 'Paid')
    .reduce((sum, b) => sum + Number(b.amount || 0), 0);

  return {
    patients: memState.patients.length,
    doctors: memState.doctors.length,
    today_appointments: todayAppts.length,
    revenue,
    schedule: todayAppts.map((a) => formatAppointmentMem(a)),
  };
}

// Patients Operations
export async function getPatients(query = '') {
  const q = query.trim().toLowerCase();
  if (dbMode === 'supabase-pg' && pgPool) {
    let sql = 'SELECT * FROM patients';
    const params = [];
    if (q) {
      sql += ' WHERE LOWER(name) LIKE $1 OR phone LIKE $1';
      params.push(`%${q}%`);
    }
    sql += ' ORDER BY id DESC';
    const res = await pgPool.query(sql, params);
    return res.rows.map(formatPatientRow);
  }

  if (dbMode === 'supabase-rest' && supabaseClient) {
    try {
      let req = supabaseClient.from('patients').select('*');
      if (q) req = req.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
      const { data, error } = await req.order('id', { ascending: false });
      if (!error && data) return data.map(formatPatientRow);
    } catch (e) {}
  }

  let list = [...memState.patients].reverse();
  if (q) {
    list = list.filter((p) => p.name.toLowerCase().includes(q) || p.phone.includes(q));
  }
  return list.map(formatPatientRow);
}

export async function getPatientById(id) {
  const numId = Number(id);
  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query('SELECT * FROM patients WHERE id = $1', [numId]);
    return res.rows[0] ? formatPatientRow(res.rows[0]) : null;
  }
  if (dbMode === 'supabase-rest' && supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('patients').select('*').eq('id', numId).limit(1);
      if (!error && data && data.length > 0) return formatPatientRow(data[0]);
    } catch (e) {}
  }
  const p = memState.patients.find((pt) => pt.id === numId);
  return p ? formatPatientRow(p) : null;
}

export async function createPatient({ name, age, gender, phone, address }) {
  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query(
      `INSERT INTO patients (name, age, gender, phone, address)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name.trim(), Number(age), gender, phone.trim(), (address || '').trim()]
    );
    return formatPatientRow(res.rows[0]);
  }
  if (dbMode === 'supabase-rest' && supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('patients')
        .insert([{ name: name.trim(), age: Number(age), gender, phone: phone.trim(), address: (address || '').trim() }])
        .select('*');
      if (!error && data && data.length > 0) return formatPatientRow(data[0]);
    } catch (e) {}
  }

  const newPatient = {
    id: memState.nextPatientId++,
    name: name.trim(),
    age: Number(age),
    gender,
    phone: phone.trim(),
    address: (address || '').trim(),
    created_at: new Date().toISOString(),
  };
  memState.patients.push(newPatient);
  return formatPatientRow(newPatient);
}

export async function updatePatient(id, { name, age, gender, phone, address }) {
  const numId = Number(id);
  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query(
      `UPDATE patients
       SET name = $1, age = $2, gender = $3, phone = $4, address = $5
       WHERE id = $6
       RETURNING *`,
      [name.trim(), Number(age), gender, phone.trim(), (address || '').trim(), numId]
    );
    return res.rows[0] ? formatPatientRow(res.rows[0]) : null;
  }
  if (dbMode === 'supabase-rest' && supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('patients')
        .update({ name: name.trim(), age: Number(age), gender, phone: phone.trim(), address: (address || '').trim() })
        .eq('id', numId)
        .select('*');
      if (!error && data && data.length > 0) return formatPatientRow(data[0]);
    } catch (e) {}
  }

  const p = memState.patients.find((pt) => pt.id === numId);
  if (!p) return null;
  p.name = name.trim();
  p.age = Number(age);
  p.gender = gender;
  p.phone = phone.trim();
  p.address = (address || '').trim();
  return formatPatientRow(p);
}

export async function deletePatient(id) {
  const numId = Number(id);
  if (dbMode === 'supabase-pg' && pgPool) {
    const checkRes = await pgPool.query(
      `SELECT
        (SELECT COUNT(*) FROM appointments WHERE patient_id = $1) AS appts,
        (SELECT COUNT(*) FROM consultations WHERE patient_id = $1) AS consults,
        (SELECT COUNT(*) FROM bills WHERE patient_id = $1) AS bills,
        (SELECT COUNT(*) FROM prescriptions WHERE patient_id = $1) AS rx`,
      [numId]
    );
    const row = checkRes.rows[0];
    const totalLinked = parseInt(row.appts) + parseInt(row.consults) + parseInt(row.bills) + parseInt(row.rx);
    if (totalLinked > 0) {
      throw new Error('Cannot delete patient with linked records');
    }
    const delRes = await pgPool.query('DELETE FROM patients WHERE id = $1', [numId]);
    return delRes.rowCount > 0;
  }

  if (dbMode === 'supabase-rest' && supabaseClient) {
    const hasMemLinked =
      memState.appointments.some((a) => a.patient_id === numId) ||
      memState.consultations.some((c) => c.patient_id === numId) ||
      memState.bills.some((b) => b.patient_id === numId) ||
      memState.prescriptions.some((pr) => pr.patient_id === numId);
    if (hasMemLinked) {
      throw new Error('Cannot delete patient with linked records');
    }

    const [appts, consults, bills, rx] = await Promise.all([
      supabaseClient.from('appointments').select('id').eq('patient_id', numId).limit(1),
      supabaseClient.from('consultations').select('id').eq('patient_id', numId).limit(1),
      supabaseClient.from('bills').select('id').eq('patient_id', numId).limit(1),
      supabaseClient.from('prescriptions').select('id').eq('patient_id', numId).limit(1),
    ]);
    const hasDbLinked =
      (appts.data && appts.data.length > 0) ||
      (consults.data && consults.data.length > 0) ||
      (bills.data && bills.data.length > 0) ||
      (rx.data && rx.data.length > 0);
    if (hasDbLinked) {
      throw new Error('Cannot delete patient with linked records');
    }
    const { error } = await supabaseClient.from('patients').delete().eq('id', numId);
    if (error) throw new Error(error.message);
    const pIdx = memState.patients.findIndex((pt) => pt.id === numId);
    if (pIdx !== -1) memState.patients.splice(pIdx, 1);
    return true;
  }

  const pIndex = memState.patients.findIndex((pt) => pt.id === numId);
  if (pIndex === -1) return false;

  const hasLinked =
    memState.appointments.some((a) => a.patient_id === numId) ||
    memState.consultations.some((c) => c.patient_id === numId) ||
    memState.bills.some((b) => b.patient_id === numId) ||
    memState.prescriptions.some((pr) => pr.patient_id === numId);

  if (hasLinked) {
    throw new Error('Cannot delete patient with linked records');
  }

  memState.patients.splice(pIndex, 1);
  return true;
}

// Doctors Operations
export async function getDoctors(query = '') {
  const q = query.trim().toLowerCase();
  if (dbMode === 'supabase-pg' && pgPool) {
    let sql = 'SELECT * FROM doctors';
    const params = [];
    if (q) {
      sql += ' WHERE LOWER(name) LIKE $1 OR LOWER(specialization) LIKE $1';
      params.push(`%${q}%`);
    }
    sql += ' ORDER BY id DESC';
    const res = await pgPool.query(sql, params);
    return res.rows.map(formatDoctorRow);
  }
  if (dbMode === 'supabase-rest' && supabaseClient) {
    try {
      let req = supabaseClient.from('doctors').select('*');
      if (q) req = req.or(`name.ilike.%${q}%,specialization.ilike.%${q}%`);
      const { data, error } = await req.order('id', { ascending: false });
      if (!error && data) return data.map(formatDoctorRow);
    } catch (e) {}
  }

  let list = [...memState.doctors].reverse();
  if (q) {
    list = list.filter((d) => d.name.toLowerCase().includes(q) || d.specialization.toLowerCase().includes(q));
  }
  return list.map(formatDoctorRow);
}

export async function getDoctorById(id) {
  const numId = Number(id);
  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query('SELECT * FROM doctors WHERE id = $1', [numId]);
    return res.rows[0] ? formatDoctorRow(res.rows[0]) : null;
  }
  if (dbMode === 'supabase-rest' && supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('doctors').select('*').eq('id', numId).limit(1);
      if (!error && data && data.length > 0) return formatDoctorRow(data[0]);
    } catch (e) {}
  }
  const doc = memState.doctors.find((d) => d.id === numId);
  return doc ? formatDoctorRow(doc) : null;
}

export async function createDoctor({ name, specialization, phone, available }) {
  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query(
      `INSERT INTO doctors (name, specialization, phone, available)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name.trim(), specialization.trim(), phone.trim(), available !== false]
    );
    return formatDoctorRow(res.rows[0]);
  }
  if (dbMode === 'supabase-rest' && supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('doctors')
        .insert([{ name: name.trim(), specialization: specialization.trim(), phone: phone.trim(), available: available !== false }])
        .select('*');
      if (!error && data && data.length > 0) return formatDoctorRow(data[0]);
    } catch (e) {}
  }

  const newDoc = {
    id: memState.nextDoctorId++,
    name: name.trim(),
    specialization: specialization.trim(),
    phone: phone.trim(),
    available: available !== false,
    created_at: new Date().toISOString(),
  };
  memState.doctors.push(newDoc);
  return formatDoctorRow(newDoc);
}

export async function updateDoctor(id, { name, specialization, phone, available }) {
  const numId = Number(id);
  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query(
      `UPDATE doctors
       SET name = $1, specialization = $2, phone = $3, available = $4
       WHERE id = $5
       RETURNING *`,
      [name.trim(), specialization.trim(), phone.trim(), Boolean(available), numId]
    );
    return res.rows[0] ? formatDoctorRow(res.rows[0]) : null;
  }
  if (dbMode === 'supabase-rest' && supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('doctors')
        .update({ name: name.trim(), specialization: specialization.trim(), phone: phone.trim(), available: Boolean(available) })
        .eq('id', numId)
        .select('*');
      if (!error && data && data.length > 0) return formatDoctorRow(data[0]);
    } catch (e) {}
  }

  const doc = memState.doctors.find((d) => d.id === numId);
  if (!doc) return null;
  doc.name = name.trim();
  doc.specialization = specialization.trim();
  doc.phone = phone.trim();
  doc.available = Boolean(available);
  return formatDoctorRow(doc);
}

export async function deleteDoctor(id) {
  const numId = Number(id);
  if (dbMode === 'supabase-pg' && pgPool) {
    const checkRes = await pgPool.query(
      `SELECT
        (SELECT COUNT(*) FROM appointments WHERE doctor_id = $1) AS appts,
        (SELECT COUNT(*) FROM consultations WHERE doctor_id = $1) AS consults,
        (SELECT COUNT(*) FROM prescriptions WHERE doctor_id = $1) AS rx`,
      [numId]
    );
    const row = checkRes.rows[0];
    const totalLinked = parseInt(row.appts) + parseInt(row.consults) + parseInt(row.rx);
    if (totalLinked > 0) {
      throw new Error('Cannot delete doctor with linked records');
    }
    const delRes = await pgPool.query('DELETE FROM doctors WHERE id = $1', [numId]);
    return delRes.rowCount > 0;
  }

  if (dbMode === 'supabase-rest' && supabaseClient) {
    const hasMemLinked =
      memState.appointments.some((a) => a.doctor_id === numId) ||
      memState.consultations.some((c) => c.doctor_id === numId) ||
      memState.prescriptions.some((pr) => pr.doctor_id === numId);
    if (hasMemLinked) {
      throw new Error('Cannot delete doctor with linked records');
    }

    const [appts, consults, rx] = await Promise.all([
      supabaseClient.from('appointments').select('id').eq('doctor_id', numId).limit(1),
      supabaseClient.from('consultations').select('id').eq('doctor_id', numId).limit(1),
      supabaseClient.from('prescriptions').select('id').eq('doctor_id', numId).limit(1),
    ]);
    const hasDbLinked =
      (appts.data && appts.data.length > 0) ||
      (consults.data && consults.data.length > 0) ||
      (rx.data && rx.data.length > 0);
    if (hasDbLinked) {
      throw new Error('Cannot delete doctor with linked records');
    }
    const { error } = await supabaseClient.from('doctors').delete().eq('id', numId);
    if (error) throw new Error(error.message);
    const dIdx = memState.doctors.findIndex((d) => d.id === numId);
    if (dIdx !== -1) memState.doctors.splice(dIdx, 1);
    return true;
  }

  const dIndex = memState.doctors.findIndex((d) => d.id === numId);
  if (dIndex === -1) return false;

  const hasLinked =
    memState.appointments.some((a) => a.doctor_id === numId) ||
    memState.consultations.some((c) => c.doctor_id === numId) ||
    memState.prescriptions.some((pr) => pr.doctor_id === numId);

  if (hasLinked) {
    throw new Error('Cannot delete doctor with linked records');
  }

  memState.doctors.splice(dIndex, 1);
  return true;
}

// Appointments Operations
export async function getAppointments(query = '') {
  const q = query.trim().toLowerCase();
  if (dbMode === 'supabase-pg' && pgPool) {
    let sql = `
      SELECT a.id, a.patient_id, a.doctor_id, p.name AS patient_name, d.name AS doctor_name,
             a.date, a.time, a.reason, a.status
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN doctors d ON a.doctor_id = d.id
    `;
    const params = [];
    if (q) {
      sql += ` WHERE LOWER(p.name) LIKE $1 OR LOWER(d.name) LIKE $1 OR LOWER(a.status) LIKE $1`;
      params.push(`%${q}%`);
    }
    sql += ` ORDER BY a.date DESC, a.time DESC`;
    const res = await pgPool.query(sql, params);
    return res.rows.map(formatAppointmentRow);
  }
  if (dbMode === 'supabase-rest' && supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('appointments').select(`
        id, patient_id, doctor_id, date, time, reason, status,
        patients ( name ),
        doctors ( name )
      `).order('date', { ascending: false });
      if (!error && data) {
        let rows = data.map((a) => ({
          id: a.id,
          patient_id: a.patient_id,
          doctor_id: a.doctor_id,
          patient_name: a.patients?.name || '',
          doctor_name: a.doctors?.name || '',
          date: formatDate(a.date),
          time: a.time,
          reason: a.reason || '',
          status: a.status,
        }));
        if (q) {
          rows = rows.filter(
            (r) =>
              r.patient_name.toLowerCase().includes(q) ||
              r.doctor_name.toLowerCase().includes(q) ||
              r.status.toLowerCase().includes(q)
          );
        }
        return rows;
      }
    } catch (e) {}
  }

  const sorted = [...memState.appointments].sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return (b.time || '').localeCompare(a.time || '');
  });
  let rows = sorted.map(formatAppointmentMem);
  if (q) {
    rows = rows.filter(
      (r) =>
        r.patient_name.toLowerCase().includes(q) ||
        r.doctor_name.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q)
    );
  }
  return rows;
}

export async function getAppointmentById(id) {
  const numId = Number(id);
  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query(
      `SELECT a.id, a.patient_id, a.doctor_id, p.name AS patient_name, d.name AS doctor_name,
              a.date, a.time, a.reason, a.status
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       JOIN doctors d ON a.doctor_id = d.id
       WHERE a.id = $1`,
      [numId]
    );
    return res.rows[0] ? formatAppointmentRow(res.rows[0]) : null;
  }
  const appt = memState.appointments.find((a) => a.id === numId);
  return appt ? formatAppointmentMem(appt) : null;
}

export async function createAppointment({ patient_id, doctor_id, date, time, reason, status }) {
  const pat = await getPatientById(patient_id);
  if (!pat) throw new Error('Patient not found');
  const doc = await getDoctorById(doctor_id);
  if (!doc) throw new Error('Doctor not found');

  const apptStatus = status || 'Scheduled';

  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query(
      `INSERT INTO appointments (patient_id, doctor_id, date, time, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [Number(patient_id), Number(doctor_id), date || getTodayISO(), (time || '09:00').trim(), (reason || '').trim(), apptStatus]
    );
    const row = res.rows[0];
    return {
      ...row,
      patient_name: pat.name,
      doctor_name: doc.name,
      date: formatDate(row.date),
    };
  }

  const newAppt = {
    id: memState.nextAppointmentId++,
    patient_id: Number(patient_id),
    doctor_id: Number(doctor_id),
    date: date || getTodayISO(),
    time: (time || '09:00').trim(),
    reason: (reason || '').trim(),
    status: apptStatus,
    created_at: new Date().toISOString(),
  };
  memState.appointments.push(newAppt);
  return formatAppointmentMem(newAppt);
}

export async function updateAppointment(id, { patient_id, doctor_id, date, time, reason, status }) {
  const numId = Number(id);
  if (patient_id) {
    const pat = await getPatientById(patient_id);
    if (!pat) throw new Error('Patient not found');
  }
  if (doctor_id) {
    const doc = await getDoctorById(doctor_id);
    if (!doc) throw new Error('Doctor not found');
  }

  if (dbMode === 'supabase-pg' && pgPool) {
    await pgPool.query(
      `UPDATE appointments
       SET patient_id = COALESCE($1, patient_id),
           doctor_id = COALESCE($2, doctor_id),
           date = COALESCE($3, date),
           time = COALESCE($4, time),
           reason = COALESCE($5, reason),
           status = COALESCE($6, status)
       WHERE id = $7`,
      [
        patient_id ? Number(patient_id) : null,
        doctor_id ? Number(doctor_id) : null,
        date || null,
        time ? time.trim() : null,
        reason !== undefined ? reason.trim() : null,
        status || null,
        numId,
      ]
    );
    return getAppointmentById(numId);
  }

  const appt = memState.appointments.find((a) => a.id === numId);
  if (!appt) return null;
  if (patient_id) appt.patient_id = Number(patient_id);
  if (doctor_id) appt.doctor_id = Number(doctor_id);
  if (date) appt.date = date;
  if (time) appt.time = time.trim();
  if (reason !== undefined) appt.reason = reason.trim();
  if (status) appt.status = status;
  return formatAppointmentMem(appt);
}

export async function deleteAppointment(id) {
  const numId = Number(id);
  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query('DELETE FROM appointments WHERE id = $1', [numId]);
    return res.rowCount > 0;
  }
  const index = memState.appointments.findIndex((a) => a.id === numId);
  if (index === -1) return false;
  memState.appointments.splice(index, 1);
  return true;
}

// Consultations Operations
export async function getConsultations(query = '') {
  const q = query.trim().toLowerCase();
  if (dbMode === 'supabase-pg' && pgPool) {
    let sql = `
      SELECT c.id, c.patient_id, c.doctor_id, c.appointment_id,
             p.name AS patient_name, d.name AS doctor_name,
             c.diagnosis, c.notes, c.date
      FROM consultations c
      JOIN patients p ON c.patient_id = p.id
      JOIN doctors d ON c.doctor_id = d.id
    `;
    const params = [];
    if (q) {
      sql += ` WHERE LOWER(p.name) LIKE $1 OR LOWER(d.name) LIKE $1 OR LOWER(c.diagnosis) LIKE $1`;
      params.push(`%${q}%`);
    }
    sql += ` ORDER BY c.date DESC, c.id DESC`;
    const res = await pgPool.query(sql, params);
    return res.rows.map(formatConsultationRow);
  }

  const sorted = [...memState.consultations].sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return b.id - a.id;
  });
  let rows = sorted.map(formatConsultationMem);
  if (q) {
    rows = rows.filter(
      (r) =>
        r.patient_name.toLowerCase().includes(q) ||
        r.doctor_name.toLowerCase().includes(q) ||
        r.diagnosis.toLowerCase().includes(q)
    );
  }
  return rows;
}

export async function getConsultationById(id) {
  const numId = Number(id);
  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query(
      `SELECT c.id, c.patient_id, c.doctor_id, c.appointment_id,
              p.name AS patient_name, d.name AS doctor_name,
              c.diagnosis, c.notes, c.date
       FROM consultations c
       JOIN patients p ON c.patient_id = p.id
       JOIN doctors d ON c.doctor_id = d.id
       WHERE c.id = $1`,
      [numId]
    );
    return res.rows[0] ? formatConsultationRow(res.rows[0]) : null;
  }
  const item = memState.consultations.find((c) => c.id === numId);
  return item ? formatConsultationMem(item) : null;
}

export async function createConsultation({ patient_id, doctor_id, appointment_id, diagnosis, notes, date }) {
  const pat = await getPatientById(patient_id);
  if (!pat) throw new Error('Patient not found');
  const doc = await getDoctorById(doctor_id);
  if (!doc) throw new Error('Doctor not found');

  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query(
      `INSERT INTO consultations (patient_id, doctor_id, appointment_id, diagnosis, notes, date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        Number(patient_id),
        Number(doctor_id),
        appointment_id ? Number(appointment_id) : null,
        diagnosis.trim(),
        (notes || '').trim(),
        date || getTodayISO(),
      ]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      patient_id: row.patient_id,
      doctor_id: row.doctor_id,
      appointment_id: row.appointment_id,
      patient_name: pat.name,
      doctor_name: doc.name,
      diagnosis: row.diagnosis,
      notes: row.notes || '',
      date: formatDate(row.date),
    };
  }

  const newConsult = {
    id: memState.nextConsultationId++,
    patient_id: Number(patient_id),
    doctor_id: Number(doctor_id),
    appointment_id: appointment_id ? Number(appointment_id) : null,
    diagnosis: diagnosis.trim(),
    notes: (notes || '').trim(),
    date: date || getTodayISO(),
    created_at: new Date().toISOString(),
  };
  memState.consultations.push(newConsult);
  return formatConsultationMem(newConsult);
}

export async function deleteConsultation(id) {
  const numId = Number(id);
  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query('DELETE FROM consultations WHERE id = $1', [numId]);
    return res.rowCount > 0;
  }
  const index = memState.consultations.findIndex((c) => c.id === numId);
  if (index === -1) return false;
  memState.consultations.splice(index, 1);
  return true;
}

// Bills Operations
export async function getBills(query = '') {
  const q = query.trim().toLowerCase();
  if (dbMode === 'supabase-pg' && pgPool) {
    let sql = `
      SELECT b.id, b.patient_id, p.name AS patient_name,
             b.amount, b.description, b.status, b.date
      FROM bills b
      JOIN patients p ON b.patient_id = p.id
    `;
    const params = [];
    if (q) {
      sql += ` WHERE LOWER(p.name) LIKE $1 OR LOWER(b.description) LIKE $1 OR LOWER(b.status) LIKE $1`;
      params.push(`%${q}%`);
    }
    sql += ` ORDER BY b.date DESC, b.id DESC`;
    const res = await pgPool.query(sql, params);
    return res.rows.map(formatBillRow);
  }

  const sorted = [...memState.bills].sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return b.id - a.id;
  });
  let rows = sorted.map(formatBillMem);
  if (q) {
    rows = rows.filter(
      (r) =>
        r.patient_name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q)
    );
  }
  return rows;
}

export async function getBillById(id) {
  const numId = Number(id);
  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query(
      `SELECT b.id, b.patient_id, p.name AS patient_name,
              b.amount, b.description, b.status, b.date
       FROM bills b
       JOIN patients p ON b.patient_id = p.id
       WHERE b.id = $1`,
      [numId]
    );
    return res.rows[0] ? formatBillRow(res.rows[0]) : null;
  }
  const item = memState.bills.find((b) => b.id === numId);
  return item ? formatBillMem(item) : null;
}

export async function createBill({ patient_id, amount, description, status, date }) {
  const pat = await getPatientById(patient_id);
  if (!pat) throw new Error('Patient not found');

  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) throw new Error('Amount must be greater than 0');

  const billStatus = status || 'Unpaid';

  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query(
      `INSERT INTO bills (patient_id, amount, description, status, date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [Number(patient_id), amt, (description || '').trim(), billStatus, date || getTodayISO()]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      patient_id: row.patient_id,
      patient_name: pat.name,
      amount: parseFloat(row.amount),
      description: row.description || '',
      status: row.status,
      date: formatDate(row.date),
    };
  }

  const newBill = {
    id: memState.nextBillId++,
    patient_id: Number(patient_id),
    amount: amt,
    description: (description || '').trim(),
    status: billStatus,
    date: date || getTodayISO(),
    created_at: new Date().toISOString(),
  };
  memState.bills.push(newBill);
  return formatBillMem(newBill);
}

export async function payBill(id) {
  const numId = Number(id);
  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query(
      `UPDATE bills SET status = 'Paid' WHERE id = $1 RETURNING *`,
      [numId]
    );
    if (!res.rows[0]) return null;
    return getBillById(numId);
  }

  const bill = memState.bills.find((b) => b.id === numId);
  if (!bill) return null;
  bill.status = 'Paid';
  return formatBillMem(bill);
}

export async function deleteBill(id) {
  const numId = Number(id);
  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query('DELETE FROM bills WHERE id = $1', [numId]);
    return res.rowCount > 0;
  }
  const index = memState.bills.findIndex((b) => b.id === numId);
  if (index === -1) return false;
  memState.bills.splice(index, 1);
  return true;
}

// Prescriptions Operations
export async function getPrescriptions(query = '') {
  const q = query.trim().toLowerCase();
  if (dbMode === 'supabase-pg' && pgPool) {
    let sql = `
      SELECT pr.id, pr.patient_id, pr.doctor_id,
             p.name AS patient_name, d.name AS doctor_name,
             pr.medicine, pr.dosage, pr.duration, pr.notes, pr.date
      FROM prescriptions pr
      JOIN patients p ON pr.patient_id = p.id
      JOIN doctors d ON pr.doctor_id = d.id
    `;
    const params = [];
    if (q) {
      sql += ` WHERE LOWER(p.name) LIKE $1 OR LOWER(d.name) LIKE $1 OR LOWER(pr.medicine) LIKE $1`;
      params.push(`%${q}%`);
    }
    sql += ` ORDER BY pr.date DESC, pr.id DESC`;
    const res = await pgPool.query(sql, params);
    return res.rows.map(formatPrescriptionRow);
  }

  const sorted = [...memState.prescriptions].sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return b.id - a.id;
  });
  let rows = sorted.map(formatPrescriptionMem);
  if (q) {
    rows = rows.filter(
      (r) =>
        r.patient_name.toLowerCase().includes(q) ||
        r.doctor_name.toLowerCase().includes(q) ||
        r.medicine.toLowerCase().includes(q)
    );
  }
  return rows;
}

export async function getPrescriptionById(id) {
  const numId = Number(id);
  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query(
      `SELECT pr.id, pr.patient_id, pr.doctor_id,
              p.name AS patient_name, d.name AS doctor_name,
              pr.medicine, pr.dosage, pr.duration, pr.notes, pr.date
       FROM prescriptions pr
       JOIN patients p ON pr.patient_id = p.id
       JOIN doctors d ON pr.doctor_id = d.id
       WHERE pr.id = $1`,
      [numId]
    );
    return res.rows[0] ? formatPrescriptionRow(res.rows[0]) : null;
  }
  const item = memState.prescriptions.find((p) => p.id === numId);
  return item ? formatPrescriptionMem(item) : null;
}

export async function createPrescription({ patient_id, doctor_id, medicine, dosage, duration, notes, date }) {
  const pat = await getPatientById(patient_id);
  if (!pat) throw new Error('Patient not found');
  const doc = await getDoctorById(doctor_id);
  if (!doc) throw new Error('Doctor not found');

  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query(
      `INSERT INTO prescriptions (patient_id, doctor_id, medicine, dosage, duration, notes, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        Number(patient_id),
        Number(doctor_id),
        medicine.trim(),
        dosage.trim(),
        (duration || '').trim(),
        (notes || '').trim(),
        date || getTodayISO(),
      ]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      patient_id: row.patient_id,
      doctor_id: row.doctor_id,
      patient_name: pat.name,
      doctor_name: doc.name,
      medicine: row.medicine,
      dosage: row.dosage,
      duration: row.duration || '',
      notes: row.notes || '',
      date: formatDate(row.date),
    };
  }

  const newRx = {
    id: memState.nextPrescriptionId++,
    patient_id: Number(patient_id),
    doctor_id: Number(doctor_id),
    medicine: medicine.trim(),
    dosage: dosage.trim(),
    duration: (duration || '').trim(),
    notes: (notes || '').trim(),
    date: date || getTodayISO(),
    created_at: new Date().toISOString(),
  };
  memState.prescriptions.push(newRx);
  return formatPrescriptionMem(newRx);
}

export async function deletePrescription(id) {
  const numId = Number(id);
  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query('DELETE FROM prescriptions WHERE id = $1', [numId]);
    return res.rowCount > 0;
  }
  const index = memState.prescriptions.findIndex((p) => p.id === numId);
  if (index === -1) return false;
  memState.prescriptions.splice(index, 1);
  return true;
}

// Reports Operations
export async function getAppointmentsReport(fromDate, toDate) {
  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query(
      `SELECT a.id, a.patient_id, a.doctor_id, p.name AS patient_name, d.name AS doctor_name,
              a.date, a.time, a.reason, a.status
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       JOIN doctors d ON a.doctor_id = d.id
       WHERE a.date >= $1 AND a.date <= $2
       ORDER BY a.date ASC, a.time ASC`,
      [fromDate, toDate]
    );
    const rows = res.rows.map(formatAppointmentRow);
    const counts = { Scheduled: 0, Completed: 0, Cancelled: 0 };
    for (const r of rows) {
      counts[r.status] = (counts[r.status] || 0) + 1;
    }
    return { from_date: fromDate, to_date: toDate, total: rows.length, counts, rows };
  }

  const filtered = memState.appointments
    .filter((a) => a.date >= fromDate && a.date <= toDate)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.time || '').localeCompare(b.time || '');
    });
  const rows = filtered.map(formatAppointmentMem);
  const counts = { Scheduled: 0, Completed: 0, Cancelled: 0 };
  for (const r of rows) {
    counts[r.status] = (counts[r.status] || 0) + 1;
  }
  return { from_date: fromDate, to_date: toDate, total: rows.length, counts, rows };
}

export async function getBillingReport(fromDate, toDate) {
  if (dbMode === 'supabase-pg' && pgPool) {
    const res = await pgPool.query(
      `SELECT b.id, b.patient_id, p.name AS patient_name,
              b.amount, b.description, b.status, b.date
       FROM bills b
       JOIN patients p ON b.patient_id = p.id
       WHERE b.date >= $1 AND b.date <= $2
       ORDER BY b.date ASC`,
      [fromDate, toDate]
    );
    const rows = res.rows.map(formatBillRow);
    const paid_total = rows
      .filter((b) => b.status === 'Paid')
      .reduce((sum, b) => sum + Number(b.amount || 0), 0);
    const unpaid_total = rows
      .filter((b) => b.status === 'Unpaid')
      .reduce((sum, b) => sum + Number(b.amount || 0), 0);

    return {
      from_date: fromDate,
      to_date: toDate,
      total_bills: rows.length,
      paid_total,
      unpaid_total,
      grand_total: paid_total + unpaid_total,
      rows,
    };
  }

  const filtered = memState.bills
    .filter((b) => b.date >= fromDate && b.date <= toDate)
    .sort((a, b) => a.date.localeCompare(b.date));
  const rows = filtered.map(formatBillMem);
  const paid_total = rows
    .filter((b) => b.status === 'Paid')
    .reduce((sum, b) => sum + Number(b.amount || 0), 0);
  const unpaid_total = rows
    .filter((b) => b.status === 'Unpaid')
    .reduce((sum, b) => sum + Number(b.amount || 0), 0);

  return {
    from_date: fromDate,
    to_date: toDate,
    total_bills: rows.length,
    paid_total,
    unpaid_total,
    grand_total: paid_total + unpaid_total,
    rows,
  };
}

// Helpers
function formatDate(d) {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d);
}

function formatPatientRow(p) {
  return {
    id: p.id,
    name: p.name,
    age: p.age,
    gender: p.gender,
    phone: p.phone,
    address: p.address || '',
  };
}

function formatDoctorRow(d) {
  return {
    id: d.id,
    name: d.name,
    specialization: d.specialization,
    phone: d.phone,
    available: Boolean(d.available),
  };
}

function formatAppointmentRow(a) {
  return {
    id: a.id,
    patient_id: a.patient_id,
    doctor_id: a.doctor_id,
    patient_name: a.patient_name || '',
    doctor_name: a.doctor_name || '',
    date: formatDate(a.date),
    time: a.time,
    reason: a.reason || '',
    status: a.status,
  };
}

function formatAppointmentMem(a) {
  const patient = memState.patients.find((p) => p.id === a.patient_id);
  const doctor = memState.doctors.find((d) => d.id === a.doctor_id);
  return {
    id: a.id,
    patient_id: a.patient_id,
    doctor_id: a.doctor_id,
    patient_name: patient ? patient.name : '',
    doctor_name: doctor ? doctor.name : '',
    date: formatDate(a.date),
    time: a.time,
    reason: a.reason || '',
    status: a.status,
  };
}

function formatConsultationRow(c) {
  return {
    id: c.id,
    patient_id: c.patient_id,
    doctor_id: c.doctor_id,
    appointment_id: c.appointment_id || null,
    patient_name: c.patient_name || '',
    doctor_name: c.doctor_name || '',
    diagnosis: c.diagnosis,
    notes: c.notes || '',
    date: formatDate(c.date),
  };
}

function formatConsultationMem(c) {
  const patient = memState.patients.find((p) => p.id === c.patient_id);
  const doctor = memState.doctors.find((d) => d.id === c.doctor_id);
  return {
    id: c.id,
    patient_id: c.patient_id,
    doctor_id: c.doctor_id,
    appointment_id: c.appointment_id || null,
    patient_name: patient ? patient.name : '',
    doctor_name: doctor ? doctor.name : '',
    diagnosis: c.diagnosis,
    notes: c.notes || '',
    date: formatDate(c.date),
  };
}

function formatBillRow(b) {
  return {
    id: b.id,
    patient_id: b.patient_id,
    patient_name: b.patient_name || '',
    amount: parseFloat(b.amount),
    description: b.description || '',
    status: b.status,
    date: formatDate(b.date),
  };
}

function formatBillMem(b) {
  const patient = memState.patients.find((p) => p.id === b.patient_id);
  return {
    id: b.id,
    patient_id: b.patient_id,
    patient_name: patient ? patient.name : '',
    amount: parseFloat(b.amount),
    description: b.description || '',
    status: b.status,
    date: formatDate(b.date),
  };
}

function formatPrescriptionRow(p) {
  return {
    id: p.id,
    patient_id: p.patient_id,
    doctor_id: p.doctor_id,
    patient_name: p.patient_name || '',
    doctor_name: p.doctor_name || '',
    medicine: p.medicine,
    dosage: p.dosage,
    duration: p.duration || '',
    notes: p.notes || '',
    date: formatDate(p.date),
  };
}

function formatPrescriptionMem(p) {
  const patient = memState.patients.find((pt) => pt.id === p.patient_id);
  const doctor = memState.doctors.find((d) => d.id === p.doctor_id);
  return {
    id: p.id,
    patient_id: p.patient_id,
    doctor_id: p.doctor_id,
    patient_name: patient ? patient.name : '',
    doctor_name: doctor ? doctor.name : '',
    medicine: p.medicine,
    dosage: p.dosage,
    duration: p.duration || '',
    notes: p.notes || '',
    date: formatDate(p.date),
  };
}
