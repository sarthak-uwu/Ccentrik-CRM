const cron = require("node-cron");
const { supabase } = require("../config/db");
const { sendNotificationEmail, sendMail } = require("../config/mail");

function startCronJobs() {
  // Daily at 9:00 AM UTC — follow-up reminders
  cron.schedule("0 9 * * *", async () => {
    console.log("[CRON] Running daily follow-up reminders...");
    try {
      const today = new Date().toISOString().split("T")[0];

      const { data: leads, error } = await supabase
        .from("leads")
        .select("id, contact_name, company_name, follow_up_date, assigned_to, stage, temperature, priority, assigned_profile:profiles!leads_assigned_to_fkey(id,full_name,email)")
        .eq("follow_up_date", today)
        .not("stage", "in", '("won","lost")')
        .limit(200);

      if (error) { console.error("[CRON] Follow-up query error:", error.message); return; }
      if (!leads?.length) { console.log("[CRON] No follow-ups today."); return; }

      // Group by assigned user to send one email per person
      const grouped = leads.reduce((acc, lead) => {
        const profile = lead.assigned_profile;
        if (!profile?.email) return acc;
        if (!acc[profile.email]) acc[profile.email] = { profile, leads: [] };
        acc[profile.email].leads.push(lead);
        return acc;
      }, {});

      let sent = 0;
      for (const { profile, leads: userLeads } of Object.values(grouped)) {
        const leadList = userLeads
          .map((l) => `• ${l.contact_name}${l.company_name ? ` (${l.company_name})` : ""} — ${l.stage} / ${l.temperature}`)
          .join("\n");

        await sendNotificationEmail({
          to: profile.email,
          name: profile.full_name,
          subject: `You have ${userLeads.length} follow-up${userLeads.length > 1 ? "s" : ""} scheduled today`,
          title: "Today's Follow-up Reminders",
          message: `You have ${userLeads.length} lead follow-up${userLeads.length > 1 ? "s" : ""} scheduled for today:\n\n${leadList}`,
          ctaLabel: "Open CRM",
          ctaUrl: process.env.FRONTEND_URL || "https://ccentrik-crm.web.app",
        });
        sent++;
      }

      console.log(`[CRON] Sent follow-up reminders to ${sent} users for ${leads.length} leads.`);
    } catch (err) {
      console.error("[CRON] Follow-up reminder error:", err.message);
    }
  });

  // Daily at 8:00 AM UTC — overdue leads alert (temperature still cold after 7+ days)
  cron.schedule("0 8 * * *", async () => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: stale } = await supabase
        .from("leads")
        .select("id, contact_name, company_name, updated_at, assigned_profile:profiles!leads_assigned_to_fkey(id,full_name,email)")
        .eq("temperature", "cold")
        .lt("updated_at", sevenDaysAgo)
        .not("stage", "in", '("won","lost")')
        .limit(100);

      if (!stale?.length) return;

      const grouped = stale.reduce((acc, lead) => {
        const profile = lead.assigned_profile;
        if (!profile?.email) return acc;
        if (!acc[profile.email]) acc[profile.email] = { profile, leads: [] };
        acc[profile.email].leads.push(lead);
        return acc;
      }, {});

      for (const { profile, leads: userLeads } of Object.values(grouped)) {
        const leadList = userLeads
          .map((l) => `• ${l.contact_name}${l.company_name ? ` (${l.company_name})` : ""} — last updated ${new Date(l.updated_at).toLocaleDateString("en-IN")}`)
          .join("\n");

        await sendNotificationEmail({
          to: profile.email,
          name: profile.full_name,
          subject: `${userLeads.length} stale lead${userLeads.length > 1 ? "s" : ""} need attention`,
          title: "Stale Leads Alert",
          message: `${userLeads.length} of your leads have been cold and untouched for 7+ days:\n\n${leadList}\n\nConsider re-engaging or updating their status.`,
          ctaLabel: "View Leads",
          ctaUrl: `${process.env.FRONTEND_URL || "https://ccentrik-crm.web.app"}/leads`,
        });
      }
    } catch (err) {
      console.error("[CRON] Stale leads alert error:", err.message);
    }
  });

  // Every 10 minutes — meeting reminders (24h, 1h, 15min before)
  cron.schedule("*/10 * * * *", async () => {
    try {
      const now = new Date();
      // Windows: [target - 6 min, target + 6 min]
      const windows = [
        { label: "24h",  ms: 24 * 3600000, type: "reminder_24h"  },
        { label: "1h",   ms:      3600000, type: "reminder_1h"   },
        { label: "15min",ms:       900000, type: "reminder_15min" },
      ];

      for (const { label, ms, type } of windows) {
        const windowStart = new Date(now.getTime() + ms - 6 * 60000).toISOString();
        const windowEnd   = new Date(now.getTime() + ms + 6 * 60000).toISOString();

        const { data: meetings } = await supabase
          .from("meetings")
          .select("id, title, start_time, end_time, customer_email, customer_name, company_name, meeting_link, location, mode, created_by, created_profile:profiles!meetings_created_by_fkey(full_name, email)")
          .gte("start_time", windowStart)
          .lte("start_time", windowEnd)
          .in("status", ["scheduled", "confirmed"])
          .limit(50);

        if (!meetings?.length) continue;

        for (const m of meetings) {
          // Check if this reminder was already sent (via notifications table)
          const { data: existing } = await supabase
            .from("notifications")
            .select("id")
            .eq("entity_id", m.id)
            .eq("type", `meeting_${type}`)
            .limit(1);

          if (existing?.length) continue; // already sent

          const organizer = m.created_profile || {};
          const startStr  = new Date(m.start_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
          const dateStr   = new Date(m.start_time).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

          // Notify organizer
          if (organizer.email) {
            await sendNotificationEmail({
              to:       organizer.email,
              name:     organizer.full_name || "there",
              subject:  `Reminder: "${m.title}" starts in ${label}`,
              title:    `Meeting Reminder — ${label} Before`,
              message:  `Your meeting "<strong>${m.title}</strong>"${m.company_name ? ` with ${m.company_name}` : ""} starts in <strong>${label}</strong> on ${dateStr} at ${startStr} IST.${m.meeting_link ? `\n\nJoin link: ${m.meeting_link}` : m.location ? `\n\nLocation: ${m.location}` : ""}`,
              ctaLabel: m.meeting_link ? "Join Meeting" : "View CRM",
              ctaUrl:   m.meeting_link || `${process.env.FRONTEND_URL || "https://ccentrik-crm.web.app"}/meetings`,
            }).catch(() => {});
          }

          // Notify customer (if email present)
          if (m.customer_email) {
            await sendNotificationEmail({
              to:       m.customer_email,
              name:     m.customer_name || "there",
              subject:  `Reminder: "${m.title}" starts in ${label}`,
              title:    `Meeting Reminder — ${label} Before`,
              message:  `Your meeting "<strong>${m.title}</strong>" with <strong>${organizer.full_name || "Ccentrik"}</strong> starts in <strong>${label}</strong> on ${dateStr} at ${startStr} IST.${m.meeting_link ? `\n\nJoin: ${m.meeting_link}` : m.location ? `\n\nLocation: ${m.location}` : ""}`,
              ctaLabel: m.meeting_link ? "Join Meeting" : undefined,
              ctaUrl:   m.meeting_link || undefined,
            }).catch(() => {});
          }

          // Mark as sent in notifications table to prevent duplicate
          await supabase.from("notifications").insert({
            user_id:    m.created_by,
            title:      `Meeting reminder sent (${label})`,
            message:    `Reminder sent for: ${m.title}`,
            type:       `meeting_${type}`,
            entity_id:  m.id,
            read:       true,
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error("[CRON] Meeting reminder error:", err.message);
    }
  });

  // Daily at 14:30 UTC (8:00 PM IST) — security report
  cron.schedule("30 14 * * *", async () => {
    console.log("[CRON] Running daily security report...");
    try {
      await sendDailySecurityReport();
    } catch (err) {
      console.error("[CRON] Security report error:", err.message);
    }
  });

  console.log("[CRON] Scheduled: follow-up reminders (9 AM UTC), stale leads alert (8 AM UTC), security report (14:30 UTC / 8 PM IST)");
}

async function sendDailySecurityReport() {
  const IS_TEST = (process.env.SECURITY_REPORT_MODE || "TEST") !== "PRODUCTION";
  const REPORT_TO = IS_TEST
    ? (process.env.SECURITY_REPORT_TEST_EMAIL || "sarthak.tyagi@ccentrik.com")
    : null; // PRODUCTION mode: per-owner delivery (extend later)

  if (!REPORT_TO) {
    console.log("[CRON] Security report: PRODUCTION mode not yet configured, skipping.");
    return;
  }

  // Date range: today in IST (UTC+5:30)
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const todayIST = new Date(now.getTime() + istOffsetMs);
  const dateStr = todayIST.toISOString().split("T")[0]; // YYYY-MM-DD
  const dayStart = new Date(`${dateStr}T00:00:00+05:30`).toISOString();
  const dayEnd   = new Date(`${dateStr}T23:59:59+05:30`).toISOString();

  // Fetch today's login activity joined with profiles
  const { data: logs, error } = await supabase
    .from("login_logs")
    .select("id, user_id, logged_in_at, logged_out_at, device_id, ip_address, city, country, profiles!login_logs_user_id_fkey(full_name, email, role)")
    .gte("logged_in_at", dayStart)
    .lte("logged_in_at", dayEnd)
    .order("logged_in_at", { ascending: false });

  if (error) { console.error("[CRON] Security report query error:", error.message); return; }
  if (!logs?.length) {
    console.log("[CRON] Security report: no login activity today, skipping email.");
    return;
  }

  // Build per-user summary
  const userMap = {};
  const devicesByUser = {};

  for (const log of logs) {
    const uid = log.user_id;
    if (!uid) continue;
    if (!userMap[uid]) {
      userMap[uid] = {
        name:    log.profiles?.full_name || "Unknown",
        email:   log.profiles?.email     || "",
        role:    log.profiles?.role      || "",
        logins:  0,
        logouts: 0,
        devices: new Set(),
        locations: new Set(),
      };
    }
    userMap[uid].logins++;
    if (log.logged_out_at) userMap[uid].logouts++;
    if (log.device_id)  userMap[uid].devices.add(log.device_id);
    if (log.city)       userMap[uid].locations.add(`${log.city}${log.country ? ", " + log.country : ""}`);
    if (!devicesByUser[uid]) devicesByUser[uid] = new Set();
    if (log.device_id)  devicesByUser[uid].add(log.device_id);
  }

  const multiDeviceUsers = Object.entries(devicesByUser)
    .filter(([, devs]) => devs.size > 1)
    .map(([uid]) => uid);

  const users = Object.entries(userMap);
  const totalLogins  = logs.length;
  const activeSessions = logs.filter((l) => !l.logged_out_at).length;
  const reportDate   = todayIST.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  // Build HTML rows
  const roleLabel = (r) => (r || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const tableRows = users.map(([uid, u]) => {
    const isMultiDevice = multiDeviceUsers.includes(uid);
    const statusDot = isMultiDevice
      ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f59e0b;margin-right:5px;" title="Multiple devices"></span>`
      : `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;margin-right:5px;"></span>`;
    const deviceWarning = isMultiDevice ? ` ⚠️ ${u.devices.size} devices` : "";
    return `
      <tr style="border-bottom:1px solid #F1F5F9;">
        <td style="padding:10px 12px;font-size:13px;color:#0F172A;font-weight:500;">${statusDot}${u.name}</td>
        <td style="padding:10px 12px;font-size:12px;color:#64748B;">${roleLabel(u.role)}</td>
        <td style="padding:10px 12px;font-size:13px;color:#0F172A;text-align:center;">${u.logins}</td>
        <td style="padding:10px 12px;font-size:13px;color:#0F172A;text-align:center;">${u.logouts}</td>
        <td style="padding:10px 12px;font-size:12px;color:${isMultiDevice ? "#92400E" : "#64748B"};">${[...u.locations].join(", ") || "—"}${deviceWarning}</td>
      </tr>`;
  }).join("");

  const warningsHtml = multiDeviceUsers.length > 0
    ? `<div style="margin:20px 0;padding:12px 16px;background:#FEF3C7;border:1px solid #FCD34D;border-left:4px solid #F59E0B;border-radius:8px;font-size:13px;color:#78350F;">
        ⚠️ <strong>${multiDeviceUsers.length} user${multiDeviceUsers.length > 1 ? "s" : ""}</strong> logged in from multiple different devices today. Review the table below.
       </div>`
    : `<div style="margin:20px 0;padding:12px 16px;background:#DCFCE7;border:1px solid #86EFAC;border-left:4px solid #22c55e;border-radius:8px;font-size:13px;color:#14532D;">
        ✓ No suspicious multi-device activity detected today.
       </div>`;

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#0F172A;">Daily Security Report</p>
    <p style="margin:0 0 20px;font-size:13px;color:#64748B;">${reportDate}${IS_TEST ? ' &nbsp;<span style="background:#DBEAFE;color:#1D4ED8;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600;">TEST MODE</span>' : ""}</p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;margin:0 0 20px;overflow:hidden;">
      <tr>
        <td style="padding:14px 20px;text-align:center;border-right:1px solid #E2E8F0;">
          <div style="font-size:28px;font-weight:800;color:#0F172A;">${users.length}</div>
          <div style="font-size:11.5px;color:#64748B;font-weight:500;margin-top:2px;">Active Users</div>
        </td>
        <td style="padding:14px 20px;text-align:center;border-right:1px solid #E2E8F0;">
          <div style="font-size:28px;font-weight:800;color:#0F172A;">${totalLogins}</div>
          <div style="font-size:11.5px;color:#64748B;font-weight:500;margin-top:2px;">Login Events</div>
        </td>
        <td style="padding:14px 20px;text-align:center;border-right:1px solid #E2E8F0;">
          <div style="font-size:28px;font-weight:800;color:#0F172A;">${activeSessions}</div>
          <div style="font-size:11.5px;color:#64748B;font-weight:500;margin-top:2px;">Open Sessions</div>
        </td>
        <td style="padding:14px 20px;text-align:center;">
          <div style="font-size:28px;font-weight:800;color:${multiDeviceUsers.length > 0 ? "#F59E0B" : "#22c55e"};">${multiDeviceUsers.length}</div>
          <div style="font-size:11.5px;color:#64748B;font-weight:500;margin-top:2px;">Multi-Device ⚠️</div>
        </td>
      </tr>
    </table>

    ${warningsHtml}

    <p style="margin:16px 0 8px;font-size:12px;font-weight:700;color:#0F172A;text-transform:uppercase;letter-spacing:0.06em;">Per-User Activity</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;">
      <thead>
        <tr style="background:#F8FAFC;border-bottom:2px solid #E2E8F0;">
          <th style="padding:10px 12px;font-size:11px;text-align:left;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Name</th>
          <th style="padding:10px 12px;font-size:11px;text-align:left;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Role</th>
          <th style="padding:10px 12px;font-size:11px;text-align:center;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Logins</th>
          <th style="padding:10px 12px;font-size:11px;text-align:center;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Logouts</th>
          <th style="padding:10px 12px;font-size:11px;text-align:left;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Location / Devices</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  `;

  // Build HTML email inline (mail.js baseLayout is internal)
  const BRAND_GRADIENT = "linear-gradient(135deg,#0B1120 0%,#1B3A6B 100%)";
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Daily Security Report</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F1F5F9;padding:40px 0;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;">
        <tr><td style="background:${BRAND_GRADIENT};border-radius:16px 16px 0 0;padding:32px 36px 28px;text-align:center;">
          <p style="margin:0 0 6px;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.5);">CCENTRIK</p>
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;">Security Report</h1>
        </td></tr>
        <tr><td style="background:#FFFFFF;padding:36px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;">${bodyHtml}</td></tr>
        <tr><td style="background:#F8FAFC;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 16px 16px;padding:20px 36px;text-align:center;">
          <p style="margin:0;font-size:11.5px;color:#94A3B8;line-height:1.7;">
            © ${new Date().getFullYear()} Ccentrik CRM &nbsp;·&nbsp; Automated security digest — do not reply.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Daily Security Report — ${reportDate}\n\nActive Users: ${users.length}\nLogin Events: ${totalLogins}\nOpen Sessions: ${activeSessions}\nMulti-Device Warnings: ${multiDeviceUsers.length}\n\n${
    users.map(([, u]) => `• ${u.name} (${roleLabel(u.role)}) — ${u.logins} login(s), ${u.logouts} logout(s)${u.devices.size > 1 ? ` ⚠️ ${u.devices.size} devices` : ""}`).join("\n")
  }\n\n— Ccentrik CRM Security`;

  await sendMail({
    to: REPORT_TO,
    subject: `Ccentrik Security Report — ${reportDate}${IS_TEST ? " [TEST]" : ""}`,
    html,
    text,
  });

  console.log(`[CRON] Security report sent to ${REPORT_TO} (${IS_TEST ? "TEST" : "PRODUCTION"} mode). Users: ${users.length}, Warnings: ${multiDeviceUsers.length}`);
}

module.exports = { startCronJobs };
