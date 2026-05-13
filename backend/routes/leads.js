const express = require("express");
const router = express.Router();
const { supabase } = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");

const CAN_EDIT   = ["owner", "sales_head", "sales_manager"];
const CAN_DELETE = ["owner", "sales_head"];

const calcAiScore = (budget, source) => {
  let score = 40;
  if (budget > 100000) score += 30;
  else if (budget > 50000) score += 20;
  else if (budget > 10000) score += 10;
  if (source === "referral") score += 25;
  else if (source === "website") score += 10;
  return Math.min(score, 100);
};

async function nextLeadCode() {
  const { count } = await supabase.from("leads").select("id", { count: "exact", head: true });
  return `LEAD-${String((count || 0) + 1).padStart(5, "0")}`;
}

// GET /api/leads
router.get("/", authenticate, async (req, res) => {
  const { stage, temperature, source, assigned_to, search, limit = 100, offset = 0 } = req.query;
  const { role, id: profileId } = req.profile;

  let query = supabase
    .from("leads")
    .select("*, assigned_profile:profiles!leads_assigned_to_fkey(id,full_name,avatar_url)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (role === "employee") query = query.eq("assigned_to", profileId);
  if (stage)       query = query.eq("stage", stage);
  if (temperature) query = query.eq("temperature", temperature);
  if (source)      query = query.eq("source", source);
  if (assigned_to && role !== "employee") query = query.eq("assigned_to", assigned_to);
  if (search)      query = query.or(`contact_name.ilike.%${search}%,company_name.ilike.%${search}%`);

  const { data, error, count } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data, count });
});

// POST /api/leads
router.post("/", authenticate, async (req, res) => {
  const { budget, source, assigned_to, ...rest } = req.body;
  const { role, id: profileId } = req.profile;
  const ai_score = calcAiScore(Number(budget) || 0, source);
  const lead_code = await nextLeadCode();

  // Employees can only assign to themselves
  const finalAssignedTo = role === "employee" ? profileId : (assigned_to || profileId);

  const { data, error } = await supabase
    .from("leads")
    .insert({ ...rest, budget: Number(budget) || 0, source, ai_score, lead_code, assigned_to: finalAssignedTo, created_by: profileId })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// POST /api/leads/bulk
router.post("/bulk", authenticate, authorize(...CAN_EDIT), async (req, res) => {
  const leads = req.body;
  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: "Body must be a non-empty array of leads" });
  }
  const { count: existing } = await supabase.from("leads").select("id", { count: "exact", head: true });
  const enriched = leads.map((l, i) => ({
    ...l,
    ai_score: calcAiScore(Number(l.budget) || 0, l.source),
    lead_code: `LEAD-${String((existing || 0) + i + 1).padStart(5, "0")}`,
    created_by: req.profile.id,
    assigned_to: l.assigned_to || req.profile.id,
  }));
  const { data, error } = await supabase.from("leads").insert(enriched).select();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ inserted: data.length, data });
});

// GET /api/leads/:id
router.get("/:id", authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from("leads")
    .select("*, assigned_profile:profiles!leads_assigned_to_fkey(id,full_name,avatar_url)")
    .eq("id", req.params.id)
    .single();
  if (error) return res.status(404).json({ error: "Lead not found" });
  res.json(data);
});

// PUT /api/leads/:id
router.put("/:id", authenticate, authorize(...CAN_EDIT), async (req, res) => {
  const { data, error } = await supabase
    .from("leads")
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// PATCH /api/leads/:id
router.patch("/:id", authenticate, authorize(...CAN_EDIT), async (req, res) => {
  const { data, error } = await supabase
    .from("leads")
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/leads/:id
router.delete("/:id", authenticate, authorize(...CAN_DELETE), async (req, res) => {
  const { error } = await supabase.from("leads").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
