const express = require("express");
const router = express.Router();
const { supabase } = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");

const CAN_WRITE = ["owner", "sales_head", "sales_manager"];
const CAN_DELETE = ["owner", "sales_head"];

const validateDealContact = (body) => {
  if (!body.company_name?.trim()) return "Company name is required";
  let notes = {};
  try { notes = body.notes ? JSON.parse(body.notes) : {}; } catch { /* ignore */ }
  if (!notes.email?.trim() && !notes.contact?.trim()) return "At least one contact detail (Email or Phone) is required";
  return null;
};

// POST /api/deals
router.post("/", authenticate, authorize(...CAN_WRITE), async (req, res) => {
  const contactErr = validateDealContact(req.body);
  if (contactErr) return res.status(400).json({ error: contactErr });

  const { data, error } = await supabase
    .from("deals")
    .insert({ ...req.body, created_by: req.profile.id })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  // When converted from a lead, log a lifecycle milestone on both the lead and the deal
  if (req.body.lead_id) {
    const company = req.body.company_name || req.body.title || "Record";
    supabase.from("activities").insert({
      type: "lifecycle",
      title: "Converted to Deal",
      description: `${company} was converted from Lead/Pipeline to the Deals module`,
      lead_id: req.body.lead_id,
      deal_id: data.id,
      created_by: req.profile.id,
      status: "done",
    }).then(() => {}).catch(() => {});
  }

  res.status(201).json(data);
});

// GET /api/deals
router.get("/", authenticate, async (req, res) => {
  const { stage, assigned_to, search, limit = 100, offset = 0 } = req.query;
  const { role, id: profileId } = req.profile;

  const applyFilters = (q) => {
    if (!["owner", "sales_head"].includes(role)) q = q.eq("assigned_to", profileId);
    if (stage)       q = q.eq("stage", stage);
    if (assigned_to) q = q.eq("assigned_to", assigned_to);
    if (search)      q = q.or(`title.ilike.%${search}%,company_name.ilike.%${search}%`);
    return q.order("updated_at", { ascending: false }).range(Number(offset), Number(offset) + Number(limit) - 1);
  };

  // Try enriched select with joins first; fall back to plain select if FK joins fail
  let { data, error, count } = await applyFilters(
    supabase.from("deals").select(
      "*, assigned_profile:profiles!assigned_to(id,full_name,avatar_url), linked_lead:leads!lead_id(lead_code,source,country,industry)",
      { count: "exact" }
    )
  );

  if (error) {
    // Join syntax incompatible with this schema — fetch plain data then enrich manually
    const plain = await applyFilters(
      supabase.from("deals").select("*", { count: "exact" })
    );
    if (plain.error) return res.status(400).json({ error: plain.error.message });
    data  = plain.data || [];
    count = plain.count;

    // Manually enrich with assigned profiles so frontend always gets full_name
    const assignedIds = [...new Set(data.filter((d) => d.assigned_to).map((d) => d.assigned_to))];
    if (assignedIds.length) {
      const { data: profiles } = await supabase.from("profiles").select("id,full_name,avatar_url").in("id", assignedIds);
      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
      data = data.map((d) => ({ ...d, assigned_profile: d.assigned_to ? (profileMap[d.assigned_to] || null) : null }));
    }
  }

  res.json({ data: data || [], count: count || 0 });
});

// GET /api/deals/:id
router.get("/:id", authenticate, async (req, res) => {
  let { data, error } = await supabase
    .from("deals")
    .select("*, assigned_profile:profiles!assigned_to(id,full_name,avatar_url), linked_lead:leads!lead_id(lead_code,source,country,industry)")
    .eq("id", req.params.id)
    .single();
  if (error) {
    const plain = await supabase.from("deals").select("*").eq("id", req.params.id).single();
    if (plain.error) return res.status(404).json({ error: "Deal not found" });
    data = plain.data;
    // Manually enrich with assigned profile
    if (data?.assigned_to) {
      const { data: prof } = await supabase.from("profiles").select("id,full_name,avatar_url").eq("id", data.assigned_to).maybeSingle();
      if (prof) data = { ...data, assigned_profile: prof };
    }
  }
  res.json(data);
});

// PUT /api/deals/:id
router.put("/:id", authenticate, authorize(...CAN_WRITE), async (req, res) => {
  if (req.body.company_name !== undefined || req.body.notes !== undefined) {
    const contactErr = validateDealContact(req.body);
    if (contactErr) return res.status(400).json({ error: contactErr });
  }
  const { data, error } = await supabase
    .from("deals")
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// PATCH /api/deals/:id — partial update (same auth as PUT)
router.patch("/:id", authenticate, authorize(...CAN_WRITE), async (req, res) => {
  const { data, error } = await supabase
    .from("deals")
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/deals/:id
router.delete("/:id", authenticate, authorize(...CAN_DELETE), async (req, res) => {
  // Fetch deal first to get the linked lead_id before deletion
  const { data: deal } = await supabase.from("deals").select("id, lead_id").eq("id", req.params.id).maybeSingle();

  // Detach activities so FK constraint won't block deletion
  await supabase.from("activities").update({ deal_id: null }).eq("deal_id", req.params.id);

  const { error } = await supabase.from("deals").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });

  // Revert linked lead's stage so it doesn't remain as an orphan 'converted' record
  if (deal?.lead_id) {
    supabase.from("leads")
      .update({ stage: "new", updated_at: new Date().toISOString() })
      .eq("id", deal.lead_id)
      .eq("stage", "converted")
      .then(() => {}).catch(() => {});
  }

  // Cascade delete associated notifications so they don't linger after deletion
  supabase.from("notifications").delete().eq("entity_id", req.params.id).eq("entity_type", "deal").then(() => {}).catch(() => {});

  res.json({ success: true });
});

const CAN_REVERT = ["owner", "sales_head"];

// POST /api/deals/:id/revert-to-lead — move deal back to Leads module
router.post("/:id/revert-to-lead", authenticate, authorize(...CAN_REVERT), async (req, res) => {
  try {
    const { data: deal, error: fetchErr } = await supabase
      .from("deals").select("id, lead_id, company_name, stage").eq("id", req.params.id).single();
    if (fetchErr || !deal) return res.status(404).json({ error: "Deal not found" });
    if (!deal.lead_id) return res.status(400).json({ error: "This deal has no linked lead record. Cannot revert." });

    // Restore lead to active state
    const { error: leadErr } = await supabase
      .from("leads").update({ stage: "new", updated_at: new Date().toISOString() }).eq("id", deal.lead_id);
    if (leadErr) return res.status(400).json({ error: leadErr.message });

    // Detach activities from this deal so FK constraint won't block deletion
    await supabase.from("activities").update({ deal_id: null }).eq("deal_id", deal.id);

    // Delete the deal (conversion undone; history preserved in change_history + audit_logs)
    const { error: dealErr } = await supabase.from("deals").delete().eq("id", deal.id);
    if (dealErr) return res.status(400).json({ error: dealErr.message });

    await supabase.from("change_history").insert({
      entity_type: "lead", entity_id: deal.lead_id,
      field_name: "conversion", field_label: "Reverted to Lead",
      old_value: "deal", new_value: "lead",
      changed_by: req.profile.id,
    });

    await supabase.from("audit_logs").insert({
      user_id: req.profile.id,
      action: "revert_deal_to_lead",
      resource: "deal",
      details: { deal_id: deal.id, lead_id: deal.lead_id, company: deal.company_name },
    });

    res.json({ success: true, lead_id: deal.lead_id });
  } catch (e) {
    res.status(500).json({ error: e.message || "Internal error in revert-to-lead" });
  }
});

// POST /api/deals/:id/revert-to-pipeline — move deal back to Pipeline module
router.post("/:id/revert-to-pipeline", authenticate, authorize(...CAN_REVERT), async (req, res) => {
  try {
    const { data: deal, error: fetchErr } = await supabase
      .from("deals").select("id, lead_id, company_name, stage").eq("id", req.params.id).single();
    if (fetchErr || !deal) return res.status(404).json({ error: "Deal not found" });
    if (!deal.lead_id) return res.status(400).json({ error: "This deal has no linked lead record. Cannot revert to Pipeline." });

    // Restore lead to pipeline stage
    const { error: leadErr } = await supabase
      .from("leads").update({ stage: "pipeline", updated_at: new Date().toISOString() }).eq("id", deal.lead_id);
    if (leadErr) return res.status(400).json({ error: leadErr.message });

    // Detach activities from this deal so FK constraint won't block deletion
    await supabase.from("activities").update({ deal_id: null }).eq("deal_id", deal.id);

    // Delete the deal (conversion undone; history preserved in change_history + audit_logs)
    const { error: dealErr } = await supabase.from("deals").delete().eq("id", deal.id);
    if (dealErr) return res.status(400).json({ error: dealErr.message });

    await supabase.from("change_history").insert({
      entity_type: "lead", entity_id: deal.lead_id,
      field_name: "conversion", field_label: "Reverted to Pipeline",
      old_value: "deal", new_value: "pipeline",
      changed_by: req.profile.id,
    });

    await supabase.from("audit_logs").insert({
      user_id: req.profile.id,
      action: "revert_deal_to_pipeline",
      resource: "deal",
      details: { deal_id: deal.id, lead_id: deal.lead_id, company: deal.company_name },
    });

    res.json({ success: true, lead_id: deal.lead_id });
  } catch (e) {
    res.status(500).json({ error: e.message || "Internal error in revert-to-pipeline" });
  }
});

// POST /api/deals/cleanup-orphaned — owner only
// Finds active deals whose linked lead no longer exists and deletes them
router.post("/cleanup-orphaned", authenticate, authorize("owner", "sales_head"), async (req, res) => {
  try {
    // Get all active deals (not won/lost) that have a lead_id
    const { data: activeDeals } = await supabase
      .from("deals")
      .select("id, lead_id")
      .not("stage", "in", '("won","lost")')
      .not("lead_id", "is", null);

    if (!activeDeals?.length) return res.json({ fixed: 0, message: "No orphaned deals found" });

    // Get all existing lead IDs
    const leadIds = activeDeals.map((d) => d.lead_id);
    const { data: existingLeads } = await supabase.from("leads").select("id").in("id", leadIds);
    const existingSet = new Set((existingLeads || []).map((l) => l.id));

    // Orphaned = deal's lead_id points to a lead that no longer exists
    const orphanDeals = activeDeals.filter((d) => !existingSet.has(d.lead_id));
    if (!orphanDeals.length) return res.json({ fixed: 0, message: "No orphaned deals found" });

    const orphanIds = orphanDeals.map((d) => d.id);

    // Detach activities so FK constraint won't block deletion
    await supabase.from("activities").update({ deal_id: null }).in("deal_id", orphanIds);

    const { error } = await supabase.from("deals").delete().in("id", orphanIds);
    if (error) return res.status(400).json({ error: error.message });

    res.json({ fixed: orphanIds.length, message: `${orphanIds.length} orphaned deal(s) cleaned up` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
