'use strict';

function rl(r) {
  if (r === "owner")          return "Super Admin";
  if (r === "sales_head")     return "Sales Head";
  if (r === "sales_manager")  return "Sales Manager";
  if (r === "inside_sales")   return "Inside Sales";
  if (r === "sales_employee") return "Sales Executive";
  return (r || "Staff").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
    });
  } catch { return "—"; }
}

function fmtCurrency(val) {
  const n = Number(val) || 0;
  if (!n) return "—";
  if (n >= 10000000) return "₹" + (n / 10000000).toFixed(1) + "Cr";
  if (n >= 100000)   return "₹" + (n / 100000).toFixed(1) + "L";
  if (n >= 1000)     return "₹" + (n / 1000).toFixed(0) + "K";
  return "₹" + n;
}

function fmtType(t) {
  if (!t) return "—";
  return t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function buildDsrEmailHtml({
  recipientName, recipientRole, dateLabel, generatedAt,
  scopeProfiles, scopeTotals, statsMap, meetings, profileMap,
}) {
  const firstName = (recipientName || "").split(" ")[0] || "Team";
  const genTime   = generatedAt
    ? new Date(generatedAt).toLocaleTimeString("en-IN", {
        hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
      })
    : "";

  // ── Org summary strip ─────────────────────────────────────────────────────
  const summaryData = [
    { label: "Employees",       value: scopeProfiles.length,                                                       color: "#2563EB" },
    { label: "Activities Done", value: scopeTotals.activitiesCompleted || 0,                                       color: "#059669" },
    { label: "Leads",           value: (scopeTotals.leadsCreated || 0) + (scopeTotals.prospectsAdded || 0),        color: "#7C3AED" },
    { label: "Deals Won",       value: scopeTotals.dealsWon || 0,                                                  color: "#059669" },
    { label: "Calls",           value: scopeTotals.callsMade || 0,                                                 color: "#0891B2" },
    { label: "Meetings",        value: scopeTotals.meetingsScheduled || 0,                                         color: "#D97706" },
  ];

  const summaryStrip = summaryData.map((s, i) => `
    <td style="padding:16px 14px;text-align:center;${i < summaryData.length - 1 ? "border-right:1px solid #E2E8F0;" : ""}">
      <div style="font-size:28px;font-weight:800;color:${s.color};line-height:1;">${s.value}</div>
      <div style="font-size:10px;color:#94A3B8;font-weight:600;margin-top:5px;text-transform:uppercase;letter-spacing:0.06em;">${s.label}</div>
    </td>`).join("");

  // ── Employee dashboard table ──────────────────────────────────────────────
  const thB = "padding:9px 10px;font-size:9px;font-weight:700;color:#CBD5E1;text-transform:uppercase;letter-spacing:0.07em;text-align:center;white-space:nowrap;border-right:1px solid rgba(255,255,255,0.1);background:#1E3A5F;";
  const thL = thB.replace("text-align:center;", "text-align:left;");

  const empHeaders = [
    `<th style="${thL}">Employee</th>`,
    `<th style="${thL}">Role</th>`,
    `<th style="${thB}">Prospects</th>`,
    `<th style="${thB}">Leads</th>`,
    `<th style="${thB}">Converted</th>`,
    `<th style="${thB}">Deals</th>`,
    `<th style="${thB}">Won</th>`,
    `<th style="${thB}">Calls</th>`,
    `<th style="${thB}">Emails</th>`,
    `<th style="${thB}">Meetings</th>`,
    `<th style="${thB}">Tasks</th>`,
    `<th style="${thB}">Notes</th>`,
    `<th style="${thB}">Done</th>`,
    `<th style="${thB}">Pending</th>`,
    `<th style="${thB}">Overdue</th>`,
    `<th style="${thB}">Last Active</th>`,
  ].join("");

  const empRows = scopeProfiles.map((p, i) => {
    const s  = statsMap[p.id] || {};
    const bg = i % 2 === 0 ? "#FFFFFF" : "#F8FAFC";
    const tdc = `padding:9px 10px;font-size:12px;color:#334155;border-top:1px solid #F1F5F9;text-align:center;white-space:nowrap;background:${bg};`;
    const tdl = tdc.replace("text-align:center;", "text-align:left;");
    const overdueStyle = (s.activitiesOverdue || 0) > 0 ? "color:#DC2626;font-weight:700;" : "";
    const wonStyle     = (s.dealsWon         || 0) > 0 ? "color:#059669;font-weight:700;" : "";

    return `<tr>
      <td style="${tdl}"><strong>${p.full_name || p.email}</strong></td>
      <td style="${tdl}"><span style="font-size:10px;background:#EEF2FF;color:#4F46E5;padding:2px 7px;border-radius:99px;font-weight:600;">${rl(p.role)}</span></td>
      <td style="${tdc}">${s.prospectsAdded || 0}</td>
      <td style="${tdc}">${s.leadsCreated || 0}</td>
      <td style="${tdc}">${s.leadsConverted || 0}</td>
      <td style="${tdc}">${s.dealsCreated || 0}</td>
      <td style="${tdc}"><span style="${wonStyle}">${s.dealsWon || 0}</span></td>
      <td style="${tdc}">${s.callsMade || 0}</td>
      <td style="${tdc}">${s.emailsSent || 0}</td>
      <td style="${tdc}">${s.meetingsScheduled || 0}</td>
      <td style="${tdc}">${s.tasksCompleted || 0}</td>
      <td style="${tdc}">${s.notesAdded || 0}</td>
      <td style="${tdc}">${s.activitiesCompleted || 0}</td>
      <td style="${tdc}">${s.activitiesPending || 0}</td>
      <td style="${tdc}"><span style="${overdueStyle}">${s.activitiesOverdue || 0}</span></td>
      <td style="${tdc}">${s.lastActivityAt ? fmtTime(s.lastActivityAt) : "—"}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="16" style="padding:22px;text-align:center;color:#94A3B8;font-size:13px;background:#FAFAFA;">No employee data recorded today.</td></tr>`;

  // ── Meetings section ──────────────────────────────────────────────────────
  let meetingsSection = "";
  if (meetings && meetings.length > 0) {
    const mth = (align) => `<th style="padding:9px 10px;font-size:9px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.06em;text-align:${align};background:#F8FAFC;white-space:nowrap;border-bottom:1px solid #E2E8F0;">`;

    const mtRows = meetings.map((m, i) => {
      const bg         = i % 2 === 0 ? "#FFFFFF" : "#F8FAFC";
      const td         = (al) => `style="padding:9px 10px;font-size:12px;color:#334155;border-top:1px solid #F1F5F9;text-align:${al};background:${bg};"`;
      const emp        = profileMap[m.created_by];
      const statusClr  = m.status === "completed" ? "#059669" : m.status === "cancelled" ? "#DC2626" : "#D97706";
      const mode       = m.meet_link ? "Online" : m.location ? "In-Person" : "—";
      return `<tr>
        <td ${td("left")}>${fmtTime(m.start_time)}</td>
        <td ${td("left")}>${m.customer_name || m.contact_name || "—"}</td>
        <td ${td("left")}>${m.company_name || "—"}</td>
        <td ${td("left")}>${emp ? (emp.full_name || emp.email) : "—"}</td>
        <td ${td("center")}>${fmtType(m.meeting_type) || "Meeting"}</td>
        <td ${td("center")}><span style="color:${statusClr};font-weight:600;">${m.status || "Scheduled"}</span></td>
        <td ${td("left")}>${m.purpose || "—"}</td>
        <td ${td("center")}>${mode}</td>
      </tr>`;
    }).join("");

    meetingsSection = `
    <tr><td style="padding:0 32px 28px;">
      <div style="font-size:15px;font-weight:700;color:#1E3A5F;margin-bottom:14px;border-left:3px solid #3B82F6;padding-left:10px;">Today's Meetings</div>
      <div style="overflow-x:auto;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;border-collapse:collapse;">
        <thead><tr>
          ${mth("left")}Time</th>
          ${mth("left")}Customer</th>
          ${mth("left")}Company</th>
          ${mth("left")}Employee</th>
          ${mth("center")}Type</th>
          ${mth("center")}Status</th>
          ${mth("left")}Purpose</th>
          ${mth("center")}Mode</th>
        </tr></thead>
        <tbody>${mtRows}</tbody>
      </table>
      </div>
    </td></tr>`;
  }

  // ── Key updates ───────────────────────────────────────────────────────────
  const updates = [];
  if (scopeTotals.dealsWon > 0)
    updates.push({ text: `<strong>${scopeTotals.dealsWon}</strong> deal${scopeTotals.dealsWon !== 1 ? "s" : ""} won today`, color: "#059669" });
  if (scopeTotals.revenue > 0)
    updates.push({ text: `Revenue closed: <strong>${fmtCurrency(scopeTotals.revenue)}</strong>`, color: "#059669" });
  if (scopeTotals.leadsConverted > 0)
    updates.push({ text: `<strong>${scopeTotals.leadsConverted}</strong> lead${scopeTotals.leadsConverted !== 1 ? "s" : ""} converted to deals`, color: "#2563EB" });
  if (scopeTotals.prospectsAdded > 0)
    updates.push({ text: `<strong>${scopeTotals.prospectsAdded}</strong> new prospect${scopeTotals.prospectsAdded !== 1 ? "s" : ""} added to pipeline`, color: "#7C3AED" });
  if (scopeTotals.followUpsPending > 0)
    updates.push({ text: `<strong>${scopeTotals.followUpsPending}</strong> follow-up${scopeTotals.followUpsPending !== 1 ? "s" : ""} pending today`, color: "#D97706" });
  if (scopeTotals.activitiesOverdue > 0)
    updates.push({ text: `<strong>${scopeTotals.activitiesOverdue}</strong> overdue activit${scopeTotals.activitiesOverdue !== 1 ? "ies" : "y"} require immediate attention`, color: "#DC2626" });

  const updatesSection = updates.length > 0 ? `
    <tr><td style="padding:0 32px 28px;">
      <div style="font-size:15px;font-weight:700;color:#1E3A5F;margin-bottom:14px;border-left:3px solid #3B82F6;padding-left:10px;">Key Updates</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;">
        ${updates.map(u => `<tr><td style="padding:11px 18px;font-size:13px;color:${u.color};border-bottom:1px solid #F1F5F9;">&bull;&nbsp; ${u.text}</td></tr>`).join("")}
      </table>
    </td></tr>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Daily Sales Report</title>
</head>
<body style="margin:0;padding:0;background:#EFF3F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFF3F8;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
  style="max-width:960px;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0;">

  <!-- HEADER -->
  <tr><td style="background:#0F2044;padding:28px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;">
        <div style="font-size:9px;color:#475569;letter-spacing:0.16em;text-transform:uppercase;margin-bottom:6px;font-weight:700;">CCENTRIK CRM &nbsp;&middot;&nbsp; ENTERPRISE REPORT</div>
        <div style="font-size:24px;font-weight:800;color:#FFFFFF;letter-spacing:-0.4px;line-height:1.2;">Daily Sales Report</div>
        <div style="font-size:13px;color:#64748B;margin-top:7px;">${dateLabel}</div>
      </td>
      <td style="text-align:right;vertical-align:top;">
        <div style="font-size:10px;color:#475569;margin-bottom:4px;">Generated at <strong style="color:#64748B;">${genTime} IST</strong></div>
        <div style="font-size:10px;color:#475569;">For: <strong style="color:#94A3B8;">${recipientName}</strong></div>
        <div style="margin-top:10px;"><span style="font-size:10px;padding:4px 12px;background:rgba(59,130,246,0.12);color:#93C5FD;border-radius:99px;font-weight:700;border:1px solid rgba(59,130,246,0.2);">${rl(recipientRole)}</span></div>
      </td>
    </tr></table>
  </td></tr>

  <!-- ORG SUMMARY -->
  <tr><td style="padding:20px 32px 0;">
    <div style="font-size:10px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">Organisation Activity Overview</div>
    <div style="overflow-x:auto;">
    <table role="presentation" cellpadding="0" cellspacing="0"
      style="width:100%;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;border-collapse:collapse;">
      <tr>${summaryStrip}</tr>
    </table>
    </div>
  </td></tr>

  <!-- EMPLOYEE DASHBOARD TABLE -->
  <tr><td style="padding:22px 32px 28px;">
    <div style="font-size:15px;font-weight:700;color:#1E3A5F;margin-bottom:14px;border-left:3px solid #3B82F6;padding-left:10px;">Employee Performance Dashboard</div>
    <div style="overflow-x:auto;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;border-collapse:collapse;min-width:860px;">
      <thead><tr>${empHeaders}</tr></thead>
      <tbody>${empRows}</tbody>
    </table>
    </div>
  </td></tr>

  <!-- MEETINGS -->
  ${meetingsSection}

  <!-- KEY UPDATES -->
  ${updatesSection}

  <!-- FOOTER -->
  <tr><td style="background:#F8FAFC;padding:16px 32px;border-top:1px solid #E2E8F0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:11px;color:#94A3B8;">&copy; ${new Date().getFullYear()} Ccentrik CRM &nbsp;&middot;&nbsp; Automated Daily Sales Report &nbsp;&middot;&nbsp; Do not reply</td>
      <td style="text-align:right;font-size:11px;color:#94A3B8;">Complete details in the attached PDF</td>
    </tr></table>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildDsrEmailText({ recipientName, recipientRole, dateLabel, scopeTotals, scopeProfiles, statsMap }) {
  const sep = "-".repeat(60);
  const lines = [
    `CCENTRIK CRM — DAILY SALES REPORT`,
    dateLabel,
    `For: ${recipientName} (${rl(recipientRole)})`,
    sep,
    `ORGANISATION SUMMARY`,
    `  Employees:       ${scopeProfiles.length}`,
    `  Activities Done: ${scopeTotals.activitiesCompleted || 0}`,
    `  Leads:           ${(scopeTotals.leadsCreated || 0) + (scopeTotals.prospectsAdded || 0)}`,
    `  Deals Won:       ${scopeTotals.dealsWon || 0}`,
    `  Calls Made:      ${scopeTotals.callsMade || 0}`,
    `  Meetings:        ${scopeTotals.meetingsScheduled || 0}`,
    sep,
    `EMPLOYEE DASHBOARD`,
    `${"Employee".padEnd(24)} Leads  Calls  Done  Pending  Overdue`,
    sep,
  ];
  scopeProfiles.forEach(p => {
    const s    = statsMap[p.id] || {};
    const name = (p.full_name || p.email || "").slice(0, 22).padEnd(24);
    lines.push(`${name} ${String(s.leadsCreated||0).padStart(5)}  ${String(s.callsMade||0).padStart(5)}  ${String(s.activitiesCompleted||0).padStart(4)}  ${String(s.activitiesPending||0).padStart(7)}  ${String(s.activitiesOverdue||0).padStart(7)}`);
  });
  lines.push(sep, `Full detailed report is attached as a PDF.`, `— Ccentrik CRM`);
  return lines.join("\n");
}

module.exports = { buildDsrEmailHtml, buildDsrEmailText };
