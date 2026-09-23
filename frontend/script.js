const API = "";
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
    "ai-assistant": ["AI Assistant", "Clinical operations copilot and natural language insights"],
};

let patients = [];
let doctors = [];
let appointments = [];
let editing = { type: null, id: null };

function token() {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
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

// --- Progressive Web App (PWA) Management ---
let deferredPrompt = null;

function isAppStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.matchMedia('(display-mode: window-controls-overlay)').matches ||
           (window.navigator.standalone === true);
}

function isIOSDevice() {
    const ua = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua);
}

function updateInstallButtonsVisibility() {
    const topbarBtn = document.getElementById("topbarInstallBtn");
    const sidebarBtn = document.getElementById("sidebarInstallBtn");
    const loginBanner = document.getElementById("loginPwaBanner");

    // If running in standalone mode (already launched as installed app), hide all install prompts
    if (isAppStandalone()) {
        if (topbarBtn) topbarBtn.classList.add("hidden");
        if (sidebarBtn) sidebarBtn.classList.add("hidden");
        if (loginBanner) loginBanner.classList.add("hidden");
        return;
    }

    const show = Boolean(deferredPrompt) || isIOSDevice();
    if (topbarBtn) topbarBtn.classList.toggle("hidden", !show);
    if (sidebarBtn) sidebarBtn.classList.toggle("hidden", !show);
    if (loginBanner) loginBanner.classList.toggle("hidden", !show);
}

function showIosInstallModal(show) {
    const modal = document.getElementById("iosInstallModal");
    if (modal) {
        modal.classList.toggle("hidden", !show);
    }
}

async function triggerPwaInstall() {
    if (isIOSDevice() && !deferredPrompt) {
        showIosInstallModal(true);
        return;
    }
    if (!deferredPrompt) {
        showToast("Care Clinic is ready to install via your browser menu.");
        return;
    }
    try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
            showToast("Installing Care Clinic on your device...");
            deferredPrompt = null;
            updateInstallButtonsVisibility();
        }
    } catch (err) {
        console.warn("PWA install error:", err);
    }
}

function setupPwa() {
    // 1. Register Service Worker with root scope
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js', { scope: '/' })
                .then((registration) => {
                    console.log('[PWA] Service Worker registered. Scope:', registration.scope);
                    
                    // Check for updates
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        if (newWorker) {
                            newWorker.addEventListener('statechange', () => {
                                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    console.log('[PWA] New version ready.');
                                }
                            });
                        }
                    });
                })
                .catch((err) => {
                    console.warn('[PWA] Service Worker registration failed:', err);
                });
        });
    }

    // 2. Capture beforeinstallprompt event for Android, Chromium, Desktop Chrome / Edge
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        updateInstallButtonsVisibility();
    });

    // 3. Handle appinstalled event
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        updateInstallButtonsVisibility();
        showToast("Care Clinic installed successfully!");
    });

    // 4. Bind install buttons
    const topbarBtn = document.getElementById("topbarInstallBtn");
    const sidebarBtn = document.getElementById("sidebarInstallBtn");
    const loginInstallBtn = document.getElementById("loginInstallBtn");

    if (topbarBtn) topbarBtn.addEventListener("click", triggerPwaInstall);
    if (sidebarBtn) sidebarBtn.addEventListener("click", triggerPwaInstall);
    if (loginInstallBtn) loginInstallBtn.addEventListener("click", triggerPwaInstall);

    // 5. iOS modal close handlers
    const iosModalClose = document.getElementById("iosModalClose");
    const iosModalDoneBtn = document.getElementById("iosModalDoneBtn");
    const iosModal = document.getElementById("iosInstallModal");

    if (iosModalClose) iosModalClose.addEventListener("click", () => showIosInstallModal(false));
    if (iosModalDoneBtn) iosModalDoneBtn.addEventListener("click", () => showIosInstallModal(false));
    if (iosModal) {
        iosModal.addEventListener("click", (e) => {
            if (e.target === iosModal) showIosInstallModal(false);
        });
    }

    // Initial check for installability or standalone mode
    updateInstallButtonsVisibility();

    // 6. Network connectivity indicator
    const offlineIndicator = document.getElementById("offlineIndicator");
    function updateNetworkStatus() {
        if (offlineIndicator) {
            offlineIndicator.classList.toggle("hidden", navigator.onLine);
        }
    }

    window.addEventListener("online", () => {
        updateNetworkStatus();
        showToast("Connection restored. Back online!");
        if (token()) {
            loadSummary();
        }
    });

    window.addEventListener("offline", () => {
        updateNetworkStatus();
        showToast("You are offline. Running in offline cache mode.");
    });

    updateNetworkStatus();
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
        if (!navigator.onLine) {
            throw new Error("You are currently offline. Please reconnect to perform this action.");
        }
        throw new Error(`Cannot connect to clinic server (${target}). Please ensure the server is online.`);
    }
    let data = null;
    try {
        data = await res.json();
    } catch {
        data = null;
    }
    if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        showApp(false);
        throw new Error((data && (data.detail || data.message)) || "Please log in");
    }
    if (!res.ok) {
        if (data && data.offline) {
            throw new Error(data.detail || "You are currently offline.");
        }
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
    const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY) || "{}";
    let user = {};
    try {
        user = JSON.parse(raw);
    } catch {
        user = {};
    }
    document.getElementById("userName").textContent = user.username || "Staff";
    document.getElementById("userRole").textContent = user.role || "Staff";
    document.getElementById("userInitials").textContent = (user.username || "AD").slice(0, 2).toUpperCase();
}

function openMobileSidebar() {
    const sidebar = document.getElementById("sidebar");
    const backdrop = document.getElementById("sidebarBackdrop");
    if (sidebar) sidebar.classList.add("open");
    if (backdrop) backdrop.classList.remove("hidden");
    document.body.classList.add("sidebar-open");
}

function closeMobileSidebar() {
    const sidebar = document.getElementById("sidebar");
    const backdrop = document.getElementById("sidebarBackdrop");
    if (sidebar) sidebar.classList.remove("open");
    if (backdrop) backdrop.classList.add("hidden");
    document.body.classList.remove("sidebar-open");
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
    closeMobileSidebar();
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
        if (id === "ai-assistant") await loadAiAssistant();
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

// --- AI Assistant Logic ---
function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function formatAiMarkdown(raw) {
    if (!raw) return "";
    const lines = raw.split("\n");
    let html = "";
    let inList = false;

    for (let line of lines) {
        let trimmed = line.trim();
        if (!trimmed) {
            if (inList) {
                html += "</ul>";
                inList = false;
            }
            continue;
        }

        // Headers: ### Header
        if (trimmed.startsWith("### ")) {
            if (inList) {
                html += "</ul>";
                inList = false;
            }
            html += `<h4>${escapeHtml(trimmed.slice(4))}</h4>`;
            continue;
        }
        if (trimmed.startsWith("## ")) {
            if (inList) {
                html += "</ul>";
                inList = false;
            }
            html += `<h3>${escapeHtml(trimmed.slice(3))}</h3>`;
            continue;
        }

        // Bullet list item: • or - or *
        if (/^([•\-\*]|\d+\.)\s+/.test(trimmed)) {
            if (!inList) {
                html += "<ul>";
                inList = true;
            }
            const content = trimmed.replace(/^([•\-\*]|\d+\.)\s+/, "");
            html += `<li>${inlineMarkdown(content)}</li>`;
            continue;
        }

        if (inList) {
            html += "</ul>";
            inList = false;
        }

        html += `<p>${inlineMarkdown(trimmed)}</p>`;
    }

    if (inList) {
        html += "</ul>";
    }
    return html;
}

function inlineMarkdown(text) {
    let safe = escapeHtml(text);
    // Bold: **text**
    safe = safe.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    // Italic: *text* or _text_
    safe = safe.replace(/\*(.*?)\*/g, "<em>$1</em>");
    // Inline code: `text`
    safe = safe.replace(/`(.*?)`/g, "<code>$1</code>");
    return safe;
}

async function loadAiAssistant() {
    try {
        const data = await api("/api/ai/insights");
        if (data && data.summary) {
            const pEl = document.getElementById("aiStatPatients");
            const dEl = document.getElementById("aiStatDoctors");
            const uEl = document.getElementById("aiStatUnpaid");
            if (pEl) pEl.textContent = data.summary.totalPatients;
            if (dEl) dEl.textContent = `${data.summary.availableDoctorsCount} / ${data.summary.totalDoctors} Avail`;
            if (uEl) uEl.textContent = data.summary.totalUnpaidRevenue;
        }
    } catch (err) {
        console.warn("AI insights load failed:", err.message);
    }
}

async function submitAiQuery(queryText) {
    const clean = (queryText || "").trim();
    if (!clean) return;

    const stream = document.getElementById("aiChatStream");
    const loading = document.getElementById("aiChatLoading");
    const errorAlert = document.getElementById("aiChatError");
    const input = document.getElementById("aiQueryInput");
    const sendBtn = document.getElementById("aiSendBtn");

    // Hide error
    if (errorAlert) errorAlert.classList.add("hidden");

    // Append User message
    const userMsg = document.createElement("div");
    userMsg.className = "ai-msg ai-msg-user";
    userMsg.innerHTML = `
        <div class="ai-msg-avatar">👤</div>
        <div class="ai-msg-body">
            <p>${escapeHtml(clean)}</p>
        </div>
    `;
    stream.appendChild(userMsg);
    stream.scrollTop = stream.scrollHeight;

    // Reset input
    if (input) {
        input.value = "";
        input.style.height = "auto";
    }

    // Show Loading
    if (loading) loading.classList.remove("hidden");
    if (sendBtn) {
        sendBtn.disabled = true;
    }

    try {
        const response = await api("/api/ai/query", {
            method: "POST",
            body: JSON.stringify({ query: clean }),
        });

        const timeStr = new Date(response.timestamp || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const sourceLabel = response.source === "gemini" ? "Gemini 3.8 Flash" : "Clinic AI Intelligence";

        const botMsg = document.createElement("div");
        botMsg.className = "ai-msg ai-msg-bot";
        botMsg.innerHTML = `
            <div class="ai-msg-avatar">🤖</div>
            <div class="ai-msg-body">
                ${formatAiMarkdown(response.answer)}
                <div class="ai-msg-meta">
                    <span>✨ ${escapeHtml(sourceLabel)}</span>
                    <span>${timeStr}</span>
                </div>
            </div>
        `;
        stream.appendChild(botMsg);
        stream.scrollTop = stream.scrollHeight;
    } catch (err) {
        if (errorAlert) {
            document.getElementById("aiErrorMessage").textContent = `Error: ${err.message}`;
            errorAlert.classList.remove("hidden");
        } else {
            showToast(err.message);
        }
    } finally {
        if (loading) loading.classList.add("hidden");
        if (sendBtn) sendBtn.disabled = false;
        if (input) input.focus();
    }
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
            localStorage.setItem(TOKEN_KEY, result.token);
            localStorage.setItem(USER_KEY, JSON.stringify({ username: result.username, role: result.role }));
            sessionStorage.setItem(TOKEN_KEY, result.token);
            sessionStorage.setItem(USER_KEY, JSON.stringify({ username: result.username, role: result.role }));
            setUserChip();
            showApp(true);
            switchTab("dashboard");
            updateInstallButtonsVisibility();
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
                localStorage.setItem(TOKEN_KEY, result.token);
                localStorage.setItem(USER_KEY, JSON.stringify({ username: result.username, role: result.role }));
                sessionStorage.setItem(TOKEN_KEY, result.token);
                sessionStorage.setItem(USER_KEY, JSON.stringify({ username: result.username, role: result.role }));
                setUserChip();
                showApp(true);
                switchTab("dashboard");
                updateInstallButtonsVisibility();
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
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        document.getElementById("loginForm").reset();
        showApp(false);
        updateInstallButtonsVisibility();
    });

    document.querySelectorAll(".nav-item").forEach((btn) => {
        btn.addEventListener("click", () => switchTab(btn.dataset.target));
    });

    const menuToggle = document.getElementById("menuToggleBtn");
    if (menuToggle) {
        menuToggle.addEventListener("click", () => {
            const sidebar = document.getElementById("sidebar");
            if (sidebar && sidebar.classList.contains("open")) {
                closeMobileSidebar();
            } else {
                openMobileSidebar();
            }
        });
    }

    const sidebarClose = document.getElementById("sidebarCloseBtn");
    if (sidebarClose) {
        sidebarClose.addEventListener("click", closeMobileSidebar);
    }

    const sidebarBackdrop = document.getElementById("sidebarBackdrop");
    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener("click", closeMobileSidebar);
    }

    // Dismiss overlays on Escape key
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeMobileSidebar();
            closeModal();
        }
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

    // --- AI Assistant Event Bindings ---
    const aiChatForm = document.getElementById("aiChatForm");
    const aiQueryInput = document.getElementById("aiQueryInput");
    if (aiChatForm && aiQueryInput) {
        aiChatForm.addEventListener("submit", (e) => {
            e.preventDefault();
            submitAiQuery(aiQueryInput.value);
        });

        // Auto-expand textarea and submit on Enter without Shift
        aiQueryInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitAiQuery(aiQueryInput.value);
            }
        });
        aiQueryInput.addEventListener("input", () => {
            aiQueryInput.style.height = "auto";
            aiQueryInput.style.height = `${Math.min(aiQueryInput.scrollHeight, 120)}px`;
        });
    }

    // Quick prompt chips
    document.querySelectorAll(".ai-chip-btn").forEach((chip) => {
        chip.addEventListener("click", () => {
            const prompt = chip.dataset.aiPrompt;
            if (prompt) {
                submitAiQuery(prompt);
            }
        });
    });

    // Clear chat history
    const aiClearBtn = document.getElementById("aiClearChatBtn");
    if (aiClearBtn) {
        aiClearBtn.addEventListener("click", () => {
            const stream = document.getElementById("aiChatStream");
            if (stream) {
                stream.innerHTML = `
                    <div class="ai-msg ai-msg-bot">
                        <div class="ai-msg-avatar">🤖</div>
                        <div class="ai-msg-body">
                            <p>Conversation history cleared. How can I assist you with clinic operations today?</p>
                        </div>
                    </div>
                `;
            }
            showToast("Conversation cleared");
        });
    }

    // Retry button on error
    const aiRetryBtn = document.getElementById("aiRetryBtn");
    if (aiRetryBtn) {
        aiRetryBtn.addEventListener("click", () => {
            const errAlert = document.getElementById("aiChatError");
            if (errAlert) errAlert.classList.add("hidden");
            const lastUserMsg = document.querySelector(".ai-msg-user:last-of-type .ai-msg-body p");
            if (lastUserMsg && lastUserMsg.textContent) {
                submitAiQuery(lastUserMsg.textContent);
            }
        });
    }

    // Dashboard AI Quick Buttons
    const dashOpenAiBtn = document.getElementById("dashOpenAiBtn");
    if (dashOpenAiBtn) {
        dashOpenAiBtn.addEventListener("click", () => {
            switchTab("ai-assistant");
        });
    }

    const dashQuickSummaryBtn = document.getElementById("dashQuickSummaryBtn");
    if (dashQuickSummaryBtn) {
        dashQuickSummaryBtn.addEventListener("click", () => {
            switchTab("ai-assistant");
            submitAiQuery("Provide a full clinic operations summary for today with patient load, doctor availability, and pending actions.");
        });
    }

    restoreSession();
    setupPwa();

    // Handle deep-link query parameters from PWA shortcuts (e.g. ?tab=appointments)
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const targetTab = urlParams.get('tab') || urlParams.get('module');
        if (targetTab && titles[targetTab] && token()) {
            switchTab(targetTab);
        }
    } catch {
        /* ignore invalid query */
    }
});
