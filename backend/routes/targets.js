const express = require("express");
const router  = express.Router();
const { supabase } = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { CAN_CREATE_TARGET, CAN_VIEW_ALL_TARGETS, canAssignTo } = require("../config/roles");

// ── helpers ────────────────────────────────────────────────────────────────────

async function fetchAssignee(assigneeId) {
  const { data } = await supabase
    .from("profiles")
    .select("id, role, manager_id")
    .eq("id", assigneeId)
    .single();
  return data || null;
}

async function getDirectReportIds(managerId) {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("manager_id", managerId);
  return (data || []).map(r => r.id);
}

// Validate that the caller is allowed to assign a target to the given profile.
// Returns an error string, or null if OK.
async function validateAssignment(callerProfile, assigneeId) {
  if (!assigneeId) return "assigned_to is required.";
  const assignee = await fetchAssignee(assigneeId);
  if (!assignee) return "Assignee profile not found.";

  const { role: callerRole, id: callerId } = callerProfile;

  if (!canAssignTo(callerRole, assignee.role)) {
    return `As ${callerRole}, you cannot assign targets to a ${assignee.role}.`;
  }

  // Sales managers can only assign to their own direct reports
  if (callerRole === "sales_manager" && assignee.manager_id !== callerId) {
    return "You can only assign targets to your direct reports.";
  }

  return null;
}

// ── GET /api/targets ───────────────────────────────────────────────────────────
router.get("/", authenticate, async (req, res) => {
  const { role, id } = req.profile;
  const { metric, period_type, assigned_to } = req.query;

  let q = supabase.from("targets").select("*").order("created_at", { ascending: false });

  // Role-based visibility filter
  if (["employee", "inside_sales"].includes(role)) {
    // Own targets only
    q = q.eq("assigned_to", id);
  } else if (role === "sales_manager") {
    // Own targets + direct reports' targets
    const reportIds = await getDirectReportIds(id);
    const scopeIds  = [id, ...reportIds];
    if (scopeIds.length === 1) {
      q = q.eq("assigned_to", scopeIds[0]);
    } else {
      q = q.in("assigned_to", scopeIds);
    }
  }
  // owner / sales_head: no extra filter — see all

  // Optional query filters (only applied when caller has visibility)
  if (metric)      q = q.eq("metric", metric);
  if (period_type) q = q.eq("period_type", period_type);
  if (assigned_to && CAN_VIEW_ALL_TARGETS.includes(role)) {
    q = q.eq("assigned_to", assigned_to);
  }

  const { data, error } = await q;
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data: data || [] });
});

// ── POST /api/targets ──────────────────────────────────────────────────────────
router.post("/", authenticate, async (req, res) => {
  const { role, id: creatorId } = req.profile;

  if (!CAN_CREATE_TARGET.includes(role)) {
    return res.status(403).json({ error: "You do not have permission to create targets." });
  }

  const { assigned_to, title, metric, period_type, target_value, start_date, end_date, description } = req.body;

  const assignmentError = await validateAssignment(req.profile, assigned_to);
  if (assignmentError) return res.status(403).json({ error: assignmentError });

  if (!title || !metric || !target_value || !start_date) {
    return res.status(400).json({ error: "title, metric, target_value and start_date are required." });
  }

  const { data, error } = await supabase
    .from("targets")
    .insert({ title, metric, period_type, target_value: Number(target_value), start_date, end_date, description, assigned_to, created_by: creatorId })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// ── PUT /api/targets/:id ───────────────────────────────────────────────────────
router.put("/:id", authenticate, async (req, res) => {
  const { role, id: callerId } = req.profile;

  const { data: existing, error: fetchErr } = await supabase
    .from("targets")
    .select("created_by, assigned_to")
    .eq("id", req.params.id)
    .single();
  if (fetchErr || !existing) return res.status(404).json({ error: "Target not found." });

  // Only creator or owner/sales_head may edit
  const isPrivileged = CAN_VIEW_ALL_TARGETS.includes(role);
  if (!isPrivileged && existing.created_by !== callerId) {
    return res.status(403).json({ error: "You can only edit targets you created." });
  }

  const { assigned_to, ...fields } = req.body;
  const newAssignee = assigned_to || existing.assigned_to;

  // Re-validate assignment only if assignee is changing
  if (assigned_to && assigned_to !== existing.assigned_to) {
    const assignmentError = await validateAssignment(req.profile, assigned_to);
    if (assignmentError) return res.status(403).json({ error: assignmentError });
  }

  const { data, error } = await supabase
    .from("targets")
    .update({ ...fields, assigned_to: newAssignee, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── DELETE /api/targets/:id ────────────────────────────────────────────────────
router.delete("/:id", authenticate, async (req, res) => {
  const { role, id: callerId } = req.profile;

  const { data: existing } = await supabase
    .from("targets")
    .select("created_by")
    .eq("id", req.params.id)
    .single();
  if (!existing) return res.status(404).json({ error: "Target not found." });

  const isPrivileged = CAN_VIEW_ALL_TARGETS.includes(role);
  if (!isPrivileged && existing.created_by !== callerId) {
    return res.status(403).json({ error: "You can only delete targets you created." });
  }

  const { error } = await supabase.from("targets").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
