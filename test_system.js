// Comprehensive Test Suite for Clinic Management System (SRS FR-01 through FR-16 + AI Copilot)
import * as db from './db.js';
import { queryClinicAi, getClinicContext } from './ai_service.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`✅ PASS: ${message}`);
}

async function runTests() {
  console.log('=== Starting Clinic Management System Test Suite ===\n');

  // 1. Database Initialization
  console.log('--- Test Group 1: Database Initialization & Status ---');
  await db.initDatabase();
  const status = await db.getDbStatus();
  assert(status.status === 'ok' || status.status === 'connected', 'Database status returns healthy');
  assert(status.counts.patients >= 3, 'Existing patient records preserved and loaded');
  assert(status.counts.doctors >= 2, 'Existing doctor records preserved and loaded');

  // 2. FR-01 & FR-02: Authentication & Credentials
  console.log('\n--- Test Group 2: FR-01/FR-02 Authentication ---');
  const adminUser = await db.getUserByUsername('admin');
  assert(adminUser !== null, 'Default admin account exists');
  assert(
    db.verifyPassword('admin', adminUser.password_hash),
    'Default admin password verifies successfully'
  );
  assert(
    !db.verifyPassword('wrongpass', adminUser.password_hash),
    'Wrong password does not match'
  );

  const nonExistent = await db.getUserByUsername('nobody_random');
  assert(nonExistent === null, 'Non-existent user lookup returns null');

  const registered = await db.createUser({
    username: 'teststaff',
    password_hash: db.hashPassword('staff123'),
    role: 'Staff',
  });
  assert(registered.username === 'teststaff', 'Can register new staff user');
  const verifyReg = await db.getUserByUsername('teststaff');
  assert(verifyReg !== null, 'Registered user can be queried by username');

  // 3. FR-04: Dashboard
  console.log('\n--- Test Group 3: FR-04 Dashboard Summary ---');
  const dashboard = await db.getDashboardData();
  assert(typeof dashboard.patients === 'number', 'Dashboard returns patient count');
  assert(typeof dashboard.doctors === 'number', 'Dashboard returns doctor count');
  assert(typeof dashboard.revenue === 'number', 'Dashboard returns revenue total');
  assert(Array.isArray(dashboard.schedule), 'Dashboard returns today schedule array');

  // 4. FR-05 & FR-06: Patients CRUD & Search
  console.log('\n--- Test Group 4: FR-05/FR-06 Patients CRUD & Search ---');
  const allPatients = await db.getPatients();
  assert(allPatients.length >= 3, 'Retrieves all existing patients');

  const searchedByName = await db.getPatients('Karthik');
  assert(searchedByName.length >= 1, 'Search patient by name works');
  assert(searchedByName[0].name.includes('Karthik'), 'Search result contains Karthik');

  const searchedByPhone = await db.getPatients('9876543210');
  assert(searchedByPhone.length >= 1, 'Search patient by phone works');

  const newPatient = await db.createPatient({
    name: 'Ramesh Sundaram',
    age: 38,
    gender: 'Male',
    phone: '9845123456',
    address: '10 Gandhi Road, Trichy',
  });
  assert(newPatient.id > 0, 'New patient created with ID');
  assert(newPatient.name === 'Ramesh Sundaram', 'Patient name matches');

  const updatedPatient = await db.updatePatient(newPatient.id, {
    name: 'Ramesh S.',
    age: 39,
    gender: 'Male',
    phone: '9845123456',
    address: '12 Gandhi Road, Trichy',
  });
  assert(updatedPatient.name === 'Ramesh S.', 'Patient name updated successfully');
  assert(updatedPatient.age === 39, 'Patient age updated successfully');

  // 5. FR-07 & FR-08: Doctors CRUD & Search
  console.log('\n--- Test Group 5: FR-07/FR-08 Doctors CRUD & Search ---');
  const allDoctors = await db.getDoctors();
  assert(allDoctors.length >= 2, 'Retrieves all existing doctors');

  const docSearch = await db.getDoctors('Pediatrics');
  assert(docSearch.length >= 1, 'Search doctor by specialization works');

  const newDoctor = await db.createDoctor({
    name: 'Dr. V. Rajesh',
    specialization: 'Dermatology',
    phone: '9877788899',
    available: true,
  });
  assert(newDoctor.id > 0, 'New doctor created with ID');

  const updatedDoctor = await db.updateDoctor(newDoctor.id, {
    name: 'Dr. V. Rajesh',
    specialization: 'Dermatology',
    phone: '9877788899',
    available: false,
  });
  assert(updatedDoctor.available === false, 'Doctor availability updated');

  // 6. FR-09 & FR-10: Appointments CRUD & Search
  console.log('\n--- Test Group 6: FR-09/FR-10 Appointments CRUD & Search ---');
  const today = db.getTodayISO();
  const newAppt = await db.createAppointment({
    patient_id: newPatient.id,
    doctor_id: newDoctor.id,
    date: today,
    time: '11:00',
    reason: 'Skin rash',
    status: 'Scheduled',
  });
  assert(newAppt.id > 0, 'New appointment scheduled');
  assert(newAppt.status === 'Scheduled', 'Appointment status is Scheduled');

  const apptSearch = await db.getAppointments('Scheduled');
  assert(apptSearch.length >= 1, 'Search appointment by status works');

  const updatedAppt = await db.updateAppointment(newAppt.id, {
    status: 'Completed',
  });
  assert(updatedAppt.status === 'Completed', 'Appointment marked as Completed');

  // 7. FR-11: Consultations CRUD
  console.log('\n--- Test Group 7: FR-11 Consultations CRUD ---');
  const newConsult = await db.createConsultation({
    patient_id: newPatient.id,
    doctor_id: newDoctor.id,
    appointment_id: newAppt.id,
    diagnosis: 'Contact dermatitis',
    notes: 'Prescribed topical hydrocortisone. Avoid allergens.',
    date: today,
  });
  assert(newConsult.id > 0, 'New consultation created');
  assert(newConsult.diagnosis === 'Contact dermatitis', 'Diagnosis matches');

  // 8. FR-12: Billing CRUD
  console.log('\n--- Test Group 8: FR-12 Billing CRUD ---');
  const newBill = await db.createBill({
    patient_id: newPatient.id,
    amount: 550.0,
    description: 'Specialist consultation fee',
    status: 'Unpaid',
    date: today,
  });
  assert(newBill.id > 0, 'New bill generated');
  assert(newBill.status === 'Unpaid', 'Initial bill status is Unpaid');

  const paidBill = await db.payBill(newBill.id);
  assert(paidBill.status === 'Paid', 'Bill successfully marked as Paid');

  // 9. FR-13: Prescriptions CRUD
  console.log('\n--- Test Group 9: FR-13 Prescriptions CRUD ---');
  const newRx = await db.createPrescription({
    patient_id: newPatient.id,
    doctor_id: newDoctor.id,
    medicine: 'Cetirizine 10mg',
    dosage: '1 tablet at bedtime',
    duration: '7 days',
    notes: 'Take with water',
    date: today,
  });
  assert(newRx.id > 0, 'Prescription created');
  assert(newRx.medicine === 'Cetirizine 10mg', 'Medicine name matches');

  // 10. Linked Records Delete Protection
  console.log('\n--- Test Group 10: Relational Constraints & Delete Protection ---');
  let deleteErrorThrown = false;
  try {
    await db.deletePatient(newPatient.id);
  } catch (err) {
    deleteErrorThrown = true;
    assert(
      err.message.includes('linked records'),
      'Cannot delete patient with linked appointment/bill/consultation/prescription'
    );
  }
  assert(deleteErrorThrown, 'Delete prevention for patient with linked records verified');

  // Clean up linked records
  await db.deletePrescription(newRx.id);
  await db.deleteBill(newBill.id);
  await db.deleteConsultation(newConsult.id);
  await db.deleteAppointment(newAppt.id);

  // Now patient and doctor can be deleted cleanly
  const patDeleted = await db.deletePatient(newPatient.id);
  assert(patDeleted === true, 'Patient can be deleted after linked records removed');

  const docDeleted = await db.deleteDoctor(newDoctor.id);
  assert(docDeleted === true, 'Doctor can be deleted after linked records removed');

  // 11. FR-14: Reports
  console.log('\n--- Test Group 11: FR-14 Reports ---');
  const apptReport = await db.getAppointmentsReport('2020-01-01', '2030-12-31');
  assert(typeof apptReport.total === 'number', 'Appointment report returns total');
  assert(typeof apptReport.counts === 'object', 'Appointment report returns status breakdown');

  const billReport = await db.getBillingReport('2020-01-01', '2030-12-31');
  assert(typeof billReport.total_bills === 'number', 'Billing report returns total_bills');
  assert(typeof billReport.paid_total === 'number', 'Billing report returns paid_total');

  // 12. AI Clinical Copilot & Operations Intelligence
  console.log('\n--- Test Group 12: AI Clinical Copilot & Operations Intelligence ---');
  const aiContext = await getClinicContext();
  assert(typeof aiContext === 'object', 'AI context compilation returns object');
  assert(typeof aiContext.summary === 'object', 'AI context contains summary metrics');
  assert(aiContext.summary.totalPatients >= 3, 'AI context contains live patient metrics');
  assert(aiContext.summary.totalDoctors >= 2, 'AI context contains live doctor metrics');
  assert(Array.isArray(aiContext.doctors), 'AI context provides doctor availability array');
  assert(Array.isArray(aiContext.bills), 'AI context provides billing receivables array');

  // Test AI Query: Operations Summary
  const summaryReply = await queryClinicAi({ query: 'Provide a full clinic operations summary for today' });
  assert(typeof summaryReply.answer === 'string' && summaryReply.answer.length > 50, 'AI generates grounded clinic summary');
  assert(summaryReply.model === 'gemini-3.8-flash', 'AI specifies gemini-3.8-flash model');
  assert(summaryReply.answer.includes('Care Clinic Operations Summary') || summaryReply.answer.includes('Patients'), 'AI summary contains clinic operational sections');

  // Test AI Query: Doctors Availability
  const doctorReply = await queryClinicAi({ query: 'Which doctors are currently available?' });
  assert(doctorReply.answer.toLowerCase().includes('doctor'), 'AI doctor query identifies doctors');

  // Test AI Query: Unpaid Bills & Revenue
  const billReply = await queryClinicAi({ query: 'Analyze outstanding bills and unpaid revenue' });
  assert(billReply.answer.toLowerCase().includes('bill') || billReply.answer.toLowerCase().includes('revenue'), 'AI billing query analyzes receivables');

  // Test AI Query Validation: empty query throws
  let emptyQueryError = false;
  try {
    await queryClinicAi({ query: '   ' });
  } catch {
    emptyQueryError = true;
  }
  assert(emptyQueryError === true, 'AI query properly rejects empty input');

  console.log(`\n=============================================`);
  console.log(`All ${passedTests} / ${totalTests} tests PASSED successfully!`);
  console.log(`=============================================\n`);
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test run failed with error:', err);
  process.exit(1);
});
