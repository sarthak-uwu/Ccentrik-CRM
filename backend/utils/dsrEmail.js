'use strict';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const rl = r =>
  r === "owner"          ? "Super Admin"
  : r === "sales_head"   ? "Sales Head"
  : r === "sales_manager"? "Sales Manager"
  : r === "inside_sales" ? "Inside Sales"
  : r === "sales_employee"?"Sales Employee"
  : (r || "Staff").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

const fmtRev = n => {
  if (!n) return "₹0";
  if (n >= 10000000) return `₹${(n/10000000).toFixed(1)}Cr`;
  if (n >= 100000)   return `₹${(n/100000).toFixed(1)}L`;
  if (n >= 1000)     return `₹${(n/1000).toFixed(1)}K`;
  return `₹${n}`;
};

const fmtTime = iso => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true,
    });
  } catch { return "—"; }
};

const fmtMeetingType = t => {
  if (!t) return "—";
  const m = t.toLowerCase();
  if (m.includes("google") || m.includes("meet"))  return "Google Meet";
  if (m.includes("teams") || m.includes("ms"))     return "MS Teams";
  if (m.includes("zoom"))                           return "Zoom";
  if (m.includes("person") || m.includes("physical") || m.includes("office")) return "In-Person";
  return t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
};

const esc = s => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

// ─── Card definitions ────────────────────────────────────────────────────────
function makeCards(totals) {
  return [
    // Row 1 — Pipeline funnel
    { label: "Prospects Added",       value: totals.prospectsAdded,      bg: "#eff6ff", top: "#3b82f6", color: "#1d4ed8" },
    { label: "Leads Created",         value: totals.leadsCreated,        bg: "#f0fdf4", top: "#22c55e", color: "#15803d" },
    { label: "Deals Created",         value: totals.dealsCreated,        bg: "#faf5ff", top: "#a855f7", color: "#7e22ce" },
    { label: "Activities Done",       value: totals.activitiesCompleted, bg: "#f0fdf4", top: "#10b981", color: "#065f46" },
    // Row 2 — Activity status
    { label: "Activities Pending",    value: totals.activitiesPending,   bg: "#fffbeb", top: "#f59e0b", color: "#b45309" },
    { label: "Activities Overdue",    value: totals.activitiesOverdue,   bg: "#fef2f2", top: "#ef4444", color: "#b91c1c" },
    { label: "Calls Made",            value: totals.callsMade,           bg: "#eff6ff", top: "#6366f1", color: "#4338ca" },
    { label: "Emails Sent",           value: totals.emailsSent,          bg: "#f0f9ff", top: "#0ea5e9", color: "#0369a1" },
    // Row 3 — Meetings & tasks
    { label: "Meetings Scheduled",    value: totals.meetingsScheduled,   bg: "#f5f3ff", top: "#8b5cf6", color: "#6d28d9" },
    { label: "Meetings Completed",    value: totals.meetingsCompleted,   bg: "#f0fdf4", top: "#14b8a6", color: "#0f766e" },
    { label: "Tasks Created",         value: totals.tasksCreated,        bg: "#fff7ed", top: "#f97316", color: "#c2410c" },
    { label: "Tasks Completed",       value: totals.tasksCompleted,      bg: "#f0fdf4", top: "#22c55e", color: "#166534" },
    // Row 4 — Follow-ups
    { label: "Follow Ups Completed",  value: totals.followUpsCompleted,  bg: "#f0fdf4", top: "#34d399", color: "#065f46" },
    { label: "Follow Ups Pending",    value: totals.followUpsPending,    bg: "#fffbeb", top: "#fbbf24", color: "#92400e" },
    { label: "Next Follow Ups",       value: totals.nextFollowUps,       bg: "#eff6ff", top: "#60a5fa", color: "#1e40af" },
    { label: "Pipeline Converted",    value: totals.pipelineConverted,   bg: "#f5f3ff", top: "#c084fc", color: "#7e22ce" },
    // Row 5 — Results
    { label: "Leads Converted",       value: totals.leadsConverted,      bg: "#f0fdf4", top: "#4ade80", color: "#166534" },
    { label: "Deals Won",             value: totals.dealsWon,            bg: "#f0fdf4", top: "#10b981", color: "#064e3b" },
    { label: "Deals Lost",            value: totals.dealsLost,           bg: "#fef2f2", top: "#f87171", color: "#7f1d1d" },
    { label: "Total Revenue",         value: fmtRev(totals.revenue),     bg: "#fefce8", top: "#eab308", color: "#713f12" },
  ];
}

function renderCardGrid(cards) {
  const rows = [];
  for (let i = 0; i < cards.length; i += 4) {
    const row = cards.slice(i, i + 4);
    const cells = row.map(c => `
      <td width="25%" style="padding:4px;vertical-align:top;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${c.bg};border-radius:10px;border-top:3px solid ${c.top};border:1px solid ${c.top}33;">
          <tr><td style="padding:16px 12px;text-align:center;">
            <div style="font-size:26px;font-weight:900;color:${c.color};line-height:1;">${esc(String(c.value))}</div>
            <div style="font-size:11px;color:#6b7280;font-weight:600;margin-top:5px;line-height:1.3;">${esc(c.label)}</div>
          </td></tr>
        </table>
      </td>`).join("");
    // Pad to 4 columns if last row is short
    const pad = 4 - row.length;
    const padCells = pad > 0 ? `<td colspan="${pad}"></td>` : "";
    rows.push(`<tr>${cells}${padCells}</tr>`);
  }
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${rows.join("\n")}
    </table>`;
}

// ─── Employee performance table ──────────────────────────────────────────────
function renderEmployeeTable(scopeProfiles, statsMap) {
  if (!scopeProfiles.length) return "";

  const headerStyle = "padding:9px 8px;font-size:11px;font-weight:700;color:#fff;text-align:center;white-space:nowrap;background:#4338ca;border-right:1px solid #5b50d6;";
  const cellStyle   = (alt) => `padding:8px 7px;font-size:12px;text-align:center;color:#374151;border-right:1px solid #f3f4f6;${alt ? "background:#f9fafb;" : "background:#fff;"}`;
  const nameStyle   = (alt) => `padding:8px 10px;font-size:12px;font-weight:600;color:#1f2937;text-align:left;${alt ? "background:#f9fafb;" : "background:#fff;"}`;

  const headers = ["Employee","Role","Prospects","Leads","Deals","Calls","Emails","Meetings","Tasks✓","Done","Pending","Overdue","Won","Revenue","Last Active"];

  const headerRow = headers.map(h => `<th style="${headerStyle}">${esc(h)}</th>`).join("");

  const rows = scopeProfiles.map((p, i) => {
    const s   = statsMap[p.id] || {};
    const alt = i % 2 === 1;
    const lastAct = s.lastActivityAt ? fmtTime(s.lastActivityAt) : "No Activity";
    const lastActColor = s.lastActivityAt ? "#374151" : "#9ca3af";
    return `<tr>
      <td style="${nameStyle(alt)}">${esc(p.full_name || "—")}</td>
      <td style="${cellStyle(alt)}">${esc(rl(p.role))}</td>
      <td style="${cellStyle(alt)}">${s.prospectsAdded      || 0}</td>
      <td style="${cellStyle(alt)}">${s.leadsCreated        || 0}</td>
      <td style="${cellStyle(alt)}">${s.dealsCreated        || 0}</td>
      <td style="${cellStyle(alt)}">${s.callsMade           || 0}</td>
      <td style="${cellStyle(alt)}">${s.emailsSent          || 0}</td>
      <td style="${cellStyle(alt)}">${s.meetingsScheduled   || 0}</td>
      <td style="${cellStyle(alt)}">${s.tasksCompleted      || 0}</td>
      <td style="${cellStyle(alt)}">${s.activitiesCompleted || 0}</td>
      <td style="${cellStyle(alt)}${s.activitiesPending > 0 ? "color:#d97706;font-weight:700;" : ""}">${s.activitiesPending || 0}</td>
      <td style="${cellStyle(alt)}${s.activitiesOverdue > 0 ? "color:#dc2626;font-weight:700;" : ""}">${s.activitiesOverdue || 0}</td>
      <td style="${cellStyle(alt)}${s.dealsWon > 0 ? "color:#059669;font-weight:700;" : ""}">${s.dealsWon || 0}</td>
      <td style="${cellStyle(alt)}">${fmtRev(s.revenue)}</td>
      <td style="${cellStyle(alt)}color:${lastActColor};">${lastAct}</td>
    </tr>`;
  }).join("\n");

  return `
    <div style="overflow-x:auto;">
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;min-width:720px;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ─── Meetings section ────────────────────────────────────────────────────────
function renderMeetings(meetings, profileMap) {
  if (!meetings || meetings.length === 0) return "";

  const rows = meetings.map((m, i) => {
    const alt   = i % 2 === 1;
    const bg    = alt ? "#f9fafb" : "#fff";
    const emp   = profileMap?.[m.created_by];
    const empName = emp ? (emp.full_name || emp.email) : "—";
    const mode  = fmtMeetingType(m.meeting_type);
    const isOnline = mode.includes("Meet") || mode.includes("Teams") || mode.includes("Zoom");
    const statusColors = {
      completed: { bg:"#f0fdf4", color:"#15803d" },
      scheduled: { bg:"#eff6ff", color:"#1d4ed8" },
      missed:    { bg:"#fef2f2", color:"#b91c1c" },
      cancelled: { bg:"#f9fafb", color:"#6b7280" },
    };
    const sc = statusColors[m.status] || { bg:"#f9fafb", color:"#374151" };
    const statusBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:${sc.bg};color:${sc.color};">${esc((m.status||"").toUpperCase())}</span>`;
    const linkCell = isOnline && m.meet_link
      ? `<a href="${esc(m.meet_link)}" style="color:#6366f1;font-size:11px;">Join Link</a>`
      : (m.location ? `<span style="color:#6b7280;font-size:11px;">${esc(m.location)}</span>` : "—");

    return `<tr style="background:${bg};">
      <td style="padding:10px 10px;font-size:12px;font-weight:600;color:#374151;white-space:nowrap;">${fmtTime(m.start_time)}</td>
      <td style="padding:10px 10px;font-size:12px;color:#374151;">${esc(m.customer_name || m.title || "—")}</td>
      <td style="padding:10px 10px;font-size:12px;color:#374151;">${esc(m.company_name || "—")}</td>
      <td style="padding:10px 10px;font-size:12px;color:#374151;">${esc(m.contact_name || "—")}</td>
      <td style="padding:10px 10px;font-size:12px;color:#374151;">${esc(empName)}</td>
      <td style="padding:10px 10px;font-size:12px;color:#374151;">${esc(mode)}</td>
      <td style="padding:10px 10px;">${statusBadge}</td>
      <td style="padding:10px 10px;">${linkCell}</td>
    </tr>`;
  }).join("\n");

  return `
    <tr>
      <td style="padding:0 32px 28px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;margin-bottom:12px;">Today's Scheduled Meetings (${meetings.length})</div>
        <div style="overflow-x:auto;">
          <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;min-width:640px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <thead>
              <tr style="background:#1e1b4b;">
                <th style="padding:9px 10px;font-size:11px;color:#fff;text-align:left;font-weight:700;">Time</th>
                <th style="padding:9px 10px;font-size:11px;color:#fff;text-align:left;font-weight:700;">Customer</th>
                <th style="padding:9px 10px;font-size:11px;color:#fff;text-align:left;font-weight:700;">Company</th>
                <th style="padding:9px 10px;font-size:11px;color:#fff;text-align:left;font-weight:700;">Contact</th>
                <th style="padding:9px 10px;font-size:11px;color:#fff;text-align:left;font-weight:700;">Employee</th>
                <th style="padding:9px 10px;font-size:11px;color:#fff;text-align:left;font-weight:700;">Mode</th>
                <th style="padding:9px 10px;font-size:11px;color:#fff;text-align:left;font-weight:700;">Status</th>
                <th style="padding:9px 10px;font-size:11px;color:#fff;text-align:left;font-weight:700;">Link/Location</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </td>
    </tr>`;
}

// ─── Employee detail cards ────────────────────────────────────────────────────
function renderEmployeeCards(scopeProfiles, statsMap, profileMap) {
  if (!scopeProfiles.length) return "";

  const cards = scopeProfiles.map(p => {
    const s   = statsMap[p.id] || {};
    const mgr = p.manager_id ? profileMap[p.manager_id] : null;
    const mgrName = mgr ? (mgr.full_name || "—") : "—";
    const lastAct = s.lastActivityAt ? fmtTime(s.lastActivityAt) : "No Activity Today";
    const lastActColor = s.lastActivityAt ? "#059669" : "#ef4444";

    const statRow = (label, val, color = "#374151") =>
      `<tr><td style="padding:4px 0;font-size:12px;color:#6b7280;">${esc(label)}</td><td style="padding:4px 0;font-size:12px;font-weight:700;color:${color};text-align:right;">${esc(String(val))}</td></tr>`;

    return `
      <td width="50%" style="padding:6px;vertical-align:top;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fff;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden;">
          <tr>
            <td style="padding:14px 16px;background:linear-gradient(90deg,#1e1b4b,#4338ca);border-radius:10px 10px 0 0;">
              <div style="font-size:14px;font-weight:800;color:#fff;">${esc(p.full_name || "—")}</div>
              <div style="font-size:11px;color:#a5b4fc;margin-top:2px;">${esc(rl(p.role))}${mgrName !== "—" ? ` · Reports to ${esc(mgrName)}` : ""}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                ${statRow("Prospects Added",       s.prospectsAdded || 0,     "#1d4ed8")}
                ${statRow("Leads Created",         s.leadsCreated || 0,       "#15803d")}
                ${statRow("Deals Created",         s.dealsCreated || 0,       "#7e22ce")}
                ${statRow("Calls Made",            s.callsMade || 0,          "#4338ca")}
                ${statRow("Emails Sent",           s.emailsSent || 0,         "#0369a1")}
                ${statRow("Meetings",              s.meetingsScheduled || 0,  "#6d28d9")}
                ${statRow("Activities Done",       s.activitiesCompleted || 0,"#065f46")}
                ${statRow("Pending",               s.activitiesPending || 0,  s.activitiesPending > 0 ? "#d97706" : "#374151")}
                ${statRow("Overdue",               s.activitiesOverdue || 0,  s.activitiesOverdue > 0 ? "#dc2626" : "#374151")}
                ${statRow("Tasks Done",            s.tasksCompleted || 0,     "#166534")}
                ${statRow("Follow Ups Done",       s.followUpsCompleted || 0, "#065f46")}
                ${statRow("Deals Won",             s.dealsWon || 0,           "#059669")}
                ${s.revenue > 0 ? statRow("Revenue",              fmtRev(s.revenue),         "#713f12") : ""}
              </table>
              <div style="margin-top:12px;padding:8px 10px;background:${s.lastActivityAt ? "#f0fdf4" : "#fef2f2"};border-radius:6px;font-size:12px;font-weight:700;color:${lastActColor};">
                Last Activity: ${esc(lastAct)}
              </div>
            </td>
          </tr>
        </table>
      </td>`;
  });

  // Pair into rows of 2
  const rows = [];
  for (let i = 0; i < cards.length; i += 2) {
    const pair = cards.slice(i, i + 2);
    if (pair.length === 1) pair.push(`<td width="50%" style="padding:6px;"></td>`);
    rows.push(`<tr>${pair.join("")}</tr>`);
  }

  return `
    <tr>
      <td style="padding:0 26px 28px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;margin-bottom:12px;">Employee Performance Summary</div>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          ${rows.join("\n")}
        </table>
      </td>
    </tr>`;
}

// ─── Main email builder ──────────────────────────────────────────────────────
function buildDsrEmailHtml({ recipientName, recipientRole, dateLabel, generatedAt, scopeProfiles, scopeTotals, statsMap, meetings, profileMap }) {
  const genStr = new Date(generatedAt || Date.now()).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true,
  }) + " IST";

  const today = new Date(generatedAt || Date.now()).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
  });

  const cards      = makeCards(scopeTotals);
  const cardGrid   = renderCardGrid(cards);
  const empTable   = renderEmployeeTable(scopeProfiles, statsMap);
  const meetHtml   = renderMeetings(meetings, profileMap);
  const empCards   = renderEmployeeCards(scopeProfiles, statsMap, profileMap);
  const roleLabel  = rl(recipientRole);

  // Scope title
  const scopeTitle = recipientRole === "owner"
    ? "Complete Organization Report"
    : recipientRole === "sales_head"
    ? "Your Team Report"
    : recipientRole === "sales_manager"
    ? "Your Team Report"
    : "Personal Daily Report";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Daily Sales Report · ${esc(dateLabel)}</title>
  <style>
    body { margin:0;padding:0;background:#f0f2f8; }
    table { border-collapse:collapse; }
    @media (max-width:600px) {
      .card-cell { width:50%!important; }
      .emp-card  { width:100%!important; display:block; }
      .main-wrap { width:100%!important; border-radius:0!important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f0f2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f8;padding:24px 12px;">
<tr><td align="center">
<table class="main-wrap" width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(30,27,75,0.12);border:1px solid #dde3f0;">

  <!-- ═══ HEADER ═══ -->
  <tr>
    <td style="background:linear-gradient(135deg,#0f0c29 0%,#302b63 50%,#24243e 100%);padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:32px 36px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:top;">
                  <div style="font-size:24px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;font-family:'Segoe UI',Arial,sans-serif;">CCENTRIK</div>
                  <div style="font-size:12px;color:#818cf8;font-weight:500;margin-top:1px;letter-spacing:0.08em;text-transform:uppercase;">CRM Platform</div>
                </td>
                <td style="text-align:right;vertical-align:top;">
                  <div style="font-size:11px;color:#818cf8;letter-spacing:0.06em;text-transform:uppercase;font-weight:600;">Daily Sales Report</div>
                  <div style="font-size:20px;font-weight:800;color:#fff;margin-top:4px;">${esc(dateLabel)}</div>
                  <div style="font-size:11px;color:#a5b4fc;margin-top:4px;">Generated ${genStr} · Prepared Automatically</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 36px 28px;">
            <table cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.10);border-radius:10px;border:1px solid rgba(255,255,255,0.15);">
              <tr>
                <td style="padding:14px 20px;">
                  <div style="font-size:11px;color:#a5b4fc;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">Prepared for</div>
                  <div style="font-size:17px;font-weight:800;color:#fff;margin-top:3px;">${esc(recipientName)}</div>
                  <div style="font-size:12px;color:#818cf8;margin-top:2px;">${esc(roleLabel)} · ${esc(scopeTitle)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ═══ SUMMARY CARDS ═══ -->
  <tr>
    <td style="padding:28px 32px 20px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
        <span style="display:inline-block;width:3px;height:14px;background:#6366f1;border-radius:2px;vertical-align:middle;margin-right:6px;"></span>
        Organization Dashboard Summary
      </div>
      ${cardGrid}
    </td>
  </tr>

  <!-- ═══ EMPLOYEE PERFORMANCE TABLE ═══ -->
  <tr>
    <td style="padding:4px 32px 28px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;margin-bottom:12px;">
        <span style="display:inline-block;width:3px;height:14px;background:#6366f1;border-radius:2px;vertical-align:middle;margin-right:6px;"></span>
        Team Performance (${scopeProfiles.length} member${scopeProfiles.length !== 1 ? "s" : ""})
      </div>
      ${empTable}
    </td>
  </tr>

  <!-- ═══ TODAY'S MEETINGS ═══ -->
  ${meetHtml}

  <!-- ═══ EMPLOYEE DETAIL CARDS ═══ -->
  ${empCards}

  <!-- ═══ FOOTER ═══ -->
  <tr>
    <td style="background:#f9fafb;padding:20px 32px;border-top:2px solid #f3f4f6;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <div style="font-size:13px;font-weight:700;color:#374151;">Ccentrik CRM</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:2px;">Automated Daily Sales Report · ${esc(today)}</div>
          </td>
          <td align="right">
            <div style="font-size:11px;color:#d1d5db;">Confidential · Internal Use Only</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

</table>
</td></tr>
</table>

</body>
</html>`;
}

// Plain-text fallback
function buildDsrEmailText({ recipientName, recipientRole, dateLabel, scopeTotals, scopeProfiles, statsMap }) {
  const t = scopeTotals;
  const lines = [
    `CCENTRIK — Daily Sales Report`,
    `Date: ${dateLabel}`,
    `Recipient: ${recipientName} (${rl(recipientRole)})`,
    ``,
    `ORGANIZATION SUMMARY`,
    `─────────────────────────────────────`,
    `Prospects Added:       ${t.prospectsAdded}`,
    `Leads Created:         ${t.leadsCreated}`,
    `Deals Created:         ${t.dealsCreated}`,
    `Activities Completed:  ${t.activitiesCompleted}`,
    `Activities Pending:    ${t.activitiesPending}`,
    `Activities Overdue:    ${t.activitiesOverdue}`,
    `Calls Made:            ${t.callsMade}`,
    `Emails Sent:           ${t.emailsSent}`,
    `Meetings Scheduled:    ${t.meetingsScheduled}`,
    `Meetings Completed:    ${t.meetingsCompleted}`,
    `Tasks Created:         ${t.tasksCreated}`,
    `Tasks Completed:       ${t.tasksCompleted}`,
    `Follow Ups Done:       ${t.followUpsCompleted}`,
    `Follow Ups Pending:    ${t.followUpsPending}`,
    `Leads Converted:       ${t.leadsConverted}`,
    `Deals Won:             ${t.dealsWon}`,
    `Deals Lost:            ${t.dealsLost}`,
    `Revenue:               ${fmtRev(t.revenue)}`,
    ``,
    `EMPLOYEE PERFORMANCE`,
    `─────────────────────────────────────`,
    ...scopeProfiles.map(p => {
      const s = statsMap[p.id] || {};
      return `${p.full_name} (${rl(p.role)}): Prospects=${s.prospectsAdded||0} Leads=${s.leadsCreated||0} Calls=${s.callsMade||0} Emails=${s.emailsSent||0} Done=${s.activitiesCompleted||0} Pending=${s.activitiesPending||0} Won=${s.dealsWon||0}`;
    }),
    ``,
    `— Ccentrik CRM · Automated Report`,
  ];
  return lines.join("\n");
}

module.exports = { buildDsrEmailHtml, buildDsrEmailText };
