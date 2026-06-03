const admin = require("firebase-admin");

const verifyToken = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: No token" });
  }
  const token = header.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
};

module.exports = { verifyToken };
