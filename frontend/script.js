const API = (() => {
    if (window.location.protocol === "file:") return "http://127.0.0.1:8000";
    if (window.location.port && window.location.port !== "8000") return "http://127.0.0.1:8000";
    return "";
})();
const TOKEN_KEY = "clinic_token";
const USER_KEY = "clinic_user";

const titles = {
    dashboard: ["Dashboard", "Overview of clinic operations"],
    patients: ["Patients", "Register and maintain patient records"],
    doctors: ["Doctors", "Manage doctor profiles and availability"],
    appointments: ["Appointments", "Schedule and track clinic visits"],
    consultations: ["Consultations", "Record diagnosis and notes"],
    billing: ["Billing", "Create and track patient bills"],
    prescriptions: ["Prescriptions", "Record prescribed medicines"],
    reports: ["Reports", "Appointment and billing summaries by date"],
};

let patients = [];
let doctors = [];
let appointments = [];
let editing = { type: null, id: null };

function token() {
    return sessionStorage.getItem(TOKEN_KEY);
}

function showToast(message) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 2400);
}

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

function money(value) {
    return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function badge(status) {
    const map = {
        Scheduled: "badge-warn",
        Completed: "badge-ok",
        Cancelled: "badge-muted",
        Paid: "badge-ok",
        Unpaid: "badge-danger",
        Yes: "badge-ok",
        No: "badge-muted",
    };
    return `<span class="badge ${map[status] || "badge-muted"}">${status}</span>`;
}

function emptyRow(cols, text) {
    return `<tr><td colspan="${cols}" class="empty">${text}</td></tr>`;
}

async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }
    if (token()) {
        headers.Authorization = `Bearer ${token()}`;
    }
    let res;
    try {
        res = await fetch(`${API}${path}`, { ...options, headers });
    } catch (networkErr) {
        const target = API || window.location.origin;
        throw new Error(`Cannot connect to backend server (${target}). Please ensure the FastAPI backend is running (run start_backend.bat or python main.py).`);
    }
    let data = null;
    try {
        data = await res.json();
    } catch {
        data = null;
    }
    if (res.status === 401) {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        showApp(false);
        throw new Error((data && (data.detail || data.message)) || "Please log in");
    }
    if (!res.ok) {
        const detail = data && data.detail;
        const message = Array.isArray(detail)
            ? detail.map((item) => item.msg || JSON.stringify(item)).join("; ")
            : detail || "Request failed";
        throw new Error(message);
    }
    return data;
}

async function checkBackendStatus() {
    try {
        const res = await fetch(`${API}/api/health`);
        if (res.ok) {
            const data = await res.json();
            console.log("Clinic system online. Database:", data.database);
            return true;
        }
    } catch {
        console.warn("Backend offline or unreachable");
    }
    return false;
}

function showApp(loggedIn) {
    document.getElementById("login-page").classList.toggle("hidden", loggedIn);
    document.getElementById("app-dashboard").classList.toggle("hidden", !loggedIn);
}

function setUserChip() {
    const user = JSON.parse(sessionStorage.getItem(USER_KEY) || "{}");
    document.getElementById("userName").textContent = user.username || "Staff";
    document.getElementById("userRole").textContent = user.role || "Staff";
    document.getElementById("userInitials").textContent = (user.username || "AD").slice(0, 2).toUpperCase();
}

function switchTab(id) {
    document.querySelectorAll(".nav-item").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.target === id);
    });
    document.querySelectorAll(".module").forEach((mod) => {
        mod.classList.toggle("active", mod.id === id);
    });
    const [title, subtitle] = titles[id] || ["Clinic", ""];
    document.getElementById("pageTitle").textContent = title;
    document.getElementById("pageSubtitle").textContent = subtitle;
    document.getElementById("sidebar").classList.remove("open");
    loadModule(id);
}

async function loadModule(id) {
    try {
        if (id === "dashboard") await loadDashboard();
        if (id === "patients") await loadPatients();
        if (id === "doctors") await loadDoctors();
        if (id === "appointments") await loadAppointments();
        if (id === "consultations") await loadConsultations();
        if (id === "billing") await loadBills();
        if (id === "prescriptions") await loadPrescriptions();
        if (id === "reports") initReports();
    } catch (err) {
        showToast(err.message);
    }
}

async function loadLookups() {
    [patients, doctors, appointments] = await Promise.all([
        api("/api/patients"),
        api("/api/doctors"),
        api("/api/appointments"),
    ]);
}

async function loadDashboard() {
    const data = await api("/api/dashboard");
    document.getElementById("metricPatients").textContent = data.patients;
    document.getElementById("metricDoctors").textContent = data.doctors;
    document.getElementById("metricAppts").textContent = data.today_appointments;
    document.getElementById("metricRevenue").textContent = money(data.revenue);
    const body = document.getElementById("scheduleBody");
    if (!data.schedule.length) {
        body.innerHTML = emptyRow(5, "No appointments scheduled for today.");
        return;
    }
    body.innerHTML = data.schedule
        .map(
            (row) => `<tr>
            <td>${row.time}</td>
            <td>${row.patient_name}</td>
            <td>${row.doctor_name}</td>
            <td>${row.reason || "-"}</td>
            <td>${badge(row.status)}</td>
        </tr>`
        )
        .join("");
}

function actionButtons(type, id) {
    return `<td class="row-actions">
        <button class="btn btn-sm" data-edit="${type}" data-id="${id}">Edit</button>
        <button class="btn btn-sm btn-danger" data-delete="${type}" data-id="${id}">Delete</button>
    </td>`;
}

async function loadPatients(q = "") {
    const rows = await api(`/api/patients${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    const body = document.getElementById("patientsBody");
    if (!rows.length) {
        body.innerHTML = emptyRow(6, "No patients found.");
        return;
    }
    body.innerHTML = rows
        .map(
            (row) => `<tr>
            <td>${row.name}</td>
            <td>${row.age}</td>
            <td>${row.gender}</td>
            <td>${row.phone}</td>
            <td>${row.address || "-"}</td>
            ${actionButtons("patient", row.id)}
        </tr>`
        )
        .join("");
}

async function loadDoctors(q = "") {
    const rows = await api(`/api/doctors${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    const body = document.getElementById("doctorsBody");
    if (!rows.length) {
        body.innerHTML = emptyRow(5, "No doctors found.");
        return;
    }
    body.innerHTML = rows
        .map(
            (row) => `<tr>
            <td>${row.name}</td>
            <td>${row.specialization}</td>
            <td>${row.phone}</td>
            <td>${badge(row.available ? "Yes" : "No")}</td>
            ${actionButtons("doctor", row.id)}
        </tr>`
        )
        .join("");
}

async function loadAppointments(q = "") {
    const rows = await api(`/api/appointments${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    const body = document.getElementById("appointmentsBody");
    if (!rows.length) {
        body.innerHTML = emptyRow(7, "No appointments found.");
        return;
    }
    body.innerHTML = rows
        .map(
            (row) => `<tr>
            <td>${row.date}</td>
            <td>${row.time}</td>
            <td>${row.patient_name}</td>
            <td>${row.doctor_name}</td>
            <td>${row.reason || "-"}</td>
            <td>${badge(row.status)}</td>
            ${actionButtons("appointment", row.id)}
        </tr>`
        )
        .join("");
}

async function loadConsultations() {
    const rows = await api("/api/consultations");
    const body = document.getElementById("consultationsBody");
    if (!rows.length) {
        body.innerHTML = emptyRow(6, "No consultations found.");
        return;
    }
    body.innerHTML = rows
        .map(
            (row) => `<tr>
            <td>${row.date}</td>
            <td>${row.patient_name}</td>
            <td>${row.doctor_name}</td>
            <td>${row.diagnosis}</td>
            <td>${row.notes || "-"}</td>
            ${actionButtons("consultation", row.id)}
        </tr>`
        )
        .join("");
}

async function loadBills() {
    const rows = await api("/api/bills");
    const body = document.getElementById("billsBody");
    if (!rows.length) {
        body.innerHTML = emptyRow(6, "No bills found.");
        return;
    }
    body.innerHTML = rows
        .map(
            (row) => `<tr>
            <td>${row.date}</td>
            <td>${row.patient_name}</td>
            <td>${row.description || "-"}</td>
            <td>${money(row.amount)}</td>
            <td>${badge(row.status)}</td>
            ${actionButtons("bill", row.id)}
        </tr>`
        )
        .join("");
}

async function loadPrescriptions() {
    const rows = await api("/api/prescriptions");
    const body = document.getElementById("prescriptionsBody");
    if (!rows.length) {
        body.innerHTML = emptyRow(7, "No prescriptions found.");
        return;
    }
    body.innerHTML = rows
        .map(
            (row) => `<tr>
            <td>${row.date}</td>
            <td>${row.patient_name}</td>
            <td>${row.doctor_name}</td>
            <td>${row.medicine}</td>
            <td>${row.dosage}</td>
            <td>${row.duration || "-"}</td>
            ${actionButtons("prescription", row.id)}
        </tr>`
        )
        .join("");
}

function initReports() {
    const from = document.getElementById("reportFrom");
    const to = document.getElementById("reportTo");
    if (!from.value) from.value = todayISO();
    if (!to.value) to.value = todayISO();
}

async function loadReports() {
    const from = document.getElementById("reportFrom").value;
    const to = document.getElementById("reportTo").value;
    if (!from || !to) {
        showToast("Select from and to dates");
        return;
    }
    const [appts, bills] = await Promise.all([
        api(`/api/reports/appointments?from_date=${from}&to_date=${to}`),
        api(`/api/reports/billing?from_date=${from}&to_date=${to}`),
    ]);
    document.getElementById("reportApptTotal").textContent = appts.total;
    document.getElementById("reportScheduled").textContent = appts.counts.Scheduled || 0;
    document.getElementById("reportPaid").textContent = money(bills.paid_total);
    document.getElementById("reportUnpaid").textContent = money(bills.unpaid_total);
    document.getElementById("reportApptsBody").innerHTML = appts.rows.length
        ? appts.rows
              .map(
                  (row) => `<tr>
                <td>${row.date}</td>
                <td>${row.patient_name}</td>
                <td>${row.doctor_name}</td>
                <td>${badge(row.status)}</td>
            </tr>`
              )
              .join("")
        : emptyRow(4, "No appointments in this range.");
    document.getElementById("reportBillsBody").innerHTML = bills.rows.length
        ? bills.rows
              .map(
                  (row) => `<tr>
                <td>${row.date}</td>
                <td>${row.patient_name}</td>
                <td>${money(row.amount)}</td>
                <td>${badge(row.status)}</td>
            </tr>`
              )
              .join("")
        : emptyRow(4, "No bills in this range.");
}

function options(list, valueKey, labelKey, selected) {
    return list
        .map(
            (item) =>
                `<option value="${item[valueKey]}" ${String(item[valueKey]) === String(selected || "") ? "selected" : ""}>${item[labelKey]}</option>`
        )
        .join("");
}

function field(label, control, errorId) {
    return `<label>${label}${control}<small class="field-error" id="${errorId}"></small></label>`;
}

function formHtml(type, data = {}) {
    if (type === "patient") {
        return [
            field("Name", `<input name="name" required minlength="2" maxlength="80" value="${data.name || ""}">`, "err-name"),
            field("Age", `<input name="age" type="number" min="0" max="120" required value="${data.age ?? ""}">`, "err-age"),
            field(
                "Gender",
                `<select name="gender" required>
                    ${["Male", "Female", "Other"]
                        .map((g) => `<option ${data.gender === g ? "selected" : ""}>${g}</option>`)
                        .join("")}
                </select>`,
                "err-gender"
            ),
            field("Phone", `<input name="phone" required pattern="\\d{10}" maxlength="10" value="${data.phone || ""}">`, "err-phone"),
            field("Address", `<input name="address" maxlength="200" value="${data.address || ""}">`, "err-address"),
        ].join("");
    }
    if (type === "doctor") {
        return [
            field("Name", `<input name="name" required minlength="2" maxlength="80" value="${data.name || ""}">`, "err-name"),
            field(
                "Specialization",
                `<input name="specialization" required minlength="2" maxlength="80" value="${data.specialization || ""}">`,
                "err-spec"
            ),
            field("Phone", `<input name="phone" required pattern="\\d{10}" maxlength="10" value="${data.phone || ""}">`, "err-phone"),
            field(
                "Available",
                `<select name="available">
                    <option value="true" ${data.available !== false ? "selected" : ""}>Yes</option>
                    <option value="false" ${data.available === false ? "selected" : ""}>No</option>
                </select>`,
                "err-avail"
            ),
        ].join("");
    }
    if (type === "appointment") {
        return [
            field("Patient", `<select name="patient_id" required>${options(patients, "id", "name", data.patient_id)}</select>`, "err-patient"),
            field("Doctor", `<select name="doctor_id" required>${options(doctors, "id", "name", data.doctor_id)}</select>`, "err-doctor"),
            field("Date", `<input name="date" type="date" required value="${data.date || todayISO()}">`, "err-date"),
            field("Time", `<input name="time" type="time" required value="${data.time || "09:00"}">`, "err-time"),
            field("Reason", `<input name="reason" maxlength="200" value="${data.reason || ""}">`, "err-reason"),
            field(
                "Status",
                `<select name="status">${["Scheduled", "Completed", "Cancelled"]
                    .map((s) => `<option ${data.status === s ? "selected" : ""}>${s}</option>`)
                    .join("")}</select>`,
                "err-status"
            ),
        ].join("");
    }
    if (type === "consultation") {
        const apptOptions =
            `<option value="">None</option>` +
            appointments
                .map(
                    (item) =>
                        `<option value="${item.id}" ${String(item.id) === String(data.appointment_id || "") ? "selected" : ""}>#${item.id} ${item.patient_name} (${item.date})</option>`
                )
                .join("");
        return [
            field("Patient", `<select name="patient_id" required>${options(patients, "id", "name", data.patient_id)}</select>`, "err-patient"),
            field("Doctor", `<select name="doctor_id" required>${options(doctors, "id", "name", data.doctor_id)}</select>`, "err-doctor"),
            field("Linked appointment (optional)", `<select name="appointment_id">${apptOptions}</select>`, "err-appt"),
            field("Date", `<input name="date" type="date" required value="${data.date || todayISO()}">`, "err-date"),
            field("Diagnosis", `<input name="diagnosis" required minlength="2" maxlength="200" value="${data.diagnosis || ""}">`, "err-diag"),
            field("Notes", `<textarea name="notes" rows="3">${data.notes || ""}</textarea>`, "err-notes"),
        ].join("");
    }
    if (type === "bill") {
        return [
            field("Patient", `<select name="patient_id" required>${options(patients, "id", "name", data.patient_id)}</select>`, "err-patient"),
            field("Amount", `<input name="amount" type="number" min="0.01" step="0.01" required value="${data.amount || ""}">`, "err-amount"),
            field("Description", `<input name="description" maxlength="200" value="${data.description || ""}">`, "err-desc"),
            field(
                "Status",
                `<select name="status">${["Unpaid", "Paid"].map((s) => `<option ${data.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>`,
                "err-status"
            ),
            field("Date", `<input name="date" type="date" required value="${data.date || todayISO()}">`, "err-date"),
        ].join("");
    }
    if (type === "prescription") {
        return [
            field("Patient", `<select name="patient_id" required>${options(patients, "id", "name", data.patient_id)}</select>`, "err-patient"),
            field("Doctor", `<select name="doctor_id" required>${options(doctors, "id", "name", data.doctor_id)}</select>`, "err-doctor"),
            field("Medicine", `<input name="medicine" required minlength="2" maxlength="120" value="${data.medicine || ""}">`, "err-med"),
            field("Dosage", `<input name="dosage" required maxlength="80" value="${data.dosage || ""}">`, "err-dose"),
            field("Duration", `<input name="duration" maxlength="80" value="${data.duration || ""}">`, "err-dur"),
            field("Notes", `<input name="notes" maxlength="300" value="${data.notes || ""}">`, "err-notes"),
            field("Date", `<input name="date" type="date" required value="${data.date || todayISO()}">`, "err-date"),
        ].join("");
    }
    return "";
}

const endpoints = {
    patient: "/api/patients",
    doctor: "/api/doctors",
    appointment: "/api/appointments",
    consultation: "/api/consultations",
    bill: "/api/bills",
    prescription: "/api/prescriptions",
};

function payloadFrom(type, form) {
    const data = Object.fromEntries(new FormData(form).entries());
    if (type === "patient") {
        return { ...data, age: Number(data.age) };
    }
    if (type === "doctor") {
        return { ...data, available: data.available === "true" };
    }
    if (type === "appointment") {
        return { ...data, patient_id: Number(data.patient_id), doctor_id: Number(data.doctor_id) };
    }
    if (type === "consultation") {
        return {
            ...data,
            patient_id: Number(data.patient_id),
            doctor_id: Number(data.doctor_id),
            appointment_id: data.appointment_id ? Number(data.appointment_id) : null,
        };
    }
    if (type === "bill") {
        return { ...data, patient_id: Number(data.patient_id), amount: Number(data.amount) };
    }
    if (type === "prescription") {
        return { ...data, patient_id: Number(data.patient_id), doctor_id: Number(data.doctor_id) };
    }
    return data;
}

function validateForm(type, form) {
    form.querySelectorAll(".field-error").forEach((el) => {
        el.textContent = "";
    });
    if (!form.reportValidity()) {
        return false;
    }
    const data = payloadFrom(type, form);
    if (data.phone && !/^\d{10}$/.test(data.phone)) {
        showToast("Phone must be 10 digits");
        return false;
    }
    if (type === "bill" && !(data.amount > 0)) {
        showToast("Amount must be greater than 0");
        return false;
    }
    return true;
}

async function openModal(type, id = null) {
    await loadLookups();
    editing = { type, id };
    let data = {};
    if (id) {
        data = await api(`${endpoints[type]}/${id}`);
    }
    document.getElementById("modalTitle").textContent = `${id ? "Edit" : "Add"} ${type}`;
    const form = document.getElementById("modalForm");
    form.innerHTML =
        formHtml(type, data) +
        `<div class="form-actions">
            <button type="button" class="btn btn-sm" id="cancelModal">Cancel</button>
            <button type="submit" class="btn btn-primary">${id ? "Save" : "Create"}</button>
        </div>`;
    document.getElementById("modal").classList.remove("hidden");
    document.getElementById("cancelModal").onclick = closeModal;
}

function closeModal() {
    document.getElementById("modal").classList.add("hidden");
    editing = { type: null, id: null };
}

async function restoreSession() {
    if (!token()) {
        showApp(false);
        return;
    }
    try {
        const me = await api("/api/auth/me");
        sessionStorage.setItem(USER_KEY, JSON.stringify(me));
        setUserChip();
        showApp(true);
        switchTab("dashboard");
    } catch {
        showApp(false);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // Check backend and MongoDB connection status
    checkBackendStatus();
    setInterval(() => {
        if (!document.getElementById("login-page").classList.contains("hidden")) {
            checkBackendStatus();
        }
    }, 8000);

    // Tab switcher between Login and Register
    const tabLoginBtn = document.getElementById("tabLoginBtn");
    const tabRegisterBtn = document.getElementById("tabRegisterBtn");
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");
    const switchToLoginLink = document.getElementById("switchToLoginLink");

    function setAuthTab(tab) {
        const isLogin = tab === "login";
        if (tabLoginBtn) tabLoginBtn.classList.toggle("active", isLogin);
        if (tabRegisterBtn) tabRegisterBtn.classList.toggle("active", !isLogin);
        if (loginForm) loginForm.classList.toggle("hidden", !isLogin);
        if (registerForm) registerForm.classList.toggle("hidden", isLogin);
    }

    if (tabLoginBtn) tabLoginBtn.addEventListener("click", () => setAuthTab("login"));
    if (tabRegisterBtn) tabRegisterBtn.addEventListener("click", () => setAuthTab("register"));
    if (switchToLoginLink) {
        switchToLoginLink.addEventListener("click", (e) => {
            e.preventDefault();
            setAuthTab("login");
        });
    }

    // Quick demo autofill
    const fillDemoBtn = document.getElementById("fillDemoBtn");
    if (fillDemoBtn) {
        fillDemoBtn.addEventListener("click", () => {
            setAuthTab("login");
            const userInp = document.getElementById("username");
            const passInp = document.getElementById("password");
            if (userInp && passInp) {
                userInp.value = "admin";
                passInp.value = "admin";
                showToast("Demo credentials filled: admin / admin");
            }
        });
    }

    // Password visibility toggle helpers
    function setupPassToggle(btnId, inputId) {
        const btn = document.getElementById(btnId);
        const inp = document.getElementById(inputId);
        if (btn && inp) {
            btn.addEventListener("click", () => {
                const isPass = inp.type === "password";
                inp.type = isPass ? "text" : "password";
                btn.textContent = isPass ? "🙈" : "👁️";
            });
        }
    }
    setupPassToggle("togglePasswordBtn", "password");
    setupPassToggle("toggleRegPasswordBtn", "regPassword");

    // Login Form Submission
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const error = document.getElementById("loginError");
        error.classList.add("hidden");
        const username = document.getElementById("username").value.trim();
        const password = document.getElementById("password").value;
        if (!username || !password) {
            error.textContent = "Username and password are required.";
            error.classList.remove("hidden");
            return;
        }

        const loginBtn = document.getElementById("loginBtn");
        loginBtn.disabled = true;
        loginBtn.textContent = "Signing in...";

        try {
            const result = await api("/api/auth/login", {
                method: "POST",
                body: JSON.stringify({ username, password }),
            });
            sessionStorage.setItem(TOKEN_KEY, result.token);
            sessionStorage.setItem(USER_KEY, JSON.stringify({ username: result.username, role: result.role }));
            setUserChip();
            showApp(true);
            switchTab("dashboard");
            showToast(`Welcome back, ${result.username}!`);
        } catch (err) {
            error.textContent = err.message;
            error.classList.remove("hidden");
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = "Sign in";
        }
    });

    // Registration Form Submission
    if (registerForm) {
        registerForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const alertEl = document.getElementById("registerAlert");
            alertEl.classList.add("hidden");
            alertEl.classList.remove("success");

            const username = document.getElementById("regUsername").value.trim();
            const password = document.getElementById("regPassword").value;
            const role = document.getElementById("regRole").value;

            if (!username || !password) {
                alertEl.textContent = "Username and password are required.";
                alertEl.classList.remove("hidden");
                return;
            }

            const regBtn = document.getElementById("registerBtn");
            regBtn.disabled = true;
            regBtn.textContent = "Creating account...";

            try {
                const result = await api("/api/auth/register", {
                    method: "POST",
                    body: JSON.stringify({ username, password, role }),
                });
                sessionStorage.setItem(TOKEN_KEY, result.token);
                sessionStorage.setItem(USER_KEY, JSON.stringify({ username: result.username, role: result.role }));
                setUserChip();
                showApp(true);
                switchTab("dashboard");
                showToast(`Welcome, ${result.username}! Account created successfully.`);
            } catch (err) {
                alertEl.textContent = err.message;
                alertEl.classList.remove("hidden");
            } finally {
                regBtn.disabled = false;
                regBtn.textContent = "Create Account";
            }
        });
    }

    document.getElementById("logoutBtn").addEventListener("click", async () => {
        try {
            await api("/api/auth/logout", { method: "POST" });
        } catch {
            /* still clear local session */
        }
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        document.getElementById("loginForm").reset();
        showApp(false);
    });

    document.querySelectorAll(".nav-item").forEach((btn) => {
        btn.addEventListener("click", () => switchTab(btn.dataset.target));
    });

    document.getElementById("menuToggleBtn").addEventListener("click", () => {
        document.getElementById("sidebar").classList.toggle("open");
    });

    document.querySelectorAll("[data-open]").forEach((btn) => {
        btn.addEventListener("click", () => openModal(btn.dataset.open));
    });

    document.getElementById("modalClose").addEventListener("click", closeModal);
    document.getElementById("modal").addEventListener("click", (event) => {
        if (event.target.id === "modal") closeModal();
    });

    document.getElementById("modalForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const { type, id } = editing;
        if (!type || !validateForm(type, event.target)) return;
        const body = payloadFrom(type, event.target);
        try {
            if (id) {
                await api(`${endpoints[type]}/${id}`, { method: "PUT", body: JSON.stringify(body) });
                showToast("Record updated");
            } else {
                await api(endpoints[type], { method: "POST", body: JSON.stringify(body) });
                showToast("Record created");
            }
            closeModal();
            const active = document.querySelector(".nav-item.active").dataset.target;
            await loadModule(active === "dashboard" ? "dashboard" : active);
        } catch (err) {
            showToast(err.message);
        }
    });

    document.querySelector(".content").addEventListener("click", async (event) => {
        const editBtn = event.target.closest("[data-edit]");
        const deleteBtn = event.target.closest("[data-delete]");
        try {
            if (editBtn) {
                await openModal(editBtn.dataset.edit, Number(editBtn.dataset.id));
            }
            if (deleteBtn) {
                const type = deleteBtn.dataset.delete;
                const id = deleteBtn.dataset.id;
                if (!confirm("Delete this record?")) return;
                await api(`${endpoints[type]}/${id}`, { method: "DELETE" });
                showToast("Record deleted");
                await loadModule(document.querySelector(".nav-item.active").dataset.target);
            }
        } catch (err) {
            showToast(err.message);
        }
    });

    const debounce = (fn) => {
        let timer;
        return (event) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(event.target.value.trim()), 250);
        };
    };
    ["input", "change", "search"].forEach((evt) => {
        document.getElementById("patientSearch").addEventListener(evt, debounce((q) => loadPatients(q)));
        document.getElementById("doctorSearch").addEventListener(evt, debounce((q) => loadDoctors(q)));
        document.getElementById("appointmentSearch").addEventListener(evt, debounce((q) => loadAppointments(q)));
    });

    document.getElementById("reportForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
            await loadReports();
        } catch (err) {
            showToast(err.message);
        }
    });

    restoreSession();
});
