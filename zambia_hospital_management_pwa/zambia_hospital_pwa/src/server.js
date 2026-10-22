require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "hospital.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','doctor','nurse','patient')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS patients (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 name TEXT NOT NULL,
 contact TEXT DEFAULT '',
 medical_history TEXT DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS appointments (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 patient_id INTEGER NOT NULL,
 doctor_id INTEGER,
 appointment_at TEXT NOT NULL,
 purpose TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Confirmed','Cancelled')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE,
 FOREIGN KEY(doctor_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 action TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);
`);

const userCount = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
if (!userCount) {
  const addUser = db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)");
  const addPatient = db.prepare("INSERT INTO patients(user_id,name,contact) VALUES(?,?,?)");
  const seed = db.transaction(() => {
    const users = [
      ["System Admin","admin@demo.zm","Admin123!","admin"],
      ["Dr. Banda","doctor@demo.zm","Doctor123!","doctor"],
      ["Nurse Phiri","nurse@demo.zm","Nurse123!","nurse"],
      ["Demo Patient","patient@demo.zm","Patient123!","patient"]
    ];
    const ids = {};
    for (const [name,email,password,role] of users) {
      const result = addUser.run(name,email,bcrypt.hashSync(password, 12),role);
      ids[role] = result.lastInsertRowid;
    }
    addPatient.run(ids.patient, "Demo Patient", "+260 97 000 0000");
    addPatient.run(null, "Chanda Mwila", "+260 96 000 0000");
    const p = db.prepare("SELECT id FROM patients ORDER BY id LIMIT 1").get();
    db.prepare("INSERT INTO appointments(patient_id,doctor_id,appointment_at,purpose,status) VALUES(?,?,?,?,?)")
      .run(p.id, ids.doctor, new Date(Date.now()+86400000).toISOString(), "General consultation", "Pending");
  });
  seed();
}

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      imgSrc: ["'self'", "data:", "https://*.tile.openstreetmap.org"],
      connectSrc: ["'self'", "https://api.open-meteo.com"],
      fontSrc: ["'self'", "https://unpkg.com"],
      objectSrc: ["'none'"], frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: "100kb" }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.db", dir: dataDir }),
  secret: process.env.SESSION_SECRET || "development-only-change-me-please",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8*60*60*1000 }
}));
app.use("/api/login", rateLimit({ windowMs: 15*60*1000, limit: 10, standardHeaders: true, legacyHeaders: false }));

const audit = (userId, action) => db.prepare("INSERT INTO audit_log(user_id,action) VALUES(?,?)").run(userId || null, action);
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role });
function auth(req,res,next) {
  if (!req.session.user) return res.status(401).json({ error: "Please sign in." });
  next();
}
function roles(...allowed) {
  return (req,res,next) => {
    if (!req.session.user) return res.status(401).json({error:"Please sign in."});
    if (!allowed.includes(req.session.user.role)) return res.status(403).json({error:"Access denied for this role."});
    next();
  };
}
const patientForUser = userId => db.prepare("SELECT id FROM patients WHERE user_id=?").get(userId);

app.get("/api/health", (_req,res) => res.json({ ok:true, app:"Zambia Hospital PWA" }));
app.post("/api/login", (req,res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!email || !password) return res.status(400).json({error:"Enter email and password."});
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({error:"Invalid email or password."});
  req.session.regenerate(err => {
    if (err) return res.status(500).json({error:"Could not create session."});
    req.session.user = publicUser(user);
    audit(user.id, "Signed in");
    res.json({user:req.session.user});
  });
});
app.post("/api/logout", auth, (req,res) => {
  audit(req.session.user.id, "Signed out");
  req.session.destroy(() => res.json({ok:true}));
});
app.get("/api/me", (req,res) => res.json({user:req.session.user || null}));

app.get("/api/summary", auth, (req,res) => {
  const role = req.session.user.role;
  const isAdmin = role === "admin";
  const isPatient = role === "patient";
  const patient = isPatient ? patientForUser(req.session.user.id) : null;
  const patientCount = isAdmin || role === "doctor" || role === "nurse" ? db.prepare("SELECT COUNT(*) n FROM patients").get().n : 1;
  const apptWhere = isPatient && patient ? "WHERE a.patient_id=?" : "";
  const apptParams = isPatient && patient ? [patient.id] : [];
  const appointments = db.prepare(`SELECT a.id,a.appointment_at,a.purpose,a.status,p.name patient_name,u.name doctor_name
    FROM appointments a JOIN patients p ON p.id=a.patient_id LEFT JOIN users u ON u.id=a.doctor_id ${apptWhere}
    ORDER BY a.appointment_at ASC LIMIT 50`).all(...apptParams);
  res.json({
    counts: { patients: patientCount, appointments: appointments.length,
      pending: appointments.filter(a=>a.status==="Pending").length,
      doctors: db.prepare("SELECT COUNT(*) n FROM users WHERE role='doctor'").get().n },
    appointments,
    recentActivity: isAdmin ? db.prepare("SELECT l.action,l.created_at,u.name FROM audit_log l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT 8").all() : []
  });
});
app.get("/api/patients", roles("admin","doctor","nurse"), (_req,res) => {
  res.json({patients:db.prepare("SELECT id,name,contact,created_at FROM patients ORDER BY name").all()});
});
app.post("/api/patients", roles("admin"), (req,res) => {
  const name = String(req.body.name || "").trim();
  const contact = String(req.body.contact || "").trim();
  if (name.length < 2 || name.length > 100) return res.status(400).json({error:"Enter a valid patient name."});
  const result = db.prepare("INSERT INTO patients(name,contact) VALUES(?,?)").run(name,contact);
  audit(req.session.user.id, `Created patient record ${result.lastInsertRowid}`);
  res.status(201).json({id:result.lastInsertRowid,name,contact});
});
app.get("/api/appointments", auth, (req,res) => {
  const role = req.session.user.role;
  let rows;
  if (role === "patient") {
    const patient = patientForUser(req.session.user.id);
    rows = patient ? db.prepare(`SELECT a.id,a.appointment_at,a.purpose,a.status,p.name patient_name,u.name doctor_name FROM appointments a JOIN patients p ON p.id=a.patient_id LEFT JOIN users u ON u.id=a.doctor_id WHERE a.patient_id=? ORDER BY a.appointment_at`).all(patient.id) : [];
  } else if (role === "doctor") {
    rows = db.prepare(`SELECT a.id,a.appointment_at,a.purpose,a.status,p.name patient_name,u.name doctor_name FROM appointments a JOIN patients p ON p.id=a.patient_id LEFT JOIN users u ON u.id=a.doctor_id WHERE a.doctor_id=? ORDER BY a.appointment_at`).all(req.session.user.id);
  } else {
    rows = db.prepare(`SELECT a.id,a.appointment_at,a.purpose,a.status,p.name patient_name,u.name doctor_name FROM appointments a JOIN patients p ON p.id=a.patient_id LEFT JOIN users u ON u.id=a.doctor_id ORDER BY a.appointment_at`).all();
  }
  res.json({appointments:rows});
});
app.post("/api/appointments", roles("admin","patient"), (req,res) => {
  const purpose = String(req.body.purpose || "").trim();
  const appointmentAt = new Date(req.body.appointmentAt);
  if (!purpose || purpose.length > 250 || !req.body.appointmentAt || Number.isNaN(appointmentAt.getTime()) || appointmentAt <= new Date()) {
    return res.status(400).json({error:"Enter a valid future date/time and appointment purpose."});
  }
  let patientId;
  if (req.session.user.role === "patient") {
    const p = patientForUser(req.session.user.id);
    if (!p) return res.status(400).json({error:"Patient profile not found."});
    patientId = p.id;
  } else {
    patientId = Number(req.body.patientId);
    if (!db.prepare("SELECT id FROM patients WHERE id=?").get(patientId)) return res.status(400).json({error:"Choose a valid patient."});
  }
  const doctorId = req.body.doctorId ? Number(req.body.doctorId) : null;
  if (doctorId && !db.prepare("SELECT id FROM users WHERE id=? AND role='doctor'").get(doctorId)) return res.status(400).json({error:"Choose a valid doctor."});
  // Production TODO: enforce doctor availability and prevent overlapping bookings transactionally.
  const result = db.prepare("INSERT INTO appointments(patient_id,doctor_id,appointment_at,purpose) VALUES(?,?,?,?)")
    .run(patientId,doctorId,appointmentAt.toISOString(),purpose);
  audit(req.session.user.id, `Created appointment ${result.lastInsertRowid}`);
  res.status(201).json({id:result.lastInsertRowid,ok:true});
});
app.patch("/api/appointments/:id/status", roles("admin","doctor"), (req,res) => {
  const status = String(req.body.status || "");
  if (!["Confirmed","Cancelled"].includes(status)) return res.status(400).json({error:"Invalid status."});
  const id = Number(req.params.id);
  const appt = db.prepare("SELECT * FROM appointments WHERE id=?").get(id);
  if (!appt) return res.status(404).json({error:"Appointment not found."});
  if (req.session.user.role === "doctor" && appt.doctor_id !== req.session.user.id) return res.status(403).json({error:"You can only update your assigned appointments."});
  db.prepare("UPDATE appointments SET status=? WHERE id=?").run(status,id);
  audit(req.session.user.id, `${status} appointment ${id}`);
  res.json({ok:true});
});
app.get("/api/doctors", auth, (_req,res) => {
  res.json({doctors: db.prepare("SELECT id,name FROM users WHERE role='doctor' ORDER BY name").all()});
});
app.post("/api/payments/checkout", auth, (req,res) => {
  // DEMO ONLY. Never mark real payments as paid based on client input.
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) return res.status(400).json({error:"Enter a valid amount in ZMW."});
  if ((process.env.PAYMENT_PROVIDER || "demo") === "demo") {
    return res.json({mode:"demo",status:"pending",currency:"ZMW",amount,
      message:"Demo only: no money was collected. Connect an approved Zambia payment provider for real transactions."});
  }
  return res.status(501).json({error:"Provider adapter not implemented. Configure official merchant API and verified callbacks before enabling payments."});
});
app.use(express.static(path.join(__dirname, "..", "public")));
app.get("*", (_req,res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));
app.listen(PORT, () => console.log(`Zambia Hospital PWA running at http://localhost:${PORT}`));
