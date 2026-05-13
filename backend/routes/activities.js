const express = require("express");
const router = express.Router();
const { supabase } = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");

const ACTIVITY_TYPES = ["call", "meeting", "follow_up", "visit", "virtual_meeting", "phone_call", "email", "note"];
const CAN_EDIT   = ["owner", "sales_head", "sales_manager"];
const CAN_DELETE = ["owner", "sales_head"];

// POST /api/activities
router.post("/", authenticate, async (req, res) => {
  const { type } = req.body;
  if (type && !ACTIVITY_TYPES.includes(type)) {
    return res.status(400).json({ error: `Invalid type. Allowed: ${ACTIVITY_TYPES.join(", ")}` });
  }
  const { data, error } = await supabase
    .from("activities")
    .insert({ ...req.body, created_by: req.profile.id })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// GET /api/activities
router.get("/", authenticate, async (req, res) => {
  const { type, lead_id, assigned_to, limit = 100, offset = 0 } = req.query;
  const { role, id: profileId } = req.profile;

  let query = supabase
    .from("activities")
    .select(
      "*, created_by_profile:profiles!activities_created_by_fkey(id,full_name,avatar_url), lead:leads(id,contact_name,company_name)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (role === "employee") query = query.eq("created_by", profileId);
  if (type)        query = query.eq("type", type);
  if (lead_id)     query = query.eq("lead_id", lead_id);
  if (assigned_to) query = query.eq("created_by", assigned_to);

  const { data, error, count } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data, count });
});

// GET /api/activities/lead/:lead_id
router.get("/lead/:lead_id", authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from("activities")
    .select("*, created_by_profile:profiles!activities_created_by_fkey(id,full_name,avatar_url)")
    .eq("lead_id", req.params.lead_id)
    .order("created_at", { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// GET /api/activities/:id
router.get("/:id", authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from("activities")
    .select("*, created_by_profile:profiles!activities_created_by_fkey(id,full_name,avatar_url)")
    .eq("id", req.params.id)
    .single();
  if (error) return res.status(404).json({ error: "Activity not found" });
  res.json(data);
});

// PUT /api/activities/:id
router.put("/:id", authenticate, authorize(...CAN_EDIT), async (req, res) => {
  const { data, error } = await supabase
    .from("activities")
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/activities/:id
router.delete("/:id", authenticate, authorize(...CAN_DELETE), async (req, res) => {
  const { error } = await supabase.from("activities").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
