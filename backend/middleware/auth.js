const admin = require("firebase-admin");
const { supabase } = require("../config/db");

const ROLE_LEVEL = { owner: 5, sales_head: 4, sales_manager: 3, employee: 1 };

const authenticate = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  const token = header.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, status, avatar_url")
      .eq("firebase_uid", decoded.uid)
      .single();
    if (error || !profile) return res.status(401).json({ error: "Profile not found" });
    if (profile.status === "inactive") return res.status(403).json({ error: "Account is inactive" });
    req.profile = profile;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.profile) return res.status(401).json({ error: "Unauthorized" });
  if (!roles.includes(req.profile.role)) {
    return res.status(403).json({ error: `Forbidden: requires one of [${roles.join(", ")}]` });
  }
  next();
};

const hasHigherAccess = (roleA, roleB) => (ROLE_LEVEL[roleA] || 0) > (ROLE_LEVEL[roleB] || 0);

module.exports = { authenticate, authorize, ROLE_LEVEL, hasHigherAccess };
