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

const app = express();

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const allowed = [
      process.env.FRONTEND_URL || "http://localhost:5173",
      "https://ccentrik-crm.web.app",
      "https://ccentrik-crm.firebaseapp.com",
    ];
    if (allowed.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));

// Firebase Admin
const _sa = process.env.FIREBASE_SERVICE_ACCOUNT || "";
const serviceAccount = JSON.parse(Buffer.from(_sa.trim(), "base64").toString("utf8"));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
console.log("🔥 Firebase Admin connected");

// Routes
app.use("/api/auth",       require("./routes/auth"));
app.use("/api/users",      require("./routes/users"));
app.use("/api/leads",      require("./routes/leads"));
app.use("/api/deals",      require("./routes/deals"));
app.use("/api/activities", require("./routes/activities"));
app.use("/api/analytics",  require("./routes/analytics"));
app.use("/api/ai",         require("./routes/ai"));

// Health check
app.get("/api/health", (_, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

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
