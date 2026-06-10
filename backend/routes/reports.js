const express  = require("express");
const router   = express.Router();
const { supabase } = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");
const { sendMail } = require("../config/mail");
const { generateTSRData, buildTSRHtml, buildTSRText } = require("../utils/dsrReport");
const { generateDSRPdf } = require("../utils/dsrPdf");

// Roles allowed to receive DSR emails — enforced at every endpoint
const DSR_ALLOWED_ROLES = ["owner", "sales_head"];

// ─── GET /api/reports/recipients ─────────────────────────────────────────────
// Returns ONLY owner (Super Admin) and sales_head users — no other roles
router.get("/recipients", authenticate, authorize("owner", "sales_head"), async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .in("role", DSR_ALLOWED_ROLES)
      .not("status", "in", '("deleted","inactive")')
      .not("email", "is", null)
      .order("role", { ascending: false })
      .order("full_name");

    if (error) return res.status(500).json({ error: error.message });

    const roleLabel = (r) => r === "owner" ? "Super Admin" : "Sales Head";

    const recipients = (users || []).map((u) => ({
      id:    u.id,
      name:  u.full_name || u.email,
      email: u.email,
      role:  u.role,
      label: `${u.full_name || u.email} (${roleLabel(u.role)})`,
    }));

    res.json(recipients);
  } catch (err) {
    console.error("[Reports] recipients error:", err.message);
    res.status(500).json({ error: "Failed to fetch recipients" });
  }
});

// ─── POST /api/reports/send-dsr ───────────────────────────────────────────────
// Accepts { selectedEmails, datePreset, customStart?, customEnd?,
//           selectedEmployeeIds?, reportType?, datePeriod? }
router.post("/send-dsr", authenticate, authorize("owner", "sales_head"), async (req, res) => {
  const {
    selectedEmails,
    selectedEmployeeIds,       // optional: filter report to specific employee IDs
    datePreset,                // preferred: "today","yesterday","last_7","this_week", etc.
    customStart,               // for datePreset="custom" or reportType="custom"
    customEnd,
    reportType: rawReportType, // fallback for old callers
    datePeriod: rawDatePeriod,
  } = req.body;

  // Resolve reportType + datePeriod from datePreset, or fall back to legacy fields
  let reportType = rawReportType;
  let datePeriod = rawDatePeriod;
  let resolvedCustomStart = customStart;
  let resolvedCustomEnd   = customEnd;

  if (datePreset) {
    try {
      const r = resolvePreset(datePreset, customStart, customEnd);
      reportType          = r.reportType;
      datePeriod          = r.datePeriod;
      resolvedCustomStart = r.customStart;
      resolvedCustomEnd   = r.customEnd;
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  const VALID_REPORT = ["daily", "weekly", "monthly", "quarterly", "half_yearly", "yearly", "custom"];
  if (!reportType || !VALID_REPORT.includes(reportType))
    return res.status(400).json({ error: "Invalid or missing reportType / datePreset." });
  if (reportType !== "custom" && !datePeriod)
    return res.status(400).json({ error: "datePeriod is required." });
  if (reportType === "custom" && (!resolvedCustomStart || !resolvedCustomEnd))
    return res.status(400).json({ error: "customStart and customEnd are required for custom date range." });
  if (!Array.isArray(selectedEmails) || !selectedEmails.length)
    return res.status(400).json({ error: "selectedEmails must be a non-empty array." });

  // Security: verify every submitted email belongs to owner or sales_head — reject otherwise
  const { data: validProfiles, error: vpErr } = await supabase
    .from("profiles")
    .select("email, full_name, role")
    .in("email", selectedEmails)
    .in("role", DSR_ALLOWED_ROLES)
    .not("status", "in", '("deleted","inactive")')
    .not("email", "is", null);

  if (vpErr) return res.status(500).json({ error: "Failed to validate recipient emails." });

  const approvedEmails = new Set((validProfiles || []).map((p) => p.email));
  const forbidden = selectedEmails.filter((e) => !approvedEmails.has(e));
  if (forbidden.length) {
    console.warn(`[Reports] DSR send blocked — forbidden recipients: ${forbidden.join(", ")}`);
    return res.status(403).json({
      error: "One or more selected recipients are not authorised to receive DSR. Only Super Admin and Sales Head may receive reports.",
      forbidden,
    });
  }

  const uniqueEmails = [...approvedEmails];

  // Compute date range
  let periodRange;
  try {
    periodRange = computeDateRange(reportType, datePeriod, { customStart: resolvedCustomStart, customEnd: resolvedCustomEnd });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const { start: dayStart, end: dayEnd, label: reportDateLabel, subject: subjectLabel } = periodRange;
  const logDateStr = dayStart.split("T")[0];

  // Capture sender IP and user-agent for audit
  const senderIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || null;
  const userAgent = (req.headers["user-agent"] || "").slice(0, 300) || null;

  // Insert pending audit log
  const { data: logEntry } = await supabase
    .from("dsr_email_logs")
    .insert({
      sent_by:         req.profile.id,
      recipients:      uniqueEmails,
      report_date:     logDateStr,
      report_type:     reportType,
      delivery_status: "pending",
      recipient_count: uniqueEmails.length,
      ...(senderIp  ? { sender_ip: senderIp }    : {}),
      ...(userAgent ? { user_agent: userAgent }   : {}),
    })
    .select("id")
    .single();

  const logId = logEntry?.id;

  try {
    let data = await generateTSRData(dayStart, dayEnd);

    if (!data) {
      if (logId) await supabase.from("dsr_email_logs")
        .update({ delivery_status: "failed", error_message: "No staff data found for this period." })
        .eq("id", logId);
      return res.status(422).json({ error: "No sales staff data available for the selected period." });
    }

    // Filter to specific employees if requested
    if (Array.isArray(selectedEmployeeIds) && selectedEmployeeIds.length > 0) {
      const empSet = new Set(selectedEmployeeIds);
      const filteredStaff = data.staff.filter(s => empSet.has(s.id));
      if (filteredStaff.length > 0) {
        const filteredUserStats = {};
        filteredStaff.forEach(s => { filteredUserStats[s.id] = data.userStats[s.id]; });
        const v = Object.values(filteredUserStats);
        const sum = (key) => v.reduce((acc, u) => acc + (u[key] || 0), 0);
        data = {
          ...data,
          staff: filteredStaff,
          userStats: filteredUserStats,
          totals: {
            salesHeads:         filteredStaff.filter(s => s.role === "sales_head").length,
            insideSales:        filteredStaff.filter(s => s.role === "inside_sales").length,
            totalStaff:         filteredStaff.length,
            leadsToday:         sum("leadsToday"),
            calls:              sum("calls"),
            emails:             sum("emails"),
            meetings:           sum("meetings"),
            followUpsCompleted: sum("followUpsCompleted"),
            followUpsScheduled: sum("followUpsScheduled"),
            tasks:              sum("tasks"),
            activities:         sum("activities"),
            dealsCreated:       sum("dealsCreated"),
            dealsWon:           sum("dealsWon"),
            dealsLost:          sum("dealsLost"),
            revenueWon:         sum("revenueWon"),
          },
        };
      }
    }

    // Generate PDF
    const typeLabel = reportType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const pdfBuffer = await generateDSRPdf({
      staff:           data.staff,
      userStats:       data.userStats,
      totals:          data.totals,
      reportDateLabel,
      reportType:      typeLabel,
      generatedAt:     new Date().toISOString(),
    });

    const html = buildTSRHtml(data.staff, data.userStats, data.totals, reportDateLabel, reportDateLabel);
    const text = buildTSRText(data.staff, data.userStats, data.totals, reportDateLabel, reportDateLabel);
    const pdfFilename = `DSR-${typeLabel.replace(/\s/g, "-")}-${logDateStr}.pdf`;

    await sendMail({
      to:      uniqueEmails,
      subject: `Ccentrik ${subjectLabel} — ${reportDateLabel}`,
      html,
      text,
      attachments: [{
        filename:    pdfFilename,
        content:     pdfBuffer,
        contentType: "application/pdf",
      }],
    });

    if (logId) await supabase.from("dsr_email_logs")
      .update({ delivery_status: "sent" })
      .eq("id", logId);

    console.log(`[Reports] DSR (${reportType}) sent by ${req.profile.email} → ${uniqueEmails.length} recipients`);
    res.json({ success: true, sent_to: uniqueEmails.length, log_id: logId });

  } catch (err) {
    console.error("[Reports] DSR send error:", err.message);
    if (logId) await supabase.from("dsr_email_logs")
      .update({ delivery_status: "failed", error_message: err.message?.slice(0, 500) })
      .eq("id", logId);
    res.status(500).json({ error: "Failed to send DSR report.", details: err.message });
  }
});

// ─── GET /api/reports/dsr-config ─────────────────────────────────────────────
// Owner only — returns configured automatic DSR recipients
router.get("/dsr-config", authenticate, authorize("owner"), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("dsr_recipient_config")
      .select("user_id, created_at, profile:profiles!dsr_recipient_config_user_id_fkey(id, full_name, email, role)")
      .order("created_at", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    const roleLabel = (r) => r === "owner" ? "Super Admin" : "Sales Head";

    const recipients = (data || []).map((row) => ({
      id:    row.profile?.id    || row.user_id,
      name:  row.profile?.full_name || row.profile?.email || row.user_id,
      email: row.profile?.email,
      role:  row.profile?.role,
      label: row.profile ? `${row.profile.full_name || row.profile.email} (${roleLabel(row.profile.role)})` : row.user_id,
    }));

    res.json(recipients);
  } catch (err) {
    console.error("[Reports] dsr-config GET error:", err.message);
    res.status(500).json({ error: "Failed to fetch DSR config" });
  }
});

// ─── POST /api/reports/dsr-config ─────────────────────────────────────────────
// Owner only — replaces auto-DSR recipient list; validates all are owner/sales_head
router.post("/dsr-config", authenticate, authorize("owner"), async (req, res) => {
  const { userIds } = req.body;

  if (!Array.isArray(userIds))
    return res.status(400).json({ error: "userIds must be an array." });

  // Empty array = clear all (valid — means "no configured recipients; fall back to all owners")
  if (userIds.length > 0) {
    // Security: confirm all submitted IDs are owner or sales_head
    const { data: validUsers, error: vuErr } = await supabase
      .from("profiles")
      .select("id, role")
      .in("id", userIds)
      .in("role", DSR_ALLOWED_ROLES)
      .not("status", "in", '("deleted","inactive")');

    if (vuErr) return res.status(500).json({ error: "Failed to validate user IDs." });

    const validSet = new Set((validUsers || []).map((u) => u.id));
    const forbidden = userIds.filter((id) => !validSet.has(id));
    if (forbidden.length) {
      return res.status(403).json({
        error: "One or more user IDs are not authorised to receive DSR. Only Super Admin and Sales Head are allowed.",
        forbidden,
      });
    }
  }

  try {
    // Delete all existing config rows
    await supabase.from("dsr_recipient_config").delete().not("user_id", "is", null);

    // Insert new rows if any
    if (userIds.length > 0) {
      const rows = userIds.map((id) => ({ user_id: id, added_by: req.profile.id }));
      const { error: insErr } = await supabase.from("dsr_recipient_config").insert(rows);
      if (insErr) return res.status(500).json({ error: insErr.message });
    }

    console.log(`[Reports] DSR config updated by ${req.profile.email} — ${userIds.length} recipients`);
    res.json({ success: true, configured_count: userIds.length });
  } catch (err) {
    console.error("[Reports] dsr-config POST error:", err.message);
    res.status(500).json({ error: "Failed to save DSR config" });
  }
});

// ─── Map frontend datePreset to reportType + datePeriod ──────────────────────
function resolvePreset(preset, customStart, customEnd) {
  const now  = new Date();
  const pad  = (n) => String(n).padStart(2, "0");
  const dStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today     = dStr(now);
  const yesterday = dStr(new Date(now.getTime() - 86400000));

  // Monday of current week
  const getMonday = (d) => {
    const day = d.getDay() || 7;
    const m = new Date(d);
    m.setDate(d.getDate() - (day - 1));
    return m;
  };

  switch (preset) {
    case "today":         return { reportType: "daily",     datePeriod: today };
    case "yesterday":     return { reportType: "daily",     datePeriod: yesterday };
    case "last_7": {
      const s = dStr(new Date(now.getTime() - 6 * 86400000));
      return { reportType: "custom", customStart: s, customEnd: today };
    }
    case "this_week":     return { reportType: "weekly",    datePeriod: dStr(getMonday(now)) };
    case "last_week":     return { reportType: "weekly",    datePeriod: dStr(getMonday(new Date(now.getTime() - 7 * 86400000))) };
    case "this_month":    return { reportType: "monthly",   datePeriod: `${now.getFullYear()}-${pad(now.getMonth() + 1)}` };
    case "last_month": {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { reportType: "monthly", datePeriod: `${d.getFullYear()}-${pad(d.getMonth() + 1)}` };
    }
    case "this_quarter": {
      const q = Math.floor(now.getMonth() / 3) + 1;
      return { reportType: "quarterly", datePeriod: `${now.getFullYear()}-Q${q}` };
    }
    case "last_quarter": {
      const tq = Math.floor(now.getMonth() / 3) + 1;
      const pq = tq === 1 ? 4 : tq - 1;
      const py = tq === 1 ? now.getFullYear() - 1 : now.getFullYear();
      return { reportType: "quarterly", datePeriod: `${py}-Q${pq}` };
    }
    case "current_year":  return { reportType: "yearly", datePeriod: String(now.getFullYear()) };
    case "previous_year": return { reportType: "yearly", datePeriod: String(now.getFullYear() - 1) };
    case "custom": {
      if (!customStart || !customEnd) throw new Error("customStart and customEnd are required for custom range.");
      return { reportType: "custom", customStart, customEnd };
    }
    default: throw new Error(`Unknown datePreset: ${preset}`);
  }
}

// ─── Compute date range for a given report type + period string ───────────────
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function computeDateRange(reportType, datePeriod, opts = {}) {
  switch (reportType) {
    case "daily": {
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
      if (!/^\d{4}-\d{2}-\d{2}$/.test(datePeriod)) throw new Error("Invalid date for weekly report (expected YYYY-MM-DD).");
      const d   = new Date(datePeriod + "T12:00:00Z");
      const day = d.getUTCDay() || 7;
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
      if (!/^\d{4}-Q[1-4]$/.test(datePeriod)) throw new Error("Invalid period for quarterly report (expected YYYY-Q#).");
      const [year, q] = datePeriod.split("-");
      const qNum = parseInt(q[1]);
      const sm   = (qNum - 1) * 3;
      const em   = sm + 2;
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
      if (!/^\d{4}$/.test(datePeriod)) throw new Error("Invalid year for yearly report (expected YYYY).");
      const label = `Year ${datePeriod}`;
      return {
        start:   new Date(`${datePeriod}-01-01T00:00:00+05:30`).toISOString(),
        end:     new Date(`${datePeriod}-12-31T23:59:59+05:30`).toISOString(),
        label,
        subject: "Yearly Sales Report",
      };
    }
    case "custom": {
      const { customStart, customEnd } = opts;
      if (!customStart || !customEnd) throw new Error("customStart and customEnd required for custom date range.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(customStart) || !/^\d{4}-\d{2}-\d{2}$/.test(customEnd))
        throw new Error("Invalid customStart or customEnd (expected YYYY-MM-DD).");
      if (customStart > customEnd) throw new Error("customStart must not be after customEnd.");
      const label = `${customStart} to ${customEnd}`;
      return {
        start:   new Date(`${customStart}T00:00:00+05:30`).toISOString(),
        end:     new Date(`${customEnd}T23:59:59+05:30`).toISOString(),
        label,
        subject: "Sales Report",
      };
    }
    default:
      throw new Error(`Unknown reportType: ${reportType}`);
  }
}

// ─── GET /api/reports/dsr-logs ────────────────────────────────────────────────
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
