const express = require("express");
const router = express.Router();
const { supabase } = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");

const ACTIVITY_TYPES = [
  // base
  "call", "meeting", "follow_up", "email", "note",
  "stage_change", "deal_created", "task_created", "general",
  // backend extras
  "visit", "virtual_meeting", "phone_call", "email_contact",
  // pipeline panel
  "follow_up_call", "follow_up_email", "meeting_person", "meeting_virtual",
  // lead / deal panel
  "followup", "reminder", "task", "proposal",
  // whatsapp
  "whatsapp", "whatsapp_follow_up",
  // email sync / Gmail auto-tracking
  "email_sent",
];

// Columns that exist on the activities table — prevents injection of unknown fields
const ALLOWED_COLUMNS = new Set([
  "type", "description", "user_id", "lead_id", "deal_id", "customer_id",
  "task_id", "meeting_id", "metadata", "assigned_to", "title",
  "status", "priority", "due_date", "related_type", "related_id",
  "next_follow_up_date",
]);

const CAN_EDIT   = ["owner", "sales_head"];
const CAN_DELETE = ["owner", "sales_head"];
const ROLE_RANK  = { owner: 4, sales_head: 3, sales_manager: 2, employee: 1, inside_sales: 1 };

// POST /api/activities
router.post("/", authenticate, async (req, res) => {
  const { type } = req.body;
  if (type && !ACTIVITY_TYPES.includes(type)) {
    return res.status(400).json({ error: `Invalid activity type: ${type}` });
  }

  // Whitelist only known columns to prevent injection of unknown fields
  const payload = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => ALLOWED_COLUMNS.has(k))
  );

  // description is NOT NULL — fall back to title if omitted
  if (!payload.description && payload.title) payload.description = payload.title;
  if (!payload.description) payload.description = payload.type || "Activity logged";

  payload.created_by = req.profile.id;

  const { data, error } = await supabase
    .from("activities")
    .insert(payload)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  // Immediately update last_activity_at on the linked lead and reset inactivity status.
  // This ensures the dashboard reflects the new activity without waiting for the nightly cron.
  const activityTs = data.created_at || new Date().toISOString();
  if (data.lead_id) {
    supabase.from("leads")
      .update({ last_activity_at: activityTs, inactivity_status: "active" })
      .eq("id", data.lead_id)
      .then(() => {}).catch(() => {});
  }
  // For deals, update updated_at so StaleDealsWidget reflects the new activity.
  if (data.deal_id) {
    supabase.from("deals")
      .update({ updated_at: activityTs })
      .eq("id", data.deal_id)
      .then(() => {}).catch(() => {});
  }

  res.status(201).json(data);
});

// GET /api/activities
router.get("/", authenticate, async (req, res) => {
  const { type, lead_id, assigned_to, limit = 200, offset = 0 } = req.query;
  const { role, id: profileId } = req.profile;

  let query = supabase
    .from("activities")
    .select(
      "*, created_by_profile:profiles!activities_created_by_fkey(id,full_name,avatar_url,role), assigned_profile:profiles!activities_assigned_to_fkey(id,full_name,avatar_url), lead:leads(id,contact_name,company_name,stage)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  // Role-based visibility
  if (role === "employee" || role === "inside_sales") {
    // Employee sees activities they created, are assigned to, or are the user_id on
    query = query.or(`created_by.eq.${profileId},assigned_to.eq.${profileId},user_id.eq.${profileId}`);

  } else if (role === "sales_manager") {
    // Manager sees own + direct reports' activities only
    const { data: reports } = await supabase
      .from("profiles").select("id").eq("manager_id", profileId);
    const reportIds = (reports || []).map(r => r.id);
    const scopeIds  = [profileId, ...reportIds];
    if (scopeIds.length === 1) {
      query = query.or(`created_by.eq.${scopeIds[0]},assigned_to.eq.${scopeIds[0]}`);
    } else {
      query = query.or(
        `created_by.in.(${scopeIds.join(",")}),assigned_to.in.(${scopeIds.join(",")})`
      );
    }

  } else if (role === "sales_head") {
    // Sales head sees everyone except owner
    const { data: visible } = await supabase
      .from("profiles").select("id")
      .in("role", ["sales_head", "sales_manager", "employee", "inside_sales"]);
    const ids = (visible || []).map(p => p.id);
    if (ids.length === 0) {
      query = query.or(`created_by.eq.${profileId},assigned_to.eq.${profileId}`);
    } else {
      query = query.or(
        `created_by.in.(${ids.join(",")}),assigned_to.in.(${ids.join(",")})`
      );
    }
  }
  // owner: no filter — sees all activities

  if (type)        query = query.eq("type", type);
  if (lead_id)     query = query.eq("lead_id", lead_id);
  if (assigned_to) query = query.eq("assigned_to", assigned_to);

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

// PUT /api/activities/:id — own activity always; higher-rank can edit anyone's
router.put("/:id", authenticate, async (req, res) => {
  const { data: existing } = await supabase
    .from("activities")
    .select("created_by, assigned_to")
    .eq("id", req.params.id)
    .single();
  if (!existing) return res.status(404).json({ error: "Activity not found" });

  const isOwn = existing.created_by === req.profile.id || existing.assigned_to === req.profile.id;
  if (!isOwn) {
    const { data: creator } = await supabase
      .from("profiles").select("role").eq("id", existing.created_by).single();
    const myRank      = ROLE_RANK[req.profile.role] || 0;
    const creatorRank = ROLE_RANK[creator?.role]     || 0;
    if (myRank < creatorRank) {
      return res.status(403).json({ error: "You cannot edit an activity created by a higher role." });
    }
    if (myRank === 1) {
      return res.status(403).json({ error: "You can only edit your own activities." });
    }
  }

  const { data, error } = await supabase
    .from("activities")
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/activities/:id — only owner / sales_head can delete
router.delete("/:id", authenticate, async (req, res) => {
  const { role, id: deleterId, full_name: deleterName } = req.profile;

  if (role !== "owner" && role !== "sales_head") {
    return res.status(403).json({ error: "Only Super Admin and Sales Head can delete activities." });
  }

  const { data: existing } = await supabase
    .from("activities")
    .select("id, title, type, related_type, related_id, lead_id, deal_id, created_by")
    .eq("id", req.params.id)
    .single();
  if (!existing) return res.status(404).json({ error: "Activity not found" });

  const { error } = await supabase.from("activities").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });

  // Non-blocking audit log — fails silently if table doesn't exist yet
  supabase.from("activity_deletion_logs").insert({
    activity_id:   existing.id,
    activity_type: existing.type || null,
    activity_title: existing.title || null,
    related_type:  existing.related_type || null,
    related_id:    existing.related_id   || null,
    lead_id:       existing.lead_id      || null,
    deal_id:       existing.deal_id      || null,
    deleted_by:    deleterId,
    deleter_name:  deleterName || null,
    deleter_role:  role,
    deleted_at:    new Date().toISOString(),
  }).then(() => {});

  res.json({ success: true });
});

module.exports = router;
