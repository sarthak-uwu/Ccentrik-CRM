const { Resend } = require("resend");
const nodemailer  = require("nodemailer"); // kept for per-user meeting SMTP only
const crypto      = require("crypto");

// ─── Resend (primary transport — proper DKIM/SPF, inbox delivery) ─────────────
const resend    = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
// Company email used as the authoritative FROM address across all transports
const COMPANY_EMAIL = process.env.GMAIL_USER || process.env.MAIL_USER || process.env.RESEND_FROM || "sarthak.tyagi@ccentrik.com";
const FROM_ADDR = process.env.RESEND_FROM || COMPANY_EMAIL;
const FROM_NAME = process.env.MAIL_FROM_NAME || "Ccentrik CRM";
const FROM      = `${FROM_NAME} <${FROM_ADDR}>`;

// ─── Global SMTP transport (company email — ccentrik.com) ─────────────────────
// GMAIL_USER/GMAIL_PASS takes priority; falls back to MAIL_USER/MAIL_PASS
const SMTP_USER = process.env.GMAIL_USER || process.env.MAIL_USER;
const SMTP_PASS = process.env.GMAIL_PASS || process.env.MAIL_PASS;
const GLOBAL_SMTP_HOST = process.env.MAIL_SMTP_HOST || "smtp.gmail.com";
const GLOBAL_SMTP_PORT = Number(process.env.MAIL_SMTP_PORT) || 465;
const globalTransport  = (SMTP_USER && SMTP_PASS)
  ? nodemailer.createTransport({
      host:   GLOBAL_SMTP_HOST,
      port:   GLOBAL_SMTP_PORT,
      secure: GLOBAL_SMTP_PORT === 465,
      auth:   { user: SMTP_USER, pass: SMTP_PASS },
      tls:    { rejectUnauthorized: false },
    })
  : null;

const APP_URL = process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes("localhost")
  ? process.env.FRONTEND_URL
  : "https://ccentrik-crm.web.app";

function baseLayout(title, bodyHtml, { badgeColor = "#2563EB", badgeBg = "#EFF6FF", badgeBorder = "#BFDBFE" } = {}) {
  const LOGO = "https://ccentrik-crm.web.app/logo-blue.png";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F7FA;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB;">

        <!-- Top accent stripe -->
        <tr><td style="height:3px;background:${badgeColor};font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Header: logo + badge -->
        <tr><td style="padding:22px 36px;border-bottom:1px solid #E5E7EB;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
            <td><img src="${LOGO}" alt="CCENTRIK" height="26" style="display:block;border:0;" /></td>
            <td align="right">
              <span style="display:inline-block;padding:4px 14px;background:${badgeBg};border:1px solid ${badgeBorder};border-radius:100px;font-size:11px;font-weight:700;color:${badgeColor};letter-spacing:0.05em;text-transform:uppercase;">${title}</span>
            </td>
          </tr></table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px;">
          ${bodyHtml}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#F9FAFB;padding:20px 36px;border-top:1px solid #E5E7EB;border-radius:0 0 16px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
            <td>
              <p style="margin:0;font-size:11.5px;color:#9CA3AF;line-height:1.7;">&#169; ${new Date().getFullYear()} CCENTRIK &nbsp;&middot;&nbsp; Automated &nbsp;&middot;&nbsp; Do not reply</p>
            </td>
            <td align="right">
              <a href="https://www.ccentrik.com" style="font-size:11.5px;color:#9CA3AF;text-decoration:none;">ccentrik.com</a>
            </td>
          </tr></table>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function credentialBox(rows) {
  const cells = rows.map(([label, value, mono], i, arr) => {
    const isLast = i === arr.length - 1;
    const borderStyle = isLast ? "" : "border-bottom:1px solid #F3F4F6;";
    return `
    <tr>
      <td style="padding:12px 18px;${borderStyle}font-size:12px;color:#6B7280;font-weight:500;width:38%;white-space:nowrap;vertical-align:middle;">${label}</td>
      <td style="padding:12px 18px;${borderStyle}font-size:13px;font-weight:600;color:#111827;vertical-align:middle;${mono ? "font-family:'Courier New',Courier,monospace;background:#F0F4FF;border-left:3px solid #BFDBFE;letter-spacing:0.03em;" : ""}">${value}</td>
    </tr>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;margin:20px 0;overflow:hidden;">${cells}</table>`;
}

function ctaButton(label, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:24px 0 20px;">
    <tr><td style="background:#2563EB;border-radius:10px;">
      <a href="${url}" style="display:block;padding:14px 28px;font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;text-align:center;border-radius:10px;">${label} &rarr;</a>
    </td></tr>
  </table>`;
}

function warningBox(text) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
    <tr><td style="background:#FFFBEB;border:1px solid #FDE68A;border-left:3px solid #F59E0B;border-radius:8px;padding:12px 16px;font-size:13px;color:#92400E;">
      &#9888;&#65039; ${text}
    </td></tr>
  </table>`;
}

const sendMail = async ({ to, subject, html, text, replyTo }) => {
  if (!resend) {
    console.warn("[sendMail] RESEND_API_KEY not set — email skipped:", subject);
    return { skipped: true };
  }
  const result = await resend.emails.send({
    from:    FROM,
    to:      Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
    ...(replyTo ? { reply_to: replyTo } : {}),
  });
  if (result.error) throw new Error(result.error.message || "Resend send failed");
  return result;
};

// ─── Welcome / Invitation ─────────────────────────────────────────────────────

const sendWelcomeEmail = async ({ to, name, tempPassword, role, invitedBy, inviterEmail }) => {
  const displayEmail = to;
  const roleLabel = role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const fromName   = invitedBy ? `${invitedBy} (Ccentrik CRM)` : "Ccentrik CRM";

  const html = baseLayout("Team Invitation", `
    <!-- Icon hero -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr><td style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:14px;padding:24px;text-align:center;">
        <div style="width:52px;height:52px;background:#2563EB;border-radius:14px;margin:0 auto 14px;text-align:center;line-height:52px;font-size:24px;">&#127881;</div>
        <h1 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#111827;">Welcome, ${name}!</h1>
        <p style="margin:0;font-size:13.5px;color:#3B82F6;font-weight:500;">You've been added to the CCENTRIK workspace${invitedBy ? ` by ${invitedBy}` : ""}.</p>
      </td></tr>
    </table>
    <p style="margin:0 0 6px;font-size:14px;color:#475569;line-height:1.7;">Your account is ready. Use the credentials below to sign in and get started.</p>
    ${credentialBox([
      ["Login Email", displayEmail, false],
      ["Temporary Password", tempPassword, true],
      ["Your Role", roleLabel, false],
      ...(inviterEmail ? [["Invited By", inviterEmail, false]] : []),
    ])}
    ${ctaButton("Login to CCENTRIK", `${APP_URL}/login`)}
    ${warningBox("Change your password immediately after your first login.")}
  `);

  const text = `Hi ${name},\n\nYou've been added to Ccentrik CRM${invitedBy ? ` by ${invitedBy}` : ""}.\n\nLogin Email: ${displayEmail}\nTemporary Password: ${tempPassword}\nRole: ${roleLabel}\n\nLogin at: ${APP_URL}/login\n\nChange your password after first login.\n\n— Ccentrik CRM`;

  const subject = "Welcome to Ccentrik CRM — Your Account is Ready";

  // Try Resend first; fall back to SMTP globalTransport if Resend fails or is not configured
  try {
    return await sendMail({ to, subject, html, text, replyTo: inviterEmail });
  } catch (resendErr) {
    console.warn("[sendWelcomeEmail] Resend failed:", resendErr.message, "| RESEND_API_KEY:", process.env.RESEND_API_KEY ? "SET" : "MISSING");
  }

  if (globalTransport) {
    return globalTransport.sendMail({
      from: FROM,
      to,
      subject,
      html,
      text,
      ...(inviterEmail ? { replyTo: inviterEmail } : {}),
    });
  }

  throw new Error("Email delivery failed: no working transport (check RESEND_API_KEY or GMAIL_USER/GMAIL_PASS env vars)");
};

// ─── Password Reset ───────────────────────────────────────────────────────────

const sendPasswordResetEmail = async ({ to, name, resetLink, expiresInMinutes = 60 }) => {
  const html = baseLayout("Password Reset", `
    <!-- Icon hero -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr><td style="text-align:center;">
        <div style="width:52px;height:52px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:14px;margin:0 auto 14px;text-align:center;line-height:52px;font-size:24px;">&#128274;</div>
        <h1 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#111827;">Reset your password</h1>
        <p style="margin:0;font-size:13.5px;color:#6B7280;">Hi <strong style="color:#111827;">${name || "there"}</strong> — we received a reset request for your account.</p>
      </td></tr>
    </table>
    <p style="margin:0 0 22px;font-size:14px;color:#475569;line-height:1.7;">
      Click the button below to set a new password. This link expires in <strong style="color:#111827;">${expiresInMinutes} minutes</strong>.
    </p>
    ${ctaButton("Reset My Password", resetLink)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
      <tr><td style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:14px 18px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.05em;">Link (if button doesn't work)</p>
        <p style="margin:0;font-size:12px;color:#2563EB;word-break:break-all;line-height:1.6;">${resetLink}</p>
      </td></tr>
    </table>
    <p style="margin:20px 0 0;font-size:12.5px;color:#9CA3AF;text-align:center;line-height:1.6;">
      Didn't request this? You can safely ignore this email — your password won't change.
    </p>
  `);

  const text = `Hi ${name || "there"},\n\nWe received a request to reset your The CCENTRIK password.\n\nReset link:\n${resetLink}\n\nExpires in ${expiresInMinutes} minutes. If you didn't request this, ignore this email.\n\n— The CCENTRIK`;

  return sendMail({ to, subject: "Reset Your Password – The CCENTRIK", html, text });
};

// ─── System Notification ──────────────────────────────────────────────────────

const sendNotificationEmail = async ({ to, name, subject, title, message, ctaLabel, ctaUrl }) => {
  const buttonHtml = ctaLabel && ctaUrl ? ctaButton(ctaLabel, ctaUrl) : "";

  const html = baseLayout(title || subject, `
    <p style="margin:0 0 10px;font-size:14px;color:#111827;">Hi <strong>${name || "there"}</strong>,</p>
    <div style="font-size:14px;color:#475569;line-height:1.75;margin:0 0 20px;">${message}</div>
    ${buttonHtml}
  `);

  const text = `Hi ${name || "there"},\n\n${message}${ctaUrl ? `\n\n${ctaLabel || "Open"}: ${ctaUrl}` : ""}\n\n— The CCENTRIK`;

  return sendMail({ to, subject, html, text });
};

// ─── Sensitive Field Edit Alert ───────────────────────────────────────────────

const sendSensitiveFieldAlert = async ({ to, toName, editorName, editorRole, leadName, companyName, editedFields }) => {
  const roleLabel = (editorRole || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const alertFieldsHtml = editedFields.map((f, i, arr) => {
    const isLast = i === arr.length - 1;
    return `<tr><td style="padding:10px 18px;${isLast ? "" : "border-bottom:1px solid #FEE2E2;"}font-size:13.5px;color:#991B1B;font-weight:500;">&#9679;&nbsp; ${f}</td></tr>`;
  }).join("");

  const html = baseLayout("Security Alert", `
    <!-- Red alert banner -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr><td style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:18px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
          <td style="font-size:22px;padding-right:14px;">&#128721;</td>
          <td>
            <p style="margin:0;font-size:13.5px;font-weight:700;color:#991B1B;">Restricted fields were edited</p>
            <p style="margin:3px 0 0;font-size:12.5px;color:#B91C1C;line-height:1.5;">A team member modified sensitive contact data on a lead in CCENTRIK.</p>
          </td>
        </tr></table>
      </td></tr>
    </table>
    <p style="margin:0 0 6px;font-size:14px;color:#111827;">Hi <strong>${toName || "Admin"}</strong>,</p>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.7;">The following lead record was modified. Please review the changes below.</p>
    ${credentialBox([
      ["Lead / Company", `${companyName || leadName}`, false],
      ["Edited by", editorName, false],
      ["Role", roleLabel, false],
    ])}
    <p style="margin:20px 0 8px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;">Fields Changed</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;overflow:hidden;margin-bottom:20px;">
      ${alertFieldsHtml}
    </table>
    ${ctaButton("Review Lead Record", `${APP_URL}/leads`)}
    ${warningBox("If this edit was unauthorised, contact your administrator immediately and revoke the user's access.")}
  `, { badgeColor: "#DC2626", badgeBg: "#FEF2F2", badgeBorder: "#FECACA" });

  const text = `Hi ${toName || "Admin"},\n\n${editorName} (${roleLabel}) edited restricted fields on "${companyName || leadName}".\n\nFields: ${editedFields.join(", ")}\n\nReview: ${APP_URL}/leads\n\n— The CCENTRIK`;

  return sendMail({ to, subject: `Sensitive lead data changed by ${editorName}`, html, text });
};

// ─── iCalendar generator (RFC 5545 + RFC 5546 iTIP) ──────────────────────────

function generateICS({ uid, sequence = 0, method = "REQUEST", title, startTime, endTime, organizerName, organizerEmail, attendees = [], location, description, meetingLink }) {
  // RFC 5545 §3.1: fold lines longer than 75 octets
  const fold = (line) => {
    if (!line || line.length <= 75) return line;
    let out = "", pos = 0;
    while (pos < line.length) {
      const chunk = pos === 0 ? 75 : 74;
      out += (pos > 0 ? "\r\n " : "") + line.slice(pos, pos + chunk);
      pos += chunk;
    }
    return out;
  };
  // RFC 5545 §3.3.11: escape TEXT
  const esc = (s) => (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  // UTC datetime format: 20260524T093000Z
  const fmtDT = (d) => new Date(d).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const safeEnd = endTime || new Date(new Date(startTime).getTime() + 3600000).toISOString();
  const locVal  = location || meetingLink || null;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ccentrik CRM//Meeting//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    fold(`UID:${uid}`),
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${fmtDT(new Date())}`,
    `DTSTART:${fmtDT(startTime)}`,
    `DTEND:${fmtDT(safeEnd)}`,
    fold(`SUMMARY:${esc(title)}`),
    description ? fold(`DESCRIPTION:${esc(description)}`) : null,
    locVal       ? fold(`LOCATION:${esc(locVal)}`)            : null,
    meetingLink  ? fold(`URL:${meetingLink}`)                  : null,
    fold(`ORGANIZER;CN="${esc(organizerName)}":MAILTO:${organizerEmail}`),
    ...attendees.map((a) => fold(`ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="${esc(a.name || a.email)}":MAILTO:${a.email}`)),
    method === "CANCEL" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    // 30-minute display alarm
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    fold(`DESCRIPTION:Upcoming: ${esc(title)}`),
    "END:VALARM",
    // 1-day display alarm
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    fold(`DESCRIPTION:Tomorrow: ${esc(title)}`),
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return lines.join("\r\n");
}

// ─── Meeting Invite — uses the scheduling user's own SMTP ────────────────────
// ─── RSVP token helpers (HMAC-signed, no DB needed) ─────────────────────────
const RSVP_SECRET = process.env.RSVP_SECRET || "ccentrik-rsvp-secret-2024";
function generateRsvpToken(meetingId, action, expiresAt) {
  const data = `${meetingId}|${action}|${expiresAt}`;
  const sig  = crypto.createHmac("sha256", RSVP_SECRET).update(data).digest("hex").slice(0, 20);
  return Buffer.from(`${data}|${sig}`).toString("base64url");
}
function verifyRsvpToken(token) {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const parts   = decoded.split("|");
    if (parts.length !== 4) return null;
    const [meetingId, action, expiresAt, sig] = parts;
    if (Date.now() > Number(expiresAt)) return null;
    const data = `${meetingId}|${action}|${expiresAt}`;
    const exp  = crypto.createHmac("sha256", RSVP_SECRET).update(data).digest("hex").slice(0, 20);
    if (sig !== exp) return null;
    return { meetingId, action };
  } catch { return null; }
}

const sendMeetingInviteEmail = async ({ to, customerName, title, startTime, endTime, meetingType, meetingLink, location, mapsUrl, description, hostName, hostTitle, hostEmail, senderEmail, senderPassword, meetingPurpose, companyName, meetingId, sequence = 0, allAttendees = [] }) => {
  // Per-user transport only — per-user SMTP is resolved later when choosing send path
  const isOnline  = meetingType !== "in_person" && meetingType !== "in-person";
  const typeLabel = meetingType === "google_meet" ? "Google Meet"
    : meetingType === "teams"     ? "Microsoft Teams"
    : meetingType === "jitsi"     ? "Jitsi Meet"
    : isOnline                    ? "Online Meeting"
    : "In-Person Meeting";

  const purposeLabels = {
    follow_up: "Follow-up", discovery: "Discovery Call", demo: "Product Demo",
    negotiation: "Negotiation", proposal: "Proposal Discussion", requirements: "Requirement Gathering",
    onboarding: "Onboarding", support: "Support Meeting", internal: "Internal Discussion",
    presentation: "Client Presentation", payment: "Payment Discussion", closing: "Closing Discussion",
  };
  const purposeLabel = meetingPurpose ? (purposeLabels[meetingPurpose] || meetingPurpose) : null;

  const dateStr = new Date(startTime).toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Kolkata",
  });
  const timeStr = new Date(startTime).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
  });
  const endTimeStr = endTime
    ? new Date(endTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })
    : null;

  // Compute duration
  const durationMins = endTime ? Math.round((new Date(endTime) - new Date(startTime)) / 60000) : null;
  const durationStr  = durationMins
    ? durationMins < 60 ? `${durationMins} min` : `${Math.floor(durationMins / 60)}h${durationMins % 60 ? ` ${durationMins % 60}m` : ""}`
    : null;

  const LOGO = "https://ccentrik-crm.web.app/logo-blue.png";

  // Google Calendar quick-add URL for the email CTA button (for the recipient, not the CRM user)
  const gcalUrl = (() => {
    const fmt = (d) => new Date(d).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const p = new URLSearchParams({
      action: "TEMPLATE",
      text: title || "Meeting",
      dates: `${fmt(startTime)}/${fmt(endTime || new Date(new Date(startTime).getTime() + 3600000))}`,
      details: [description, meetingLink ? `Join: ${meetingLink}` : ""].filter(Boolean).join("\n\n") || `Meeting with ${hostName || "Ccentrik"}`,
      location: location || meetingLink || "",
    });
    const recipient = Array.isArray(to) ? to[0] : to;
    if (recipient) p.append("add", recipient);
    return `https://calendar.google.com/calendar/render?${p.toString()}`;
  })();

  const isOnlineMeeting = meetingType !== "in_person" && meetingType !== "in-person";
  const typeLabel = meetingType === "google_meet" ? "Google Meet"
    : meetingType === "teams"     ? "Microsoft Teams"
    : meetingType === "jitsi"     ? "Jitsi Meet"
    : isOnlineMeeting             ? "Online Meeting"
    : "In-Person Meeting";

  const purposeLabels = {
    follow_up: "Follow-up", discovery: "Discovery Call", demo: "Product Demo",
    negotiation: "Negotiation", proposal: "Proposal Discussion", requirements: "Requirement Gathering",
    onboarding: "Onboarding", support: "Support Meeting", internal: "Internal Discussion",
    presentation: "Client Presentation", payment: "Payment Discussion", closing: "Closing Discussion",
  };
  const purposeLabel = meetingPurpose ? (purposeLabels[meetingPurpose] || meetingPurpose) : null;

  const dateStr = new Date(startTime).toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Kolkata",
  });
  const timeStr = new Date(startTime).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
  });
  const endTimeStr = endTime
    ? new Date(endTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })
    : null;
  const durationMins = endTime ? Math.round((new Date(endTime) - new Date(startTime)) / 60000) : null;
  const durationStr  = durationMins
    ? durationMins < 60 ? `${durationMins} min` : `${Math.floor(durationMins / 60)}h${durationMins % 60 ? ` ${durationMins % 60}m` : ""}`
    : null;

  const dayFull = new Date(startTime).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric", weekday: "long", timeZone: "Asia/Kolkata",
  });

  const LOGO       = "https://ccentrik-crm.web.app/logo-blue.png";
  const BACKEND    = process.env.BACKEND_URL || "https://backend-gamma-nine-32.vercel.app";

  // Google Calendar quick-add
  const gcalUrl = (() => {
    const fmt = (d) => new Date(d).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const p = new URLSearchParams({
      action: "TEMPLATE",
      text: title || "Meeting",
      dates: `${fmt(startTime)}/${fmt(endTime || new Date(new Date(startTime).getTime() + 3600000))}`,
      details: [description, meetingLink ? `Join: ${meetingLink}` : ""].filter(Boolean).join("\n\n") || `Meeting with ${hostName || "Ccentrik"}`,
      location: location || meetingLink || "",
    });
    return `https://calendar.google.com/calendar/render?${p.toString()}`;
  })();

  // Outlook Calendar quick-add
  const outlookUrl = (() => {
    const fmt = (d) => new Date(d).toISOString();
    const p = new URLSearchParams({
      path:      "/calendar/action/compose",
      rru:       "addevent",
      subject:   title || "Meeting",
      startdt:   fmt(startTime),
      enddt:     fmt(endTime || new Date(new Date(startTime).getTime() + 3600000)),
      body:      [description, meetingLink ? `Join: ${meetingLink}` : ""].filter(Boolean).join("\n\n") || `Meeting with ${hostName || "Ccentrik"}`,
      location:  location || meetingLink || "",
    });
    return `https://outlook.live.com/calendar/0/deeplink/compose?${p.toString()}`;
  })();

  // Google Maps URL
  const effectiveMapsUrl = mapsUrl || (location && !isOnlineMeeting ? `https://maps.google.com/?q=${encodeURIComponent(location)}` : null);

  // RSVP tokens (expire 2h after meeting start)
  const rsvpExpiry      = new Date(startTime).getTime() + 2 * 3600000;
  const acceptToken     = meetingId ? generateRsvpToken(meetingId, "accept",  rsvpExpiry) : null;
  const declineToken    = meetingId ? generateRsvpToken(meetingId, "decline", rsvpExpiry) : null;
  const acceptUrl       = acceptToken  ? `${BACKEND}/api/meetings/rsvp?t=${acceptToken}`  : null;
  const declineUrl      = declineToken ? `${BACKEND}/api/meetings/rsvp?t=${declineToken}` : null;

  // "Respond by" — 24 h before meeting start
  const respondByDate   = new Date(new Date(startTime).getTime() - 86400000);
  const respondByStr    = respondByDate.toLocaleString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
  }) + " IST";

  const participantCount = allAttendees.filter(a => a && (a.email || typeof a === "string")).length;
  const participantEmail = allAttendees.length > 0
    ? (allAttendees[0]?.email || (typeof allAttendees[0] === "string" ? allAttendees[0] : null))
    : null;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Meeting Invitation – ${title}</title>
</style>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f0f4f8;padding:24px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dde3ec;">

<!-- ══ TOP BAR: logo + badge ══ -->
<tr><td style="padding:18px 28px;border-bottom:1px solid #e8edf3;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr valign="middle">
    <td><img src="${LOGO}" alt="Ccentrik" height="24" style="display:block;border:0;"/></td>
    <td align="right">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr valign="middle">
        <td style="background:#e8f0fe;border:1px solid #b8d0fd;border-radius:20px;padding:5px 12px;">
          <span style="font-size:11px;font-weight:600;color:#1a4fd6;letter-spacing:0.3px;">&#128197; Meeting Invitation</span>
        </td>
      </tr></table>
    </td>
  </tr></table>
</td></tr>

<!-- ══ HERO: dark navy header ══ -->
<tr><td style="background:linear-gradient(135deg,#0d1b3e 0%,#102560 60%,#1a3a7a 100%);padding:36px 28px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
    <!-- Left: hero text -->
    <td width="56%" valign="top">
      <h1 style="margin:0 0 10px;font-size:30px;font-weight:800;color:#ffffff;line-height:1.15;">You're Invited<br/>to a Meeting</h1>
      <p style="margin:0;font-size:13px;color:#a8c4e8;line-height:1.65;">Ccentrik CRM has scheduled a meeting with you. Please review the details below and respond.</p>
    </td>
    <!-- Right: calendar graphic -->
    <td width="44%" align="right" valign="middle">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-left:auto;">
        <tr><td style="background:#ffffff;border-radius:14px;overflow:hidden;width:130px;box-shadow:0 8px 28px rgba(0,0,0,0.3);">
          <div style="background:#1a4fd6;padding:7px 12px;text-align:center;">
            <div style="font-size:9px;font-weight:700;color:#a0c0ff;text-transform:uppercase;letter-spacing:1.5px;">${new Date(startTime).toLocaleString("en-US",{month:"long",timeZone:"Asia/Kolkata"})}</div>
          </div>
          <div style="padding:14px 12px 12px;text-align:center;">
            <div style="font-size:44px;font-weight:800;color:#0d1b3e;line-height:1;">${new Date(startTime).toLocaleString("en-US",{day:"numeric",timeZone:"Asia/Kolkata"})}</div>
            <div style="font-size:9px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-top:3px;">${new Date(startTime).toLocaleString("en-US",{weekday:"long",timeZone:"Asia/Kolkata"})}</div>
            <div style="margin-top:8px;padding-top:7px;border-top:1px solid #f0f4f8;font-size:10px;color:#1a4fd6;font-weight:700;">${timeStr}${endTimeStr ? ` – ${endTimeStr}` : ""}</div>
            <div style="font-size:9px;color:#aaa;margin-top:2px;">IST</div>
            <div style="margin-top:10px;font-size:9px;font-weight:700;color:#1a4fd6;letter-spacing:0.5px;">CCENTRIK</div>
          </div>
        </td></tr>
      </table>
    </td>
  </tr></table>
</td></tr>

<!-- ══ BODY ══ -->
<tr><td style="padding:28px 28px 24px;">

  <!-- Greeting -->
  <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0d1b3e;">Hello, &#128075;</p>
  <p style="margin:0 0 22px;font-size:13.5px;color:#4b5563;line-height:1.65;">You have been invited to the following meeting. Please review the details and let us know if you'll be able to attend.</p>

  ${(acceptUrl && declineUrl) ? `
  <!-- RSVP Buttons -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:16px;">
    <tr>
      <td width="48%" style="padding-right:6px;">
        <a href="${acceptUrl}" target="_blank" style="display:block;background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:14px 10px;text-decoration:none;text-align:center;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;"><tr valign="middle">
            <td style="width:26px;height:26px;background:#16a34a;border-radius:50%;text-align:center;line-height:26px;font-size:13px;color:#fff;">&#10003;</td>
            <td style="padding-left:8px;">
              <div style="font-size:13px;font-weight:700;color:#15803d;">Accept Meeting</div>
              <div style="font-size:11px;color:#4ade80;margin-top:1px;">I'll be there</div>
            </td>
          </tr></table>
        </a>
      </td>
      <td width="48%" style="padding-left:6px;">
        <a href="${declineUrl}" target="_blank" style="display:block;background:#fff5f5;border:1.5px solid #fca5a5;border-radius:10px;padding:14px 10px;text-decoration:none;text-align:center;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;"><tr valign="middle">
            <td style="width:26px;height:26px;background:#dc2626;border-radius:50%;text-align:center;line-height:26px;font-size:13px;color:#fff;">&#10007;</td>
            <td style="padding-left:8px;">
              <div style="font-size:13px;font-weight:700;color:#dc2626;">Decline Meeting</div>
              <div style="font-size:11px;color:#f87171;margin-top:1px;">I won't be able to attend</div>
            </td>
          </tr></table>
        </a>
      </td>
    </tr>
  </table>

  <!-- Respond by -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:22px;">
    <tr><td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:9px 14px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr valign="middle">
        <td style="font-size:13px;color:#3b82f6;padding-right:6px;">&#9432;</td>
        <td style="font-size:12.5px;color:#475569;">Please respond by <strong style="color:#1d4ed8;">${respondByStr}</strong></td>
      </tr></table>
    </td></tr>
  </table>` : ""}

  <!-- Meeting Details card -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1.5px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:20px;">
    <tr><td style="background:#f8fafc;padding:14px 18px;border-bottom:1px solid #e2e8f0;">
      <span style="font-size:13px;font-weight:700;color:#0d1b3e;">Meeting Details</span>
    </td></tr>
    <!-- Meeting Title row -->
    <tr><td style="padding:0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td width="50" style="padding:14px 10px 14px 18px;vertical-align:top;">
            <div style="width:34px;height:34px;background:#1a4fd6;border-radius:8px;text-align:center;line-height:34px;font-size:16px;">&#128197;</div>
          </td>
          <td style="padding:14px 18px 14px 8px;vertical-align:top;">
            <div style="font-size:11px;color:#9ca3af;font-weight:500;margin-bottom:3px;">Meeting Title</div>
            <div style="font-size:13.5px;font-weight:600;color:#111827;">${title}</div>
          </td>
        </tr>
        <!-- Date & Time -->
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td width="50" style="padding:14px 10px 14px 18px;vertical-align:top;">
            <div style="width:34px;height:34px;background:#1a4fd6;border-radius:8px;text-align:center;line-height:34px;font-size:16px;">&#128336;</div>
          </td>
          <td style="padding:14px 18px 14px 8px;vertical-align:top;">
            <div style="font-size:11px;color:#9ca3af;font-weight:500;margin-bottom:3px;">Date &amp; Time</div>
            <div style="font-size:13.5px;font-weight:600;color:#111827;">${dayFull}</div>
            <div style="font-size:13px;color:#374151;margin-top:2px;">${timeStr}${endTimeStr ? ` &ndash; ${endTimeStr}` : ""} IST${durationStr ? ` &middot; ${durationStr}` : ""}</div>
          </td>
        </tr>
        <!-- Location / Link -->
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td width="50" style="padding:14px 10px 14px 18px;vertical-align:top;">
            <div style="width:34px;height:34px;background:#1a4fd6;border-radius:8px;text-align:center;line-height:34px;font-size:16px;">${isOnlineMeeting ? "&#128249;" : "&#128205;"}</div>
          </td>
          <td style="padding:14px 18px 14px 8px;vertical-align:top;">
            <div style="font-size:11px;color:#9ca3af;font-weight:500;margin-bottom:3px;">${isOnlineMeeting ? "Meeting Link" : "Location"}</div>
            ${meetingLink ? `<a href="${meetingLink}" target="_blank" style="font-size:13.5px;font-weight:600;color:#1a4fd6;text-decoration:none;word-break:break-all;">${typeLabel}</a>
            <div style="margin-top:4px;"><a href="${meetingLink}" target="_blank" style="font-size:12px;color:#3b82f6;text-decoration:none;font-weight:500;">&#9654; Join Meeting</a></div>`
            : location ? `<div style="font-size:13.5px;font-weight:600;color:#111827;">${location}</div>
            ${effectiveMapsUrl ? `<div style="margin-top:4px;"><a href="${effectiveMapsUrl}" target="_blank" style="font-size:12px;color:#3b82f6;text-decoration:none;font-weight:500;">&#128205; View on Google Maps</a></div>` : ""}`
            : `<div style="font-size:13px;color:#6b7280;">—</div>`}
          </td>
        </tr>
        <!-- Reason for Meeting -->
        ${(description || purposeLabel) ? `<tr style="border-bottom:1px solid #f1f5f9;">
          <td width="50" style="padding:14px 10px 14px 18px;vertical-align:top;">
            <div style="width:34px;height:34px;background:#1a4fd6;border-radius:8px;text-align:center;line-height:34px;font-size:16px;">&#128203;</div>
          </td>
          <td style="padding:14px 18px 14px 8px;vertical-align:top;">
            <div style="font-size:11px;color:#9ca3af;font-weight:500;margin-bottom:3px;">Reason for Meeting</div>
            <div style="font-size:13px;color:#374151;line-height:1.6;">${description || purposeLabel}</div>
          </td>
        </tr>` : ""}
        <!-- Invited by -->
        <tr style="border-bottom:${participantCount > 0 ? "1px solid #f1f5f9" : "0"};">
          <td width="50" style="padding:14px 10px 14px 18px;vertical-align:top;">
            <div style="width:34px;height:34px;background:#1a4fd6;border-radius:8px;text-align:center;line-height:34px;font-size:16px;">&#128100;</div>
          </td>
          <td style="padding:14px 18px 14px 8px;vertical-align:top;">
            <div style="font-size:11px;color:#9ca3af;font-weight:500;margin-bottom:3px;">Invited by</div>
            <div style="font-size:13.5px;font-weight:600;color:#111827;">${hostName || "Ccentrik Sales Team"}</div>
            ${hostTitle ? `<div style="font-size:12px;color:#6b7280;margin-top:1px;">${hostTitle}, Ccentrik Sales Team</div>` : `<div style="font-size:12px;color:#6b7280;margin-top:1px;">Ccentrik Sales Team</div>`}
            ${hostEmail ? `<div style="font-size:12px;color:#6b7280;margin-top:1px;">${hostEmail}</div>` : ""}
          </td>
        </tr>
        <!-- Additional Participants -->
        ${participantCount > 0 ? `<tr>
          <td width="50" style="padding:14px 10px 14px 18px;vertical-align:top;">
            <div style="width:34px;height:34px;background:#1a4fd6;border-radius:8px;text-align:center;line-height:34px;font-size:16px;">&#128101;</div>
          </td>
          <td style="padding:14px 18px 14px 8px;vertical-align:top;">
            <div style="font-size:11px;color:#9ca3af;font-weight:500;margin-bottom:3px;">Additional Participants</div>
            <div style="font-size:13.5px;font-weight:600;color:#111827;">${participantCount} Member${participantCount !== 1 ? "s" : ""}</div>
            ${participantEmail ? `<div style="font-size:12px;color:#6b7280;margin-top:1px;">${participantEmail}</div>` : ""}
          </td>
        </tr>` : ""}
      </table>
    </td></tr>
  </table>

  <!-- Add to Calendar -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1.5px solid #e2e8f0;border-radius:12px;margin-bottom:16px;">
    <tr><td style="padding:18px 20px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr valign="middle">
        <td>
          <div style="font-size:14px;font-weight:700;color:#0d1b3e;margin-bottom:3px;">Add to your calendar</div>
          <div style="font-size:12px;color:#6b7280;">Stay updated and never miss a meeting.</div>
        </td>
        <td align="right">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr valign="middle">
            <td style="padding-right:8px;">
              <a href="${gcalUrl}" target="_blank" style="display:inline-flex;align-items:center;gap:5px;background:#fff;border:1.5px solid #e2e8f0;border-radius:8px;padding:8px 14px;text-decoration:none;font-size:12px;font-weight:600;color:#374151;white-space:nowrap;">
                <span style="font-size:14px;">&#128197;</span> Google Calendar
              </a>
            </td>
            <td>
              <a href="${outlookUrl}" target="_blank" style="display:inline-flex;align-items:center;gap:5px;background:#fff;border:1.5px solid #e2e8f0;border-radius:8px;padding:8px 14px;text-decoration:none;font-size:12px;font-weight:600;color:#374151;white-space:nowrap;">
                <span style="font-size:14px;">&#128197;</span> Outlook Calendar
              </a>
            </td>
          </tr></table>
        </td>
      </tr></table>
    </td></tr>
  </table>

  <!-- Need Help section -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f0f7ff;border:1.5px solid #dbeafe;border-radius:12px;margin-bottom:4px;">
    <tr><td style="padding:16px 20px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr valign="middle">
        <td>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr valign="middle">
            <td style="width:36px;height:36px;background:#1a4fd6;border-radius:50%;text-align:center;line-height:36px;font-size:17px;">&#127911;</td>
            <td style="padding-left:12px;">
              <div style="font-size:13px;font-weight:700;color:#1e40af;">Need help or have questions?</div>
              <div style="font-size:12px;color:#6b7280;margin-top:1px;">Our team is here to help you.</div>
            </td>
          </tr></table>
        </td>
        <td align="right">
          <a href="mailto:${hostEmail || "support@ccentrik.com"}" style="display:inline-block;background:#1a4fd6;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:12.5px;font-weight:600;white-space:nowrap;">Contact Support &#8594;</a>
        </td>
      </tr></table>
    </td></tr>
  </table>

</td></tr>

<!-- ══ DARK FOOTER ══ -->
<tr><td style="background:linear-gradient(135deg,#0d1b3e 0%,#102560 100%);padding:24px 28px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr valign="middle">
    <td>
      <img src="${LOGO}" alt="Ccentrik" height="22" style="display:block;border:0;filter:brightness(0) invert(1);margin-bottom:5px;"/>
      <div style="font-size:11px;color:#7ea8d8;margin-top:4px;">Driving Connections. Building Success.</div>
    </td>
    <td align="right">
      <div style="font-size:11.5px;color:#ffffff;margin-bottom:3px;">&#9993; support@ccentrik.com</div>
      <div style="font-size:11.5px;color:#7ea8d8;">&#127760; www.ccentrik.com</div>
      <div style="margin-top:8px;">
        <span style="display:inline-block;width:24px;height:24px;background:rgba(255,255,255,0.12);border-radius:50%;text-align:center;line-height:24px;font-size:11px;margin-left:5px;">in</span>
        <span style="display:inline-block;width:24px;height:24px;background:rgba(255,255,255,0.12);border-radius:50%;text-align:center;line-height:24px;font-size:11px;margin-left:5px;">tw</span>
        <span style="display:inline-block;width:24px;height:24px;background:rgba(255,255,255,0.12);border-radius:50%;text-align:center;line-height:24px;font-size:11px;margin-left:5px;">fb</span>
        <span style="display:inline-block;width:24px;height:24px;background:rgba(255,255,255,0.12);border-radius:50%;text-align:center;line-height:24px;font-size:11px;margin-left:5px;">ig</span>
      </div>
    </td>
  </tr></table>
</td></tr>

<!-- ══ COPYRIGHT BAR ══ -->
<tr><td style="background:#f8fafc;padding:12px 28px;text-align:center;border-top:1px solid #e5e7eb;">
  <p style="margin:0 0 3px;font-size:11px;color:#9ca3af;">&copy; ${new Date().getFullYear()} Ccentrik CRM. All rights reserved.</p>
  <p style="margin:0;font-size:10.5px;color:#c0c8d8;">You are receiving this email because you have been invited to a meeting.</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  const text = `Hello ${customerName || "there"},\n\n${hostName || "The Ccentrik Sales Team"} has invited you to a meeting.\n\nMeeting: ${title}${purposeLabel ? `\nPurpose: ${purposeLabel}` : ""}\nDate: ${dayFull}\nTime: ${timeStr}${endTimeStr ? " – " + endTimeStr : ""} IST${durationStr ? ` (${durationStr})` : ""}\nMode: ${typeLabel}${meetingLink ? `\nJoin: ${meetingLink}` : location ? `\nLocation: ${location}` : ""}\n${description ? `\nAgenda: ${description}` : ""}\nOrganized by: ${hostName || "Ccentrik Sales Team"}${hostEmail ? ` — ${hostEmail}` : ""}${acceptUrl ? `\n\nAccept Meeting: ${acceptUrl}` : ""}${declineUrl ? `\nDecline Meeting: ${declineUrl}` : ""}\n\nAdd to Google Calendar: ${gcalUrl}\nAdd to Outlook Calendar: ${outlookUrl}\n\n— Ccentrik CRM\nsupport@ccentrik.com | www.ccentrik.com\n© ${new Date().getFullYear()} Ccentrik CRM`;

  // ── Generate iCalendar (RFC 5545) content ────────────────────────────────────
  const calUID       = meetingId ? `${meetingId}@ccentrik.com` : `${crypto.randomUUID()}@ccentrik.com`;
  const calOrganizer = hostEmail || senderEmail || FROM_ADDR;
  // Merge primary recipient + any additional attendees into the iCal ATTENDEE list
  const icsAttendees = [
    ...(Array.isArray(to) ? to : [to]).map((e) => ({ name: customerName || e, email: e })),
    ...allAttendees.filter((a) => a && a.email && !( Array.isArray(to) ? to : [to]).includes(a.email)),
  ];
  const icsContent   = generateICS({
    uid:           calUID,
    sequence,
    method:        "REQUEST",
    title,
    startTime,
    endTime,
    organizerName: hostName || "Ccentrik CRM",
    organizerEmail: calOrganizer,
    attendees:     icsAttendees,
    location,
    description,
    meetingLink,
  });
  const icsBuffer = Buffer.from(icsContent, "utf-8");

  // Sending priority: per-user SMTP creds → company MAIL_USER account → Resend
  const usePerUser = !!(senderEmail && senderPassword);
  const transport  = usePerUser
    ? nodemailer.createTransport({
        host: "smtp.gmail.com", port: 465, secure: true,
        auth: { user: senderEmail, pass: senderPassword },
        tls:  { rejectUnauthorized: false },
      })
    : globalTransport;

  const effectiveSender = usePerUser ? senderEmail : (COMPANY_EMAIL);
  const fromDisplay     = `${hostName || FROM_NAME} <${effectiveSender}>`;
  const subjectLine     = `${hostName || "CENTRIK"} has invited you${companyName ? ` — ${companyName}` : ""}: ${title}`;

  if (transport) {
    // Nodemailer path — text/calendar MIME part triggers Gmail RSVP + auto-creates calendar event
    return transport.sendMail({
      from:        fromDisplay,
      to,
      subject:     subjectLine,
      html,
      text,
      ...(hostEmail ? { replyTo: hostEmail } : {}),
      messageId:   `<${calUID.split("@")[0]}-${Date.now()}@ccentrik.com>`,
      alternatives: [{
        contentType: "text/calendar; method=REQUEST; charset=UTF-8",
        content:     icsBuffer,
      }],
      attachments: [{
        filename:    "invite.ics",
        content:     icsBuffer,
        contentType: "text/calendar; method=REQUEST; name=invite.ics",
      }],
    });
  }

  // Resend fallback (when no SMTP credentials available)
  if (!resend) { console.warn("[sendMeetingInvite] RESEND_API_KEY not set — invite email skipped"); return { skipped: true }; }
  const result = await resend.emails.send({
    from:        FROM,
    to:          Array.isArray(to) ? to : [to],
    subject:     subjectLine,
    html,
    text,
    ...(hostEmail ? { reply_to: hostEmail } : {}),
    attachments: [{
      filename: "invite.ics",
      content:  icsBuffer,
    }],
  });
  if (result.error) throw new Error(result.error.message || "Resend send failed");
  return result;
};

// ─── Meeting Cancellation — removes event from attendee calendars ─────────────
const sendMeetingCancellationEmail = async ({ to, customerName, title, startTime, endTime, hostName, hostEmail, senderEmail, senderPassword, meetingId, sequence = 1 }) => {
  const meetingTransport = (senderEmail && senderPassword)
    ? nodemailer.createTransport({
        host: "smtp.gmail.com", port: 465, secure: true,
        auth: { user: senderEmail, pass: senderPassword },
        tls: { rejectUnauthorized: false },
      })
    : null;

  const calUID  = meetingId ? `${meetingId}@ccentrik.com` : `${crypto.randomUUID()}@ccentrik.com`;
  const calOrg  = hostEmail || senderEmail || FROM_ADDR;
  const recipients = Array.isArray(to) ? to : [to];

  const icsContent = generateICS({
    uid:            calUID,
    sequence,
    method:         "CANCEL",
    title,
    startTime,
    endTime,
    organizerName:  hostName || "Ccentrik CRM",
    organizerEmail: calOrg,
    attendees:      recipients.map((e) => ({ name: customerName || e, email: e })),
  });
  const icsBuffer = Buffer.from(icsContent, "utf-8");

  const dateStr = new Date(startTime).toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Kolkata",
  });
  const LOGO   = "https://ccentrik-crm.web.app/logo-blue.png";

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Meeting Cancelled</title></head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F7FA;padding:40px 20px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB;">
  <!-- Header -->
  <tr><td style="padding:24px 36px;border-bottom:1px solid #E5E7EB;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="vertical-align:middle;"><img src="${LOGO}" alt="Ccentrik" height="28" style="display:block;border:0;"/></td>
        <td align="right" style="vertical-align:middle;"><span style="display:inline-block;background:#FEF2F2;border:1px solid #FECACA;color:#DC2626;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:4px 12px;border-radius:20px;">Meeting Cancelled</span></td>
      </tr>
    </table>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:32px 36px;">
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#111827;line-height:1.3;">${title}</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#6B7280;line-height:1.6;">Hello <strong style="color:#111827;">${customerName || "there"}</strong>, we regret to inform you that the meeting scheduled for <strong style="color:#111827;">${dateStr}</strong> has been cancelled.</p>
    <!-- Cancellation notice -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
      <tr><td style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:16px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td width="32" style="vertical-align:top;padding-right:12px;">
              <div style="width:32px;height:32px;background:#FEE2E2;border-radius:8px;text-align:center;line-height:32px;font-size:16px;">✕</div>
            </td>
            <td style="vertical-align:middle;">
              <p style="margin:0;font-size:13.5px;font-weight:600;color:#991B1B;">Calendar event automatically cancelled</p>
              <p style="margin:4px 0 0;font-size:12.5px;color:#B91C1C;line-height:1.5;">If you had already accepted this invite, it will be removed from your Google Calendar automatically.</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
    <!-- Contact -->
    <p style="margin:0;font-size:13.5px;color:#6B7280;line-height:1.6;">If you have any questions, please reach out to <a href="mailto:${hostEmail || FROM_ADDR}" style="color:#2563EB;text-decoration:none;font-weight:500;">${hostEmail || FROM_ADDR}</a>.</p>
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:#F9FAFB;padding:20px 36px;border-top:1px solid #E5E7EB;border-radius:0 0 16px 16px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9CA3AF;">© ${new Date().getFullYear()} Ccentrik &nbsp;&middot;&nbsp; This is an automated message, please do not reply directly.</p>
  </td></tr>
</table>
</td></tr></table></body></html>`;

  const text = `Hello ${customerName || "there"},\n\nWe regret to inform you that the meeting "${title}" scheduled for ${dateStr} has been cancelled.\n\nThis event has been automatically removed from your calendar.\n\nFor questions, contact: ${hostEmail || FROM_ADDR}\n\n— The Ccentrik Team`;

  const usePerUser2  = !!(senderEmail && senderPassword);
  const cancelTransport = usePerUser2
    ? nodemailer.createTransport({
        host: "smtp.gmail.com", port: 465, secure: true,
        auth: { user: senderEmail, pass: senderPassword },
        tls:  { rejectUnauthorized: false },
      })
    : globalTransport;

  const cancelFrom   = usePerUser2 ? senderEmail : COMPANY_EMAIL;
  const subjectLine  = `Meeting Cancelled: ${title}`;
  const fromDisplay  = `${hostName || FROM_NAME} <${cancelFrom}>`;

  if (cancelTransport) {
    return cancelTransport.sendMail({
      from:        fromDisplay,
      to,
      subject:     subjectLine,
      html,
      text,
      ...(hostEmail ? { replyTo: hostEmail } : {}),
      messageId:   `<cancel-${calUID.split("@")[0]}-${Date.now()}@ccentrik.com>`,
      // METHOD:CANCEL removes the event from attendee's calendar automatically
      alternatives: [{
        contentType: "text/calendar; method=CANCEL; charset=UTF-8",
        content:     icsBuffer,
      }],
      attachments: [{
        filename:    "cancellation.ics",
        content:     icsBuffer,
        contentType: "text/calendar; method=CANCEL; name=cancellation.ics",
      }],
    });
  }

  // Resend fallback
  if (!resend) { console.warn("[sendMeetingCancellation] RESEND_API_KEY not set — cancellation email skipped"); return { skipped: true }; }
  const result = await resend.emails.send({
    from:        FROM,
    to:          recipients,
    subject:     subjectLine,
    html,
    text,
    attachments: [{ filename: "cancellation.ics", content: icsBuffer }],
  });
  if (result.error) throw new Error(result.error.message || "Resend send failed");
  return result;
};

module.exports = { sendMail, sendWelcomeEmail, sendNotificationEmail, sendSensitiveFieldAlert, sendMeetingInviteEmail, sendMeetingCancellationEmail, generateRsvpToken, verifyRsvpToken };
