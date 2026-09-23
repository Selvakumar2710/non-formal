import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import * as db from './db.js';
import { queryClinicAi, getClinicContext } from './ai_service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

app.use(cors());
app.use(express.json());

// Token session storage (token -> userId)
const sessions = new Map();

// Authentication Middleware
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ detail: 'Authentication required' });
  }
  const token = authHeader.split(' ')[1].trim();
  const userId = sessions.get(token);
  if (!userId) {
    return res.status(401).json({ detail: 'Invalid or expired session' });
  }
  const user = await db.getUserById(userId);
  if (!user) {
    return res.status(401).json({ detail: 'Invalid session' });
  }
  req.user = user;
  next();
}

// --- API Routes ---

// Health & Database Diagnostics
app.get(['/api/health', '/api/status'], async (req, res) => {
  try {
    const status = await db.getDbStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Authentication
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const trimmed = typeof username === 'string' ? username.trim() : '';
    if (!trimmed || !password) {
      return res.status(400).json({ detail: 'Username and password are required' });
    }
    const user = await db.getUserByUsername(trimmed);
    if (!user || !db.verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ detail: 'Invalid username or password' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, user.id);
    res.json({ token, username: user.username, role: user.role });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, role } = req.body || {};
    const trimmed = typeof username === 'string' ? username.trim() : '';
    if (!trimmed || trimmed.length < 2 || trimmed.length > 80) {
      return res.status(400).json({ detail: 'Username must be between 2 and 80 characters' });
    }
    if (!password || password.length < 3 || password.length > 80) {
      return res.status(400).json({ detail: 'Password must be between 3 and 80 characters' });
    }
    const existing = await db.getUserByUsername(trimmed);
    if (existing) {
      return res.status(400).json({ detail: 'Username already registered' });
    }
    const newUser = await db.createUser({
      username: trimmed,
      password_hash: db.hashPassword(password),
      role: role || 'Staff',
    });
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, newUser.id);
    res.json({ token, username: newUser.username, role: newUser.role });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1].trim();
    sessions.delete(token);
  }
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

// Dashboard
app.get('/api/dashboard', requireAuth, async (req, res) => {
  try {
    const data = await db.getDashboardData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// Patients CRUD
app.get('/api/patients', requireAuth, async (req, res) => {
  try {
    const list = await db.getPatients(req.query.q || '');
    res.json(list);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.post('/api/patients', requireAuth, async (req, res) => {
  try {
    const { name, age, gender, phone, address } = req.body || {};
    if (!name || name.trim().length < 2 || name.trim().length > 80) {
      return res.status(400).json({ detail: 'Name must be between 2 and 80 characters' });
    }
    const numAge = Number(age);
    if (age === undefined || age === null || isNaN(numAge) || numAge < 0 || numAge > 120) {
      return res.status(400).json({ detail: 'Age must be between 0 and 120' });
    }
    if (!['Male', 'Female', 'Other'].includes(gender)) {
      return res.status(400).json({ detail: 'Gender must be Male, Female, or Other' });
    }
    if (!db.validPhone(phone)) {
      return res.status(400).json({ detail: 'Phone must be 10 digits' });
    }

    const patient = await db.createPatient({ name, age: numAge, gender, phone, address });
    res.json(patient);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.get('/api/patients/:id', requireAuth, async (req, res) => {
  try {
    const patient = await db.getPatientById(req.params.id);
    if (!patient) return res.status(404).json({ detail: 'Patient not found' });
    res.json(patient);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.put('/api/patients/:id', requireAuth, async (req, res) => {
  try {
    const existing = await db.getPatientById(req.params.id);
    if (!existing) return res.status(404).json({ detail: 'Patient not found' });

    const { name, age, gender, phone, address } = req.body || {};
    if (!name || name.trim().length < 2 || name.trim().length > 80) {
      return res.status(400).json({ detail: 'Name must be between 2 and 80 characters' });
    }
    const numAge = Number(age);
    if (age === undefined || age === null || isNaN(numAge) || numAge < 0 || numAge > 120) {
      return res.status(400).json({ detail: 'Age must be between 0 and 120' });
    }
    if (!['Male', 'Female', 'Other'].includes(gender)) {
      return res.status(400).json({ detail: 'Gender must be Male, Female, or Other' });
    }
    if (!db.validPhone(phone)) {
      return res.status(400).json({ detail: 'Phone must be 10 digits' });
    }

    const updated = await db.updatePatient(req.params.id, { name, age: numAge, gender, phone, address });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.delete('/api/patients/:id', requireAuth, async (req, res) => {
  try {
    const existing = await db.getPatientById(req.params.id);
    if (!existing) return res.status(404).json({ detail: 'Patient not found' });

    await db.deletePatient(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    if (err.message.includes('linked records')) {
      return res.status(400).json({ detail: 'Cannot delete patient with linked records' });
    }
    res.status(500).json({ detail: err.message });
  }
});

// Doctors CRUD
app.get('/api/doctors', requireAuth, async (req, res) => {
  try {
    const list = await db.getDoctors(req.query.q || '');
    res.json(list);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.post('/api/doctors', requireAuth, async (req, res) => {
  try {
    const { name, specialization, phone, available } = req.body || {};
    if (!name || name.trim().length < 2 || name.trim().length > 80) {
      return res.status(400).json({ detail: 'Name must be between 2 and 80 characters' });
    }
    if (!specialization || specialization.trim().length < 2) {
      return res.status(400).json({ detail: 'Specialization must be at least 2 characters' });
    }
    if (!db.validPhone(phone)) {
      return res.status(400).json({ detail: 'Phone must be 10 digits' });
    }

    const doc = await db.createDoctor({ name, specialization, phone, available });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.get('/api/doctors/:id', requireAuth, async (req, res) => {
  try {
    const doc = await db.getDoctorById(req.params.id);
    if (!doc) return res.status(404).json({ detail: 'Doctor not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.put('/api/doctors/:id', requireAuth, async (req, res) => {
  try {
    const existing = await db.getDoctorById(req.params.id);
    if (!existing) return res.status(404).json({ detail: 'Doctor not found' });

    const { name, specialization, phone, available } = req.body || {};
    if (!name || name.trim().length < 2 || name.trim().length > 80) {
      return res.status(400).json({ detail: 'Name must be between 2 and 80 characters' });
    }
    if (!specialization || specialization.trim().length < 2) {
      return res.status(400).json({ detail: 'Specialization must be at least 2 characters' });
    }
    if (!db.validPhone(phone)) {
      return res.status(400).json({ detail: 'Phone must be 10 digits' });
    }

    const updated = await db.updateDoctor(req.params.id, { name, specialization, phone, available });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.delete('/api/doctors/:id', requireAuth, async (req, res) => {
  try {
    const existing = await db.getDoctorById(req.params.id);
    if (!existing) return res.status(404).json({ detail: 'Doctor not found' });

    await db.deleteDoctor(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    if (err.message.includes('linked records')) {
      return res.status(400).json({ detail: 'Cannot delete doctor with linked records' });
    }
    res.status(500).json({ detail: err.message });
  }
});

// Appointments CRUD
app.get('/api/appointments', requireAuth, async (req, res) => {
  try {
    const list = await db.getAppointments(req.query.q || '');
    res.json(list);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.post('/api/appointments', requireAuth, async (req, res) => {
  try {
    const { patient_id, doctor_id, date, time, reason, status } = req.body || {};
    if (!patient_id || !doctor_id) {
      return res.status(400).json({ detail: 'Patient and Doctor are required' });
    }
    const apptStatus = status || 'Scheduled';
    if (!['Scheduled', 'Completed', 'Cancelled'].includes(apptStatus)) {
      return res.status(400).json({ detail: 'Invalid appointment status' });
    }

    const appt = await db.createAppointment({
      patient_id,
      doctor_id,
      date,
      time,
      reason,
      status: apptStatus,
    });
    res.json(appt);
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(400).json({ detail: err.message });
    }
    res.status(500).json({ detail: err.message });
  }
});

app.get('/api/appointments/:id', requireAuth, async (req, res) => {
  try {
    const appt = await db.getAppointmentById(req.params.id);
    if (!appt) return res.status(404).json({ detail: 'Appointment not found' });
    res.json(appt);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.put('/api/appointments/:id', requireAuth, async (req, res) => {
  try {
    const existing = await db.getAppointmentById(req.params.id);
    if (!existing) return res.status(404).json({ detail: 'Appointment not found' });

    const { patient_id, doctor_id, date, time, reason, status } = req.body || {};
    if (status && !['Scheduled', 'Completed', 'Cancelled'].includes(status)) {
      return res.status(400).json({ detail: 'Invalid appointment status' });
    }

    const updated = await db.updateAppointment(req.params.id, {
      patient_id,
      doctor_id,
      date,
      time,
      reason,
      status,
    });
    res.json(updated);
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(400).json({ detail: err.message });
    }
    res.status(500).json({ detail: err.message });
  }
});

app.delete('/api/appointments/:id', requireAuth, async (req, res) => {
  try {
    const existing = await db.getAppointmentById(req.params.id);
    if (!existing) return res.status(404).json({ detail: 'Appointment not found' });

    await db.deleteAppointment(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// Consultations CRUD
app.get('/api/consultations', requireAuth, async (req, res) => {
  try {
    const list = await db.getConsultations(req.query.q || '');
    res.json(list);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.post('/api/consultations', requireAuth, async (req, res) => {
  try {
    const { patient_id, doctor_id, appointment_id, diagnosis, notes, date } = req.body || {};
    if (!patient_id || !doctor_id) {
      return res.status(400).json({ detail: 'Patient and Doctor are required' });
    }
    if (!diagnosis || diagnosis.trim().length < 2) {
      return res.status(400).json({ detail: 'Diagnosis must be at least 2 characters' });
    }

    const item = await db.createConsultation({
      patient_id,
      doctor_id,
      appointment_id,
      diagnosis,
      notes,
      date,
    });
    res.json(item);
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(400).json({ detail: err.message });
    }
    res.status(500).json({ detail: err.message });
  }
});

app.get('/api/consultations/:id', requireAuth, async (req, res) => {
  try {
    const item = await db.getConsultationById(req.params.id);
    if (!item) return res.status(404).json({ detail: 'Consultation not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.delete('/api/consultations/:id', requireAuth, async (req, res) => {
  try {
    const existing = await db.getConsultationById(req.params.id);
    if (!existing) return res.status(404).json({ detail: 'Consultation not found' });

    await db.deleteConsultation(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// Bills CRUD
app.get('/api/bills', requireAuth, async (req, res) => {
  try {
    const list = await db.getBills(req.query.q || '');
    res.json(list);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.post('/api/bills', requireAuth, async (req, res) => {
  try {
    const { patient_id, amount, description, status, date } = req.body || {};
    if (!patient_id) {
      return res.status(400).json({ detail: 'Patient is required' });
    }
    const numAmt = Number(amount);
    if (isNaN(numAmt) || numAmt <= 0) {
      return res.status(400).json({ detail: 'Amount must be greater than 0' });
    }
    const billStatus = status || 'Unpaid';
    if (!['Paid', 'Unpaid'].includes(billStatus)) {
      return res.status(400).json({ detail: 'Invalid bill status' });
    }

    const bill = await db.createBill({
      patient_id,
      amount: numAmt,
      description,
      status: billStatus,
      date,
    });
    res.json(bill);
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(400).json({ detail: err.message });
    }
    res.status(500).json({ detail: err.message });
  }
});

app.get('/api/bills/:id', requireAuth, async (req, res) => {
  try {
    const item = await db.getBillById(req.params.id);
    if (!item) return res.status(404).json({ detail: 'Bill not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.put('/api/bills/:id/pay', requireAuth, async (req, res) => {
  try {
    const updated = await db.payBill(req.params.id);
    if (!updated) return res.status(404).json({ detail: 'Bill not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.delete('/api/bills/:id', requireAuth, async (req, res) => {
  try {
    const existing = await db.getBillById(req.params.id);
    if (!existing) return res.status(404).json({ detail: 'Bill not found' });

    await db.deleteBill(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// Prescriptions CRUD
app.get('/api/prescriptions', requireAuth, async (req, res) => {
  try {
    const list = await db.getPrescriptions(req.query.q || '');
    res.json(list);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.post('/api/prescriptions', requireAuth, async (req, res) => {
  try {
    const { patient_id, doctor_id, medicine, dosage, duration, notes, date } = req.body || {};
    if (!patient_id || !doctor_id) {
      return res.status(400).json({ detail: 'Patient and Doctor are required' });
    }
    if (!medicine || medicine.trim().length < 2) {
      return res.status(400).json({ detail: 'Medicine name must be at least 2 characters' });
    }
    if (!dosage || !dosage.trim()) {
      return res.status(400).json({ detail: 'Dosage is required' });
    }

    const item = await db.createPrescription({
      patient_id,
      doctor_id,
      medicine,
      dosage,
      duration,
      notes,
      date,
    });
    res.json(item);
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(400).json({ detail: err.message });
    }
    res.status(500).json({ detail: err.message });
  }
});

app.get('/api/prescriptions/:id', requireAuth, async (req, res) => {
  try {
    const item = await db.getPrescriptionById(req.params.id);
    if (!item) return res.status(404).json({ detail: 'Prescription not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.delete('/api/prescriptions/:id', requireAuth, async (req, res) => {
  try {
    const existing = await db.getPrescriptionById(req.params.id);
    if (!existing) return res.status(404).json({ detail: 'Prescription not found' });

    await db.deletePrescription(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// Schema export endpoint for Supabase setup
app.get('/api/supabase/schema', (req, res) => {
  try {
    const schemaPath = path.join(__dirname, 'supabase_schema.sql');
    if (fs.existsSync(schemaPath)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.sendFile(schemaPath);
    }
    res.status(404).json({ detail: 'Schema file not found' });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// Reports
app.get('/api/reports/appointments', requireAuth, async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    if (!from_date || !to_date) {
      return res.status(400).json({ detail: 'from_date and to_date are required' });
    }
    if (to_date < from_date) {
      return res.status(400).json({ detail: 'to_date must be on or after from_date' });
    }

    const report = await db.getAppointmentsReport(from_date, to_date);
    res.json(report);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.get('/api/reports/billing', requireAuth, async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    if (!from_date || !to_date) {
      return res.status(400).json({ detail: 'from_date and to_date are required' });
    }
    if (to_date < from_date) {
      return res.status(400).json({ detail: 'to_date must be on or after from_date' });
    }

    const report = await db.getBillingReport(from_date, to_date);
    res.json(report);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// --- AI Clinical Assistant & Intelligence Endpoints ---
app.post('/api/ai/query', requireAuth, async (req, res) => {
  try {
    const { query, history } = req.body || {};
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ detail: 'Query text is required' });
    }
    const result = await queryClinicAi({ query, history });
    res.json(result);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.get('/api/ai/insights', requireAuth, async (req, res) => {
  try {
    const context = await getClinicContext();
    res.json({
      summary: context.summary,
      timestamp: new Date().toISOString(),
      model: 'gemini-3.8-flash',
    });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// Explicit PWA Service Worker and Manifest endpoints with correct headers
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(frontendDir, 'sw.js'));
});

app.get(['/manifest.webmanifest', '/manifest.json'], (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(path.join(frontendDir, 'manifest.webmanifest'));
});

// Serve frontend static files
const frontendDir = path.join(__dirname, 'frontend');
app.use(express.static(frontendDir));

// Fallback to index.html for client SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// Startup Database Initialization & Server Listen
let serverInstance = null;
async function startServer() {
  await db.initDatabase();
  serverInstance = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Clinic Management System running on http://0.0.0.0:${PORT}`);
  });
}

function handleShutdown(signal) {
  console.log(`Received ${signal}. Gracefully shutting down...`);
  if (serverInstance) {
    serverInstance.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

startServer();
