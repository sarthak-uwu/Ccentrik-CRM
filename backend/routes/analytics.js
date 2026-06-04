const express = require("express");
const router = express.Router();
const { supabase } = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");

// GET /api/analytics
router.get("/", authenticate, authorize("owner", "sales_head", "sales_manager"), async (req, res) => {
  try {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();

    const [leadsRes, dealsRes, profilesRes, activitiesRes] = await Promise.all([
      supabase.from("leads").select("id, stage, temperature, priority, source, assigned_to, created_at, ai_score"),
      supabase.from("deals").select("id, stage, value, assigned_to, created_at, close_date, closed_at"),
      supabase.from("profiles").select("id, full_name, role, avatar_url").eq("status", "active"),
      supabase.from("activities").select("id, type, created_by, created_at").gte("created_at", sixMonthsAgo),
    ]);

    const leads  = leadsRes.data  || [];
    const deals  = dealsRes.data  || [];
    const profiles = profilesRes.data || [];
    const activities = activitiesRes.data || [];

    // ── Lead breakdown ────────────────────────────────────────────────────────
    const byStage = leads.reduce((acc, l) => { acc[l.stage] = (acc[l.stage] || 0) + 1; return acc; }, {});
    const byTemp  = leads.reduce((acc, l) => { acc[l.temperature] = (acc[l.temperature] || 0) + 1; return acc; }, {});
    const bySource = leads.reduce((acc, l) => { if (l.source) acc[l.source] = (acc[l.source] || 0) + 1; return acc; }, {});

    // ── Deal breakdown ────────────────────────────────────────────────────────
    const wonDeals  = deals.filter((d) => d.stage === "won");
    const lostDeals = deals.filter((d) => d.stage === "lost");
    const wonRevenue = wonDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);
    const pipeline  = deals.filter((d) => !["won", "lost"].includes(d.stage));
    const pipelineValue = pipeline.reduce((s, d) => s + (Number(d.value) || 0), 0);
    const conversionRate = leads.length > 0 ? ((wonDeals.length / leads.length) * 100).toFixed(1) : "0.0";

    // ── Monthly trends (last 6 months) ────────────────────────────────────────
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleString("en-IN", { month: "short", year: "2-digit" }) });
    }

    const monthlyLeads = months.map(({ key, label }) => ({
      month: label,
      leads: leads.filter((l) => l.created_at?.startsWith(key)).length,
      deals: deals.filter((d) => d.created_at?.startsWith(key)).length,
      revenue: wonDeals.filter((d) => (d.closed_at || d.created_at)?.startsWith(key)).reduce((s, d) => s + (Number(d.value) || 0), 0),
    }));

    // ── Employee performance ──────────────────────────────────────────────────
    const salesProfiles = profiles.filter((p) => ["employee", "sales_manager"].includes(p.role));
    const employeePerf = salesProfiles.map((p) => {
      const myLeads = leads.filter((l) => l.assigned_to === p.id);
      const myWon   = deals.filter((d) => d.assigned_to === p.id && d.stage === "won");
      const myActs  = activities.filter((a) => a.created_by === p.id);
      const avgScore = myLeads.length
        ? Math.round(myLeads.reduce((s, l) => s + (l.ai_score || 0), 0) / myLeads.length)
        : 0;
      return {
        id: p.id,
        name: p.full_name,
        avatar_url: p.avatar_url,
        role: p.role,
        leads: myLeads.length,
        won: myWon.length,
        revenue: myWon.reduce((s, d) => s + (Number(d.value) || 0), 0),
        activities: myActs.length,
        avg_ai_score: avgScore,
        conversion: myLeads.length > 0 ? ((myWon.length / myLeads.length) * 100).toFixed(1) : "0.0",
      };
    }).sort((a, b) => b.revenue - a.revenue);

    // ── Activity breakdown ────────────────────────────────────────────────────
    const byActivity = activities.reduce((acc, a) => { acc[a.type] = (acc[a.type] || 0) + 1; return acc; }, {});

    res.json({
      overview: {
        total_leads: leads.length,
        total_deals: deals.length,
        won_deals: wonDeals.length,
        lost_deals: lostDeals.length,
        pipeline_deals: pipeline.length,
        won_revenue: wonRevenue,
        pipeline_value: pipelineValue,
        conversion_rate: conversionRate,
        total_activities: activities.length,
      },
      leads_by_stage:       byStage,
      leads_by_temperature: byTemp,
      leads_by_source:      bySource,
      activities_by_type:   byActivity,
      monthly_trends:       monthlyLeads,
      employee_performance: employeePerf,
    });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
