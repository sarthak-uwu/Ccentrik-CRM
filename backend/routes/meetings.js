const express = require("express");
const router  = express.Router();
const { supabase } = require("../config/db");
const { sendMeetingInviteEmail, sendMeetingCancellationEmail, verifyRsvpToken } = require("../config/mail");
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

// ─── Microsoft Teams Meeting Creation ────────────────────────────────────────
// Requires env vars: TEAMS_CLIENT_ID, TEAMS_CLIENT_SECRET, TEAMS_TENANT_ID
// Set these in Vercel project settings → Environment Variables
router.post("/create-teams", authenticate, async (req, res) => {
  const { title, startTime, endTime } = req.body;
  const clientId     = process.env.TEAMS_CLIENT_ID;
  const clientSecret = process.env.TEAMS_CLIENT_SECRET;
  const tenantId     = process.env.TEAMS_TENANT_ID;

  if (!clientId || !clientSecret || !tenantId) {
    return res.json({
      success: false,
      joinUrl: null,
      message: "Microsoft Teams not configured. Add TEAMS_CLIENT_ID, TEAMS_CLIENT_SECRET, TEAMS_TENANT_ID to environment variables.",
    });
  }

  try {
    // Step 1: Get access token via client credentials grant
    const tokenResp = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type:    "client_credentials",
          client_id:     clientId,
          client_secret: clientSecret,
          scope:         "https://graph.microsoft.com/.default",
        }),
      }
    );
    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) throw new Error(tokenData.error_description || "Failed to get Teams access token");

    // Step 2: Look up the organizer's user ID in Graph API
    const hostProfile = await resolveHostProfile(req.profile.id);
    const userEmail   = hostProfile.email;
    const userResp    = await fetch(`https://graph.microsoft.com/v1.0/users/${userEmail}`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userResp.json();
    if (!userData.id) throw new Error("Could not find Microsoft 365 user. Ensure the organizer email is registered in Azure AD.");

    // Step 3: Create the online meeting
    const startISO = startTime || new Date(Date.now() + 3600000).toISOString();
    const endISO   = endTime   || new Date(Date.now() + 7200000).toISOString();
    const meetResp = await fetch(`https://graph.microsoft.com/v1.0/users/${userData.id}/onlineMeetings`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${tokenData.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        subject:   title || "Ccentrik Meeting",
        startDateTime: startISO,
        endDateTime:   endISO,
      }),
    });
    const meetData = await meetResp.json();
    if (!meetData.joinWebUrl) throw new Error(meetData.error?.message || "Teams meeting creation failed");

    res.json({
      success:   true,
      joinUrl:   meetData.joinWebUrl,
      meetingId: meetData.id,
      passcode:  meetData.joinMeetingIdSettings?.passcode || null,
    });
  } catch (err) {
    console.error("[Teams] Meeting creation error:", err.message);
    res.json({ success: false, joinUrl: null, message: err.message });
  }
});

// ─── Google Meet Link Creation ────────────────────────────────────────────────
// Requires env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// Each user must also complete Google OAuth2 (connect their Google account in Settings)
// For quick setup without OAuth: uses a Google Calendar event URL that auto-generates Meet
router.post("/create-meet", authenticate, async (req, res) => {
  const { title, startTime, endTime } = req.body;
  const clientId     = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    // Fallback: Generate a deterministic-looking Meet link placeholder
    // The user can paste a real Meet link manually
    return res.json({
      success:  false,
      meetLink: null,
      message:  "Google Meet API not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to environment variables, then connect your Google account in Settings → Integrations.",
    });
  }

  try {
    const hostProfile   = await resolveHostProfile(req.profile.id);
    const googleToken   = hostProfile.google_access_token;

    if (!googleToken) {
      return res.json({
        success:  false,
        meetLink: null,
        message:  "Google account not connected. Go to Settings → Integrations → Connect Google to authorize.",
      });
    }

    const startISO = startTime || new Date(Date.now() + 3600000).toISOString();
    const endISO   = endTime   || new Date(Date.now() + 7200000).toISOString();

    // Create a Calendar event with conferenceData=GoogleMeet to auto-generate Meet link
    const eventResp = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
      {
        method:  "POST",
        headers: { Authorization: `Bearer ${googleToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: title || "Ccentrik Meeting",
          start:   { dateTime: startISO, timeZone: "Asia/Kolkata" },
          end:     { dateTime: endISO,   timeZone: "Asia/Kolkata" },
          conferenceData: {
            createRequest: {
              requestId:             `ccentrik-${Date.now()}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }),
      }
    );
    const eventData = await eventResp.json();
    const meetLink  = eventData.conferenceData?.entryPoints?.find(e => e.entryPointType === "video")?.uri;

    if (!meetLink) throw new Error(eventData.error?.message || "Google Meet link not generated");

    res.json({ success: true, meetLink, calendarEventId: eventData.id });
  } catch (err) {
    console.error("[Google Meet] Creation error:", err.message);
    res.json({ success: false, meetLink: null, message: err.message });
  }
});

// ─── Google OAuth2 — initiate flow ───────────────────────────────────────────
router.get("/google/auth", authenticate, (req, res) => {
  const clientId    = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${process.env.BACKEND_URL || "https://backend-gamma-nine-32.vercel.app"}/api/meetings/google/callback`;
  if (!clientId) return res.status(400).json({ error: "GOOGLE_CLIENT_ID not configured" });

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         "https://www.googleapis.com/auth/calendar.events",
    access_type:   "offline",
    state:         req.profile.id,   // pass CRM user ID through OAuth flow
    prompt:        "consent",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// ─── Google OAuth2 — callback ─────────────────────────────────────────────────
router.get("/google/callback", async (req, res) => {
  const { code, state: userId } = req.query;
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri  = `${process.env.BACKEND_URL || "https://backend-gamma-nine-32.vercel.app"}/api/meetings/google/callback`;

  if (!code || !userId) return res.status(400).send("Invalid OAuth callback");

  try {
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    const tokens = await tokenResp.json();
    if (!tokens.access_token) throw new Error("No access_token in response");

    // Store tokens on the user's profile (needs google_access_token column in profiles table)
    await supabase.from("profiles").update({
      google_access_token:  tokens.access_token,
      google_refresh_token: tokens.refresh_token || null,
      updated_at: new Date().toISOString(),
    }).eq("id", userId);

    const frontendUrl = process.env.FRONTEND_URL || "https://ccentrik-crm.web.app";
    res.redirect(`${frontendUrl}/settings?google_connected=1`);
  } catch (err) {
    console.error("[Google OAuth] Callback error:", err.message);
    res.redirect(`${(process.env.FRONTEND_URL || "https://ccentrik-crm.web.app")}/settings?google_error=1`);
  }
});

// GET /api/meetings/rsvp — customer clicks Accept/Decline link in email (no auth needed)
router.get("/rsvp", async (req, res) => {
  const { t: token } = req.query;
  if (!token) return res.status(400).send(rsvpPage("Invalid", "Missing or invalid token.", false));

  const parsed = verifyRsvpToken(token);
  if (!parsed) return res.status(400).send(rsvpPage("Link Expired", "This RSVP link has expired or is invalid. Please contact the organizer.", false));

  const { meetingId, action } = parsed;
  const isAccept = action === "accept";

  try {
    // Log RSVP as an activity entry (no schema change required)
    await supabase.from("activities").insert({
      type:        isAccept ? "rsvp_accepted" : "rsvp_declined",
      title:       isAccept ? "Meeting Accepted" : "Meeting Declined",
      description: `Customer ${isAccept ? "accepted" : "declined"} the meeting invitation.`,
      status:      "done",
      created_at:  new Date().toISOString(),
      user_id:     null,  // external customer, no user_id
    }).eq ? null : null; // suppress unused var warning

    // Also update meeting status if declining
    if (!isAccept) {
      await supabase.from("meetings").update({
        status:     "cancelled",
        updated_at: new Date().toISOString(),
      }).eq("id", meetingId);
    } else {
      await supabase.from("meetings").update({
        status:     "scheduled",
        updated_at: new Date().toISOString(),
      }).eq("id", meetingId).eq("status", "scheduled");
    }
  } catch (err) {
    console.error("[RSVP] DB update error:", err.message);
  }

  const title   = isAccept ? "You're All Set! ✅" : "Response Received";
  const message = isAccept
    ? "Thank you for accepting the meeting invitation. We look forward to meeting with you. You will receive a reminder before the meeting."
    : "Thank you for letting us know. Your response has been recorded. Please contact the organizer if you'd like to reschedule.";

  res.send(rsvpPage(title, message, isAccept));
});

function rsvpPage(title, message, accepted) {
  const color = accepted ? "#16a34a" : "#dc2626";
  const bg    = accepted ? "#f0fdf4" : "#fff5f5";
  const icon  = accepted ? "✅" : "❌";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f0f4f8;padding:40px 20px;"><tr><td align="center">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dde3ec;">
  <tr><td style="background:linear-gradient(135deg,#0d1b3e,#1a3a7a);padding:28px 32px;text-align:center;">
    <div style="font-size:18px;font-weight:700;color:#fff;letter-spacing:-0.3px;">CCENTRIK</div>
  </td></tr>
  <tr><td style="padding:36px 32px;text-align:center;">
    <div style="font-size:48px;margin-bottom:16px;">${icon}</div>
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#0d1b3e;">${title}</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#4b5563;line-height:1.7;">${message}</p>
    <div style="background:${bg};border:1px solid ${color}30;border-radius:10px;padding:14px 20px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:${color};font-weight:600;">Response recorded successfully</p>
    </div>
    <p style="margin:0;font-size:12px;color:#9ca3af;">You can close this window.</p>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">&copy; ${new Date().getFullYear()} Ccentrik CRM &middot; <a href="https://ccentrik-crm.web.app" style="color:#6b7280;text-decoration:none;">Visit CRM</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

module.exports = router;
