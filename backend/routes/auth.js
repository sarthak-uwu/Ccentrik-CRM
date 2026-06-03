const express = require("express");
const router  = express.Router();
const admin   = require("firebase-admin");
const axios   = require("axios");
const { supabase } = require("../config/db");
const { sendWelcomeEmail } = require("../config/mail");
const { authenticate, authorize } = require("../middleware/auth");

const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || "AIzaSyAiJrt5Ar6pypMMvCmDIEOyPj_Ze07PYIU";
const APP_URL = process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes("localhost")
  ? process.env.FRONTEND_URL
  : "https://ccentrik-crm.web.app";

// POST /api/auth/add-member — invite a new team member (owner/sales_head only)
router.post("/add-member", authenticate, authorize("owner", "sales_head"), async (req, res) => {
  const { email, name, role = "employee" } = req.body;

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

    // 2. Upsert profile in Supabase (conflict on firebase_uid)
    const { error: profileErr } = await supabase.from("profiles").upsert({
      firebase_uid: firebaseUser.uid,
      email: email.toLowerCase(),
      full_name: name,
      role,
      status: "active",
      updated_at: new Date().toISOString(),
    }, { onConflict: "firebase_uid" });
    if (profileErr) throw profileErr;

    // 3. Send welcome email to CRM email
    const inviterProfile = req.profile;
    let emailSent = false;
    try {
      await sendWelcomeEmail({
        to: email, name, tempPassword, role,
        invitedBy:    inviterProfile?.full_name || null,
        inviterEmail: inviterProfile?.email     || null,
      });
      emailSent = true;
      console.log(`[add-member] Welcome email sent to ${email}`);
    } catch (mailErr) {
      console.error("[add-member] Welcome email failed:", mailErr.message);
      console.error("[add-member] Mail env — RESEND_API_KEY:", process.env.RESEND_API_KEY ? "SET" : "MISSING", "| GMAIL_USER:", process.env.GMAIL_USER ? "SET" : "MISSING");
    }

    res.json({
      success: true,
      message: emailSent
        ? `Member added and invitation sent to ${email}`
        : `Member added successfully. Email could not be sent — share credentials manually: ${email} / ${tempPassword}`,
      tempPassword,
      emailSent,
    });
  } catch (err) {
    console.error("add-member error:", err);
    res.status(400).json({ error: err.message });
  }
});

// POST /api/auth/send-reset-email — Firebase sends the reset email directly
// Always returns 200 to prevent email enumeration
router.post("/send-reset-email", async (req, res) => {
  const { email } = req.body;
  if (!email || !email.endsWith("@ccentrik.com")) {
    return res.json({ ok: true });
  }

  try {
    // Firebase REST API — triggers Firebase's own email sending (inbox-reliable, DKIM-signed)
    // Template subject & body are configured in Firebase Console →
    //   Authentication → Email Templates → Password Reset
    await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_WEB_API_KEY}`,
      {
        requestType: "PASSWORD_RESET",
        email,
        continueUrl: `${APP_URL}/reset-password`,
      }
    );
  } catch (err) {
    // Swallow all errors — don't reveal whether the account exists
    const code = err?.response?.data?.error?.message;
    if (code && code !== "EMAIL_NOT_FOUND") {
      console.error("send-reset-email error:", code);
    }
  }

  res.json({ ok: true });
});

// GET /api/auth/profile/:uid — authenticated callers only; employees see only their own profile
router.get("/profile/:uid", authenticate, async (req, res) => {
  const requestorIsAdmin = ["owner", "sales_head", "sales_manager"].includes(req.profile.role);
  // Non-admins can only fetch their own profile
  if (!requestorIsAdmin && req.user.uid !== req.params.uid) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("id, firebase_uid, full_name, email, role, status, avatar_url, department, bio, online_at, created_at")
    .eq("firebase_uid", req.params.uid)
    .single();
  if (error) return res.status(404).json({ error: "Profile not found" });
  res.json(data);
});

module.exports = router;
