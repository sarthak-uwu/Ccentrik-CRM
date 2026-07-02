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

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
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

function getMeetingMode(m) {
  const t = (m.meeting_type || "").toLowerCase();
  if (t === "in_person" || t === "in-person") return "In Person";
  if (t === "phone" || t === "phone_call")    return "Phone Call";
  if (t === "virtual" || t === "online") {
    if ((m.meet_link || "").toLowerCase().includes("teams")) return "Microsoft Teams";
    return "Google Meet";
  }
  if (m.meet_link) {
    if (m.meet_link.toLowerCase().includes("teams")) return "Microsoft Teams";
    return "Google Meet";
  }
  if (m.location) return "In Person";
  return fmtType(m.meeting_type) || "—";
}

function buildDsrEmailHtml({
  recipientName, recipientRole, dateLabel, generatedAt,
  scopeProfiles, scopeTotals, statsMap, meetings, profileMap,
}) {
  const genTime = generatedAt
    ? new Date(generatedAt).toLocaleTimeString("en-IN", {
        hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
      })
    : "";

  // ── [NEW] Management Dashboard Summary ───────────────────────────────────────
  const activeCount   = scopeProfiles.filter(p => (statsMap[p.id]?.activitiesCompleted || 0) > 0).length;
  const inactiveCount = scopeProfiles.length - activeCount;
  const prodScore     = scopeProfiles.length > 0 ? Math.round((activeCount / scopeProfiles.length) * 100) : 0;

  const kpiData = [
    { label: "Total Employees", value: scopeProfiles.length,                                                color: "#2563EB", bg: "#EFF6FF", bd: "#BFDBFE" },
    { label: "Active Today",    value: activeCount,                                                         color: "#059669", bg: "#ECFDF5", bd: "#A7F3D0" },
    { label: "Inactive Today",  value: inactiveCount,                                                       color: "#DC2626", bg: "#FEF2F2", bd: "#FECACA" },
    { label: "Activities",      value: scopeTotals.activitiesCompleted || 0,                                color: "#7C3AED", bg: "#F5F3FF", bd: "#DDD6FE" },
    { label: "Calls",           value: scopeTotals.callsMade || 0,                                          color: "#0891B2", bg: "#ECFEFF", bd: "#A5F3FC" },
    { label: "Follow-ups",      value: scopeTotals.followUpsCompleted || 0,                                 color: "#D97706", bg: "#FFFBEB", bd: "#FDE68A" },
    { label: "Emails",          value: scopeTotals.emailsSent || 0,                                         color: "#EC4899", bg: "#FDF2F8", bd: "#FBCFE8" },
    { label: "Meetings",        value: scopeTotals.meetingsScheduled || 0,                                  color: "#F59E0B", bg: "#FFFBEB", bd: "#FDE68A" },
    { label: "Notes",           value: scopeTotals.notesAdded || 0,                                         color: "#64748B", bg: "#F8FAFC", bd: "#E2E8F0" },
    { label: "New Leads",       value: (scopeTotals.leadsCreated || 0) + (scopeTotals.prospectsAdded || 0), color: "#6366F1", bg: "#EEF2FF", bd: "#C7D2FE" },
    { label: "Deals Created",   value: scopeTotals.dealsCreated || 0,                                       color: "#0891B2", bg: "#ECFEFF", bd: "#A5F3FC" },
    { label: "Deals Won",       value: scopeTotals.dealsWon || 0,                                           color: "#059669", bg: "#ECFDF5", bd: "#A7F3D0" },
    { label: "Deals Lost",      value: scopeTotals.dealsLost || 0,                                          color: "#DC2626", bg: "#FEF2F2", bd: "#FECACA" },
    { label: "Productivity",    value: prodScore + "%",                                                     color: "#7C3AED", bg: "#F5F3FF", bd: "#DDD6FE" },
  ];

  function kpiCell(k, last) {
    return `<td style="padding:${last ? "0" : "0 5px 0 0"};vertical-align:top;">
      <div style="text-align:center;background:${k.bg};border:1px solid ${k.bd};border-radius:8px;padding:14px 4px;">
        <div style="font-size:22px;font-weight:800;color:${k.color};line-height:1;">${k.value}</div>
        <div style="font-size:9px;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-top:5px;line-height:1.3;">${k.label}</div>
      </div>
    </td>`;
  }

  const kpiRow1Html = kpiData.slice(0, 7).map((k, i) => kpiCell(k, i === 6)).join("");
  const kpiRow2Html = kpiData.slice(7).map((k, i)  => kpiCell(k, i === 6)).join("");

  const managementSummarySection = `
  <tr><td style="padding:24px 32px 0;">
    <div style="font-size:15px;font-weight:700;color:#1E3A5F;margin-bottom:14px;border-left:3px solid #3B82F6;padding-left:10px;">Management Dashboard Summary</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      <tr>${kpiRow1Html}</tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${kpiRow2Html}</tr>
    </table>
  </td></tr>`;

  // ── [NEW] Team Performance Table with highlights ──────────────────────────────
  const empPerfStats = scopeProfiles.map(p => ({
    p, s: statsMap[p.id] || {},
    total: statsMap[p.id]?.activitiesCompleted || 0,
  }));
  const maxAct        = Math.max(...empPerfStats.map(e => e.total), 0);
  const activeEmp     = empPerfStats.filter(e => e.total > 0);
  const minAct        = activeEmp.length > 0 ? Math.min(...activeEmp.map(e => e.total)) : -1;

  const perfThL = "padding:9px 10px;font-size:9px;font-weight:700;color:#1E3A5F;text-transform:uppercase;letter-spacing:0.06em;text-align:left;background:#EFF6FF;border-bottom:2px solid #BFDBFE;white-space:nowrap;";
  const perfThC = perfThL.replace("text-align:left;", "text-align:center;");

  const perfHeaders = `
    <th style="${perfThL}">Employee</th>
    <th style="${perfThC}">Activities</th>
    <th style="${perfThC}">Calls</th>
    <th style="${perfThC}">Follow-ups</th>
    <th style="${perfThC}">Emails</th>
    <th style="${perfThC}">Meetings</th>
    <th style="${perfThC}">Notes</th>
    <th style="${perfThC}">New Leads</th>
    <th style="${perfThC}">Deals Created</th>
    <th style="${perfThC}">Deals Won</th>
    <th style="${perfThC}">Pending</th>
    <th style="${perfThC}">Productivity</th>`;

  const perfRows = empPerfStats.map(({ p, s, total }) => {
    const isHighest    = maxAct > 0 && total === maxAct;
    const isLowest     = minAct > 0 && total === minAct && !isHighest;
    const isNoActivity = total === 0;

    let rowBg = "#FFFFFF";
    let badge  = "";
    if (isHighest)    { rowBg = "#ECFDF5"; badge = `<span style="font-size:9px;background:#059669;color:#fff;padding:1px 6px;border-radius:99px;margin-left:6px;font-weight:600;">Top</span>`; }
    else if (isLowest)     { rowBg = "#FFFBEB"; badge = `<span style="font-size:9px;background:#D97706;color:#fff;padding:1px 6px;border-radius:99px;margin-left:6px;font-weight:600;">Low</span>`; }
    else if (isNoActivity) { rowBg = "#FEF2F2"; badge = `<span style="font-size:9px;background:#DC2626;color:#fff;padding:1px 6px;border-radius:99px;margin-left:6px;font-weight:600;">No Activity</span>`; }

    const tdl     = `padding:9px 10px;font-size:12px;color:#334155;border-top:1px solid #F1F5F9;text-align:left;background:${rowBg};`;
    const tdc     = tdl.replace("text-align:left;", "text-align:center;");
    const empProd = maxAct > 0 ? Math.round((total / maxAct) * 100) : 0;
    const prodClr = empProd >= 80 ? "#059669" : empProd >= 50 ? "#D97706" : "#DC2626";

    return `<tr>
      <td style="${tdl}"><strong>${p.full_name || p.email}</strong>${badge}</td>
      <td style="${tdc}">${total}</td>
      <td style="${tdc}">${s.callsMade || 0}</td>
      <td style="${tdc}">${s.followUpsCompleted || 0}</td>
      <td style="${tdc}">${s.emailsSent || 0}</td>
      <td style="${tdc}">${s.meetingsScheduled || 0}</td>
      <td style="${tdc}">${s.notesAdded || 0}</td>
      <td style="${tdc}">${(s.leadsCreated || 0) + (s.prospectsAdded || 0)}</td>
      <td style="${tdc}">${s.dealsCreated || 0}</td>
      <td style="${tdc}"><span style="${(s.dealsWon || 0) > 0 ? "color:#059669;font-weight:700;" : ""}">${s.dealsWon || 0}</span></td>
      <td style="${tdc}">${s.activitiesPending || 0}</td>
      <td style="${tdc}"><span style="font-size:11px;font-weight:700;color:${prodClr};">${empProd}%</span></td>
    </tr>`;
  }).join("") || `<tr><td colspan="12" style="padding:22px;text-align:center;color:#94A3B8;font-size:13px;">No data recorded today.</td></tr>`;

  const teamPerformanceSection = `
  <tr><td style="padding:24px 32px 0;">
    <div style="font-size:15px;font-weight:700;color:#1E3A5F;margin-bottom:8px;border-left:3px solid #3B82F6;padding-left:10px;">Team Performance</div>
    <div style="font-size:11px;color:#64748B;margin-bottom:12px;">
      <span style="background:#ECFDF5;color:#059669;padding:2px 8px;border-radius:99px;font-weight:600;margin-right:6px;">Green = Top Performer</span>
      <span style="background:#FFFBEB;color:#D97706;padding:2px 8px;border-radius:99px;font-weight:600;margin-right:6px;">Yellow = Lowest Active</span>
      <span style="background:#FEF2F2;color:#DC2626;padding:2px 8px;border-radius:99px;font-weight:600;">Red = No Activity</span>
    </div>
    <div style="overflow-x:auto;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;border-collapse:collapse;min-width:860px;">
      <thead><tr>${perfHeaders}</tr></thead>
      <tbody>${perfRows}</tbody>
    </table>
    </div>
  </td></tr>`;

  // ── [NEW] Scheduled Meetings Summary ─────────────────────────────────────────
  let scheduledMeetingsSection = "";
  if (meetings && meetings.length > 0) {
    const smTh = (al) => `<th style="padding:9px 10px;font-size:9px;font-weight:700;color:#1E3A5F;text-transform:uppercase;letter-spacing:0.06em;text-align:${al};background:#EFF6FF;border-bottom:2px solid #BFDBFE;white-space:nowrap;">`;

    const smRows = meetings.map((m, i) => {
      const bg          = i % 2 === 0 ? "#FFFFFF" : "#F8FAFC";
      const td          = (al) => `style="padding:9px 10px;font-size:12px;color:#334155;border-top:1px solid #F1F5F9;text-align:${al};background:${bg};"`;
      const emp         = profileMap[m.created_by];
      const mode        = getMeetingMode(m);
      const statusLabel = m.status ? (m.status.charAt(0).toUpperCase() + m.status.slice(1)) : "Scheduled";
      const statusClr   = m.status === "completed" ? "#059669" : m.status === "cancelled" ? "#DC2626" : m.status === "pending" ? "#D97706" : "#2563EB";
      return `<tr>
        <td ${td("left")}>${emp ? (emp.full_name || emp.email) : "—"}</td>
        <td ${td("left")}>${m.company_name || "—"}</td>
        <td ${td("left")}>${m.customer_name || m.contact_name || "—"}</td>
        <td ${td("center")}>${fmtDate(m.start_time)}</td>
        <td ${td("center")}>${fmtTime(m.start_time)}</td>
        <td ${td("center")}>${mode}</td>
        <td ${td("center")}><span style="color:${statusClr};font-weight:600;">${statusLabel}</span></td>
      </tr>`;
    }).join("");

    scheduledMeetingsSection = `
    <tr><td style="padding:24px 32px 0;">
      <div style="font-size:15px;font-weight:700;color:#1E3A5F;margin-bottom:14px;border-left:3px solid #3B82F6;padding-left:10px;">Scheduled Meetings Summary</div>
      <div style="overflow-x:auto;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;border-collapse:collapse;">
        <thead><tr>
          ${smTh("left")}Employee</th>
          ${smTh("left")}Company</th>
          ${smTh("left")}Contact Person</th>
          ${smTh("center")}Meeting Date</th>
          ${smTh("center")}Meeting Time</th>
          ${smTh("center")}Meeting Mode</th>
          ${smTh("center")}Status</th>
        </tr></thead>
        <tbody>${smRows}</tbody>
      </table>
      </div>
    </td></tr>`;
  }

  // ── Org summary strip (existing) ──────────────────────────────────────────────
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

  // ── Employee dashboard table (existing) ───────────────────────────────────────
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

  // ── Meetings section (existing) ───────────────────────────────────────────────
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

  // ── Key updates (existing) ────────────────────────────────────────────────────
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

  <!-- MANAGEMENT DASHBOARD SUMMARY -->
  ${managementSummarySection}

  <!-- TEAM PERFORMANCE -->
  ${teamPerformanceSection}

  <!-- SCHEDULED MEETINGS SUMMARY -->
  ${scheduledMeetingsSection}

  <!-- divider -->
  <tr><td style="padding:20px 32px 0;">
    <hr style="border:none;border-top:2px dashed #E2E8F0;margin:0;"/>
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
