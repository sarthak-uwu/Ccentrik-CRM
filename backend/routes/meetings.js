const express = require("express");
const router  = express.Router();
const { supabase } = require("../config/db");
const { sendMeetingInviteEmail, sendMeetingCancellationEmail } = require("../config/mail");
const { authenticate } = require("../middleware/auth");

async function resolveHostProfile(profileId) {
  const { data } = await supabase
    .from("profiles")
    .select("email, full_name, mail_app_password")
    .eq("id", profileId)
    .single();
  return data || {};
}

// POST /api/meetings/invite — branded email + iCal REQUEST (Gmail auto-syncs calendar event)
router.post("/invite", authenticate, async (req, res) => {
  const {
    customerName, customerEmail, title, startTime, endTime,
    meetingType, meetingLink, location, description, hostName,
    meetingPurpose, companyName, meetingId, sequence = 0, allAttendees = [],
  } = req.body;

  if (!customerEmail || !title || !startTime) {
    return res.status(400).json({ error: "customerEmail, title and startTime are required" });
  }

  const hostProfile   = await resolveHostProfile(req.profile.id);
  const senderEmail   = hostProfile.email           || null;
  const senderPassword= hostProfile.mail_app_password || null;
  const resolvedName  = hostName || hostProfile.full_name || "Ccentrik Team";

  let emailSent  = false;
  let emailError = null;
  try {
    await sendMeetingInviteEmail({
      to:            customerEmail,
      customerName,
      title,
      startTime,
      endTime,
      meetingType,
      meetingLink,
      location,
      description,
      hostName:      resolvedName,
      hostEmail:     senderEmail,
      senderEmail,
      senderPassword,
      meetingPurpose,
      companyName,
      meetingId,
      sequence:      Number(sequence) || 0,
      allAttendees,
    });
    emailSent = true;
  } catch (err) {
    emailError = err.message || "Unknown error";
    console.error("Meeting invite email failed:", emailError);
  }

  res.json({ success: true, emailSent, emailError });
});

// GET /api/meetings/rsvp — public endpoint clicked from email Accept/Decline buttons
router.get("/rsvp", async (req, res) => {
  const { id, action } = req.query;
  if (!id || !["accept", "decline", "reschedule"].includes(action)) {
    return res.status(400).send("<p>Invalid request.</p>");
  }

  const actionLabels = { accept: "Accepted", decline: "Declined", reschedule: "Reschedule Requested" };
  const actionColors = { accept: "#18b56f", decline: "#ff4d4d", reschedule: "#ff9800" };
  const actionIcons  = { accept: "✔", decline: "✖", reschedule: "📅" };
  const label = actionLabels[action];
  const color = actionColors[action];
  const icon  = actionIcons[action];

  try {
    // Log the RSVP response as an activity (no schema change needed)
    await supabase.from("activities").insert({
      type:        "note",
      title:       `Meeting RSVP: ${label}`,
      description: `Attendee responded "${label}" to meeting invite (ID: ${id})`,
      status:      "done",
      metadata:    { meeting_id: id, rsvp_action: action, responded_at: new Date().toISOString() },
    });
  } catch (_) {
    // Non-fatal — still show the confirmation page
  }

  // Return a branded confirmation page
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Meeting Response</title>
  <style>body{margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;}</style>
</head>
<body>
  <div style="background:#fff;border-radius:20px;padding:48px 40px;max-width:480px;width:90%;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,0.08);">
    <div style="font-size:26px;font-weight:700;color:#0a52ff;margin-bottom:24px;font-family:Arial,Helvetica,sans-serif;">CENTRIK</div>
    <div style="font-size:52px;margin-bottom:16px;">${icon}</div>
    <h1 style="font-size:24px;font-weight:700;color:${color};margin:0 0 12px 0;">${label}</h1>
    <p style="font-size:15px;color:#58627d;line-height:1.6;margin:0 0 28px 0;">
      ${action === "accept" ? "Thank you! Your response has been recorded. We look forward to the meeting." :
        action === "decline" ? "Thank you for letting us know. Your response has been recorded." :
        "Your request has been noted. Our team will reach out to reschedule."}
    </p>
    <div style="font-size:12px;color:#aaa;">Powered by Centrik CRM</div>
  </div>
</body>
</html>`);
});

// POST /api/meetings/cancel-invite — iCal CANCEL removes event from attendee calendars
router.post("/cancel-invite", authenticate, async (req, res) => {
  const {
    customerName, customerEmail, title, startTime, endTime,
    hostName, meetingId, sequence = 1, allAttendees = [],
  } = req.body;

  if (!customerEmail || !title || !startTime) {
    return res.status(400).json({ error: "customerEmail, title and startTime are required" });
  }

  const hostProfile    = await resolveHostProfile(req.profile.id);
  const senderEmail    = hostProfile.email            || null;
  const senderPassword = hostProfile.mail_app_password || null;
  const resolvedName   = hostName || hostProfile.full_name || "Ccentrik Team";

  // Send to primary recipient + all additional attendees
  const allRecipients = [
    ...(Array.isArray(customerEmail) ? customerEmail : [customerEmail]),
    ...allAttendees.map((a) => (typeof a === "string" ? a : a.email)).filter(Boolean),
  ];
  const uniqueRecipients = [...new Set(allRecipients.filter(Boolean))];

  let emailSent  = false;
  let emailError = null;
  try {
    await Promise.all(uniqueRecipients.map((email) =>
      sendMeetingCancellationEmail({
        to:           email,
        customerName: customerName || email,
        title,
        startTime,
        endTime,
        hostName:     resolvedName,
        hostEmail:    senderEmail,
        senderEmail,
        senderPassword,
        meetingId,
        sequence:     Number(sequence) || 1,
      })
    ));
    emailSent = true;
  } catch (err) {
    emailError = err.message || "Unknown error";
    console.error("Meeting cancellation email failed:", emailError);
  }

  res.json({ success: true, emailSent, emailError });
});

module.exports = router;
