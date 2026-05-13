const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const { supabase } = require("../config/db");
const { sendWelcomeEmail } = require("../config/mail");

// POST /api/auth/add-member — invite a new team member
router.post("/add-member", async (req, res) => {
  const { email, personal_email, name, role = "employee" } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: "Email and name are required" });
  }
  if (!email.endsWith("@ccentrik.com")) {
    return res.status(400).json({ error: "Only @ccentrik.com emails allowed" });
  }

  const tempPassword = "Cc1!" + Math.random().toString(36).slice(-8);

  try {
    let firebaseUser;
    let isExisting = false;

    // 1. Create or fetch Firebase user
    try {
      firebaseUser = await admin.auth().createUser({
        email,
        displayName: name,
        password: tempPassword,
      });
    } catch (err) {
      if (err.code === "auth/email-already-exists") {
        firebaseUser = await admin.auth().getUserByEmail(email);
        isExisting = true;
        // Reset password so the invite email has a valid temp password
        await admin.auth().updateUser(firebaseUser.uid, { password: tempPassword });
      } else {
        throw err;
      }
    }

    // 2. Upsert profile in Supabase
    const { error: profileErr } = await supabase.from("profiles").upsert({
      firebase_uid: firebaseUser.uid,
      email: email.toLowerCase(),
      full_name: name,
      role,
      status: "active",
    });
    if (profileErr) throw profileErr;

    // 3. Send welcome email to personal email (real inbox), fallback to CRM email
    const mailTo = personal_email || email;
    await sendWelcomeEmail({ to: mailTo, loginEmail: email, name, tempPassword, role });

    res.json({ success: true, message: `Invitation sent to ${email}` });
  } catch (err) {
    console.error("add-member error:", err);
    res.status(400).json({ error: err.message });
  }
});

// GET /api/auth/profile/:uid
router.get("/profile/:uid", async (req, res) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("firebase_uid", req.params.uid)
    .single();
  if (error) return res.status(404).json({ error: "Profile not found" });
  res.json(data);
});

module.exports = router;
