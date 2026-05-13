const express = require("express");
const router = express.Router();
const { supabase } = require("../config/db");
const { verifyToken } = require("../middleware/authMiddleware.js");
const { requireRole } = require("../middleware/roleMiddleware");

const calcAiScore = (budget, source) => {
  let score = 40;
  if (budget > 100000) score += 30;
  else if (budget > 50000) score += 20;
  else if (budget > 10000) score += 10;
  if (source === "referral") score += 25;
  else if (source === "website") score += 10;
  return Math.min(score, 100);
};

// GET /api/leads
router.get("/", async (req, res) => {
  const { stage, temperature, source, assigned_to, search, limit = 100, offset = 0 } = req.query;
  let query = supabase
    .from("leads")
    .select("*, assigned_profile:profiles!leads_assigned_to_fkey(id,full_name,avatar_url)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (stage) query = query.eq("stage", stage);
  if (temperature) query = query.eq("temperature", temperature);
  if (source) query = query.eq("source", source);
  if (assigned_to) query = query.eq("assigned_to", assigned_to);
  if (search) query = query.or(`contact_name.ilike.%${search}%,company_name.ilike.%${search}%`);

  const { data, error, count } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data, count });
});

// POST /api/leads
router.post("/", async (req, res) => {
  const { budget, source, ...rest } = req.body;
  const ai_score = calcAiScore(Number(budget) || 0, source);
  const { data, error } = await supabase
    .from("leads")
    .insert({ ...rest, budget: Number(budget) || 0, source, ai_score })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/leads/:id — restricted to owner and sales_head
router.patch("/:id", verifyToken, requireRole("owner", "sales_head"), async (req, res) => {
  const { data, error } = await supabase
    .from("leads")
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/leads/:id — restricted to owner and sales_head
router.delete("/:id", verifyToken, requireRole("owner", "sales_head"), async (req, res) => {
  const { error } = await supabase.from("leads").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
