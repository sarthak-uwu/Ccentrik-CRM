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
