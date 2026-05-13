const express = require("express");
const router = express.Router();
const { supabase } = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");

const CAN_WRITE = ["owner", "sales_head", "sales_manager"];
const CAN_DELETE = ["owner", "sales_head"];

// POST /api/deals
router.post("/", authenticate, authorize(...CAN_WRITE), async (req, res) => {
  const { data, error } = await supabase
    .from("deals")
    .insert({ ...req.body, created_by: req.profile.id })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// GET /api/deals
router.get("/", authenticate, async (req, res) => {
  const { stage, assigned_to, search, limit = 100, offset = 0 } = req.query;
  const { role, id: profileId } = req.profile;

  let query = supabase
    .from("deals")
    .select(
      "*, assigned_profile:profiles!deals_assigned_to_fkey(id,full_name,avatar_url)",
      { count: "exact" }
    )
    .order("updated_at", { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (role === "employee") query = query.eq("assigned_to", profileId);
  if (stage)       query = query.eq("stage", stage);
  if (assigned_to) query = query.eq("assigned_to", assigned_to);
  if (search)      query = query.or(`title.ilike.%${search}%,company_name.ilike.%${search}%`);

  const { data, error, count } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data, count });
});

// GET /api/deals/:id
router.get("/:id", authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from("deals")
    .select("*, assigned_profile:profiles!deals_assigned_to_fkey(id,full_name,avatar_url)")
    .eq("id", req.params.id)
    .single();
  if (error) return res.status(404).json({ error: "Deal not found" });
  res.json(data);
});

// PUT /api/deals/:id
router.put("/:id", authenticate, authorize(...CAN_WRITE), async (req, res) => {
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
  const { error } = await supabase.from("deals").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
