const { supabase } = require("../config/db");

const requireRole = (...allowedRoles) => async (req, res, next) => {
  if (!req.user?.uid) return res.status(401).json({ error: "Unauthorized" });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("firebase_uid", req.user.uid)
    .single();
  if (!profile || !allowedRoles.includes(profile.role)) {
    return res.status(403).json({ error: "Forbidden: Insufficient role" });
  }
  req.profile = profile;
  next();
};

module.exports = { requireRole };
