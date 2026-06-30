const express  = require("express");
const router   = express.Router();
const { supabase } = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");
const { sendMail } = require("../config/mail");
const { generateTSRData, generateStaffDSRData, generateEmployeeActivityData, buildTSRHtml, buildTSRText } = require("../utils/dsrReport");
const { generateDSRPdf, generateActivityPdf, generateEnterpriseDSRPdf } = require("../utils/dsrPdf");

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
// Called daily by GitHub Actions at 14:10 UTC (7:40 PM IST).
// Role-based DSR routing — each recipient gets exactly ONE email scoped to their hierarchy:
//   • owner (Super Admin) → full org report (everyone)
//   • sales_head         → their hierarchy (managers + employees reporting to them)
//   • sales_manager      → their direct reports
//   • sales_employee / inside_sales → their own personal DSR
// Protected by CRON_SECRET env var.
// Duplicate prevention: checks dsr_email_logs before sending — skips if already sent today.
router.get("/auto-dsr-cron", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    console.warn("[AutoDSR] Unauthorized cron attempt from", req.ip);
    return res.status(401).json({ error: "Unauthorized" });
  }

  const nowUtc      = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIst      = new Date(nowUtc.getTime() + istOffsetMs);
  const todayIST    = nowIst.toISOString().slice(0, 10);   // "YYYY-MM-DD"
  const dayStart    = new Date(`${todayIST}T00:00:00+05:30`).toISOString();
  const dayEnd      = new Date(`${todayIST}T23:59:59+05:30`).toISOString();
  const dateLabel   = nowIst.toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Kolkata",
  });

  console.log(`[AutoDSR] Triggered at ${nowUtc.toISOString()} | IST date: ${todayIST}`);

  try {
    // ── Duplicate prevention: skip if already sent today ───────────────────
    const { data: existing } = await supabase
      .from("dsr_email_logs")
      .select("id")
      .eq("report_date", todayIST)
      .eq("report_type", "auto_daily")
      .eq("delivery_status", "sent")
      .limit(1);

    if (existing?.length > 0) {
      console.log(`[AutoDSR] Already sent for ${todayIST} — skipping duplicate execution.`);
      return res.json({ success: true, skipped: true, reason: "already_sent_today", date: todayIST });
    }

    // ── Fetch all active profiles with manager hierarchy ───────────────────
    const { data: allProfiles, error: profErr } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, manager_id")
      .in("role", ["owner", "sales_head", "sales_manager", "sales_employee", "inside_sales"])
      .not("status", "in", '("deleted","inactive")')
      .not("email", "is", null)
      .order("role").order("full_name");

    if (profErr) throw new Error("Profile fetch failed: " + profErr.message);

    const allP          = allProfiles || [];
    const owners        = allP.filter(p => p.role === "owner");
    const salesHeads    = allP.filter(p => p.role === "sales_head");
    const salesManagers = allP.filter(p => p.role === "sales_manager");
    const fieldRoles    = allP.filter(p => ["sales_employee", "inside_sales"].includes(p.role));

    // Helper: get all profiles in a person's hierarchy (direct reports + their direct reports)
    const getHierarchy = (managerId) => {
      const level1 = allP.filter(p => p.manager_id === managerId);
      const level2 = level1.flatMap(p => allP.filter(q => q.manager_id === p.id));
      const unique  = [...new Map([...level1, ...level2].map(p => [p.id, p])).values()];
      return unique;
    };

    const rangeLabel = "00:00 – 23:59 IST";
    const results    = [];
    const sentEmails = new Set(); // track who has received an email to prevent any duplicates

    const sendDSR = async ({ toEmails, staffList, reportTypeLabel, filenamePrefix }) => {
      const recipients = toEmails.filter(e => !sentEmails.has(e));
      if (!recipients.length || !staffList.length) return null;

      const data = await generateStaffDSRData(dayStart, dayEnd, staffList);
      if (!data) { console.log(`[AutoDSR] No data for ${filenamePrefix}`); return null; }

      const html = buildTSRHtml(data.staff, data.userStats, data.totals, dateLabel, rangeLabel);
      const text = buildTSRText(data.staff, data.userStats, data.totals, dateLabel, rangeLabel);

      const attachments = [];
      try {
        const pdfBuffer = await generateDSRPdf({
          staff: data.staff, userStats: data.userStats, totals: data.totals,
          reportDateLabel: dateLabel, reportType: reportTypeLabel, generatedAt: nowUtc.toISOString(),
        });
        attachments.push({
          filename: `${filenamePrefix}-${todayIST}.pdf`,
          content: pdfBuffer.toString("base64"),
          content_type: "application/pdf",
        });
      } catch (pdfErr) {
        console.warn(`[AutoDSR] PDF failed for ${filenamePrefix}:`, pdfErr.message);
      }

      await sendMail({
        to: recipients,
        subject: `Daily Sales Report – ${todayIST.split("-").reverse().join("/")}`,
        html,
        text,
        attachments,
      });

      recipients.forEach(e => sentEmails.add(e));
      console.log(`[AutoDSR] ${filenamePrefix} sent to ${recipients.length} recipient(s): ${recipients.join(", ")}`);
      return recipients.length;
    };

    // ── A: Super Admins (owners) — full org report ─────────────────────────
    const ownerEmails = owners.map(o => o.email).filter(Boolean);
    const allStaff    = allP.filter(p => p.role !== "owner");
    if (ownerEmails.length > 0 && allStaff.length > 0) {
      const count = await sendDSR({
        toEmails: ownerEmails, staffList: allStaff,
        reportTypeLabel: "Daily – Full Organisation", filenamePrefix: "DSR-OrgWide",
      });
      if (count) results.push({ type: "owner_full_org", recipients: count, status: "sent" });
    }

    // ── B: Sales Heads — their hierarchy only ──────────────────────────────
    for (const head of salesHeads) {
      if (!head.email) continue;
      const hierarchy = getHierarchy(head.id);
      if (!hierarchy.length) continue;
      const count = await sendDSR({
        toEmails: [head.email], staffList: hierarchy,
        reportTypeLabel: `Daily – ${head.full_name}'s Team`, filenamePrefix: `DSR-SalesHead-${head.id.slice(0, 8)}`,
      });
      if (count) results.push({ type: "sales_head", recipient: head.full_name, staff: hierarchy.length, status: "sent" });
    }

    // ── C: Sales Managers — their direct reports only ──────────────────────
    for (const mgr of salesManagers) {
      if (!mgr.email) continue;
      const reports = allP.filter(p => p.manager_id === mgr.id);
      if (!reports.length) continue;
      const count = await sendDSR({
        toEmails: [mgr.email], staffList: reports,
        reportTypeLabel: `Daily – ${mgr.full_name}'s Team`, filenamePrefix: `DSR-Manager-${mgr.id.slice(0, 8)}`,
      });
      if (count) results.push({ type: "sales_manager", recipient: mgr.full_name, staff: reports.length, status: "sent" });
    }

    // ── D: Individual employees (sales_employee / inside_sales) ────────────
    for (const emp of fieldRoles) {
      if (!emp.email) continue;
      const count = await sendDSR({
        toEmails: [emp.email], staffList: [emp],
        reportTypeLabel: "Daily – Personal Summary", filenamePrefix: `DSR-Employee-${emp.id.slice(0, 8)}`,
      });
      if (count) results.push({ type: "employee", recipient: emp.full_name, status: "sent" });
    }

    // ── Log completion ─────────────────────────────────────────────────────
    try {
      await supabase.from("dsr_email_logs").insert({
        recipients:       [...sentEmails],
        report_date:      todayIST,
        report_type:      "auto_daily",
        delivery_status:  "sent",
        recipient_count:  sentEmails.size,
      });
    } catch (logErr) {
      console.warn("[AutoDSR] Audit log insert failed:", logErr.message);
    }

    console.log(`[AutoDSR] Completed. Total unique recipients: ${sentEmails.size}. Results:`, JSON.stringify(results));
    res.json({ success: true, date: todayIST, totalRecipients: sentEmails.size, results });

  } catch (err) {
    console.error("[AutoDSR] Fatal error:", err.message, err.stack?.slice(0, 400));
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

    // lastSeen is based ONLY on real CRM actions — login does NOT reset inactivity.
    // A user who merely logs in without performing any CRM action is considered inactive.
    const activityTs = [
      lastAct?.created_at,
      lastLead?.created_at,
      lastDeal?.created_at,
      lastMeeting?.created_at,
      lastTask?.updated_at,
    ].filter(Boolean).reduce((max, ts) => (ts > max ? ts : max), "") || null;

    const lastSeenTs = activityTs; // login intentionally excluded

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

// ═══════════════════════════════════════════════════════════════════════════════
// ROLE-BASED INACTIVITY EMAIL WORKFLOW
// Fires daily at 09:00 AM IST. Each user receives email about inactive users
// within their role scope. Zero changes to any existing endpoint or helper.
// ═══════════════════════════════════════════════════════════════════════════════

const ROLE_INACTIVITY_THRESHOLD = 3; // consecutive inactive days before email starts

// ─── GET /api/reports/role-inactivity-cron ───────────────────────────────────
router.get("/role-inactivity-cron", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Compute current IST half-hour slot (mirrors existing inactivity-cron logic)
  const nowUtc      = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIst      = new Date(nowUtc.getTime() + istOffsetMs);
  const h24         = nowIst.getUTCHours();
  const rawMin      = nowIst.getUTCMinutes();
  const slot_m      = rawMin < 30 ? 0 : 30;
  const h12         = h24 % 12 || 12;
  const ampm        = h24 < 12 ? "AM" : "PM";
  const currentSlot = `${String(h12).padStart(2, "0")}:${String(slot_m).padStart(2, "0")} ${ampm}`;

  console.log(`[RoleInactivityCron] ${nowUtc.toISOString()} → IST slot: ${currentSlot}`);

  // Only execute at the 09:00 AM IST window (GitHub Actions fires at 03:30 UTC = 09:00 IST)
  if (currentSlot !== "09:00 AM") {
    return res.json({ success: true, slot: currentSlot, sent: 0, message: "Not the 09:00 AM IST window — skipped" });
  }

  try {
    const results = await sendRoleBasedInactivityAlerts(nowIst);
    return res.json({ success: true, slot: currentSlot, ...results });
  } catch (err) {
    console.error("[RoleInactivityCron] Fatal error:", err.message);
    return res.status(500).json({ error: err.message || "Role inactivity cron failed" });
  }
});

// ─── Core engine ─────────────────────────────────────────────────────────────
async function sendRoleBasedInactivityAlerts(nowIst) {
  // 1. Load all active users with their manager relationship
  const { data: allUsers, error: usersErr } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, manager_id")
    .not("status", "in", '("deleted","inactive")')
    .not("email", "is", null)
    .order("full_name");

  if (usersErr) throw usersErr;
  if (!allUsers?.length) return { sent: 0, total_users: 0 };

  // 2. Compute inactivity days for every user (sequential to avoid DB overload)
  const inactivityMap = {};
  for (const user of allUsers) {
    inactivityMap[user.id] = await computeRoleUserInactivity(user, nowIst);
  }

  // 3. For each user determine their role-based scope and send email if needed
  const results = [];

  for (const user of allUsers) {
    try {
      const scopeInactive = getRoleInactiveScope(user, allUsers, inactivityMap);

      if (scopeInactive.length === 0) {
        results.push({ user_id: user.id, status: "skipped", reason: "no_inactive_in_scope" });
        continue;
      }

      const isSelfOnlyReminder =
        scopeInactive.length === 1 && scopeInactive[0].id === user.id;

      let html, text, subject;

      if (isSelfOnlyReminder) {
        const days = inactivityMap[user.id].daysInactive;
        subject = `Action Required: You have been inactive on Ccentrik CRM for ${days} day${days !== 1 ? "s" : ""}`;
        html    = buildSelfInactivityHtml(user, days, nowIst);
        text    = buildSelfInactivityText(user, days);
      } else {
        subject = `Inactivity Alert — ${scopeInactive.length} member${scopeInactive.length !== 1 ? "s" : ""} inactive for ${ROLE_INACTIVITY_THRESHOLD}+ days`;
        html    = buildTeamInactivityHtml(user, scopeInactive, nowIst);
        text    = buildTeamInactivityText(scopeInactive);
      }

      await sendMail({ to: user.email, subject, html, text });
      results.push({ user_id: user.id, status: "sent", inactive_count: scopeInactive.length });
      console.log(`[RoleInactivityCron] Sent to ${user.email} (${user.role}) — ${scopeInactive.length} inactive in scope`);
    } catch (itemErr) {
      console.error(`[RoleInactivityCron] Failed for user ${user.id}:`, itemErr.message);
      results.push({ user_id: user.id, status: "error", error: itemErr.message });
    }
  }

  const sent = results.filter(r => r.status === "sent").length;
  console.log(`[RoleInactivityCron] Done — ${sent}/${allUsers.length} emails sent`);
  return { sent, total_users: allUsers.length, results };
}

// ─── Compute inactivity days for one user ────────────────────────────────────
async function computeRoleUserInactivity(user, nowIst) {
  const { data: lastLoginRow } = await supabase
    .from("login_logs")
    .select("logged_in_at")
    .eq("user_id", user.id)
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
    supabase.from("activities").select("created_at").eq("created_by", user.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("leads").select("created_at").eq("owner_id", user.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("deals").select("created_at").eq("created_by", user.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("meetings").select("created_at").eq("created_by", user.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("tasks").select("updated_at").eq("assigned_to", user.id)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const loginTs    = lastLoginRow?.logged_in_at || null;

  // CRM activity = any meaningful data action. Login never counts.
  const activityTs = [
    lastAct?.created_at,
    lastLead?.created_at,
    lastDeal?.created_at,
    lastMeeting?.created_at,
    lastTask?.updated_at,
  ].filter(Boolean).reduce((max, ts) => (ts > max ? ts : max), "") || null;

  // Compute consecutive days without login AND without CRM activity separately
  const dayMs = 24 * 60 * 60 * 1000;
  const daysWithoutLogin = loginTs
    ? Math.floor((nowIst.getTime() - new Date(loginTs).getTime()) / dayMs)
    : 999;
  const daysWithoutCRMActivity = activityTs
    ? Math.floor((nowIst.getTime() - new Date(activityTs).getTime()) / dayMs)
    : 999;

  // Truly inactive: BOTH conditions must be true (per inactivity policy)
  const isInactive      = daysWithoutLogin >= ROLE_INACTIVITY_THRESHOLD && daysWithoutCRMActivity >= ROLE_INACTIVITY_THRESHOLD;
  // Logged in but no productive CRM work (informational only — not counted as inactive)
  const isLoggedInNoWork = !isInactive && daysWithoutLogin < ROLE_INACTIVITY_THRESHOLD && daysWithoutCRMActivity >= ROLE_INACTIVITY_THRESHOLD;

  const daysInactive = isInactive
    ? Math.max(daysWithoutLogin, daysWithoutCRMActivity)
    : 0;

  return {
    id:                   user.id,
    name:                 user.full_name || user.email,
    email:                user.email,
    role:                 user.role,
    manager_id:           user.manager_id,
    lastLogin:            loginTs,
    lastActivity:         activityTs,
    daysWithoutLogin,
    daysWithoutCRMActivity,
    isInactive,
    isLoggedInNoWork,
    daysInactive,
  };
}

// ─── Determine inactive users within a user's role-based scope ───────────────
function getRoleInactiveScope(user, allUsers, inactivityMap) {
  const allInactive = Object.values(inactivityMap)
    .filter(u => u.daysInactive >= ROLE_INACTIVITY_THRESHOLD);

  if (user.role === "owner") {
    // Super Admin sees ALL inactive users across the organisation
    return allInactive;
  }

  if (user.role === "sales_head") {
    // Sales Head sees: self + direct reports + their reports (2-level tree)
    const level1Ids = allUsers
      .filter(u => u.manager_id === user.id)
      .map(u => u.id);
    const level2Ids = allUsers
      .filter(u => level1Ids.includes(u.manager_id))
      .map(u => u.id);
    const scopeIds = new Set([user.id, ...level1Ids, ...level2Ids]);
    return allInactive.filter(u => scopeIds.has(u.id));
  }

  if (user.role === "sales_manager") {
    // Sales Manager sees: self + direct reports only
    const directIds = allUsers
      .filter(u => u.manager_id === user.id)
      .map(u => u.id);
    const scopeIds = new Set([user.id, ...directIds]);
    return allInactive.filter(u => scopeIds.has(u.id));
  }

  if (user.role === "employee" || user.role === "inside_sales") {
    // Sales/Inside Sales Employee sees only themselves
    return allInactive.filter(u => u.id === user.id);
  }

  return [];
}

// ─── Scope helper for two-email inactivity system ─────────────────────────────
// Returns the list of users this person monitors (login activity + inactivity).
// Role visibility rules:
//   owner        → all non-owner users (Sales Heads, Managers, Employees, Inside Sales) — NOT other owners, NOT self
//   sales_head   → their Managers, Employees, Inside Sales (by reporting chain) — NOT other Sales Heads, NOT owners, NOT self
//   sales_manager → self + direct reports (Employees and Inside Sales)
//   employee / inside_sales → self only
function getUserScopeForInactivity(user, allUsers) {
  if (user.role === "owner") {
    return allUsers.filter((u) => u.id !== user.id && u.role !== "owner");
  }
  if (user.role === "sales_head") {
    const directIds = new Set(allUsers.filter((u) => u.manager_id === user.id).map((u) => u.id));
    const indirectIds = new Set(allUsers.filter((u) => directIds.has(u.manager_id)).map((u) => u.id));
    const scopeIds = new Set([...directIds, ...indirectIds]);
    return allUsers.filter((u) => scopeIds.has(u.id) && u.role !== "owner" && u.role !== "sales_head");
  }
  if (user.role === "sales_manager") {
    const directIds = allUsers.filter((u) => u.manager_id === user.id).map((u) => u.id);
    return allUsers.filter((u) => u.id === user.id || directIds.includes(u.id));
  }
  return allUsers.filter((u) => u.id === user.id);
}

// ─── Email: personal inactivity reminder (employee / inside_sales) ────────────
function buildSelfInactivityHtml(user, daysInactive, nowIst) {
  const todayStr  = nowIst.toISOString().slice(0, 10);
  const firstName = (user.full_name || user.email).split(" ")[0];
  const urgency   = daysInactive >= 7 ? "#DC2626" : "#D97706";
  const crmUrl    = process.env.FRONTEND_URL || "https://ccentrik-crm.web.app";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E5E7EB;">
  <tr><td style="height:4px;background:#1E3A5F;"></td></tr>
  <tr><td style="padding:32px 36px 20px;">
    <div style="font-size:20px;font-weight:800;color:#111827;margin-bottom:6px;">Hi ${firstName},</div>
    <div style="font-size:14px;color:#6B7280;line-height:1.6;margin-bottom:20px;">
      You have not logged into <strong style="color:#111827;">Ccentrik CRM</strong> for
      <strong style="color:${urgency};font-size:16px;"> ${daysInactive} consecutive day${daysInactive !== 1 ? "s" : ""}</strong>.
    </div>
    <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;padding:14px 18px;font-size:13px;color:#92400E;line-height:1.6;margin-bottom:24px;">
      Regular login ensures you stay updated on leads, deals, meetings, and team activity.
      Staying active helps you and your team hit targets on time.
    </div>
    <a href="${crmUrl}" style="display:inline-block;background:#1E3A5F;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700;">
      Log In to Ccentrik CRM →
    </a>
  </td></tr>
  <tr><td style="background:#F9FAFB;padding:16px 36px;border-top:1px solid #E5E7EB;font-size:11.5px;color:#9CA3AF;">
    This reminder was sent on ${todayStr} because your account has been inactive for ${daysInactive}+ days.
    It will stop automatically once you log in. &nbsp;&middot;&nbsp; Ccentrik CRM
  </td></tr>
</table></td></tr></table></body></html>`;
}

function buildSelfInactivityText(user, daysInactive) {
  const firstName = (user.full_name || user.email).split(" ")[0];
  const crmUrl    = process.env.FRONTEND_URL || "https://ccentrik-crm.web.app";
  return `Hi ${firstName},\n\nYou have not logged into Ccentrik CRM for ${daysInactive} consecutive day${daysInactive !== 1 ? "s" : ""}.\n\nPlease log in to stay updated on your leads, deals, and team activity.\n\n${crmUrl}\n\nThis reminder stops automatically once you log in.\n— Ccentrik CRM`;
}

// ─── Email: team / org-wide inactivity report (for managers/heads/owners) ─────
function buildTeamInactivityHtml(recipient, inactiveUsers, nowIst) {
  const todayStr  = nowIst.toISOString().slice(0, 10);
  const firstName = (recipient.full_name || recipient.email).split(" ")[0];
  const rl        = r => r === "owner" ? "Super Admin" : r === "sales_head" ? "Sales Head" : r === "sales_manager" ? "Sales Manager" : r === "inside_sales" ? "Inside Sales" : "Sales Employee";
  const fmtDate   = ts => {
    if (!ts) return "Never";
    return new Date(ts).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  };

  const rows = inactiveUsers.map(e => {
    const daysLabel = e.daysInactive === 999 ? "Never active" : `${e.daysInactive} days`;
    const color     = e.daysInactive >= 7 ? "#DC2626" : "#D97706";
    const selfTag   = e.id === recipient.id ? ` <span style="background:#EEF2FF;color:#4F46E5;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;">You</span>` : "";
    return `
      <tr style="border-bottom:1px solid #F3F4F6;">
        <td style="padding:11px 14px;font-size:13px;font-weight:600;color:#111827;">${e.name}${selfTag}</td>
        <td style="padding:11px 14px;font-size:12px;color:#6B7280;">${rl(e.role)}</td>
        <td style="padding:11px 14px;font-size:12px;color:#6B7280;">${fmtDate(e.lastLogin)}</td>
        <td style="padding:11px 14px;font-size:12px;color:#6B7280;">${fmtDate(e.lastActivity)}</td>
        <td style="padding:11px 14px;text-align:center;font-size:13px;font-weight:700;color:${color};">${daysLabel}</td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E5E7EB;">
  <tr><td style="height:4px;background:#1E3A5F;"></td></tr>
  <tr><td style="padding:28px 32px 16px;">
    <div style="font-size:20px;font-weight:800;color:#111827;margin-bottom:4px;">Hi ${firstName}, — Inactivity Alert</div>
    <div style="font-size:13px;color:#6B7280;">${inactiveUsers.length} member${inactiveUsers.length !== 1 ? "s" : ""} inactive for ${ROLE_INACTIVITY_THRESHOLD}+ days &nbsp;&middot;&nbsp; ${todayStr}</div>
  </td></tr>
  <tr><td style="padding:0 32px 20px;">
    <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;padding:12px 16px;font-size:12.5px;color:#92400E;line-height:1.6;">
      The following member${inactiveUsers.length !== 1 ? "s" : ""} within your team ${inactiveUsers.length !== 1 ? "have" : "has"} not logged in or performed any CRM activity
      for <strong>${ROLE_INACTIVITY_THRESHOLD}</strong> or more consecutive days. Please follow up.
    </div>
  </td></tr>
  <tr><td style="padding:0 32px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;">
      <tr style="background:#F9FAFB;">
        <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">Name</th>
        <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Role</th>
        <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Last Login</th>
        <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Last Activity</th>
        <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Inactive Days</th>
      </tr>
      ${rows}
    </table>
  </td></tr>
  <tr><td style="background:#F9FAFB;padding:16px 32px;border-top:1px solid #E5E7EB;font-size:11.5px;color:#9CA3AF;">
    &copy; ${new Date().getFullYear()} CCENTRIK &nbsp;&middot;&nbsp; Role-Based Inactivity Alert &nbsp;&middot;&nbsp; Sent daily at 9:00 AM IST until users log in &nbsp;&middot;&nbsp; Do not reply
  </td></tr>
</table></td></tr></table></body></html>`;
}

function buildTeamInactivityText(inactiveUsers) {
  const rl   = r => r === "owner" ? "Super Admin" : r === "sales_head" ? "Sales Head" : r === "sales_manager" ? "Sales Manager" : r === "inside_sales" ? "Inside Sales" : "Sales Employee";
  const fmtDt = ts => ts ? new Date(ts).toLocaleString("en-IN") : "Never";
  const sep   = "=".repeat(80);
  const lines = inactiveUsers.map(e =>
    `  ${(e.name).padEnd(28)} | ${rl(e.role).padEnd(14)} | Last Login: ${fmtDt(e.lastLogin).padEnd(22)} | Inactive: ${e.daysInactive === 999 ? "Never active" : e.daysInactive + " days"}`
  ).join("\n");
  return `${sep}\nTEAM INACTIVITY ALERT — ${ROLE_INACTIVITY_THRESHOLD}+ DAYS\n${sep}\n\n${lines}\n\n${sep}\nPlease follow up with inactive team members.\n— Ccentrik CRM`;
}

// ─── GET /api/reports/role-dsr-cron ──────────────────────────────────────────
// Called every 30 min by GitHub Actions. Fires at 07:30 PM IST slot (7:40 PM IST target).
// Add ?force=true (with valid CRON_SECRET) to bypass the time-slot check for testing.
// Role hierarchy:
//   owner          → full org report (everyone)
//   sales_head     → their full hierarchy (managers + employees under them)
//   sales_manager  → their direct reports only
//   sales_employee / inside_sales → personal DSR only
// Duplicate prevention: skips if already sent today.
router.get("/role-dsr-cron", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const forceRun = req.query.force === "true";

  const nowUtc      = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIst      = new Date(nowUtc.getTime() + istOffsetMs);
  const h24         = nowIst.getUTCHours();
  const rawMin      = nowIst.getUTCMinutes();
  const slot_m      = rawMin < 30 ? 0 : 30;
  const h12         = h24 % 12 || 12;
  const ampm        = h24 < 12 ? "AM" : "PM";
  const currentSlot = `${String(h12).padStart(2, "0")}:${String(slot_m).padStart(2, "0")} ${ampm}`;

  console.log(`[RoleDSRCron] ${nowUtc.toISOString()} → IST slot: ${currentSlot}${forceRun ? " (FORCED)" : ""}`);

  if (!forceRun && currentSlot !== "07:30 PM") {
    return res.json({ success: true, slot: currentSlot, sent: 0, message: "Not the 07:30 PM IST window — skipped" });
  }

  const pad      = (n) => String(n).padStart(2, "0");
  const todayStr = `${nowIst.getUTCFullYear()}-${pad(nowIst.getUTCMonth() + 1)}-${pad(nowIst.getUTCDate())}`;
  const dayStart = new Date(`${todayStr}T00:00:00+05:30`).toISOString();
  const dayEnd   = new Date(`${todayStr}T23:59:59+05:30`).toISOString();
  const dateLabel = nowIst.toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Kolkata",
  });

  // Duplicate prevention — skip if already sent today (unless forced test run)
  if (!forceRun) {
    const { data: existing } = await supabase
      .from("dsr_email_logs")
      .select("id")
      .eq("report_date", todayStr)
      .eq("report_type", "role_daily")
      .eq("delivery_status", "sent")
      .limit(1);
    if (existing?.length > 0) {
      console.log(`[RoleDSRCron] Already sent for ${todayStr} — skipping duplicate execution.`);
      return res.json({ success: true, skipped: true, reason: "already_sent_today", date: todayStr });
    }
  }

  try {
    const results = await sendRoleBasedDSR({ dayStart, dayEnd, dateLabel, todayStr });

    // Log completion for duplicate prevention
    if (!forceRun) {
      try {
        await supabase.from("dsr_email_logs").insert({
          recipients:      [],
          report_date:     todayStr,
          report_type:     "role_daily",
          delivery_status: "sent",
          recipient_count: results.sent || 0,
        });
      } catch (logErr) {
        console.warn("[RoleDSRCron] Audit log insert failed:", logErr.message);
      }
    }

    return res.json({ success: true, slot: currentSlot, forced: forceRun, ...results });
  } catch (err) {
    console.error("[RoleDSRCron] Fatal error:", err.message);
    return res.status(500).json({ error: err.message || "Role DSR cron failed" });
  }
});

// ─── Role-based DSR engine ────────────────────────────────────────────────────
async function sendRoleBasedDSR({ dayStart, dayEnd, dateLabel, todayStr }) {
  const rl = (r) =>
    r === "owner"         ? "Super Admin"
    : r === "sales_head"  ? "Sales Head"
    : r === "sales_manager" ? "Sales Manager"
    : r === "inside_sales" ? "Inside Sales"
    : (r || "Staff").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  // Load all active users
  const { data: allUsers, error: usersErr } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, manager_id")
    .not("status", "in", '("deleted","inactive")')
    .not("email", "is", null)
    .order("full_name");

  if (usersErr) throw usersErr;
  if (!allUsers?.length) return { sent: 0, total_recipients: 0 };

  // All roles receive a DSR — scope varies by role
  const RECIPIENT_ROLES = ["owner", "sales_head", "sales_manager", "sales_employee", "inside_sales"];
  const recipients = allUsers.filter((u) => RECIPIENT_ROLES.includes(u.role));
  if (!recipients.length) return { sent: 0, total_recipients: 0 };

  // Bulk fetch activity data for ALL non-owner users in one pass
  const allStaffIds = allUsers.filter((u) => u.role !== "owner").map((u) => u.id);
  const { employeeData, staff: allStaffData } = await generateEmployeeActivityData(allStaffIds, dayStart, dayEnd);

  // Index staff by id for quick lookup
  const staffById = {};
  allStaffData.forEach((s) => { staffById[s.id] = s; });

  let sent = 0;
  const errors = [];

  for (const recipient of recipients) {
    try {
      // Determine which staff this recipient supervises
      let subordinateIds;

      if (recipient.role === "owner") {
        // Super Admin sees everyone
        subordinateIds = allUsers.filter((u) => u.role !== "owner").map((u) => u.id);
      } else if (recipient.role === "sales_head") {
        // Sales Head sees their full hierarchy: level-1 direct reports + their reports
        const level1 = allUsers.filter((u) => u.manager_id === recipient.id).map((u) => u.id);
        const level2 = allUsers.filter((u) => level1.includes(u.manager_id)).map((u) => u.id);
        subordinateIds = [...new Set([...level1, ...level2])];
      } else if (recipient.role === "sales_manager") {
        // Sales Manager sees only their direct reports
        subordinateIds = allUsers
          .filter((u) => u.manager_id === recipient.id)
          .map((u) => u.id);
      } else if (["sales_employee", "inside_sales"].includes(recipient.role)) {
        // Individual contributors see only their own data
        subordinateIds = [recipient.id];
      }

      if (!subordinateIds?.length) continue;

      // Build scoped staff list (only those present in activity data)
      // Include all subordinates even with zero activities (so we show "No Activity")
      const scopedStaff = subordinateIds
        .map((id) => staffById[id] || allUsers.find((u) => u.id === id))
        .filter(Boolean)
        .filter((s) => s.email); // must have email to appear

      if (!scopedStaff.length) continue;

      // Compute quick stats for email body
      let qActs=0, qLeads=0, qMtg=0, qCalls=0, qEmails=0;
      for (const s of scopedStaff) {
        const st = employeeData[s.id]?.stats || {};
        qActs+=st.total||0; qLeads+=st.newLeads||0; qMtg+=st.meetings||0;
        qCalls+=st.calls||0; qEmails+=st.emails||0;
      }

      // Generate enterprise PDF with all 9 sections
      const pdfBuffer = await generateEnterpriseDSRPdf({
        employeeData,
        staff:          scopedStaff,
        reportDateLabel: dateLabel,
        recipientRole:  recipient.role,
        recipientName:  recipient.full_name || recipient.email,
        generatedAt:    new Date().toISOString(),
      });

      // Professional email greeting — PDF carries all detail
      const firstName  = (recipient.full_name || "").split(" ")[0] || "Team";
      const ddmmyyyy   = todayStr.split("-").reverse().join("/");
      const greeting   = new Date().getUTCHours() < 12 ? "Good Morning" : "Good Evening";

      const statPills = [
        { label: "New Leads",  value: qLeads,  bg: "#EFF6FF", cl: "#2563EB" },
        { label: "Activities", value: qActs,   bg: "#F0FDF4", cl: "#16A34A" },
        { label: "Meetings",   value: qMtg,    bg: "#FEF3C7", cl: "#D97706" },
        { label: "Calls",      value: qCalls,  bg: "#F5F3FF", cl: "#7C3AED" },
        { label: "Emails",     value: qEmails, bg: "#FFF1F2", cl: "#E11D48" },
      ].map(p => `<td style="padding:14px 18px;text-align:center;border-right:1px solid #E2E8F0;">
        <div style="font-size:24px;font-weight:800;color:${p.cl};">${p.value}</div>
        <div style="font-size:11px;color:#6B7280;font-weight:500;margin-top:3px;">${p.label}</div>
      </td>`).join("");

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F0F4F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F8;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E5E7EB;">
  <tr><td style="background:#1E3A5F;padding:24px 32px;">
    <div style="font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-.3px;">CCENTRIK <span style="font-weight:400;color:#94A3B8;font-size:13px;">CRM</span></div>
    <div style="font-size:12px;color:#94A3B8;margin-top:4px;letter-spacing:.05em;text-transform:uppercase;">Daily Sales Report</div>
  </td></tr>
  <tr><td style="padding:28px 32px 20px;">
    <div style="font-size:20px;font-weight:700;color:#0F172A;margin-bottom:6px;">${greeting}, ${firstName}</div>
    <div style="font-size:13.5px;color:#475569;line-height:1.7;margin-bottom:20px;">
      Please find attached the <strong>Daily Sales Report for ${ddmmyyyy}</strong>.<br/>
      This report covers all CRM activity by your team today, including new leads, calls, meetings, emails, and pipeline updates.
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;margin-bottom:20px;">
      <tr>${statPills}</tr>
    </table>
    <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:12px 16px;font-size:12.5px;color:#1E40AF;line-height:1.6;">
      📎 The full detailed report — including all sections — is attached as a PDF.
    </div>
  </td></tr>
  <tr><td style="background:#F9FAFB;padding:14px 32px;border-top:1px solid #E5E7EB;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:11.5px;color:#9CA3AF;">© ${new Date().getFullYear()} CCENTRIK &nbsp;·&nbsp; Sent: ${dateLabel} &nbsp;·&nbsp; Do not reply</td>
      <td style="text-align:right;"><span style="font-size:11px;padding:3px 9px;background:#EEF2FF;color:#4F46E5;border-radius:99px;font-weight:700;border:1px solid #C7D2FE;">${rl(recipient.role)}</span></td>
    </tr></table>
  </td></tr>
</table></td></tr></table></body></html>`;

      const text = [
        `CCENTRIK DAILY SALES REPORT — ${ddmmyyyy}`,
        `For: ${recipient.full_name||recipient.email} (${rl(recipient.role)})`,
        "=".repeat(60),
        `New Leads: ${qLeads}  |  Activities: ${qActs}  |  Meetings: ${qMtg}  |  Calls: ${qCalls}  |  Emails: ${qEmails}`,
        "",
        "Full PDF is attached with complete activity details.",
        "— Ccentrik CRM",
      ].join("\n");

      await sendMail({
        to:      [recipient.email],
        subject: `Daily Sales Report – ${ddmmyyyy}`,
        html,
        text,
        attachments: [{
          filename:     `Ccentrik-DSR-${todayStr}.pdf`,
          content:      pdfBuffer.toString("base64"),
          content_type: "application/pdf",
        }],
      });

      console.log(`[RoleDSRCron] Sent to ${recipient.email} (${rl(recipient.role)}) — ${scopedStaff.length} members`);
      sent++;
    } catch (err) {
      console.error(`[RoleDSRCron] Error for ${recipient.email}:`, err.message);
      errors.push({ email: recipient.email, error: err.message });
    }
  }

  console.log(`[RoleDSRCron] Done — ${sent}/${recipients.length} emails sent`);
  return { sent, total_recipients: recipients.length, errors: errors.length ? errors : undefined };
}


// ─── GET /api/reports/comprehensive-inactivity-cron ───────────────────────────
// Runs every day at 10:30 AM IST (covering the 10:40 AM IST requirement).
// Sends role-scoped inactivity emails with detailed HTML + PDF to ALL user tiers:
//   owner        → all inactive users across the organisation
//   sales_head   → inactive users in their full hierarchy
//   sales_manager → self + direct reports
//   inside_sales / employee → self only (only if they themselves are inactive)
// Uses existing computeRoleUserInactivity + getRoleInactiveScope — unchanged.
router.get("/comprehensive-inactivity-cron", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const nowUtc      = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIst      = new Date(nowUtc.getTime() + istOffsetMs);
  const h24         = nowIst.getUTCHours();
  const rawMin      = nowIst.getUTCMinutes();
  const slot_m      = rawMin < 30 ? 0 : 30;
  const h12         = h24 % 12 || 12;
  const ampm        = h24 < 12 ? "AM" : "PM";
  const currentSlot = `${String(h12).padStart(2, "0")}:${String(slot_m).padStart(2, "0")} ${ampm}`;

  console.log(`[ComprehensiveInactivityCron] ${nowUtc.toISOString()} → IST slot: ${currentSlot}`);

  if (currentSlot !== "11:00 AM") {
    return res.json({ success: true, slot: currentSlot, sent: 0, message: "Not the 11:00 AM IST window — skipped" });
  }

  try {
    const results = await sendComprehensiveInactivityAlerts(nowIst);
    return res.json({ success: true, slot: currentSlot, ...results });
  } catch (err) {
    console.error("[ComprehensiveInactivityCron] Fatal error:", err.message);
    return res.status(500).json({ error: err.message || "Comprehensive inactivity cron failed" });
  }
});

// ─── Comprehensive inactivity engine (two-email system) ──────────────────────
// Email 1: Login Activity Report → owners, sales_heads, sales_managers
// Email 2: Inactivity Report     → all roles (self-only for employees/inside_sales)
async function sendComprehensiveInactivityAlerts(nowIst) {
  const rl = (r) =>
    r === "owner"           ? "Super Admin"
    : r === "sales_head"    ? "Sales Head"
    : r === "sales_manager" ? "Sales Manager"
    : r === "inside_sales"  ? "Inside Sales"
    : (r || "Staff").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const fmtTs = (ts) =>
    ts ? new Date(ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never";

  const generatedAt = nowIst.toLocaleString("en-IN", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " IST";
  const pad        = (n) => String(n).padStart(2, "0");
  const todayStr   = `${nowIst.getUTCFullYear()}-${pad(nowIst.getUTCMonth() + 1)}-${pad(nowIst.getUTCDate())}`;
  const dayStart   = new Date(`${todayStr}T00:00:00+05:30`).toISOString();
  const dayEnd     = new Date(`${todayStr}T23:59:59+05:30`).toISOString();

  // 1. Load all active users
  const { data: allUsers, error: usersErr } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, manager_id")
    .not("status", "in", '("deleted","inactive")')
    .not("email", "is", null)
    .order("full_name");

  if (usersErr) throw usersErr;
  if (!allUsers?.length) return { sent: 0, total_users: 0 };

  const userById = {};
  allUsers.forEach((u) => { userById[u.id] = u; });

  // 2. Fetch today's login events (for Login Activity Report)
  const { data: loginLogs } = await supabase
    .from("login_logs")
    .select("user_id, logged_in_at, city, country")
    .gte("logged_in_at", dayStart)
    .lte("logged_in_at", dayEnd);

  const loginsByUser = {};
  for (const log of (loginLogs || [])) {
    if (!loginsByUser[log.user_id]) loginsByUser[log.user_id] = [];
    loginsByUser[log.user_id].push(log);
  }

  // 3. Compute inactivity for every user
  const inactivityMap = {};
  for (const user of allUsers) {
    inactivityMap[user.id] = await computeRoleUserInactivity(user, nowIst);
  }

  let sent = 0;
  const errors = [];

  // 4. Send emails per user based on role scope
  for (const user of allUsers) {
    try {
      const scope = getUserScopeForInactivity(user, allUsers);

      // ── Email 1: Login Activity Report (managers only) ───────────────────────
      if (["owner", "sales_head", "sales_manager"].includes(user.role) && scope.length > 0) {
        const loginData = scope.map((u) => ({
          id:           u.id,
          name:         u.full_name || u.email,
          role:         u.role,
          managerName:  u.manager_id && userById[u.manager_id]
            ? (userById[u.manager_id].full_name || userById[u.manager_id].email)
            : "—",
          loginCount:    (loginsByUser[u.id] || []).length,
          loggedInToday: (loginsByUser[u.id] || []).length > 0,
          lastLoginTime: (loginsByUser[u.id] || []).length > 0
            ? (loginsByUser[u.id] || []).reduce((mx, l) => l.logged_in_at > mx ? l.logged_in_at : mx, "")
            : null,
          location: [...new Set((loginsByUser[u.id] || []).map((l) => l.city).filter(Boolean))].join(", ") || "—",
        }));

        await sendMail({
          to:      user.email,
          subject: `Login Activity Report — ${todayStr}`,
          html:    buildLoginActivityReportHtml(user, loginData, generatedAt, todayStr, rl, fmtTs),
          text:    buildLoginActivityReportText(user, loginData, todayStr, rl),
        });
        sent++;
        console.log(`[ComprehensiveInactivityCron] Login Activity sent to ${user.email} (${rl(user.role)}) — ${loginData.filter((u) => u.loggedInToday).length}/${loginData.length} active`);
      }

      // ── Email 2: Inactivity Report ─────────────────────────────────────────────
      // Dual condition: a user is inactive ONLY IF BOTH
      //   - No login for 3+ days  AND  - No CRM activity for 3+ days
      // "Logged in but no CRM work" is shown as a separate informational section.
      const ddmmyyyy = todayStr.split("-").reverse().join("/");

      if (["owner", "sales_head", "sales_manager"].includes(user.role)) {
        const enrichUser = (u) => ({
          ...u,
          shortId:     u.id.split("-")[0].toUpperCase(),
          managerName: u.manager_id && userById[u.manager_id]
            ? (userById[u.manager_id].full_name || userById[u.manager_id].email)
            : "—",
        });

        const inactiveUsers    = scope.map((u) => inactivityMap[u.id]).filter((u) => u?.isInactive).map(enrichUser);
        const loggedInNoWork   = scope.map((u) => inactivityMap[u.id]).filter((u) => u?.isLoggedInNoWork).map(enrichUser);

        if (inactiveUsers.length > 0 || loggedInNoWork.length > 0) {
          await sendMail({
            to:      user.email,
            subject: `Daily Inactivity Report – ${ddmmyyyy}`,
            html:    buildInactivityReportHtml(user, inactiveUsers, loggedInNoWork, generatedAt, todayStr, rl, fmtTs),
            text:    buildInactivityReportText(user, inactiveUsers, generatedAt, rl),
          });
          sent++;
          console.log(`[ComprehensiveInactivityCron] Inactivity sent to ${user.email} (${rl(user.role)}) — ${inactiveUsers.length} inactive, ${loggedInNoWork.length} logged-in-no-work`);
        }

      } else {
        // employee / inside_sales: self-alert only when BOTH conditions are met
        const self = inactivityMap[user.id];
        if (self?.isInactive) {
          await sendMail({
            to:      user.email,
            subject: `Daily Inactivity Report – ${ddmmyyyy}`,
            html:    buildSelfInactivityHtml(user, self.daysWithoutCRMActivity, nowIst),
            text:    buildSelfInactivityText(user, self.daysWithoutCRMActivity),
          });
          sent++;
          console.log(`[ComprehensiveInactivityCron] Self-inactivity sent to ${user.email} (${rl(user.role)}) — ${self.daysWithoutCRMActivity}d no CRM work`);
        }
      }

    } catch (err) {
      console.error(`[ComprehensiveInactivityCron] Error for ${user.id}:`, err.message);
      errors.push({ user_id: user.id, error: err.message });
    }
  }

  console.log(`[ComprehensiveInactivityCron] Done — ${sent} emails sent`);
  return { sent, total_users: allUsers.length, errors: errors.length ? errors : undefined };
}

// ─── Login Activity Report HTML ───────────────────────────────────────────────
function buildLoginActivityReportHtml(recipient, loginData, generatedAt, todayStr, rl, fmtTs) {
  const firstName   = (recipient.full_name || "").split(" ")[0] || "Team";
  const activeCount = loginData.filter((u) => u.loggedInToday).length;
  const absentCount = loginData.length - activeCount;

  const rows = loginData.map((u) => `
    <tr style="border-bottom:1px solid #F3F4F6;">
      <td style="padding:10px 12px;font-size:13px;font-weight:600;color:#111827;">${u.name}</td>
      <td style="padding:10px 12px;font-size:12px;color:#374151;">${rl(u.role)}</td>
      <td style="padding:10px 12px;font-size:12px;color:#374151;">${u.managerName}</td>
      <td style="padding:10px 12px;text-align:center;">
        <span style="font-size:11px;padding:2px 8px;border-radius:99px;font-weight:600;${
          u.loggedInToday
            ? "background:#DCFCE7;color:#16A34A;border:1px solid #86EFAC;"
            : "background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;"
        }">${u.loggedInToday ? "Active" : "Not Logged In"}</span>
      </td>
      <td style="padding:10px 12px;text-align:center;font-size:13px;color:#374151;">${u.loginCount}</td>
      <td style="padding:10px 12px;font-size:12px;color:#374151;">${u.lastLoginTime ? fmtTs(u.lastLoginTime) : "—"}</td>
      <td style="padding:10px 12px;font-size:12px;color:#374151;">${u.location}</td>
    </tr>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:820px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E5E7EB;">
  <tr><td style="height:4px;background:linear-gradient(90deg,#1E3A5F,#2563EB);"></td></tr>
  <tr><td style="padding:28px 32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>
        <div style="font-size:21px;font-weight:800;color:#111827;margin-bottom:4px;">Hi ${firstName}, — Login Activity Report</div>
        <div style="font-size:13px;color:#6B7280;">${loginData.length} member${loginData.length !== 1 ? "s" : ""} in scope &nbsp;·&nbsp; Report date: ${todayStr} &nbsp;·&nbsp; Generated: ${generatedAt}</div>
      </td>
      <td style="text-align:right;vertical-align:top;">
        <span style="font-size:11px;padding:4px 10px;background:#DBEAFE;color:#1D4ED8;border-radius:99px;font-weight:700;border:1px solid #BFDBFE;">${rl(recipient.role)}</span>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:0 32px 14px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;">
      <tr>
        <td style="padding:16px 20px;text-align:center;border-right:1px solid #E2E8F0;">
          <div style="font-size:28px;font-weight:800;color:#16A34A;">${activeCount}</div>
          <div style="font-size:11.5px;color:#64748B;font-weight:500;margin-top:2px;">Active Today</div>
        </td>
        <td style="padding:16px 20px;text-align:center;border-right:1px solid #E2E8F0;">
          <div style="font-size:28px;font-weight:800;color:#DC2626;">${absentCount}</div>
          <div style="font-size:11.5px;color:#64748B;font-weight:500;margin-top:2px;">Not Logged In</div>
        </td>
        <td style="padding:16px 20px;text-align:center;">
          <div style="font-size:28px;font-weight:800;color:#0F172A;">${loginData.length}</div>
          <div style="font-size:11.5px;color:#64748B;font-weight:500;margin-top:2px;">Total in Scope</div>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 32px 28px;overflow-x:auto;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;min-width:700px;">
      <tr style="background:#F9FAFB;">
        <th style="padding:9px 12px;text-align:left;font-size:10.5px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;">Name</th>
        <th style="padding:9px 12px;text-align:left;font-size:10.5px;font-weight:700;color:#6B7280;text-transform:uppercase;">Role</th>
        <th style="padding:9px 12px;text-align:left;font-size:10.5px;font-weight:700;color:#6B7280;text-transform:uppercase;">Manager</th>
        <th style="padding:9px 12px;text-align:center;font-size:10.5px;font-weight:700;color:#6B7280;text-transform:uppercase;">Status</th>
        <th style="padding:9px 12px;text-align:center;font-size:10.5px;font-weight:700;color:#6B7280;text-transform:uppercase;">Logins</th>
        <th style="padding:9px 12px;text-align:left;font-size:10.5px;font-weight:700;color:#6B7280;text-transform:uppercase;">Last Login</th>
        <th style="padding:9px 12px;text-align:left;font-size:10.5px;font-weight:700;color:#6B7280;text-transform:uppercase;">Location</th>
      </tr>
      <tbody>${rows}</tbody>
    </table>
  </td></tr>
  <tr><td style="background:#F9FAFB;padding:14px 32px;border-top:1px solid #E5E7EB;font-size:11.5px;color:#9CA3AF;">
    &copy; ${new Date().getFullYear()} CCENTRIK &nbsp;·&nbsp; Automated Login Activity Report &nbsp;·&nbsp; Generated: ${generatedAt} &nbsp;·&nbsp; Do not reply
  </td></tr>
</table></td></tr></table></body></html>`;
}

// ─── Login Activity Report plain-text ─────────────────────────────────────────
function buildLoginActivityReportText(recipient, loginData, todayStr, rl) {
  const sep    = "─".repeat(60);
  const active = loginData.filter((u) => u.loggedInToday).length;
  const lines  = loginData.map((u) =>
    `${u.name} (${rl(u.role)}) | ${u.loggedInToday ? `Active — ${u.loginCount} login(s)` : "Not Logged In"} | Manager: ${u.managerName}`
  ).join("\n");
  return `${sep}\nCCENTRIK — LOGIN ACTIVITY REPORT — ${todayStr}\nRecipient: ${recipient.full_name || recipient.email} (${rl(recipient.role)})\n${sep}\n\nActive: ${active} / Total: ${loginData.length}\n\n${lines}\n\n${sep}\n— Ccentrik CRM`;
}

// ─── Inactivity Report HTML ───────────────────────────────────────────────────
// inactiveUsers    = BOTH no-login AND no-CRM-activity >= threshold (truly inactive)
// loggedInNoWork   = logged in recently but no CRM activity >= threshold (informational)
function buildInactivityReportHtml(recipient, inactiveUsers, loggedInNoWork, generatedAt, todayStr, rl, fmtTs) {
  const firstName = (recipient.full_name || "").split(" ")[0] || "Team";
  const ddmmyyyy  = todayStr.split("-").reverse().join("/");

  const tRows = inactiveUsers.map((e) => `
    <tr style="border-bottom:1px solid #F3F4F6;">
      <td style="padding:10px 12px;font-size:13px;font-weight:600;color:#111827;">${e.name}</td>
      <td style="padding:10px 12px;font-size:11.5px;color:#6B7280;font-family:monospace;">${e.shortId}</td>
      <td style="padding:10px 12px;font-size:12px;color:#374151;">${rl(e.role)}</td>
      <td style="padding:10px 12px;font-size:12px;color:#374151;">${e.managerName}</td>
      <td style="padding:10px 12px;font-size:12px;color:#374151;">${fmtTs(e.lastLogin)}</td>
      <td style="padding:10px 12px;font-size:12px;color:#374151;">${fmtTs(e.lastActivity)}</td>
      <td style="padding:10px 12px;text-align:center;font-size:13px;font-weight:700;color:#DC2626;">${e.daysWithoutLogin===999?"Never":""+e.daysWithoutLogin+"d"}</td>
      <td style="padding:10px 12px;text-align:center;font-size:13px;font-weight:700;color:#DC2626;">${e.daysWithoutCRMActivity===999?"Never":""+e.daysWithoutCRMActivity+"d"}</td>
      <td style="padding:10px 12px;text-align:center;">
        <span style="font-size:11px;padding:2px 8px;border-radius:99px;background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;font-weight:600;">Inactive</span>
      </td>
    </tr>`).join("");

  const noWorkRows = (loggedInNoWork || []).map((e) => `
    <tr style="border-bottom:1px solid #F3F4F6;">
      <td style="padding:9px 12px;font-size:13px;font-weight:600;color:#111827;">${e.name}</td>
      <td style="padding:9px 12px;font-size:12px;color:#374151;">${rl(e.role)}</td>
      <td style="padding:9px 12px;font-size:12px;color:#374151;">${e.managerName}</td>
      <td style="padding:9px 12px;font-size:12px;color:#374151;">${fmtTs(e.lastLogin)}</td>
      <td style="padding:9px 12px;font-size:12px;color:#374151;">${fmtTs(e.lastActivity)}</td>
      <td style="padding:9px 12px;text-align:center;font-size:13px;font-weight:700;color:#D97706;">${e.daysWithoutCRMActivity===999?"Never":""+e.daysWithoutCRMActivity+"d"}</td>
      <td style="padding:9px 12px;text-align:center;">
        <span style="font-size:11px;padding:2px 8px;border-radius:99px;background:#FEF9C3;color:#92400E;border:1px solid #FCD34D;font-weight:600;">Logged In, No CRM Work</span>
      </td>
    </tr>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:820px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E5E7EB;">
  <tr><td style="height:4px;background:linear-gradient(90deg,#DC2626,#7C3AED);"></td></tr>
  <tr><td style="padding:28px 32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>
        <div style="font-size:21px;font-weight:800;color:#111827;margin-bottom:4px;">Hi ${firstName}, — Inactivity Report</div>
        <div style="font-size:13px;color:#6B7280;">Daily Inactivity Report &nbsp;·&nbsp; ${ddmmyyyy} &nbsp;·&nbsp; ${inactiveUsers.length} inactive</div>
      </td>
      <td style="text-align:right;vertical-align:top;">
        <span style="font-size:11px;padding:4px 10px;background:#FEF2F2;color:#DC2626;border-radius:99px;font-weight:700;border:1px solid #FECACA;">${rl(recipient.role)}</span>
      </td>
    </tr></table>
  </td></tr>
  ${inactiveUsers.length > 0 ? `
  <tr><td style="padding:0 32px 6px;">
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:11px 16px;font-size:12.5px;color:#7F1D1D;line-height:1.6;">
      <strong>Truly Inactive</strong> — no login AND no CRM activity for <strong>${ROLE_INACTIVITY_THRESHOLD}+</strong> consecutive days. Both conditions must be met.
    </div>
  </td></tr>
  <tr><td style="padding:8px 32px 20px;overflow-x:auto;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;min-width:760px;">
      <tr style="background:#F9FAFB;">
        <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Name</th>
        <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">ID</th>
        <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Role</th>
        <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Manager</th>
        <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Last Login</th>
        <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Last CRM Activity</th>
        <th style="padding:9px 10px;text-align:center;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">No Login</th>
        <th style="padding:9px 10px;text-align:center;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">No CRM Work</th>
        <th style="padding:9px 10px;text-align:center;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Status</th>
      </tr>
      <tbody>${tRows}</tbody>
    </table>
  </td></tr>` : ''}
  ${noWorkRows ? `
  <tr><td style="padding:0 32px 6px;">
    <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;padding:11px 16px;font-size:12.5px;color:#92400E;line-height:1.6;">
      <strong>Logged In but No CRM Work</strong> — these members logged in recently but performed no meaningful CRM activity for ${ROLE_INACTIVITY_THRESHOLD}+ days. <em>Informational only — not counted as inactive.</em>
    </div>
  </td></tr>
  <tr><td style="padding:8px 32px 28px;overflow-x:auto;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;min-width:700px;">
      <tr style="background:#F9FAFB;">
        <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Name</th>
        <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Role</th>
        <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Manager</th>
        <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Last Login</th>
        <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Last CRM Activity</th>
        <th style="padding:9px 10px;text-align:center;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Days No CRM Work</th>
        <th style="padding:9px 10px;text-align:center;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Status</th>
      </tr>
      <tbody>${noWorkRows}</tbody>
    </table>
  </td></tr>` : ''}
  <tr><td style="background:#F9FAFB;padding:14px 32px;border-top:1px solid #E5E7EB;font-size:11.5px;color:#9CA3AF;">
    &copy; ${new Date().getFullYear()} CCENTRIK &nbsp;·&nbsp; Daily Inactivity Report &nbsp;·&nbsp; Generated: ${generatedAt} &nbsp;·&nbsp; Do not reply
  </td></tr>
</table></td></tr></table></body></html>`;
}

// ─── Inactivity Report plain-text ─────────────────────────────────────────────
function buildInactivityReportText(recipient, inactiveUsers, generatedAt, rl) {
  const sep   = "─".repeat(60);
  const lines = inactiveUsers.map((u) =>
    `${u.name} (${rl(u.role)}) | Manager: ${u.managerName} | Inactive: ${u.daysInactive === 999 ? "Never active" : u.daysInactive + " days"}`
  ).join("\n");
  return `${sep}\nCCENTRIK — INACTIVITY REPORT — ${generatedAt}\nRecipient: ${recipient.full_name || recipient.email} (${rl(recipient.role)})\n${sep}\n\n${lines}\n\n${sep}\nPlease follow up with inactive team members.\n— Ccentrik CRM`;
}

// ─── GET /api/reports/lead-inactivity-cron ────────────────────────────────────
// Runs at 09:00 AM IST daily. Add ?force=true to bypass the slot check for testing.
router.get("/lead-inactivity-cron", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const forceRun    = req.query.force === "true";
  const nowUtc      = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIst      = new Date(nowUtc.getTime() + istOffsetMs);
  const h24         = nowIst.getUTCHours();
  const rawMin      = nowIst.getUTCMinutes();
  const slot_m      = rawMin < 30 ? 0 : 30;
  const h12         = h24 % 12 || 12;
  const ampm        = h24 < 12 ? "AM" : "PM";
  const currentSlot = `${String(h12).padStart(2, "0")}:${String(slot_m).padStart(2, "0")} ${ampm}`;

  console.log(`[LeadInactivityCron] ${nowUtc.toISOString()} → IST slot: ${currentSlot}`);

  if (!forceRun && currentSlot !== "09:00 AM") {
    return res.json({ success: true, slot: currentSlot, processed: 0, message: "Not the 09:00 AM IST window — skipped" });
  }

  try {
    const results = await runLeadInactivityCheck(nowIst);
    return res.json({ success: true, slot: currentSlot, forced: forceRun, ...results });
  } catch (err) {
    console.error("[LeadInactivityCron] Fatal:", err.message);
    return res.status(500).json({ error: err.message || "Lead inactivity cron failed" });
  }
});

// ─── Lead inactivity engine ───────────────────────────────────────────────────
const LEAD_THRESHOLD_7  = 7;
const LEAD_THRESHOLD_25 = 25;
const LEAD_THRESHOLD_30 = 30;

async function runLeadInactivityCheck(nowIst) {
  const dayMs = 24 * 60 * 60 * 1000;
  const nowMs = nowIst.getTime();

  // Load all active assigned leads (skip terminal stages)
  const { data: leads, error: leadsErr } = await supabase
    .from("leads")
    .select("id, company_name, contact_name, assigned_to, created_at, inactivity_status")
    .not("assigned_to", "is", null)
    .not("stage", "in", '("won","lost","converted","pipeline")');

  if (leadsErr) throw leadsErr;
  if (!leads?.length) return { processed: 0, warned7: 0, warned25: 0, unassigned: 0 };

  const leadIds = leads.map(l => l.id);

  // Batch load latest activity per lead (ordered DESC so first hit = latest)
  const { data: activities } = await supabase
    .from("activities")
    .select("lead_id, created_at")
    .in("lead_id", leadIds)
    .order("created_at", { ascending: false });

  const lastActMap = {};
  for (const act of (activities || [])) {
    if (!lastActMap[act.lead_id]) lastActMap[act.lead_id] = act.created_at;
  }

  // Load admins/heads for unassignment notifications
  const { data: admins } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .in("role", ["owner", "sales_head"])
    .not("email", "is", null);

  let processed = 0, warned7 = 0, warned25 = 0, unassigned = 0;
  const errors = [];

  for (const lead of leads) {
    try {
      const lastActTs    = lastActMap[lead.id] || lead.created_at;
      const daysInactive = Math.floor((nowMs - new Date(lastActTs).getTime()) / dayMs);
      const leadName     = lead.company_name || lead.contact_name || "A lead";

      if (daysInactive < LEAD_THRESHOLD_7) {
        // Lead is active again — reset if previously flagged
        if (lead.inactivity_status && lead.inactivity_status !== "active") {
          await supabase.from("leads")
            .update({ last_activity_at: lastActTs, inactivity_status: "active" })
            .eq("id", lead.id);
          await supabase.from("notifications")
            .delete()
            .eq("entity_id", lead.id).eq("entity_type", "lead").eq("type", "general");
        } else {
          await supabase.from("leads").update({ last_activity_at: lastActTs }).eq("id", lead.id);
        }

      } else if (daysInactive >= LEAD_THRESHOLD_30 && lead.inactivity_status !== "auto_unassigned") {
        // ── AUTO-UNASSIGN ──
        const prevOwner = lead.assigned_to;
        await supabase.from("leads").update({
          assigned_to:          null,
          inactivity_status:    "auto_unassigned",
          previous_assigned_to: prevOwner,
          unassigned_at:        new Date().toISOString(),
          last_activity_at:     lastActTs,
        }).eq("id", lead.id);

        await supabase.from("lead_inactivity_logs").insert({
          lead_id:              lead.id,
          event_type:           "auto_unassigned",
          days_inactive:        daysInactive,
          assigned_to_at_event: prevOwner,
          notes:                `Auto-unassigned after ${daysInactive} days of inactivity`,
        });

        // Clear prev owner's inactivity notifications
        await supabase.from("notifications")
          .delete()
          .eq("entity_id", lead.id).eq("entity_type", "lead")
          .eq("type", "general").eq("user_id", prevOwner);

        // Notify the previous owner
        await supabase.from("notifications").insert({
          user_id:     prevOwner,
          type:        "general",
          title:       "Lead Unassigned — No Activity",
          message:     `"${leadName}" was automatically unassigned after ${daysInactive} days of inactivity.`,
          data:        { subtype: "lead_auto_unassigned", lead_id: lead.id, days: daysInactive },
          entity_id:   lead.id,
          entity_type: "lead",
          read:        false,
        });

        // Notify each admin/head (deduplicate)
        for (const admin of (admins || [])) {
          if (admin.id === prevOwner) continue;
          const { data: ex } = await supabase.from("notifications").select("id")
            .eq("user_id", admin.id).eq("entity_id", lead.id)
            .eq("entity_type", "lead").eq("read", false).limit(1);
          if (!ex?.length) {
            await supabase.from("notifications").insert({
              user_id:     admin.id,
              type:        "general",
              title:       "Lead Auto-Unassigned",
              message:     `"${leadName}" was auto-unassigned after ${daysInactive} days with no CRM activity. Reassign from the Inactive Lead Alerts widget.`,
              data:        { subtype: "lead_auto_unassigned_admin", lead_id: lead.id, days: daysInactive },
              entity_id:   lead.id,
              entity_type: "lead",
              read:        false,
            });
          }
        }
        unassigned++;

      } else if (daysInactive >= LEAD_THRESHOLD_25 && lead.inactivity_status !== "auto_unassigned") {
        // ── 25-DAY FINAL WARNING ──
        if (lead.inactivity_status !== "warning_25") {
          await supabase.from("leads")
            .update({ last_activity_at: lastActTs, inactivity_status: "warning_25" })
            .eq("id", lead.id);

          await supabase.from("lead_inactivity_logs").insert({
            lead_id:              lead.id,
            event_type:           "warning_25d",
            days_inactive:        daysInactive,
            assigned_to_at_event: lead.assigned_to,
          });

          // Replace any existing notification with the final warning
          await supabase.from("notifications").delete()
            .eq("entity_id", lead.id).eq("entity_type", "lead")
            .eq("user_id", lead.assigned_to).eq("type", "general");

          await supabase.from("notifications").insert({
            user_id:     lead.assigned_to,
            type:        "general",
            title:       "⚠️ Final Warning — Lead Will Be Unassigned",
            message:     `"${leadName}" has been inactive for ${daysInactive} days. Log activity within ${LEAD_THRESHOLD_30 - daysInactive} day(s) to keep this lead assigned.`,
            data:        { subtype: "lead_inactive_25d", lead_id: lead.id, days: daysInactive, days_remaining: LEAD_THRESHOLD_30 - daysInactive },
            entity_id:   lead.id,
            entity_type: "lead",
            read:        false,
          });
          warned25++;
        } else {
          await supabase.from("leads").update({ last_activity_at: lastActTs }).eq("id", lead.id);
        }

      } else if (daysInactive >= LEAD_THRESHOLD_7 && lead.inactivity_status !== "auto_unassigned") {
        // ── 7-DAY REMINDER ──
        if (!["warning_7", "warning_25"].includes(lead.inactivity_status)) {
          await supabase.from("leads")
            .update({ last_activity_at: lastActTs, inactivity_status: "warning_7" })
            .eq("id", lead.id);

          await supabase.from("lead_inactivity_logs").insert({
            lead_id:              lead.id,
            event_type:           "reminder_7d",
            days_inactive:        daysInactive,
            assigned_to_at_event: lead.assigned_to,
          });

          // Only create if no unread notification exists for this lead/user
          const { data: ex } = await supabase.from("notifications").select("id")
            .eq("user_id", lead.assigned_to).eq("entity_id", lead.id)
            .eq("entity_type", "lead").eq("read", false).limit(1);

          if (!ex?.length) {
            await supabase.from("notifications").insert({
              user_id:     lead.assigned_to,
              type:        "general",
              title:       "Lead Inactivity Reminder",
              message:     `"${leadName}" hasn't had any CRM activity for ${daysInactive} days. Please log a call, meeting, or note.`,
              data:        { subtype: "lead_inactive_7d", lead_id: lead.id, days: daysInactive },
              entity_id:   lead.id,
              entity_type: "lead",
              read:        false,
            });
          }
          warned7++;
        } else {
          await supabase.from("leads").update({ last_activity_at: lastActTs }).eq("id", lead.id);
        }

      } else {
        // Already at correct status — refresh last_activity_at
        await supabase.from("leads").update({ last_activity_at: lastActTs }).eq("id", lead.id);
      }

      processed++;
    } catch (err) {
      console.error(`[LeadInactivityCron] Error for lead ${lead.id}:`, err.message);
      errors.push({ lead_id: lead.id, error: err.message });
    }
  }

  console.log(`[LeadInactivityCron] Done — ${processed} leads, ${warned7} 7d, ${warned25} 25d, ${unassigned} auto-unassigned`);
  return { processed, warned7, warned25, unassigned, errors: errors.length ? errors : undefined };
}

module.exports = router;
