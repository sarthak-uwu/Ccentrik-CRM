const express  = require("express");
const router   = express.Router();
const { supabase } = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");
const { sendMail } = require("../config/mail");
const { generateTSRData, generateStaffDSRData, generateEmployeeActivityData, buildTSRHtml, buildTSRText } = require("../utils/dsrReport");
const { generateDSRPdf, generateActivityPdf } = require("../utils/dsrPdf");

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

// ─── GET /api/reports/inactivity-test-recipients ─────────────────────────────
// Returns ALL active users for the test-email dropdown (not filtered by role).
router.get("/inactivity-test-recipients", authenticate, authorize("owner", "sales_head"), async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .not("status", "in", '("deleted","inactive")')
      .not("email", "is", null)
      .order("full_name");

    if (error) return res.status(500).json({ error: error.message });

    const roleLabel = (r) => {
      if (r === "owner")        return "Super Admin";
      if (r === "sales_head")   return "Sales Head";
      if (r === "sales_manager")return "Sales Manager";
      if (r === "inside_sales") return "Inside Sales";
      return (r || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    };

    res.json((users || []).map((u) => ({
      id:    u.id,
      name:  u.full_name || u.email,
      email: u.email,
      role:  u.role,
      label: `${u.full_name || u.email} (${roleLabel(u.role)})`,
    })));
  } catch (err) {
    console.error("[Reports] inactivity-test-recipients error:", err.message);
    res.status(500).json({ error: "Failed to fetch recipients" });
  }
});

// ─── POST /api/reports/send-dsr ───────────────────────────────────────────────
// Accepts { selectedEmails, datePreset, customStart?, customEnd?,
//           selectedEmployeeIds?, reportType?, datePeriod? }
router.post("/send-dsr", authenticate, authorize("owner", "sales_head", "inside_sales"), async (req, res) => {
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
    })
    .select("id")
    .single();

  const logId = logEntry?.id;

  try {
    // Resolve which employees to include
    // inside_sales users are always restricted to their own data
    let staffIds;
    if (req.profile.role === "inside_sales") {
      staffIds = [req.profile.id];
    } else if (Array.isArray(selectedEmployeeIds) && selectedEmployeeIds.length > 0) {
      staffIds = selectedEmployeeIds;
    } else {
      const { data: allStaff } = await supabase
        .from("profiles").select("id")
        .in("role", ["sales_head", "inside_sales"])
        .not("status", "in", '("deleted","inactive")');
      staffIds = (allStaff || []).map(s => s.id);
    }

    if (!staffIds?.length) {
      if (logId) await supabase.from("dsr_email_logs")
        .update({ delivery_status: "failed", error_message: "No staff found." }).eq("id", logId);
      return res.status(422).json({ error: "No sales staff found for the selected filters." });
    }

    console.log("[DSR] 1 generateEmployeeActivityData", dayStart, dayEnd, "staffIds:", staffIds.length);
    const { employeeData, staff } = await generateEmployeeActivityData(staffIds, dayStart, dayEnd);
    console.log("[DSR] 1 done staff:", staff.length);

    if (!staff.length) {
      if (logId) await supabase.from("dsr_email_logs")
        .update({ delivery_status: "failed", error_message: "No staff data found for this period." }).eq("id", logId);
      return res.status(422).json({ error: "No sales staff data available for the selected period." });
    }

    console.log("[DSR] 2 generateActivityPdf");
    const typeLabel = reportType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const pdfBuffer = await generateActivityPdf({
      employeeData, staff, reportDateLabel, reportType: typeLabel, generatedAt: new Date().toISOString(),
    });
    console.log("[DSR] 2 done pdf bytes:", pdfBuffer?.length);

    // Build email body from per-employee data
    const rl = (r) => r==="owner"?"Super Admin":r==="sales_head"?"Sales Head":r==="inside_sales"?"Inside Sales":(r||"Staff").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());
    const empRows = staff.map(s => {
      const st = employeeData[s.id]?.stats || {};
      return `<tr style="border-bottom:1px solid #F3F4F6;">
        <td style="padding:11px 14px;font-size:13px;font-weight:600;color:#111827;">${s.full_name||s.email}</td>
        <td style="padding:11px 14px;font-size:12px;color:#6B7280;">${rl(s.role)}</td>
        <td style="padding:11px 14px;text-align:center;font-size:14px;font-weight:700;color:#4F46E5;">${st.total||0}</td>
        <td style="padding:11px 14px;text-align:center;font-size:13px;color:#16A34A;font-weight:600;">${st.completed||0}</td>
        <td style="padding:11px 14px;text-align:center;font-size:13px;color:#2563EB;">${st.calls||0}</td>
        <td style="padding:11px 14px;text-align:center;font-size:13px;color:#0891B2;">${st.emails||0}</td>
        <td style="padding:11px 14px;text-align:center;font-size:13px;color:#059669;">${st.meetings||0}</td>
        <td style="padding:11px 14px;text-align:center;font-size:13px;font-weight:700;color:#7C3AED;">${st.efficiency||0}%</td>
      </tr>`;
    }).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0;background:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E5E7EB;">
  <tr><td style="height:4px;background:#4F46E5;"></td></tr>
  <tr><td style="padding:28px 32px 20px;">
    <div style="font-size:22px;font-weight:800;color:#111827;margin-bottom:4px;">Ccentrik DSR — ${reportDateLabel}</div>
    <div style="font-size:13px;color:#6B7280;">${typeLabel} Sales Report &nbsp;&middot;&nbsp; ${staff.length} employee${staff.length!==1?"s":""} &nbsp;&middot;&nbsp; See attached PDF for full details</div>
  </td></tr>
  <tr><td style="padding:0 32px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;">
      <tr style="background:#F9FAFB;">
        <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">Employee</th>
        <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">Role</th>
        <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Activities</th>
        <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Done</th>
        <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Calls</th>
        <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Emails</th>
        <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Meetings</th>
        <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Score</th>
      </tr>
      ${empRows}
    </table>
  </td></tr>
  <tr><td style="background:#F9FAFB;padding:16px 32px;border-top:1px solid #E5E7EB;font-size:11.5px;color:#9CA3AF;">
    &copy; ${new Date().getFullYear()} CCENTRIK &nbsp;&middot;&nbsp; Automated DSR &nbsp;&middot;&nbsp; Do not reply
  </td></tr>
</table></td></tr></table></body></html>`;
    const text = `Ccentrik DSR — ${reportDateLabel}\n\n${staff.map(s=>{const st=employeeData[s.id]?.stats||{};return `${s.full_name||s.email}: ${st.total||0} activities, ${st.calls||0} calls, ${st.emails||0} emails, ${st.meetings||0} meetings`;}).join("\n")}\n\nSee attached PDF for full details.`;
    const pdfFilename = `DSR-${typeLabel.replace(/\s/g,"-")}-${logDateStr}.pdf`;

    console.log("[DSR] 3 sendMail to", uniqueEmails.length, "recipients");
    await sendMail({
      to:      uniqueEmails,
      subject: `Ccentrik ${subjectLabel} — ${reportDateLabel}`,
      html,
      text,
      attachments: [{
        filename:    pdfFilename,
        content:     pdfBuffer.toString("base64"),
        content_type: "application/pdf",
      }],
    });
    console.log("[DSR] 3 done");

    if (logId) await supabase.from("dsr_email_logs")
      .update({ delivery_status: "sent" }).eq("id", logId);

    console.log(`[Reports] DSR (${reportType}) sent by ${req.profile.email} → ${uniqueEmails.length} recipients`);
    res.json({ success: true, sent_to: uniqueEmails.length, log_id: logId });

  } catch (err) {
    console.error("[Reports] DSR send error:", err.message);
    console.error("[Reports] DSR send stack:", err.stack?.slice(0, 600));
    if (logId) await supabase.from("dsr_email_logs")
      .update({ delivery_status: "failed", error_message: err.message?.slice(0, 500) })
      .eq("id", logId);
    res.status(500).json({ error: err.message || "Failed to send DSR report." });
  }
});

// ─── POST /api/reports/download-pdf ──────────────────────────────────────────
// Owner / Sales Head / Inside Sales — per-employee activity PDF for the selected period.
// inside_sales users are restricted to their own data server-side.
// Accepts { selectedEmployeeIds?, datePreset?, customStart?, customEnd? }
router.post("/download-pdf", authenticate, authorize("owner", "sales_head", "inside_sales"), async (req, res) => {
  const { selectedEmployeeIds, datePreset, customStart, customEnd } = req.body;

  // Resolve date range (supports datePreset like send-dsr, or raw customStart/customEnd)
  let periodRange;
  try {
    if (datePreset) {
      const r = resolvePreset(datePreset, customStart, customEnd);
      periodRange = computeDateRange(r.reportType, r.datePeriod, { customStart: r.customStart, customEnd: r.customEnd });
    } else {
      if (!customStart || !customEnd)
        return res.status(400).json({ error: "datePreset or customStart+customEnd are required." });
      periodRange = computeDateRange("custom", null, { customStart, customEnd });
    }
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const { start: dayStart, end: dayEnd, label: reportDateLabel, subject: subjectLabel } = periodRange;

  try {
    // Determine which employee IDs to include
    // inside_sales users are always restricted to their own data (server-side enforcement)
    let staffIds;
    if (req.profile.role === "inside_sales") {
      staffIds = [req.profile.id];
    } else {
      staffIds = Array.isArray(selectedEmployeeIds) && selectedEmployeeIds.length > 0
        ? selectedEmployeeIds
        : null;

      if (!staffIds) {
        const { data: allStaff } = await supabase
          .from("profiles")
          .select("id")
          .in("role", ["inside_sales", "sales_head"])
          .not("status", "in", '("deleted","inactive")');
        staffIds = (allStaff || []).map(s => s.id);
      }
    }

    if (!staffIds.length)
      return res.status(422).json({ error: "No staff found for the selected filters." });

    const { employeeData, staff } = await generateEmployeeActivityData(staffIds, dayStart, dayEnd);
    if (!staff.length)
      return res.status(422).json({ error: "No staff data available for the selected period." });

    const reportType = (subjectLabel || "Sales Report").replace(" Sales Report", "").trim() || "Custom";
    const pdfBuffer = await generateActivityPdf({
      employeeData,
      staff,
      reportDateLabel,
      reportType,
      generatedAt: new Date().toISOString(),
    });

    const filename = `DSR_${reportDateLabel.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
    // Return base64-encoded PDF to avoid binary corruption in Vercel serverless
    res.json({ data: pdfBuffer.toString("base64"), filename, size: pdfBuffer.length });
  } catch (err) {
    console.error("[Reports] PDF download error:", err.message, err.stack?.slice(0, 400));
    res.status(500).json({ error: err.message || "Failed to generate PDF." });
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

// ─── Helper: derive current datePeriod string for a given reportType (IST) ───
function currentPeriodForType(reportType, nowIst) {
  const pad = (n) => String(n).padStart(2, "0");
  const y   = nowIst.getUTCFullYear();
  const mo  = nowIst.getUTCMonth();           // 0-indexed
  const d   = nowIst.getUTCDate();
  const todayStr = `${y}-${pad(mo + 1)}-${pad(d)}`;
  switch (reportType) {
    case "daily":       return { reportType, datePeriod: todayStr };
    case "weekly":      return { reportType, datePeriod: todayStr };   // computeDateRange handles week math
    case "monthly":     return { reportType, datePeriod: `${y}-${pad(mo + 1)}` };
    case "quarterly":   return { reportType, datePeriod: `${y}-Q${Math.floor(mo / 3) + 1}` };
    case "half_yearly": return { reportType, datePeriod: `${y}-${mo < 6 ? "H1" : "H2"}` };
    case "yearly":      return { reportType, datePeriod: String(y) };
    default:            return { reportType: "daily", datePeriod: todayStr };
  }
}

// ─── GET /api/reports/scheduler ──────────────────────────────────────────────
// Returns the current user's auto-email scheduler config (null if none).
router.get("/scheduler", authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("dsr_scheduler")
      .select("*")
      .eq("user_id", req.profile.id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || null);
  } catch (err) {
    console.error("[Scheduler] GET error:", err.message);
    res.status(500).json({ error: "Failed to fetch scheduler config" });
  }
});

// ─── POST /api/reports/scheduler ─────────────────────────────────────────────
// Upserts the current user's auto-email scheduler config.
router.post("/scheduler", authenticate, async (req, res) => {
  const { enabled, report_type, employee_ids, recipient_emails, time_slot } = req.body;

  if (!time_slot) return res.status(400).json({ error: "time_slot is required" });

  // Role enforcement: inside_sales can only schedule their own report
  let empIds = Array.isArray(employee_ids) && employee_ids.length > 0 ? employee_ids : null;
  if (req.profile.role === "inside_sales") {
    empIds = [req.profile.id];
  }

  // Recipient is always the logged-in user's own email — not selectable
  const ownerEmail = req.profile.email;
  if (!ownerEmail) {
    return res.status(400).json({ error: "Your profile has no email address. Please contact an administrator." });
  }

  try {
    const { data, error } = await supabase
      .from("dsr_scheduler")
      .upsert({
        user_id:          req.profile.id,
        enabled:          enabled !== false,
        report_type:      report_type || "daily",
        employee_ids:     empIds,
        recipient_emails: [ownerEmail],
        time_slot,
        updated_at:       new Date().toISOString(),
      }, { onConflict: "user_id" })
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, config: data });
  } catch (err) {
    console.error("[Scheduler] POST error:", err.message);
    res.status(500).json({ error: err.message || "Failed to save scheduler config" });
  }
});

// ─── GET /api/reports/scheduler-cron ─────────────────────────────────────────
// Called every 30 min by Vercel Cron. Finds all enabled configs whose time_slot
// matches the current IST half-hour and sends the configured DSR.
router.get("/scheduler-cron", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const nowUtc      = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIst      = new Date(nowUtc.getTime() + istOffsetMs);

  // Floor current IST minutes to the nearest half-hour boundary.
  // GitHub Actions cron can fire up to ~20 min late, so we must floor (not round)
  // to avoid mapping an 8:20 PM execution to the "08:30 PM" slot.
  const h24    = nowIst.getUTCHours();
  const rawMin = nowIst.getUTCMinutes();
  const slot_m = rawMin < 30 ? 0 : 30;
  const h12    = h24 % 12 || 12;
  const ampm   = h24 < 12 ? "AM" : "PM";
  const currentSlot = `${String(h12).padStart(2, "0")}:${String(slot_m).padStart(2, "0")} ${ampm}`;

  console.log(`[Scheduler-Cron] ${nowUtc.toISOString()} → IST slot: ${currentSlot}`);

  try {
    const { data: configs, error: cfgErr } = await supabase
      .from("dsr_scheduler")
      .select("*")
      .eq("enabled", true)
      .eq("time_slot", currentSlot);

    if (cfgErr) throw cfgErr;
    if (!configs || configs.length === 0) {
      return res.json({ success: true, slot: currentSlot, sent: 0, message: "No configs for this slot" });
    }

    const results = [];

    for (const cfg of configs) {
      try {
        // Compute date range for this report type
        const { reportType, datePeriod } = currentPeriodForType(cfg.report_type || "daily", nowIst);
        const { start, end, label: rangeLabel } = computeDateRange(reportType, datePeriod);

        // Determine employee IDs
        let staffIds = Array.isArray(cfg.employee_ids) && cfg.employee_ids.length > 0
          ? cfg.employee_ids
          : null;
        if (!staffIds) {
          const { data: allStaff } = await supabase
            .from("profiles")
            .select("id")
            .in("role", ["sales_head", "inside_sales"])
            .not("status", "in", '("deleted","inactive")');
          staffIds = (allStaff || []).map((s) => s.id);
        }
        if (!staffIds || staffIds.length === 0) continue;

        // Fetch employee activity data — staffIds first, then date range
        const { employeeData, staff: empStaff } = await generateEmployeeActivityData(staffIds, start, end);
        if (!empStaff || empStaff.length === 0) {
          results.push({ user_id: cfg.user_id, status: "skipped", reason: "no_data" });
          continue;
        }

        // Generate PDF
        const reportTypeLabel = cfg.report_type
          ? cfg.report_type.charAt(0).toUpperCase() + cfg.report_type.slice(1).replace(/_/g, " ")
          : "Daily";
        const pdfBuffer = await generateActivityPdf({
          employeeData,
          staff:           empStaff,
          reportDateLabel: rangeLabel,
          reportType:      reportTypeLabel,
          generatedAt:     nowUtc.toISOString(),
        });

        // Always send to the config owner's current email (fetched live from profiles)
        const { data: cfgOwner } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", cfg.user_id)
          .maybeSingle();
        const toEmails = [cfgOwner?.email].filter(Boolean);
        if (toEmails.length === 0) continue;

        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#1e293b;margin-bottom:8px">Ccentrik Auto DSR — ${rangeLabel}</h2>
          <p style="color:#64748b;font-size:14px">Your automated <strong>${reportTypeLabel}</strong> Sales Report is attached.</p>
          <p style="color:#64748b;font-size:14px">Covers ${employeeData.length} employee(s).</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
          <p style="color:#94a3b8;font-size:12px">Sent automatically by Ccentrik CRM Auto Scheduler at ${currentSlot} IST</p>
        </div>`;

        await sendMail({
          to:          toEmails,
          subject:     `Ccentrik Auto DSR (${reportTypeLabel}) — ${rangeLabel}`,
          html,
          text:        `Ccentrik Auto DSR — ${rangeLabel}\n\nYour automated ${reportTypeLabel} Sales Report is attached.`,
          attachments: [{
            filename:     `AutoDSR-${cfg.report_type}-${nowIst.toISOString().slice(0, 10)}.pdf`,
            content:      pdfBuffer.toString("base64"),
            content_type: "application/pdf",
          }],
        });

        results.push({ user_id: cfg.user_id, report_type: cfg.report_type, recipients: toEmails.length, status: "sent" });
        console.log(`[Scheduler-Cron] Sent ${cfg.report_type} DSR to ${toEmails.length} recipients for user ${cfg.user_id}`);

      } catch (itemErr) {
        console.error(`[Scheduler-Cron] Failed for user ${cfg.user_id}:`, itemErr.message);
        results.push({ user_id: cfg.user_id, status: "error", error: itemErr.message });
      }
    }

    res.json({ success: true, slot: currentSlot, sent: results.filter((r) => r.status === "sent").length, results });

  } catch (err) {
    console.error("[Scheduler-Cron] Fatal error:", err.message);
    res.status(500).json({ error: err.message || "Scheduler cron failed" });
  }
});

// ─── GET /api/reports/auto-dsr-cron ──────────────────────────────────────────
// Called daily by Vercel Cron at 14:30 UTC (8:00 PM IST).
// Role-based email routing:
//   • Field staff (sales_employee, inside_sales, sales_manager) → all sales_heads + all owners
//   • Sales heads → owners only
// Protected by CRON_SECRET env var (set in Vercel dashboard).
router.get("/auto-dsr-cron", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    console.warn("[AutoDSR] Unauthorized cron attempt from", req.ip);
    return res.status(401).json({ error: "Unauthorized" });
  }

  console.log("[AutoDSR] Cron triggered at", new Date().toISOString());

  try {
    // Compute today's IST date range  (IST = UTC + 5h 30m)
    const nowUtc      = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const nowIst      = new Date(nowUtc.getTime() + istOffsetMs);
    const todayIST    = nowIst.toISOString().slice(0, 10);      // "YYYY-MM-DD"
    const dayStart    = new Date(`${todayIST}T00:00:00+05:30`).toISOString();
    const dayEnd      = new Date(`${todayIST}T23:59:59+05:30`).toISOString();
    const dateLabel   = new Date(`${todayIST}T12:00:00Z`).toLocaleDateString("en-IN", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    // Fetch all relevant profiles in one query
    const { data: allProfiles, error: profErr } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .in("role", ["owner", "sales_head", "sales_manager", "inside_sales", "sales_employee"])
      .not("status", "in", '("deleted","inactive")')
      .not("email", "is", null)
      .order("role").order("full_name");

    if (profErr) throw new Error("Profile fetch failed: " + profErr.message);

    const owners      = (allProfiles || []).filter((p) => p.role === "owner");
    const salesHeads  = (allProfiles || []).filter((p) => p.role === "sales_head");
    const fieldStaff  = (allProfiles || []).filter((p) =>
      ["sales_manager", "inside_sales", "sales_employee"].includes(p.role)
    );

    const ownerEmails     = owners.map((o) => o.email).filter(Boolean);
    const salesHeadEmails = salesHeads.map((h) => h.email).filter(Boolean);
    const results         = [];

    const rangeLabel = "00:00 – 20:00 IST";

    // ── A: Field staff DSR → Sales Heads + Super Admins ────────────────────
    if (fieldStaff.length > 0) {
      const fieldData = await generateStaffDSRData(dayStart, dayEnd, fieldStaff);
      if (fieldData) {
        const toEmails = [...new Set([...salesHeadEmails, ...ownerEmails])];
        if (toEmails.length > 0) {
          const html = buildTSRHtml(fieldData.staff, fieldData.userStats, fieldData.totals, dateLabel, rangeLabel);
          const text = buildTSRText(fieldData.staff, fieldData.userStats, fieldData.totals, dateLabel, rangeLabel);
          const attachments = [];
          try {
            const pdfBuffer = await generateDSRPdf({
              staff: fieldData.staff, userStats: fieldData.userStats, totals: fieldData.totals,
              reportDateLabel: dateLabel, reportType: "Daily", generatedAt: nowUtc.toISOString(),
            });
            attachments.push({ filename: `DSR-Daily-${todayIST}.pdf`, content: pdfBuffer.toString("base64"), content_type: "application/pdf" });
          } catch (pdfErr) {
            console.warn("[AutoDSR] PDF generation failed (field staff), sending without attachment:", pdfErr.message);
          }
          await sendMail({ to: toEmails, subject: `Ccentrik Daily Sales Report — ${dateLabel}`, html, text, attachments });
          try {
            await supabase.from("dsr_email_logs").insert({
              recipients: toEmails, report_date: todayIST, report_type: "daily",
              delivery_status: "sent", recipient_count: toEmails.length,
            });
          } catch (logErr) {
            console.warn("[AutoDSR] Log insert failed:", logErr.message);
          }
          results.push({ type: "field_staff_dsr", recipients: toEmails.length, status: "sent" });
          console.log(`[AutoDSR] Field staff DSR sent to ${toEmails.length} recipients`);
        }
      } else {
        console.log("[AutoDSR] No field staff activity data for", todayIST);
      }
    }

    // ── B: Sales Head DSR → Super Admins only ──────────────────────────────
    if (salesHeads.length > 0 && ownerEmails.length > 0) {
      const headData = await generateStaffDSRData(dayStart, dayEnd, salesHeads);
      if (headData) {
        const html = buildTSRHtml(headData.staff, headData.userStats, headData.totals, dateLabel, rangeLabel);
        const text = buildTSRText(headData.staff, headData.userStats, headData.totals, dateLabel, rangeLabel);
        const attachments = [];
        try {
          const pdfBuffer = await generateDSRPdf({
            staff: headData.staff, userStats: headData.userStats, totals: headData.totals,
            reportDateLabel: dateLabel, reportType: "Daily (Sales Heads)", generatedAt: nowUtc.toISOString(),
          });
          attachments.push({ filename: `DSR-SalesHead-${todayIST}.pdf`, content: pdfBuffer.toString("base64"), content_type: "application/pdf" });
        } catch (pdfErr) {
          console.warn("[AutoDSR] PDF generation failed (sales head), sending without attachment:", pdfErr.message);
        }
        await sendMail({ to: ownerEmails, subject: `Ccentrik Sales Head Daily Report — ${dateLabel}`, html, text, attachments });
        try {
          await supabase.from("dsr_email_logs").insert({
            recipients: ownerEmails, report_date: todayIST, report_type: "daily",
            delivery_status: "sent", recipient_count: ownerEmails.length,
          });
        } catch (logErr) {
          console.warn("[AutoDSR] Log insert failed:", logErr.message);
        }
        results.push({ type: "sales_head_dsr", recipients: ownerEmails.length, status: "sent" });
        console.log(`[AutoDSR] Sales Head DSR sent to ${ownerEmails.length} Super Admins`);
      }
    }

    console.log("[AutoDSR] Completed:", JSON.stringify(results));
    res.json({ success: true, date: todayIST, results });

  } catch (err) {
    console.error("[AutoDSR] Cron error:", err.message);
    console.error("[AutoDSR] Stack:", err.stack?.slice(0, 600));
    res.status(500).json({ error: err.message || "Auto DSR cron failed" });
  }
});

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

// ─── POST /api/reports/inactivity-send-now ───────────────────────────────────
// Manual / urgent send — checks inactivity right now and emails any recipient.
// Available to owner and sales_head only.
router.post("/inactivity-send-now", authenticate, authorize("owner", "sales_head"), async (req, res) => {
  const { threshold_days, test_emails } = req.body;
  const effectiveDays = Math.max(1, parseInt(threshold_days) || 3);

  // Send only to the explicitly selected test recipients; fall back to logged-in user
  const selected = Array.isArray(test_emails) ? test_emails.filter(Boolean) : [];
  const toEmails = selected.length > 0 ? selected : [req.profile.email].filter(Boolean);

  if (!toEmails.length) {
    return res.status(400).json({ error: "No recipients selected. Please select at least one recipient." });
  }

  try {
    const nowUtc = new Date();
    const nowIst = new Date(nowUtc.getTime() + 5.5 * 60 * 60 * 1000);

    const inactiveEmployees = await getInactiveEmployees(effectiveDays, nowIst);

    // Always send a test email — even if 0 inactive employees, deliver a confirmation
    const html = inactiveEmployees.length > 0
      ? buildInactivityAlertHtml(inactiveEmployees, effectiveDays, "detailed", nowIst)
      : `<div style="font-family:sans-serif;padding:24px;max-width:560px;margin:auto">
           <h2 style="color:#111">Inactivity Alert — Test Delivery</h2>
           <p style="color:#475569">This is a test email to confirm that your Inactivity Alert is configured correctly.</p>
           <p style="color:#475569">No employees were found inactive for <strong>${effectiveDays}+ days</strong> at the time of sending — this means all tracked employees have been active within the threshold period.</p>
           <p style="color:#94a3b8;font-size:12px;">Sent via Ccentrik CRM · Inactivity Alert test</p>
         </div>`;

    const text = inactiveEmployees.length > 0
      ? buildInactivityAlertText(inactiveEmployees, effectiveDays)
      : `Inactivity Alert Test\n\nNo employees inactive for ${effectiveDays}+ days at time of sending.\nAll tracked employees are active within the threshold.\n\n— Ccentrik CRM`;

    await sendMail({
      to:      toEmails,
      subject: inactiveEmployees.length > 0
        ? `Employee Inactivity Alert — ${inactiveEmployees.length} employee${inactiveEmployees.length !== 1 ? "s" : ""} inactive for ${effectiveDays}+ days`
        : `[Test] Inactivity Alert — All employees active (${effectiveDays}-day threshold)`,
      html,
      text,
    });

    console.log(`[InactivityAlert] Test send by ${req.profile.email} → ${toEmails.length} recipient(s) — ${inactiveEmployees.length} inactive`);
    res.json({ success: true, sent: true, inactive_count: inactiveEmployees.length });
  } catch (err) {
    console.error("[InactivityAlert] Manual send error:", err.message);
    res.status(500).json({ error: err.message || "Failed to send inactivity alert" });
  }
});

// ─── GET /api/reports/inactivity-config ──────────────────────────────────────
// Returns the current user's inactivity alert config (owner/sales_head only).
router.get("/inactivity-config", authenticate, authorize("owner", "sales_head"), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("inactivity_alert_config")
      .select("*")
      .eq("user_id", req.profile.id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || null);
  } catch (err) {
    console.error("[InactivityAlert] GET config error:", err.message);
    res.status(500).json({ error: "Failed to fetch inactivity alert config" });
  }
});

// ─── POST /api/reports/inactivity-config ─────────────────────────────────────
// Upserts the current user's inactivity alert config (owner/sales_head only).
router.post("/inactivity-config", authenticate, authorize("owner", "sales_head"), async (req, res) => {
  const { enabled, threshold_days, time_slot, frequency, email_format } = req.body;

  if (!time_slot) return res.status(400).json({ error: "time_slot is required" });
  const effectiveDays = Math.max(1, parseInt(threshold_days) || 3);

  // Scheduled alerts always go to the logged-in user's email only
  const ownerEmail    = req.profile.email;
  const allRecipients = ownerEmail ? [ownerEmail] : [];

  try {
    const { data, error } = await supabase
      .from("inactivity_alert_config")
      .upsert({
        user_id:          req.profile.id,
        enabled:          enabled !== false,
        threshold_days:   effectiveDays,
        time_slot,
        recipient_emails: allRecipients,
        frequency:        frequency || "daily",
        email_format:     email_format || "summary",
        updated_at:       new Date().toISOString(),
      }, { onConflict: "user_id" })
      .select()
      .single();
    if (error) throw error;
    console.log(`[InactivityAlert] Config saved by ${req.profile.email} — threshold: ${effectiveDays}d, slot: ${time_slot}, recipients: ${allRecipients.length}`);
    res.json({ success: true, config: data });
  } catch (err) {
    console.error("[InactivityAlert] POST config error:", err.message);
    res.status(500).json({ error: err.message || "Failed to save config" });
  }
});

// ─── GET /api/reports/inactivity-cron ────────────────────────────────────────
// Called every 30 min by GitHub Actions. Finds all enabled configs whose time_slot
// matches the current IST half-hour, checks employee inactivity, and sends alerts.
router.get("/inactivity-cron", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const nowUtc      = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIst      = new Date(nowUtc.getTime() + istOffsetMs);

  const h24    = nowIst.getUTCHours();
  const rawMin = nowIst.getUTCMinutes();
  const slot_m = rawMin < 30 ? 0 : 30;
  const h12    = h24 % 12 || 12;
  const ampm   = h24 < 12 ? "AM" : "PM";
  const currentSlot = `${String(h12).padStart(2, "0")}:${String(slot_m).padStart(2, "0")} ${ampm}`;

  console.log(`[InactivityCron] ${nowUtc.toISOString()} → IST slot: ${currentSlot}`);

  try {
    const { data: configs, error: cfgErr } = await supabase
      .from("inactivity_alert_config")
      .select("*")
      .eq("enabled", true)
      .eq("time_slot", currentSlot);

    if (cfgErr) throw cfgErr;
    if (!configs || configs.length === 0) {
      return res.json({ success: true, slot: currentSlot, sent: 0, message: "No inactivity configs for this slot" });
    }

    // Apply frequency filter: weekly = Monday only, monthly = 1st of month only
    const dayOfWeek  = nowIst.getUTCDay();  // 0=Sun … 6=Sat
    const dayOfMonth = nowIst.getUTCDate();

    const activeConfigs = configs.filter(cfg => {
      if (cfg.frequency === "weekly")  return dayOfWeek  === 1;  // Monday
      if (cfg.frequency === "monthly") return dayOfMonth === 1;  // 1st
      return true; // daily
    });

    if (activeConfigs.length === 0) {
      return res.json({ success: true, slot: currentSlot, sent: 0, message: "No configs due today based on frequency" });
    }

    // Cache inactivity results per unique threshold to avoid redundant DB calls
    const inactiveCache = {};
    const results = [];

    for (const cfg of activeConfigs) {
      try {
        const key = String(cfg.threshold_days);
        if (!inactiveCache[key]) {
          inactiveCache[key] = await getInactiveEmployees(cfg.threshold_days, nowIst);
        }
        const inactiveEmployees = inactiveCache[key];

        const toEmails = (cfg.recipient_emails || []).filter(Boolean);
        if (toEmails.length === 0) {
          results.push({ user_id: cfg.user_id, status: "skipped", reason: "no_recipients" });
          continue;
        }

        if (inactiveEmployees.length === 0) {
          results.push({ user_id: cfg.user_id, status: "skipped", reason: "no_inactive_employees" });
          continue;
        }

        const html = buildInactivityAlertHtml(inactiveEmployees, cfg.threshold_days, cfg.email_format, nowIst);
        const text = buildInactivityAlertText(inactiveEmployees, cfg.threshold_days);

        await sendMail({
          to:      toEmails,
          subject: `Employee Inactivity Alert — ${inactiveEmployees.length} employee${inactiveEmployees.length !== 1 ? "s" : ""} inactive for ${cfg.threshold_days}+ days`,
          html,
          text,
        });

        results.push({ user_id: cfg.user_id, status: "sent", inactive: inactiveEmployees.length, recipients: toEmails.length });
        console.log(`[InactivityCron] Alert sent (threshold: ${cfg.threshold_days}d) to ${toEmails.length} recipients — ${inactiveEmployees.length} inactive employees`);
      } catch (itemErr) {
        console.error(`[InactivityCron] Failed for user ${cfg.user_id}:`, itemErr.message);
        results.push({ user_id: cfg.user_id, status: "error", error: itemErr.message });
      }
    }

    res.json({ success: true, slot: currentSlot, sent: results.filter(r => r.status === "sent").length, results });
  } catch (err) {
    console.error("[InactivityCron] Fatal error:", err.message);
    res.status(500).json({ error: err.message || "Inactivity cron failed" });
  }
});

// ─── Helper: find employees inactive for >= thresholdDays ────────────────────
async function getInactiveEmployees(thresholdDays, nowIst) {
  const { data: employees, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .in("role", ["inside_sales", "sales_head"])
    .not("status", "in", '("deleted","inactive")')
    .order("full_name");

  if (error || !employees?.length) return [];

  const inactive = [];

  for (const emp of employees) {
    const { data: lastLoginRow } = await supabase
      .from("login_logs")
      .select("logged_in_at")
      .eq("user_id", emp.id)
      .order("logged_in_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const [
      { data: lastAct     },
      { data: lastLead    },
      { data: lastDeal    },
      { data: lastMeeting },
      { data: lastTask    },
    ] = await Promise.all([
      supabase.from("activities").select("created_at").eq("created_by", emp.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("leads").select("created_at").eq("owner_id", emp.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("deals").select("created_at").eq("created_by", emp.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("meetings").select("created_at").eq("created_by", emp.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("tasks").select("updated_at").eq("assigned_to", emp.id)
        .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const loginTs = lastLoginRow?.logged_in_at || null;
    const activityTs = [
      lastAct?.created_at,
      lastLead?.created_at,
      lastDeal?.created_at,
      lastMeeting?.created_at,
      lastTask?.updated_at,
    ].filter(Boolean).reduce((max, ts) => (ts > max ? ts : max), "") || null;

    const candidates = [loginTs, activityTs].filter(Boolean);
    const lastSeenTs = candidates.length > 0
      ? candidates.reduce((max, ts) => (ts > max ? ts : max))
      : null;

    const daysInactive = lastSeenTs
      ? Math.floor((nowIst.getTime() - new Date(lastSeenTs).getTime()) / (24 * 60 * 60 * 1000))
      : 999;

    if (daysInactive >= thresholdDays) {
      inactive.push({
        id: emp.id,
        name: emp.full_name || emp.email,
        email: emp.email,
        role: emp.role,
        lastLogin:    loginTs,
        lastActivity: activityTs,
        lastSeen:     lastSeenTs,
        daysInactive,
      });
    }
  }

  return inactive;
}

// ─── Build inactivity alert HTML email ───────────────────────────────────────
function buildInactivityAlertHtml(employees, thresholdDays, format, nowIst) {
  const todayStr = nowIst.toISOString().slice(0, 10);
  const rl = r => r === "owner" ? "Super Admin" : r === "sales_head" ? "Sales Head" : r === "inside_sales" ? "Inside Sales" : (r || "").replace(/_/g, " ");
  const fmtDate = (ts) => {
    if (!ts) return "Never";
    return new Date(ts).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  };

  const rows = employees.map(e => {
    const daysLabel = e.daysInactive === 999 ? "Never active" : `${e.daysInactive} days`;
    const color     = e.daysInactive >= 7 ? "#DC2626" : "#D97706";
    return `
      <tr style="border-bottom:1px solid #F3F4F6;">
        <td style="padding:11px 14px;font-size:13px;font-weight:600;color:#111827;">${e.name}</td>
        <td style="padding:11px 14px;font-size:12px;color:#6B7280;">${rl(e.role)}</td>
        <td style="padding:11px 14px;font-size:12px;color:#6B7280;">${fmtDate(e.lastLogin)}</td>
        <td style="padding:11px 14px;font-size:12px;color:#6B7280;">${fmtDate(e.lastActivity)}</td>
        <td style="padding:11px 14px;text-align:center;font-size:13px;font-weight:700;color:${color};">${daysLabel}</td>
      </tr>`;
  }).join("");

  const detailedNote = format === "detailed"
    ? `<tr><td style="padding:0 32px 20px;">
        <div style="background:#F8FAFC;border:1px solid #E5E7EB;border-radius:8px;padding:14px 18px;">
          <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Inactivity Summary</div>
          <div style="font-size:12.5px;color:#6B7280;line-height:1.7;">
            Total employees monitored: <strong style="color:#111827;">${employees.length}</strong><br/>
            Threshold: <strong style="color:#111827;">${thresholdDays} days</strong><br/>
            Report generated: <strong style="color:#111827;">${todayStr}</strong>
          </div>
        </div>
      </td></tr>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E5E7EB;">
  <tr><td style="height:4px;background:#000;"></td></tr>
  <tr><td style="padding:28px 32px 16px;">
    <div style="font-size:22px;font-weight:800;color:#111827;margin-bottom:4px;">Employee Inactivity Alert</div>
    <div style="font-size:13px;color:#6B7280;">${employees.length} employee${employees.length !== 1 ? "s" : ""} inactive for ${thresholdDays}+ days &nbsp;&middot;&nbsp; ${todayStr}</div>
  </td></tr>
  <tr><td style="padding:0 32px 20px;">
    <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;padding:12px 16px;font-size:12.5px;color:#92400E;line-height:1.6;">
      The following employees have not logged in or performed any CRM activity for <strong>${thresholdDays}</strong> or more consecutive days. Please review and take necessary action.
    </div>
  </td></tr>
  ${detailedNote}
  <tr><td style="padding:0 32px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;">
      <tr style="background:#F9FAFB;">
        <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">Employee</th>
        <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Role</th>
        <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Last Login</th>
        <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Last Activity</th>
        <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Inactive Days</th>
      </tr>
      ${rows}
    </table>
  </td></tr>
  <tr><td style="background:#F9FAFB;padding:16px 32px;border-top:1px solid #E5E7EB;font-size:11.5px;color:#9CA3AF;">
    &copy; ${new Date().getFullYear()} CCENTRIK &nbsp;&middot;&nbsp; Automated Inactivity Alert &nbsp;&middot;&nbsp; Do not reply
  </td></tr>
</table></td></tr></table></body></html>`;
}

// ─── Build inactivity alert plain-text ───────────────────────────────────────
function buildInactivityAlertText(employees, thresholdDays) {
  const rl     = r => r === "owner" ? "Super Admin" : r === "sales_head" ? "Sales Head" : r === "inside_sales" ? "Inside Sales" : (r || "");
  const fmtDt  = ts => ts ? new Date(ts).toLocaleString("en-IN") : "Never";
  const sep    = "=".repeat(80);
  const lines  = employees.map(e =>
    `  ${(e.name).padEnd(28)} | ${rl(e.role).padEnd(14)} | Last Login: ${fmtDt(e.lastLogin).padEnd(22)} | Last Activity: ${fmtDt(e.lastActivity).padEnd(22)} | Inactive: ${e.daysInactive === 999 ? "Never active" : e.daysInactive + " days"}`
  ).join("\n");
  return `${sep}\nEMPLOYEE INACTIVITY ALERT\nThreshold: ${thresholdDays} days\n${sep}\n\n${lines}\n\n${sep}\nPlease review and take necessary action.\n— Ccentrik CRM`;
}

module.exports = router;
