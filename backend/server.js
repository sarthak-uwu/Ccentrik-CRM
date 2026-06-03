require("dotenv").config();
// Strip BOM (U+FEFF) that PowerShell sometimes injects into env vars
Object.keys(process.env).forEach(k => {
  if (process.env[k] && process.env[k].charCodeAt(0) === 0xFEFF) {
    process.env[k] = process.env[k].slice(1);
  }
});
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL || "http://localhost:5173",
  "https://ccentrik-crm.web.app",
  "https://ccentrik-crm.firebaseapp.com",
];

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// CORS must come first — before rate limiter and helmet — so preflight OPTIONS
// requests always get the right headers even when other middleware rejects
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions)); // explicit preflight for all routes (regex avoids Express 5 path-to-regexp rejection of bare "*")

// Security headers
app.use(helmet({
  crossOriginOpenerPolicy: false,   // Firebase popup auth needs this off
  contentSecurityPolicy: false,     // Handled by Firebase Hosting headers
  crossOriginResourcePolicy: false, // Allow cross-origin API responses
}));

// Rate limits
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth requests, please try again later." },
});
app.use(globalLimiter);
app.use("/api/auth", authLimiter);
app.use(express.json({ limit: "2mb" }));

// Firebase Admin
const _sa = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
let serviceAccount = null;
if (_sa) {
  serviceAccount = JSON.parse(Buffer.from(_sa, "base64").toString("utf8"));
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  console.log("🔥 Firebase Admin connected");
} else {
  console.warn("⚠️ FIREBASE_SERVICE_ACCOUNT is missing; Firebase Admin init skipped.");
}


// Health / info endpoints
app.get("/health",    (_, res) => res.json({ status: "ok", ts: new Date().toISOString() }));
app.get("/api/health",(_, res) => res.json({ status: "ok", ts: new Date().toISOString() }));
app.get("/api", (_, res) => res.json({
  message: "Ccentrik CRM API",
  version: "1.0.0",
  available_endpoints: [
    "/api/auth",
    "/api/users",
    "/api/leads",
    "/api/deals",
    "/api/activities",
    "/api/analytics",
    "/api/ai",
  ],
}));

// Routes
app.use("/api/auth",       require("./routes/auth"));
app.use("/api/users",      require("./routes/users"));
app.use("/api/leads",      require("./routes/leads"));
app.use("/api/deals",      require("./routes/deals"));
app.use("/api/activities", require("./routes/activities"));
app.use("/api/analytics",  require("./routes/analytics"));
app.use("/api/ai",         require("./routes/ai"));
app.use("/api/meetings",   require("./routes/meetings"));
app.use("/api/targets",    require("./routes/targets"));

// Diagnostic: test SMTP delivery — tries MAIL_USER/MAIL_PASS then GMAIL_USER/GMAIL_PASS
app.post("/api/test-email", async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: "to is required" });
  const nodemailer = require("nodemailer");

  const pairs = [
    { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS, label: "GMAIL_USER/GMAIL_PASS" },
    { user: process.env.MAIL_USER,  pass: process.env.MAIL_PASS,  label: "MAIL_USER/MAIL_PASS" },
  ].filter((p) => p.user && p.pass);

  if (!pairs.length) {
    return res.status(500).json({ success: false, error: "No SMTP credentials set in environment" });
  }

  const results = [];
  for (const { user, pass, label } of pairs) {
    try {
      const transport = nodemailer.createTransport({
        host: "smtp.gmail.com", port: 465, secure: true,
        auth: { user, pass },
        tls: { rejectUnauthorized: false },
      });
      const info = await transport.sendMail({
        from: `Ccentrik CRM <${user}>`,
        to,
        subject: `Ccentrik CRM — SMTP Test (${label})`,
        html: `<p>SMTP working via <strong>${label}</strong> from <strong>${user}</strong>.</p>`,
        text: `SMTP working via ${label} from ${user}.`,
      });
      results.push({ label, user, success: true, messageId: info.messageId });
    } catch (err) {
      results.push({ label, user, success: false, error: err.message });
    }
  }

  const anySuccess = results.some((r) => r.success);
  res.status(anySuccess ? 200 : 500).json({ anySuccess, results });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

// Export for Vercel serverless
module.exports = app;

// Start server locally only
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Ccentrik CRM backend running on port ${PORT}`);
    const { startCronJobs } = require("./utils/cronJobs");
    startCronJobs();
  });
}
