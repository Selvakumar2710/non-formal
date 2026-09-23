# Care Clinic - Clinic Management System

A production-ready enterprise healthcare staff portal for seamless clinic operations, appointment scheduling, electronic medical records (EMR), billing, prescription management, and AI-powered clinical operational intelligence.

---

## 🌟 Key Features

- **PWA (Progressive Web App)**: Installable on Desktop (Chrome/Edge) and Mobile (Android/iOS) with offline navigation, background caching, and app shortcuts.
- **Patient EMR & Directory**: Comprehensive records, search by name/phone, medical history, and delete protection against orphaned records.
- **Doctor Profiles & Availability**: Real-time availability toggling, specialty mapping, and schedule management.
- **Appointment Scheduling**: Complete visit tracking with status lifecycle (`Scheduled`, `Completed`, `Cancelled`).
- **Consultations & Clinical Notes**: Diagnosis recording, physician notes, and appointment linking.
- **Billing & Receivables**: Invoicing, payment status tracking (`Paid` vs `Unpaid`), and revenue analytics.
- **Prescription Management**: Dosage, duration, frequency, instructions, and patient history.
- **Operational Reports**: Date-filtered appointment breakdowns and revenue collection summaries.
- **AI Clinical Operations Copilot**: Natural language assistant powered by Google Gemini (`gemini-3.8-flash`) with grounded fallback analytics.

---

## 🛠 Tech Stack

- **Frontend**: Vanilla JavaScript (ES6+), CSS3 with modern mobile responsiveness (`100dvh`, notch safe-areas), PWA Service Worker (`sw.js`), Web App Manifest (`manifest.webmanifest`).
- **Backend**: Node.js runtime, Express REST API with CORS and structured error handling.
- **Database**:
  - Direct PostgreSQL via `pg.Pool` (connection pooling with SSL support).
  - Supabase REST API client via `@supabase/supabase-js`.
  - In-memory resilient storage for offline/testing fallback.
- **AI / LLM**: Google Gemini TypeScript SDK (`@google/genai`) using `gemini-3.8-flash`.

---

## 🚀 Getting Started Locally

### Prerequisites
- Node.js >= 18.0.0
- npm or bun

### 1. Installation
```bash
git clone <repository-url>
cd clinic-management-system
npm install
```

### 2. Environment Setup
Copy the example environment configuration:
```bash
cp .env.example .env
```
Edit `.env` with your Supabase or PostgreSQL credentials, and your Gemini API key (optional for AI features).

### 3. Run Development Server
```bash
npm run dev
# or
npm start
```
Open **http://localhost:3000** in your browser.

---

## 🔐 Default Staff Accounts

| Username | Password | Role | Description |
|---|---|---|---|
| `admin` | `admin` | Staff / Admin | Full administrator access |
| `selvakumar` | `admin` | Staff | Registered clinical staff |

*Staff can also self-register directly from the login page.*

---

## 🧪 Testing

Run the automated test suite covering all 56 functional and relational requirements:
```bash
npm test
```

To run lint checks:
```bash
npm run lint
```

---

## 🚢 Production Deployment

### Option 1: Docker / Container (Cloud Run, AWS ECS, DigitalOcean App Platform)
The application is pre-configured with:
- Dynamic port detection: `PORT` environment variable (default: 3000)
- Graceful shutdown handlers for `SIGTERM` and `SIGINT`
- Production health check endpoints: `GET /api/health` and `GET /api/status`

A standard Dockerfile for containerized deployment:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
```

### Option 2: Render / Railway / Heroku
1. Connect your GitHub repository.
2. Select **Node.js** environment.
3. Build command: `npm run build`
4. Start command: `npm start`
5. Configure Environment Variables:
   - `DATABASE_URL` or `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY` (optional)
   - `NODE_ENV=production`

---

## 📁 Project Structure

```text
├── frontend/
│   ├── index.html               # Main SPA markup & PWA install prompts
│   ├── style.css                # Responsive UI styling & notch adaptations
│   ├── script.js                # Frontend app logic, state & API client
│   ├── sw.js                    # PWA Service Worker (Cache-first/Network-first)
│   ├── manifest.webmanifest     # Web App Manifest & App shortcuts
│   ├── icon.svg                 # Vector application emblem
│   └── pwa-*.png                # Multi-resolution & maskable PWA icons
├── ai_service.js                # Gemini 3.8 Flash copilot & grounded engine
├── db.js                        # Multi-engine database client (Postgres/Supabase/Memory)
├── server.js                    # Express application server & routes
├── supabase_schema.sql          # SQL schema migrations & table definitions
├── test_system.js               # 56-test comprehensive verification suite
├── metadata.json                # Project capabilities & permissions
├── package.json                 # Node.js dependencies & scripts
└── .env.example                 # Production environment variable template
```

---

## 🔒 Security & Privacy

- Sensitive credentials, connection strings, and API keys are managed exclusively via environment variables and never exposed to client code.
- Passwords are encrypted using PBKDF2 with SHA-256 and salted hashing.
- Foreign key integrity rules prevent deletion of doctors and patients with active appointments, consultations, or bills.
