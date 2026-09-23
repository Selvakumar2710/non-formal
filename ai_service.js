import { GoogleGenAI } from '@google/genai';
import * as db from './db.js';

// Initialize GoogleGenAI SDK with required telemetry header
let aiClient = null;
function getAiClient() {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

/**
 * Compiles a structured, real-time snapshot of clinic operations from the database.
 */
export async function getClinicContext() {
  const [
    dashboard,
    patients,
    doctors,
    appointments,
    consultations,
    bills,
    prescriptions,
  ] = await Promise.all([
    db.getDashboardData().catch(() => ({})),
    db.getPatients().catch(() => []),
    db.getDoctors().catch(() => []),
    db.getAppointments().catch(() => []),
    db.getConsultations().catch(() => []),
    db.getBills().catch(() => []),
    db.getPrescriptions().catch(() => []),
  ]);

  const unpaidBills = bills.filter((b) => b.status === 'Unpaid');
  const paidBills = bills.filter((b) => b.status === 'Paid');
  const totalUnpaid = unpaidBills.reduce((sum, b) => sum + Number(b.amount || 0), 0);
  const totalPaid = paidBills.reduce((sum, b) => sum + Number(b.amount || 0), 0);

  const availableDoctors = doctors.filter((d) => d.available);
  const scheduledAppts = appointments.filter((a) => a.status === 'Scheduled');
  const completedAppts = appointments.filter((a) => a.status === 'Completed');

  return {
    summary: {
      totalPatients: patients.length,
      totalDoctors: doctors.length,
      availableDoctorsCount: availableDoctors.length,
      totalAppointments: appointments.length,
      scheduledAppointmentsCount: scheduledAppts.length,
      completedAppointmentsCount: completedAppts.length,
      totalBills: bills.length,
      unpaidBillsCount: unpaidBills.length,
      totalRevenueCollected: `₹${totalPaid.toLocaleString('en-IN')}`,
      totalUnpaidRevenue: `₹${totalUnpaid.toLocaleString('en-IN')}`,
    },
    patients: patients.map((p) => ({
      id: p.id,
      name: p.name,
      age: p.age,
      gender: p.gender,
      phone: p.phone,
      address: p.address,
    })),
    doctors: doctors.map((d) => ({
      id: d.id,
      name: d.name,
      specialization: d.specialization,
      phone: d.phone,
      available: d.available ? 'Available' : 'Unavailable',
    })),
    appointments: appointments.map((a) => ({
      id: a.id,
      patient: a.patient_name,
      doctor: a.doctor_name,
      date: a.date,
      time: a.time,
      reason: a.reason,
      status: a.status,
    })),
    consultations: consultations.map((c) => ({
      id: c.id,
      patient: c.patient_name,
      doctor: c.doctor_name,
      diagnosis: c.diagnosis,
      notes: c.notes,
      date: c.date,
    })),
    bills: bills.map((b) => ({
      id: b.id,
      patient: b.patient_name,
      amount: `₹${Number(b.amount || 0).toLocaleString('en-IN')}`,
      rawAmount: Number(b.amount || 0),
      status: b.status,
      description: b.description,
      date: b.date,
    })),
    prescriptions: prescriptions.map((pr) => ({
      id: pr.id,
      patient: pr.patient_name,
      doctor: pr.doctor_name,
      medicine: pr.medicine,
      dosage: pr.dosage,
      duration: pr.duration,
      notes: pr.notes,
      date: pr.date,
    })),
  };
}

/**
 * Heuristic fallback for grounded answers when GEMINI_API_KEY is not configured
 * or if the external API call encounters rate limits/network issues.
 */
function generateHeuristicResponse(query, context) {
  const q = (query || '').toLowerCase().trim();

  // Summary / Overview
  if (q.includes('summary') || q.includes('overview') || q.includes('today') || q.includes('status') || q.includes('report')) {
    const dList = context.doctors.map((d) => `• **${d.name}** (${d.specialization}) - *${d.available}*`).join('\n');
    return `### 📊 Care Clinic Operations Summary

**Key Metrics:**
- **Registered Patients:** ${context.summary.totalPatients}
- **Doctors on Staff:** ${context.summary.totalDoctors} (${context.summary.availableDoctorsCount} currently available)
- **Appointments Scheduled:** ${context.summary.scheduledAppointmentsCount} (Total: ${context.summary.totalAppointments})
- **Revenue Collected:** ${context.summary.totalRevenueCollected}
- **Outstanding / Unpaid Invoices:** ${context.summary.totalUnpaidRevenue} (${context.summary.unpaidBillsCount} unpaid bills)

**Medical Staff Status:**
${dList}

**Recommended Next Actions:**
1. Follow up with patients having outstanding payments (${context.summary.unpaidBillsCount} bills pending).
2. Confirm arrival times for ${context.summary.scheduledAppointmentsCount} scheduled appointment(s).
3. Ensure consultations are documented after visits.`;
  }

  // Doctors & Availability
  if (q.includes('doctor') || q.includes('physician') || q.includes('available')) {
    const list = context.doctors
      .map((d) => `• **${d.name}** - Specialization: **${d.specialization}** | Status: **${d.available}** | Contact: ${d.phone}`)
      .join('\n');
    return `### 👨‍⚕️ Doctors & Availability\n\nThere are **${context.doctors.length}** doctors registered:\n\n${list}\n\n*Currently, ${context.summary.availableDoctorsCount} of ${context.doctors.length} doctors are marked as available for consultations.*`;
  }

  // Bills & Revenue
  if (q.includes('bill') || q.includes('revenue') || q.includes('paid') || q.includes('unpaid') || q.includes('money') || q.includes('amount')) {
    const unpaid = context.bills.filter((b) => b.status === 'Unpaid');
    const unpaidList = unpaid.length
      ? unpaid.map((b) => `• Invoice #${b.id}: **${b.patient}** - ${b.amount} (*${b.description || 'Consultation fee'}*)`).join('\n')
      : '• *No outstanding unpaid bills.*';

    return `### 💳 Financial & Billing Breakdown\n\n- **Total Revenue Collected:** ${context.summary.totalRevenueCollected}\n- **Unpaid / Pending Receivables:** ${context.summary.totalUnpaidRevenue}\n- **Total Invoices Issued:** ${context.summary.totalBills}\n\n**Pending Unpaid Invoices:**\n${unpaidList}`;
  }

  // Patients & Records
  if (q.includes('patient') || q.includes('patient list') || q.includes('who is')) {
    const list = context.patients
      .map((p) => `• **${p.name}** (Age ${p.age}, ${p.gender}) - Phone: ${p.phone} | Address: ${p.address || 'N/A'}`)
      .join('\n');
    return `### 🏥 Registered Patients (${context.patients.length})\n\n${list}`;
  }

  // Appointments
  if (q.includes('appointment') || q.includes('schedule') || q.includes('visit')) {
    const list = context.appointments
      .map((a) => `• [${a.date} ${a.time}] **${a.patient}** with **${a.doctor}** - Reason: *${a.reason || 'General'}* (Status: **${a.status}**)`)
      .join('\n');
    return `### 📅 Clinic Appointments (${context.appointments.length})\n\n${list || 'No appointments recorded.'}`;
  }

  // Prescriptions & Consultations
  if (q.includes('prescription') || q.includes('medicine') || q.includes('drug') || q.includes('diagnosis') || q.includes('consultation')) {
    const rxList = context.prescriptions
      .map((pr) => `• **${pr.patient}** (by ${pr.doctor}): **${pr.medicine}** | Dosage: ${pr.dosage} | Duration: ${pr.duration || 'As directed'} | Notes: ${pr.notes || 'None'}`)
      .join('\n');
    const diagList = context.consultations
      .map((c) => `• **${c.patient}** (Dr. ${c.doctor}): Diagnosis: *${c.diagnosis}* | Notes: ${c.notes || 'Routine check'}`)
      .join('\n');
    return `### 💊 Consultations & Prescriptions\n\n**Recent Diagnoses:**\n${diagList || '• None recorded'}\n\n**Prescriptions:**\n${rxList || '• None recorded'}`;
  }

  // General grounded fallback
  return `### 🤖 Care Clinic AI Assistant

Based on current clinic data:
- **Patients:** ${context.summary.totalPatients} registered
- **Doctors:** ${context.summary.totalDoctors} (${context.summary.availableDoctorsCount} available)
- **Appointments:** ${context.summary.scheduledAppointmentsCount} scheduled
- **Revenue:** ${context.summary.totalRevenueCollected} collected (${context.summary.totalUnpaidRevenue} unpaid)

You can ask me specific questions such as:
- *"Which doctors are available today?"*
- *"Summarize unpaid bills and pending revenue"*
- *"Show me recent prescriptions and diagnoses"*
- *"Provide a full clinic operations summary"*`;
}

/**
 * Main AI Query Handler
 * Uses Google Gemini 3.8 Flash model when GEMINI_API_KEY is present,
 * with seamless fallback to grounded heuristic analysis.
 */
export async function queryClinicAi({ query, history = [] }) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    throw new Error('Query string is required.');
  }

  const cleanQuery = query.trim();
  const context = await getClinicContext();

  const systemInstruction = `You are the AI Clinical & Operations Copilot for "Care Clinic Management System".
Your role is to assist healthcare administrators, doctors, and clinic staff with operational insights, patient summaries, doctor schedules, appointments, billing tracking, and prescriptions.

REAL-TIME CLINIC DATA SNAPSHOT:
${JSON.stringify(context, null, 2)}

GUIDELINES:
1. Ground your answers strictly in the REAL-TIME CLINIC DATA SNAPSHOT above.
2. Provide clear, professional, well-formatted Markdown responses. Use bolding, bullet points, and tables when helpful.
3. Currency must always be formatted in Indian Rupees (₹).
4. If a user asks about a patient, doctor, appointment, or bill not found in the records, state clearly that it is not present in the current database.
5. Provide actionable recommendations for clinic staff (e.g. following up on unpaid bills, checking doctor availability, scheduling reminders).
6. Do NOT provide speculative personal medical diagnoses or prescribe new drugs; clarify that actual clinical decisions must be approved by the treating doctor.
7. Keep responses concise, scannable, and helpful.`;

  const ai = getAiClient();

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: cleanQuery,
        config: {
          systemInstruction,
          temperature: 0.2,
        },
      });

      const replyText = response.text;
      if (replyText && replyText.trim()) {
        return {
          answer: replyText.trim(),
          model: 'gemini-3.8-flash',
          source: 'gemini',
          timestamp: new Date().toISOString(),
        };
      }
    } catch (err) {
      console.warn('Gemini API call returned error or timeout, falling back to grounded analytics:', err.message);
    }
  }

  // Grounded rule-based fallback
  const fallbackAnswer = generateHeuristicResponse(cleanQuery, context);
  return {
    answer: fallbackAnswer,
    model: 'gemini-3.8-flash',
    source: ai ? 'grounded-fallback' : 'clinic-intelligence',
    timestamp: new Date().toISOString(),
  };
}
