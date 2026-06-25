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

// Trust Vercel / reverse-proxy forwarded IPs (required for express-rate-limit on Vercel)
app.set("trust proxy", 1);

// Rate limits
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },  // suppress Vercel proxy header warnings
  message: { error: "Too many requests, please try again later." },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
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
app.use("/api/ai/documents", require("./routes/aiDocuments"));
app.use("/api/meetings",   require("./routes/meetings"));
app.use("/api/targets",    require("./routes/targets"));
app.use("/api/email",      require("./routes/email"));
app.use("/api/reports",    require("./routes/reports"));

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

  // Also test Resend
  let resendResult = null;
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require("resend");
      const r = new Resend(process.env.RESEND_API_KEY);
      const fromAddr = process.env.RESEND_FROM || process.env.GMAIL_USER || process.env.MAIL_USER || "sarthak.tyagi@ccentrik.com";
      const sent = await r.emails.send({
        from: `Ccentrik CRM <${fromAddr}>`,
        to: [to],
        subject: "Ccentrik CRM — Resend Test",
        html: `<p>Resend working from <strong>${fromAddr}</strong>.</p>`,
        text: `Resend working from ${fromAddr}.`,
      });
      resendResult = sent.error
        ? { success: false, from: fromAddr, error: sent.error.message || JSON.stringify(sent.error) }
        : { success: true, from: fromAddr, id: sent.data?.id };
    } catch (err) {
      resendResult = { success: false, error: err.message };
    }
  } else {
    resendResult = { success: false, error: "RESEND_API_KEY not set" };
  }

  res.status(anySuccess || resendResult?.success ? 200 : 500).json({ anySmtpSuccess: anySuccess, smtpResults: results, resend: resendResult });
});

// GET /api/debug-mail — open directly in browser to diagnose real email errors
app.get("/api/debug-mail", async (req, res) => {
  const { supabase } = require("./config/db");
  const { Resend }   = require("resend");
  const result = { gmailAccounts: null, resend: null, env: {} };

  result.env = {
    GMAIL_USER:     process.env.GMAIL_USER     || "NOT SET",
    MAIL_USER:      process.env.MAIL_USER      || "NOT SET",
    RESEND_API_KEY: process.env.RESEND_API_KEY ? "SET" : "NOT SET",
    RESEND_FROM:    process.env.RESEND_FROM    || "NOT SET",
  };

  // Compare profiles.id vs email_accounts.user_id for sarthak.tyagi
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("email", "sarthak.tyagi@ccentrik.com")
      .maybeSingle();
    const { data: ea } = await supabase
      .from("email_accounts")
      .select("id, email, user_id")
      .eq("email", "sarthak.tyagi@ccentrik.com")
      .eq("provider", "gmail")
      .maybeSingle();
    result.idCheck = {
      profiles_id:        profile?.id || "NOT FOUND",
      email_accounts_user_id: ea?.user_id || "NOT FOUND",
      match:              profile?.id === ea?.user_id,
    };
  } catch (e) { result.idCheck = { error: e.message }; }

  try {
    const { data: accounts } = await supabase
      .from("email_accounts")
      .select("id, email, user_id, is_active, token_expiry, refresh_token")
      .eq("is_active", true)
      .eq("provider", "gmail")
      .limit(5);
    result.gmailAccounts = (accounts || []).map(a => ({
      email:             a.email,
      user_id:           a.user_id,
      has_refresh_token: !!a.refresh_token,
      token_expiry:      a.token_expiry,
      token_expired:     a.token_expiry ? new Date(a.token_expiry) < new Date() : "unknown",
    }));
  } catch (e) { result.gmailAccounts = { error: e.message }; }

  // Test Gmail API send using sarthak.tyagi account specifically (or first active)
  try {
    const testEmail = req.query.email || "sarthak.tyagi@ccentrik.com";
    let query = supabase
      .from("email_accounts")
      .select("id, email, access_token, refresh_token, token_expiry")
      .eq("is_active", true)
      .eq("provider", "gmail");
    if (testEmail) query = query.eq("email", testEmail);
    const { data: accs } = await query.limit(1);
    if (accs?.length) {
      const acc = accs[0];
      let token = acc.access_token;
      // refresh if expired
      if (!acc.token_expiry || new Date(acc.token_expiry) <= new Date(Date.now() + 60000)) {
        try {
          const tr = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ client_id: process.env.GMAIL_CLIENT_ID, client_secret: process.env.GMAIL_CLIENT_SECRET, refresh_token: acc.refresh_token, grant_type: "refresh_token" }),
          });
          const td = await tr.json();
          token = td.access_token || token;
        } catch {}
      }
      // Build simple test MIME
      const mime = [`From: Debug <${acc.email}>`, `To: sarthaktyagi120@gmail.com`, `Subject: Gmail API Test`, `MIME-Version: 1.0`, `Content-Type: text/plain`, ``, `Gmail API test from debug endpoint`].join("\r\n");
      const raw  = Buffer.from(mime).toString("base64url");
      const gr   = await fetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      const gd = await gr.json().catch(() => ({}));
      result.gmailApiTest = gr.ok ? { success: true, from: acc.email, id: gd.id } : { success: false, from: acc.email, status: gr.status, error: gd.error?.message || JSON.stringify(gd.error) };
    } else {
      result.gmailApiTest = { success: false, error: "No active Gmail accounts in email_accounts table" };
    }
  } catch (e) { result.gmailApiTest = { success: false, error: e.message }; }

  if (process.env.RESEND_API_KEY) {
    try {
      const r = new Resend(process.env.RESEND_API_KEY);
      const fromAddr = process.env.RESEND_FROM || process.env.GMAIL_USER || process.env.MAIL_USER || "sarthak.tyagi@ccentrik.com";
      const sent = await r.emails.send({
        from: `Ccentrik Debug <${fromAddr}>`,
        to:   ["sarthaktyagi120@gmail.com"],
        subject: "Debug Email Test",
        html: "<p>debug</p>", text: "debug",
      });
      result.resend = sent.error
        ? { success: false, from: fromAddr, error: JSON.stringify(sent.error) }
        : { success: true,  from: fromAddr, id: sent.data?.id };
    } catch (e) { result.resend = { success: false, error: e.message }; }
  } else {
    result.resend = { success: false, error: "RESEND_API_KEY not set" };
  }

  res.json(result);
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

// Export app for Vercel serverless and Firebase Cloud Functions
module.exports = app;

// Start server only when running locally (not in Vercel, Firebase Functions, or other cloud envs)
const isCloudEnv = process.env.VERCEL || process.env.FUNCTION_TARGET || process.env.K_SERVICE;
if (!isCloudEnv) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Ccentrik CRM backend running on port ${PORT}`);
    const { startCronJobs } = require("./utils/cronJobs");
    startCronJobs();
  });
}
