const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const { supabase } = require("../config/db");
const { authenticate, authorize, hasHigherAccess } = require("../middleware/auth");

// GET /api/users — list all profiles
router.get("/", authenticate, authorize("owner", "sales_head", "sales_manager"), async (req, res) => {
  const { role, status, search } = req.query;

  let query = supabase
    .from("profiles")
    .select("id, firebase_uid, full_name, email, role, status, avatar_url, created_at")
    .order("created_at", { ascending: false });

  if (role)   query = query.eq("role", role);
  if (status) query = query.eq("status", status);
  if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// GET /api/users/:id
router.get("/:id", authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, status, avatar_url, created_at")
    .eq("id", req.params.id)
    .single();
  if (error) return res.status(404).json({ error: "User not found" });
  res.json(data);
});

// PUT /api/users/:id — update role or status
router.put("/:id", authenticate, authorize("owner", "sales_head"), async (req, res) => {
  const { role: newRole, status, full_name, avatar_url } = req.body;
  const requestorRole = req.profile.role;

  // Cannot change role to something equal or higher than requestor
  if (newRole && !hasHigherAccess(requestorRole, newRole) && requestorRole !== "owner") {
    return res.status(403).json({ error: "Cannot assign a role equal to or higher than your own" });
  }

  const { data: target } = await supabase.from("profiles").select("role, firebase_uid").eq("id", req.params.id).single();
  if (!target) return res.status(404).json({ error: "User not found" });

  // Cannot demote an owner
  if (target.role === "owner" && requestorRole !== "owner") {
    return res.status(403).json({ error: "Cannot modify an owner account" });
  }

  const updates = {};
  if (newRole)    updates.role       = newRole;
  if (status)     updates.status     = status;
  if (full_name)  updates.full_name  = full_name;
  if (avatar_url) updates.avatar_url = avatar_url;

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/users/:id — soft-delete: revoke all access, disable Firebase, preserve audit trail
router.delete("/:id", authenticate, authorize("owner", "sales_head"), async (req, res) => {
  const { data: target } = await supabase
    .from("profiles")
    .select("role, firebase_uid, status")
    .eq("id", req.params.id)
    .single();

  if (!target) return res.status(404).json({ error: "User not found" });
  if (target.role === "owner") return res.status(403).json({ error: "Cannot delete an owner account" });
  if (req.profile.id === req.params.id) return res.status(403).json({ error: "Cannot delete your own account" });
  if (target.status === "deleted") return res.status(409).json({ error: "User is already deleted" });

  // Disable Firebase Auth user and revoke all refresh tokens.
  // This blocks email/password login, Google OAuth, and invalidates all active sessions.
  if (target.firebase_uid) {
    try {
      await admin.auth().updateUser(target.firebase_uid, { disabled: true });
      await admin.auth().revokeRefreshTokens(target.firebase_uid);
    } catch { /* Firebase user may not exist — Supabase status is the authoritative gate */ }
  }

  // Soft-delete: mark as deleted but keep the record for audit trail and historical ownership
  const { error } = await supabase
    .from("profiles")
    .update({
      status:     "deleted",
      deleted_at: new Date().toISOString(),
      deleted_by: req.profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
