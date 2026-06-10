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
// Generates DSR for selected period and sends to resolved recipient role
router.post("/send-dsr", authenticate, authorize("owner", "sales_head"), async (req, res) => {
  const { recipientType, reportType, datePeriod } = req.body;

  // Validate inputs
  const VALID_RECIPIENT = ["super_admin", "sales_head"];
  const VALID_REPORT    = ["daily", "weekly", "monthly", "quarterly", "half_yearly", "yearly"];
  if (!recipientType || !VALID_RECIPIENT.includes(recipientType))
    return res.status(400).json({ error: "recipientType must be 'super_admin' or 'sales_head'." });
  if (!reportType || !VALID_REPORT.includes(reportType))
    return res.status(400).json({ error: "Invalid reportType." });
  if (!datePeriod)
    return res.status(400).json({ error: "datePeriod is required." });

  // Resolve recipient emails from DB
  const roleFilter = recipientType === "super_admin" ? "owner" : "sales_head";
  const { data: recipientProfiles, error: rpErr } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("role", roleFilter)
    .not("status", "in", '("deleted","inactive")')
    .not("email", "is", null);

  if (rpErr) return res.status(500).json({ error: "Failed to resolve recipient emails." });

  const uniqueEmails = [...new Set((recipientProfiles || []).map((p) => p.email).filter(Boolean))];
  if (!uniqueEmails.length)
    return res.status(404).json({ error: `No active ${roleFilter.replace("_", " ")} found in the system.` });

  // Compute date range from report type + period string
  let periodRange;
  try {
    periodRange = computeDateRange(reportType, datePeriod);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const { start: dayStart, end: dayEnd, label: reportDateLabel, subject: subjectLabel } = periodRange;
  const logDateStr = dayStart.split("T")[0];

  // Insert pending log entry
  const { data: logEntry } = await supabase
    .from("dsr_email_logs")
    .insert({
      sent_by:         req.profile.id,
      recipients:      uniqueEmails,
      report_date:     logDateStr,
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
        .update({ delivery_status: "failed", error_message: "No TSR staff data found for this period." })
        .eq("id", logId);
      return res.status(422).json({ error: "No TSR staff data available for the selected period." });
    }

    const html = buildTSRHtml(data.staff, data.userStats, data.totals, reportDateLabel, reportDateLabel);
    const text = buildTSRText(data.staff, data.userStats, data.totals, reportDateLabel, reportDateLabel);

    await sendMail({
      to:      uniqueEmails,
      subject: `Ccentrik ${subjectLabel} — ${reportDateLabel}`,
      html,
      text,
    });

    await supabase.from("dsr_email_logs")
      .update({ delivery_status: "sent" })
      .eq("id", logId);

    console.log(`[Reports] DSR (${reportType}) manually sent by ${req.profile.email} → ${uniqueEmails.length} recipients`);
    res.json({ success: true, sent_to: uniqueEmails.length, log_id: logId });

  } catch (err) {
    console.error("[Reports] DSR send error:", err.message);
    await supabase.from("dsr_email_logs")
      .update({ delivery_status: "failed", error_message: err.message?.slice(0, 500) })
      .eq("id", logId);
    res.status(500).json({ error: "Failed to send DSR report.", details: err.message });
  }
});

// ─── Compute date range for a given report type + period string ───────────────
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function computeDateRange(reportType, datePeriod) {
  switch (reportType) {
    case "daily": {
      // datePeriod: "2026-06-10"
      if (!/^\d{4}-\d{2}-\d{2}$/.test(datePeriod)) throw new Error("Invalid date for daily report (expected YYYY-MM-DD).");
      const label = new Date(datePeriod + "T12:00:00Z").toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      return {
        start:   new Date(`${datePeriod}T00:00:00+05:30`).toISOString(),
        end:     new Date(`${datePeriod}T23:59:59+05:30`).toISOString(),
        label,
        subject: "Daily Sales Report",
      };
    }
    case "weekly": {
      // datePeriod: any date string "2026-06-10" — we compute Monday–Sunday of that week
      if (!/^\d{4}-\d{2}-\d{2}$/.test(datePeriod)) throw new Error("Invalid date for weekly report (expected YYYY-MM-DD).");
      const d   = new Date(datePeriod + "T12:00:00Z");
      const day = d.getUTCDay() || 7; // Mon=1 … Sun=7
      const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - (day - 1));
      const sunday  = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
      const monStr = monday.toISOString().split("T")[0];
      const sunStr = sunday.toISOString().split("T")[0];
      const label = `${MONTH_SHORT[monday.getUTCMonth()]} ${monday.getUTCDate()} – ${MONTH_SHORT[sunday.getUTCMonth()]} ${sunday.getUTCDate()}, ${sunday.getUTCFullYear()}`;
      return {
        start:   new Date(`${monStr}T00:00:00+05:30`).toISOString(),
        end:     new Date(`${sunStr}T23:59:59+05:30`).toISOString(),
        label,
        subject: "Weekly Sales Report",
      };
    }
    case "monthly": {
      // datePeriod: "2026-06"
      if (!/^\d{4}-\d{2}$/.test(datePeriod)) throw new Error("Invalid date for monthly report (expected YYYY-MM).");
      const [year, mon] = datePeriod.split("-").map(Number);
      const lastDay = new Date(year, mon, 0).getDate();
      const padM    = String(mon).padStart(2, "0");
      const label   = `${MONTH_NAMES[mon - 1]} ${year}`;
      return {
        start:   new Date(`${year}-${padM}-01T00:00:00+05:30`).toISOString(),
        end:     new Date(`${year}-${padM}-${lastDay}T23:59:59+05:30`).toISOString(),
        label,
        subject: "Monthly Sales Report",
      };
    }
    case "quarterly": {
      // datePeriod: "2026-Q2"
      if (!/^\d{4}-Q[1-4]$/.test(datePeriod)) throw new Error("Invalid period for quarterly report (expected YYYY-Q#).");
      const [year, q] = datePeriod.split("-");
      const qNum = parseInt(q[1]);
      const sm   = (qNum - 1) * 3;           // start month index (0-based)
      const em   = sm + 2;                    // end month index (0-based)
      const endDay = new Date(parseInt(year), em + 1, 0).getDate();
      const label  = `Q${qNum} ${year} (${MONTH_NAMES[sm]} – ${MONTH_NAMES[em]} ${year})`;
      return {
        start:   new Date(`${year}-${String(sm + 1).padStart(2,"0")}-01T00:00:00+05:30`).toISOString(),
        end:     new Date(`${year}-${String(em + 1).padStart(2,"0")}-${endDay}T23:59:59+05:30`).toISOString(),
        label,
        subject: "Quarterly Sales Report",
      };
    }
    case "half_yearly": {
      // datePeriod: "2026-H1" or "2026-H2"
      if (!/^\d{4}-H[12]$/.test(datePeriod)) throw new Error("Invalid period for half-yearly report (expected YYYY-H1 or YYYY-H2).");
      const [year, h] = datePeriod.split("-");
      const isH1  = h === "H1";
      const label = `${h} ${year} (${isH1 ? "January – June" : "July – December"} ${year})`;
      return {
        start:   new Date(`${year}-${isH1 ? "01" : "07"}-01T00:00:00+05:30`).toISOString(),
        end:     new Date(`${year}-${isH1 ? "06-30" : "12-31"}T23:59:59+05:30`).toISOString(),
        label,
        subject: "Half-Yearly Sales Report",
      };
    }
    case "yearly": {
      // datePeriod: "2026"
      if (!/^\d{4}$/.test(datePeriod)) throw new Error("Invalid year for yearly report (expected YYYY).");
      const label = `Year ${datePeriod}`;
      return {
        start:   new Date(`${datePeriod}-01-01T00:00:00+05:30`).toISOString(),
        end:     new Date(`${datePeriod}-12-31T23:59:59+05:30`).toISOString(),
        label,
        subject: "Yearly Sales Report",
      };
    }
    default:
      throw new Error(`Unknown reportType: ${reportType}`);
  }
}

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
