const express  = require("express");
const router   = express.Router();
const { supabase } = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");
const { sendMail } = require("../config/mail");
const { generateTSRData, buildTSRHtml, buildTSRText } = require("../utils/dsrReport");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── GET /api/reports/recipients ─────────────────────────────────────────────
// Returns all active CRM users as potential DSR recipients
router.get("/recipients", authenticate, authorize("owner", "sales_head"), async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .not("status", "in", '("deleted","inactive")')
      .not("email", "is", null)
      .order("role", { ascending: false })
      .order("full_name");

    if (error) return res.status(500).json({ error: error.message });

    const recipients = (users || []).map((u) => ({
      id:    u.id,
      name:  u.full_name || u.email,
      email: u.email,
      role:  u.role,
      label: `${u.full_name} (${(u.role || "").replace(/_/g, " ")})`,
    }));

    res.json(recipients);
  } catch (err) {
    console.error("[Reports] recipients error:", err.message);
    res.status(500).json({ error: "Failed to fetch recipients" });
  }
});

// ─── POST /api/reports/send-dsr ───────────────────────────────────────────────
// Generates DSR in real-time and sends to selected recipients
router.post("/send-dsr", authenticate, authorize("owner", "sales_head"), async (req, res) => {
  const { recipients = [], customEmails = [], reportDate, reportType = "DSR" } = req.body;

  // Merge and validate all email addresses
  const allEmails = [...recipients, ...customEmails]
    .map((e) => (typeof e === "string" ? e.trim().toLowerCase() : ""))
    .filter((e) => EMAIL_RE.test(e));

  const uniqueEmails = [...new Set(allEmails)];

  if (!uniqueEmails.length) {
    return res.status(400).json({ error: "At least one valid recipient email is required." });
  }

  // Resolve date range (default: today 00:00 – 20:00 IST)
  const now         = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const todayIST    = new Date(now.getTime() + istOffsetMs);
  const dateStr     = reportDate || todayIST.toISOString().split("T")[0];

  const dayStart = new Date(`${dateStr}T00:00:00+05:30`).toISOString();
  const dayEnd   = new Date(`${dateStr}T23:59:59+05:30`).toISOString();

  const reportDateLabel = new Date(dayStart).toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // Insert pending log entry
  const { data: logEntry } = await supabase
    .from("dsr_email_logs")
    .insert({
      sent_by:         req.profile.id,
      recipients:      uniqueEmails,
      report_date:     dateStr,
      report_type:     reportType,
      delivery_status: "pending",
      recipient_count: uniqueEmails.length,
    })
    .select("id")
    .single();

  const logId = logEntry?.id;

  try {
    const data = await generateTSRData(dayStart, dayEnd);

    if (!data) {
      await supabase.from("dsr_email_logs")
        .update({ delivery_status: "failed", error_message: "No TSR staff data found for this date." })
        .eq("id", logId);
      return res.status(422).json({ error: "No TSR staff data available for the selected date." });
    }

    const html = buildTSRHtml(data.staff, data.userStats, data.totals, reportDateLabel);
    const text = buildTSRText(data.staff, data.userStats, data.totals, reportDateLabel);

    await sendMail({
      to:      uniqueEmails,
      subject: `Ccentrik Daily Sales Report — ${reportDateLabel}`,
      html,
      text,
    });

    await supabase.from("dsr_email_logs")
      .update({ delivery_status: "sent" })
      .eq("id", logId);

    console.log(`[Reports] DSR manually sent by ${req.profile.email} → ${uniqueEmails.length} recipients`);
    res.json({ success: true, sent_to: uniqueEmails.length, log_id: logId });

  } catch (err) {
    console.error("[Reports] DSR send error:", err.message);
    await supabase.from("dsr_email_logs")
      .update({ delivery_status: "failed", error_message: err.message?.slice(0, 500) })
      .eq("id", logId);
    res.status(500).json({ error: "Failed to send DSR report.", details: err.message });
  }
});

// ─── GET /api/reports/dsr-logs ────────────────────────────────────────────────
// Returns recent DSR send log entries
router.get("/dsr-logs", authenticate, authorize("owner", "sales_head"), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const { data: logs, error } = await supabase
      .from("dsr_email_logs")
      .select("*, sent_by_profile:profiles!dsr_email_logs_sent_by_fkey(full_name, email, role)")
      .order("sent_at", { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ error: error.message });
    res.json(logs || []);
  } catch (err) {
    console.error("[Reports] dsr-logs error:", err.message);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

module.exports = router;
