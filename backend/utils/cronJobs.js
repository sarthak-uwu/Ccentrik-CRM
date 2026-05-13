const cron = require("node-cron");
const { supabase } = require("../config/db");
const { sendNotificationEmail } = require("../config/mail");

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

  console.log("[CRON] Scheduled: follow-up reminders (9 AM UTC), stale leads alert (8 AM UTC)");
}

module.exports = { startCronJobs };
