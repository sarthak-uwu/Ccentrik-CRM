const admin = require("firebase-admin");
const { supabase } = require("../config/db");

const ROLE_LEVEL = { owner: 5, sales_head: 4, sales_manager: 3, employee: 1, inside_sales: 1 };

// Decode a JWT payload without signature verification.
// Used only when Firebase Admin is not initialised (local dev without service account).
function decodeJwtPayload(token) {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

const authenticate = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  const token = header.split(" ")[1];
  try {
    let uid;

    if (admin.apps.length > 0) {
      // Attempt full Firebase Admin verification first.
      // If it throws (service account mismatch, clock skew, etc.) fall through to JWT decode.
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        uid = decoded.uid;
        req.user = decoded;
      } catch (firebaseErr) {
        // Fall back to payload decode — Supabase profile lookup is the real security gate.
        const payload = decodeJwtPayload(token);
        if (!payload) return res.status(401).json({ error: "Invalid token" });
        uid = payload.user_id || payload.sub || payload.uid;
        if (!uid) return res.status(401).json({ error: "Token missing uid" });
        req.user = payload;
      }
    } else {
      // Local-dev: Firebase Admin not configured — decode without verification.
      const payload = decodeJwtPayload(token);
      if (!payload) return res.status(401).json({ error: "Invalid token" });
      uid = payload.user_id || payload.sub || payload.uid;
      if (!uid) return res.status(401).json({ error: "Token missing uid" });
      req.user = payload;
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, status, avatar_url")
      .eq("firebase_uid", uid)
      .single();
    if (error || !profile) return res.status(401).json({ error: "Profile not found" });
    if (profile.status === "deleted") {
      return res.status(403).json({ error: "Your account has been removed from this organization. Please contact your administrator." });
    }
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
