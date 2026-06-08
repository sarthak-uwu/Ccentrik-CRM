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
const sendMeetingInviteEmail = async ({ to, customerName, title, startTime, endTime, meetingType, meetingLink, location, description, hostName, hostEmail, senderEmail, senderPassword, meetingPurpose, companyName, meetingId, sequence = 0, allAttendees = [] }) => {
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

  const agendaHtml = description
    ? description.split("\n").map((l) => `<div style="margin:4px 0;font-size:13.5px;color:#0f172a;line-height:1.7;">${l || "&nbsp;"}</div>`).join("")
    : null;

  const dayNum         = new Date(startTime).toLocaleString("en-US", { day: "numeric",   timeZone: "Asia/Kolkata" });
  const monthYearLabel = new Date(startTime).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).toUpperCase();
  const dayNameStr     = new Date(startTime).toLocaleString("en-US", { weekday: "long",  timeZone: "Asia/Kolkata" });
  const dayMonthStr    = new Date(startTime).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" });
  const hostInitials   = (hostName || "CC").split(" ").map(w => w[0] || "").join("").slice(0, 2).toUpperCase();

  // ── Meeting-type flags ────────────────────────────────────────────────────────
  const isGoogleMeet  = meetingType === "google_meet";
  const isTeams       = meetingType === "teams";
  const isZoom        = meetingType === "jitsi" || meetingType === "zoom";
  const isInPerson    = !isOnline;

  // ── RSVP action URLs (public backend endpoint) ────────────────────────────────
  const BACKEND_BASE  = process.env.BACKEND_URL || process.env.API_URL || "https://ccentrik-crm-api.onrender.com";
  const acceptUrl     = meetingId ? `${BACKEND_BASE}/api/meetings/rsvp?id=${meetingId}&action=accept`     : "#";
  const declineUrl    = meetingId ? `${BACKEND_BASE}/api/meetings/rsvp?id=${meetingId}&action=decline`    : "#";
  const rescheduleUrl = meetingId ? `${APP_URL}/meetings`                                                 : "#";

  // ── Response deadline: 24 h before meeting ────────────────────────────────────
  const responseDeadlineStr = (() => {
    if (!startTime) return dateStr;
    const dl = new Date(new Date(startTime).getTime() - 24 * 3600000);
    return dl > new Date()
      ? dl.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" })
      : dateStr;
  })();

  // ── Outlook calendar URL ──────────────────────────────────────────────────────
  const outlookCalUrl = (() => {
    const fmt = (d) => new Date(d).toISOString();
    const p = new URLSearchParams({
      path: "/calendar/action/compose", rru: "addevent",
      subject: title || "Meeting",
      startdt: fmt(startTime),
      enddt:   fmt(endTime || new Date(new Date(startTime).getTime() + 3600000)),
      body:    [description, meetingLink ? `Join: ${meetingLink}` : ""].filter(Boolean).join("\n"),
      location: location || meetingLink || "",
    });
    return `https://outlook.live.com/calendar/0/deeplink/compose?${p.toString()}`;
  })();

  // ── Yahoo Calendar URL ────────────────────────────────────────────────────────
  const yahooCalUrl = (() => {
    const fmtY = (d) => new Date(d).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const safeEndY = endTime || new Date(new Date(startTime).getTime() + 3600000).toISOString();
    const p = new URLSearchParams({
      v: "60", title: title || "Meeting",
      st: fmtY(startTime), et: fmtY(safeEndY),
      desc: [description, meetingLink ? `Join: ${meetingLink}` : ""].filter(Boolean).join("\n"),
      in_loc: location || meetingLink || "",
    });
    return `https://calendar.yahoo.com/?${p.toString()}`;
  })();

  // ── Apple / ICS download URL (backend endpoint) ───────────────────────────────
  const appleCalUrl = meetingId
    ? `${BACKEND_BASE}/api/meetings/ics/${meetingId}`
    : null;

  // ── Participants ──────────────────────────────────────────────────────────────
  const allParticipants  = (Array.isArray(allAttendees) ? allAttendees : []).filter(a => a && a.email);
  const participantCount = allParticipants.length;
  const participantsHtml = allParticipants.map(a =>
    `<span style="display:inline-block;background:#e8eaf6;color:#1a2570;padding:4px 12px;border-radius:20px;font-size:13px;margin:3px 3px 3px 0;font-family:Arial,Helvetica,sans-serif;">${a.name || a.email}</span>`
  ).join("");

  // ── Misc ──────────────────────────────────────────────────────────────────────
  const mapsUrl    = location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}` : "#";
  const supportUrl = `mailto:${hostEmail || FROM_ADDR}`;

  // ── Pre-computed conditional HTML blocks (avoids nested template literal confusion) ──
  const locationSection = (isInPerson && location) ? `
        <tr>
          <td style="padding:16px 24px;border-bottom:1px solid #eef2f8;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="top">
              <td width="42%" style="font-weight:700;font-size:14px;color:#1a2540;font-family:Arial,Helvetica,sans-serif;padding-right:12px;">&#128205; Location</td>
              <td style="font-size:14px;color:#444;font-family:Arial,Helvetica,sans-serif;">${location}<br/><br/><a href="${mapsUrl}" target="_blank" style="color:#0a52ff;text-decoration:none;font-weight:600;">&#128205; View on Google Maps</a></td>
            </tr></table>
          </td>
        </tr>` : "";

  const meetingLinkSection = meetingLink ? `
        <tr>
          <td style="padding:16px 24px;border-bottom:1px solid #eef2f8;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
              <td width="42%" style="font-weight:700;font-size:14px;color:#1a2540;font-family:Arial,Helvetica,sans-serif;padding-right:12px;">${isTeams ? "&#128188; Teams Meeting" : isZoom ? "&#128249; Zoom Meeting" : "&#127909; Meeting Link"}</td>
              <td><a href="${meetingLink}" target="_blank" style="display:inline-block;background:${isTeams ? "#6264a7" : isZoom ? "#2D8CFF" : "#0a52ff"};color:#ffffff;padding:10px 22px;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;font-family:Arial,Helvetica,sans-serif;">${isGoogleMeet ? "Join Google Meet" : isTeams ? "Join Microsoft Teams" : isZoom ? "Join Zoom Meeting" : "Join Meeting"}</a></td>
            </tr></table>
          </td>
        </tr>` : "";

  const descriptionSection = description ? `
        <tr>
          <td style="padding:16px 24px;border-bottom:1px solid #eef2f8;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="top">
              <td width="42%" style="font-weight:700;font-size:14px;color:#1a2540;font-family:Arial,Helvetica,sans-serif;padding-right:12px;">&#128196; Reason for Meeting</td>
              <td style="font-size:14px;color:#444;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">${description.replace(/\n/g, "<br/>")}</td>
            </tr></table>
          </td>
        </tr>` : "";

  const participantsSection = participantCount > 0 ? `
        <tr>
          <td style="padding:16px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="top">
              <td width="42%" style="font-weight:700;font-size:14px;color:#1a2540;font-family:Arial,Helvetica,sans-serif;padding-right:12px;">&#128101; Additional Participants</td>
              <td style="font-size:14px;color:#444;font-family:Arial,Helvetica,sans-serif;"><strong>${participantCount} Member${participantCount !== 1 ? "s" : ""}</strong><br/><br/>${participantsHtml}</td>
            </tr></table>
          </td>
        </tr>` : "";

  // ── new single-column template (kept for reference, not currently active) ──
  void `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Meeting Invitation – ${title || "Meeting"}</title>
<!--[if !mso]><!-->
<style type="text/css">
  @media screen and (max-width:620px){
    .hide-sm{display:none!important;}
    .btn-col{display:block!important;width:100%!important;padding:0 0 10px 0!important;}
  }
</style>
<!--<![endif]-->
</head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;">

<!-- Outer wrapper -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f6fb" style="background:#f4f6fb;">
<tr><td align="center" style="padding:20px 10px;">

<!-- Email wrapper -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- ═══ 1. HEADER ═══ -->
  <tr>
    <td style="background:#ffffff;padding:20px 32px;border-bottom:1px solid #eef0f6;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr valign="middle">
          <td><span style="font-size:26px;font-weight:700;color:#0a52ff;font-family:Arial,Helvetica,sans-serif;letter-spacing:-0.5px;">CENTRIK</span></td>
          <td align="right"><span style="font-size:14px;font-weight:600;color:#26335d;font-family:Arial,Helvetica,sans-serif;">&#128197; Meeting Invitation</span></td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ═══ 2. HERO BANNER ═══ -->
  <tr>
    <td style="padding:16px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0036c7" style="background:linear-gradient(135deg,#001f75,#005cff);border-radius:16px;background-color:#0036c7;">
        <tr>
          <td style="padding:40px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <!-- Hero text -->
                <td valign="top" style="color:#ffffff;max-width:350px;padding-right:20px;">
                  <div style="font-size:40px;font-weight:700;color:#ffffff;line-height:1.1;font-family:Arial,Helvetica,sans-serif;margin:0 0 16px 0;">You're Invited<br/>to a Meeting</div>
                  <p style="font-size:15px;color:rgba(255,255,255,0.9);line-height:1.7;margin:0;font-family:Arial,Helvetica,sans-serif;">Centrik CRM has scheduled a meeting with you. Please review the details below and respond.</p>
                </td>
                <!-- Calendar widget -->
                <td class="hide-sm" align="right" valign="middle">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background:#ffffff;border-radius:16px;width:150px;overflow:hidden;margin-left:auto;">
                    <tr><td bgcolor="#0052ff" style="background:#0052ff;padding:7px;text-align:center;font-size:10px;font-weight:700;color:#ffffff;font-family:Arial,Helvetica,sans-serif;letter-spacing:1px;text-transform:uppercase;">${monthYearLabel}</td></tr>
                    <tr><td style="padding:14px 10px 12px;text-align:center;">
                      <div style="font-size:44px;font-weight:700;color:#0f172a;line-height:1;font-family:Arial,Helvetica,sans-serif;">${dayNum}</div>
                      <div style="font-size:10px;color:#64748b;font-weight:500;text-transform:uppercase;letter-spacing:1px;margin-top:4px;font-family:Arial,Helvetica,sans-serif;">${dayNameStr}</div>
                      <div style="border-top:1px solid #f1f5f9;margin-top:8px;padding-top:7px;font-size:10px;color:#0052ff;font-weight:700;font-family:Arial,Helvetica,sans-serif;">${timeStr}${endTimeStr ? " – " + endTimeStr : ""} IST</div>
                      ${durationStr ? `<div style="font-size:9px;color:#94a3b8;margin-top:2px;font-family:Arial,Helvetica,sans-serif;">${durationStr}</div>` : ""}
                    </td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ═══ 3. GREETING ═══ -->
  <tr>
    <td style="padding:28px 36px 12px;">
      <h2 style="font-size:24px;font-weight:700;color:#1a2540;margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;">Hello, ${customerName || "there"} &#128075;</h2>
      <p style="font-size:15px;color:#58627d;line-height:1.7;margin:0;font-family:Arial,Helvetica,sans-serif;">You have been invited to the following meeting. Please review the details and let us know if you'll be able to attend.</p>
    </td>
  </tr>

  <!-- ═══ 4. ACTION BUTTONS ═══ -->
  <tr>
    <td style="padding:16px 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="btn-col" valign="top" style="padding-right:10px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td align="center" style="border:2px solid #18b56f;border-radius:12px;padding:18px 12px;">
                <a href="${acceptUrl}" target="_blank" style="text-decoration:none;display:block;font-family:Arial,Helvetica,sans-serif;">
                  <div style="font-size:22px;margin-bottom:6px;">&#10004;</div>
                  <div style="font-size:14px;font-weight:700;color:#18b56f;">Accept Meeting</div>
                  <div style="font-size:11px;color:#5cb98a;margin-top:3px;">I'll be there</div>
                </a>
              </td></tr>
            </table>
          </td>
          <td class="btn-col" valign="top" style="padding:0 5px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td align="center" style="border:2px solid #ff4d4d;border-radius:12px;padding:18px 12px;">
                <a href="${declineUrl}" target="_blank" style="text-decoration:none;display:block;font-family:Arial,Helvetica,sans-serif;">
                  <div style="font-size:22px;margin-bottom:6px;">&#10006;</div>
                  <div style="font-size:14px;font-weight:700;color:#ff4d4d;">Decline Meeting</div>
                  <div style="font-size:11px;color:#e88080;margin-top:3px;">I won't be able to attend</div>
                </a>
              </td></tr>
            </table>
          </td>
          <td class="btn-col" valign="top" style="padding-left:10px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td align="center" style="border:2px solid #ff9800;border-radius:12px;padding:18px 12px;">
                <a href="${rescheduleUrl}" target="_blank" style="text-decoration:none;display:block;font-family:Arial,Helvetica,sans-serif;">
                  <div style="font-size:22px;margin-bottom:6px;">&#128197;</div>
                  <div style="font-size:14px;font-weight:700;color:#ff9800;">Reschedule</div>
                  <div style="font-size:11px;color:#d4900a;margin-top:3px;">Suggest another time</div>
                </a>
              </td></tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ═══ 5. RESPONSE DEADLINE ═══ -->
  <tr>
    <td align="center" style="padding:10px 36px 20px;font-size:14px;font-family:Arial,Helvetica,sans-serif;">
      <span style="color:#667089;">Please respond by </span><span style="color:#0a52ff;font-weight:700;">${responseDeadlineStr}</span>
    </td>
  </tr>

  <!-- ═══ 6. MEETING DETAILS CARD ═══ -->
  <tr>
    <td style="padding:0 20px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5ebf7;border-radius:16px;overflow:hidden;background:#ffffff;">

        <!-- Card heading -->
        <tr><td style="padding:20px 24px;font-size:20px;font-weight:700;color:#1a2540;border-bottom:1px solid #eef2f8;font-family:Arial,Helvetica,sans-serif;">Meeting Details</td></tr>

        <!-- Meeting Title -->
        <tr><td style="padding:15px 24px;border-bottom:1px solid #eef2f8;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="top">
            <td width="40%" style="font-weight:700;font-size:13px;color:#1a2540;font-family:Arial,Helvetica,sans-serif;padding-right:12px;">&#128197; Meeting Title</td>
            <td style="font-size:13px;color:#444;font-family:Arial,Helvetica,sans-serif;">${title || "—"}</td>
          </tr></table>
        </td></tr>

        <!-- Date & Time -->
        <tr><td style="padding:15px 24px;border-bottom:1px solid #eef2f8;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="top">
            <td width="40%" style="font-weight:700;font-size:13px;color:#1a2540;font-family:Arial,Helvetica,sans-serif;padding-right:12px;">&#128336; Date &amp; Time</td>
            <td style="font-size:13px;color:#444;font-family:Arial,Helvetica,sans-serif;">${dateStr}<br/><br/>${timeStr}${endTimeStr ? " – " + endTimeStr : ""} IST${durationStr ? ` (${durationStr})` : ""}</td>
          </tr></table>
        </td></tr>

        ${locationSection}
        ${meetingLinkSection}
        ${descriptionSection}

        <!-- Invited By -->
        <tr><td style="padding:15px 24px;${participantCount > 0 ? "border-bottom:1px solid #eef2f8;" : ""}">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="top">
            <td width="40%" style="font-weight:700;font-size:13px;color:#1a2540;font-family:Arial,Helvetica,sans-serif;padding-right:12px;">&#128100; Invited By</td>
            <td style="font-size:13px;color:#444;font-family:Arial,Helvetica,sans-serif;"><strong>${hostName || "Ccentrik Team"}</strong><br/><br/>${hostEmail ? `<a href="mailto:${hostEmail}" style="color:#0a52ff;text-decoration:none;">${hostEmail}</a>` : ""}</td>
          </tr></table>
        </td></tr>

        ${participantsSection}

      </table>
    </td>
  </tr>

  <!-- ═══ 7. ADD TO CALENDAR ═══ -->
  <tr>
    <td style="padding:0 20px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5ebf7;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:22px 24px;">
          <div style="font-size:17px;font-weight:700;color:#0a52ff;margin:0 0 4px 0;font-family:Arial,Helvetica,sans-serif;">&#128197; Add to your calendar</div>
          <div style="color:#667089;font-size:12px;margin-bottom:16px;font-family:Arial,Helvetica,sans-serif;">One click to save this meeting — works with all major calendar apps.</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding:0 4px 8px 0;" width="25%">
                <a href="${gcalUrl}" target="_blank" style="display:block;background:#ffffff;border:1px solid #d9e2f2;padding:10px 6px;text-decoration:none;border-radius:10px;color:#222;font-size:11.5px;font-weight:700;font-family:Arial,Helvetica,sans-serif;text-align:center;">
                  <div style="font-size:20px;margin-bottom:4px;">&#128198;</div>Google Calendar
                </a>
              </td>
              <td style="padding:0 4px 8px;" width="25%">
                <a href="${outlookCalUrl}" target="_blank" style="display:block;background:#ffffff;border:1px solid #d9e2f2;padding:10px 6px;text-decoration:none;border-radius:10px;color:#222;font-size:11.5px;font-weight:700;font-family:Arial,Helvetica,sans-serif;text-align:center;">
                  <div style="font-size:20px;margin-bottom:4px;">&#128188;</div>Outlook
                </a>
              </td>
              ${appleCalUrl ? `<td style="padding:0 4px 8px;" width="25%">
                <a href="${appleCalUrl}" target="_blank" style="display:block;background:#ffffff;border:1px solid #d9e2f2;padding:10px 6px;text-decoration:none;border-radius:10px;color:#222;font-size:11.5px;font-weight:700;font-family:Arial,Helvetica,sans-serif;text-align:center;">
                  <div style="font-size:20px;margin-bottom:4px;">&#63743;</div>Apple Calendar
                </a>
              </td>` : ""}
              <td style="padding:0 0 8px 4px;" width="25%">
                <a href="${yahooCalUrl}" target="_blank" style="display:block;background:#ffffff;border:1px solid #d9e2f2;padding:10px 6px;text-decoration:none;border-radius:10px;color:#222;font-size:11.5px;font-weight:700;font-family:Arial,Helvetica,sans-serif;text-align:center;">
                  <div style="font-size:20px;margin-bottom:4px;">&#128247;</div>Yahoo
                </a>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td>
  </tr>

  <!-- ═══ 8. SUPPORT SECTION ═══ -->
  <tr>
    <td style="padding:0 20px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f8ff" style="background:#f5f8ff;border-radius:16px;">
        <tr><td style="padding:22px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
            <td>
              <div style="font-size:16px;font-weight:700;color:#0a52ff;margin:0 0 4px 0;font-family:Arial,Helvetica,sans-serif;">Need help or have questions?</div>
              <div style="color:#667089;font-size:12px;font-family:Arial,Helvetica,sans-serif;">Our team is here to help you.</div>
            </td>
            <td align="right" style="padding-left:12px;">
              <a href="${supportUrl}" style="display:inline-block;background:#0a52ff;color:#ffffff;padding:11px 22px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;font-family:Arial,Helvetica,sans-serif;">Contact Support &#8594;</a>
            </td>
          </tr></table>
        </td></tr>
      </table>
    </td>
  </tr>

  <!-- ═══ 9. FOOTER ═══ -->
  <tr>
    <td bgcolor="#0036c7" style="background:linear-gradient(135deg,#0036c7,#005cff);padding:28px 36px;background-color:#0036c7;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
        <td>
          <div style="font-size:26px;font-weight:700;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">CENTRIK</div>
          <div style="margin-top:5px;color:rgba(255,255,255,0.8);font-size:12px;font-family:Arial,Helvetica,sans-serif;">Driving Connections. Building Success.</div>
        </td>
        <td align="right">
          <div style="color:rgba(255,255,255,0.9);font-size:12px;font-family:Arial,Helvetica,sans-serif;">&#128231; ${hostEmail || FROM_ADDR}</div>
          <div style="color:rgba(255,255,255,0.9);font-size:12px;margin-top:4px;font-family:Arial,Helvetica,sans-serif;">&#127758; ccentrik.com</div>
        </td>
      </tr></table>
    </td>
  </tr>

  <!-- Social links -->
  <tr>
    <td bgcolor="#002fa7" style="background:#002fa7;padding:12px 36px;text-align:center;border-top:1px solid rgba(255,255,255,0.12);">
      <a href="https://linkedin.com"  style="margin:0 8px;color:#ffffff;text-decoration:none;font-size:12px;font-family:Arial,Helvetica,sans-serif;">LinkedIn</a>
      <a href="https://twitter.com"   style="margin:0 8px;color:#ffffff;text-decoration:none;font-size:12px;font-family:Arial,Helvetica,sans-serif;">Twitter</a>
      <a href="https://facebook.com"  style="margin:0 8px;color:#ffffff;text-decoration:none;font-size:12px;font-family:Arial,Helvetica,sans-serif;">Facebook</a>
      <a href="https://instagram.com" style="margin:0 8px;color:#ffffff;text-decoration:none;font-size:12px;font-family:Arial,Helvetica,sans-serif;">Instagram</a>
    </td>
  </tr>

  <!-- Copyright -->
  <tr>
    <td style="text-align:center;padding:18px 36px;color:#8b95b3;font-size:11px;font-family:Arial,Helvetica,sans-serif;background:#ffffff;">
      &copy; ${new Date().getFullYear()} Centrik CRM. All rights reserved.<br/><br/>
      You are receiving this email because you have been invited to a meeting.
    </td>
  </tr>

</table>
</td></tr>
</table>

</body>
</html>`;

  // ── active template: two-column format (matches approved email design) ──────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Meeting Invitation – ${title || "Meeting"}</title>
<style>
  body{margin:0;padding:0;background-color:#f8fafc;font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased;}
  table{border-spacing:0;border-collapse:collapse;}
  td{padding:0;}
  img{border:0;}
  .main-container{width:100%;max-width:650px;margin:20px auto;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 30px rgba(0,0,0,0.03);}
  .header-bg{background:radial-gradient(circle at top right,#e0f2fe,#f0fdf4 40%,#e0e7ff 80%);padding:40px;}
  .btn-blue{background-color:#0052ff;color:#ffffff!important;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;display:block;text-align:center;}
  .btn-outline{border:1.5px solid #cbd5e1;color:#0052ff!important;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:block;text-align:center;background-color:#ffffff;}
  .card{background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px;}
  .info-row{border-bottom:1px solid #f1f5f9;padding:12px 0;}
  .info-row:last-child{border-bottom:none;}
  @media screen and (max-width:600px){
    .columns{display:block!important;width:100%!important;padding-right:0!important;}
    .content-padding{padding:20px!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Inter',sans-serif;">


<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f8fafc">
<tr><td align="center" style="padding:20px;">
<table class="main-container" role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width:650px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">

<!-- ═══ HEADER ═══ -->
<tr>
<td class="header-bg" style="background:radial-gradient(circle at top right,#e0f2fe,#f0fdf4 40%,#e0e7ff 80%);padding:40px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td><img src="${LOGO}" alt="CCENTRIK" height="30" style="display:block;border:0;"/></td>
      <td align="right">
        <span style="background-color:#e0e7ff;color:#0052ff;font-size:11px;font-weight:600;padding:6px 14px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;">&#128233; Meeting Invitation</span>
      </td>
    </tr>
    <tr><td colspan="2" style="padding-top:40px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
        <!-- Hero text -->
        <td class="columns" width="55%" valign="top" style="padding-right:10px;">
          <h1 style="font-size:38px;font-weight:700;color:#0f172a;margin:0 0 8px 0;line-height:1.1;">You're Invited<br/><span style="color:#0052ff;">to a Meeting</span></h1>
          <div style="width:40px;height:4px;background-color:#0052ff;margin-bottom:24px;border-radius:2px;font-size:0;line-height:0;">&nbsp;</div>
          <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 20px 0;">
            <strong>${hostName || "CCENTRIK Sales Team"}</strong> from <span style="color:#0052ff;font-weight:600;">CCENTRIK</span> has invited you to a meeting${companyName ? ` regarding <strong>${companyName}</strong>` : ""}.
          </p>
          ${purposeLabel ? `<span style="display:inline-block;background-color:#e0e7ff;color:#0052ff;font-size:13px;font-weight:500;padding:8px 16px;border-radius:20px;">Purpose: ${purposeLabel}</span>` : ""}
        </td>
        <!-- Calendar widget -->
        <td class="columns" width="45%" align="center" valign="middle" style="padding-top:20px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;width:200px;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden;margin:0 auto;">
            <tr><td style="background:#0052ff;color:#ffffff;padding:8px;text-align:center;font-size:12px;font-weight:600;letter-spacing:1px;">${monthYearLabel}</td></tr>
            <tr><td style="padding:20px 10px 12px;text-align:center;">
              <div style="font-size:56px;font-weight:700;color:#0f172a;line-height:1;">${dayNum}</div>
              <div style="font-size:11px;color:#64748b;font-weight:500;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">${dayNameStr}</div>
              <div style="border-top:1px solid #f1f5f9;margin-top:14px;padding-top:10px;font-size:11px;color:#0052ff;font-weight:600;">${timeStr}${endTimeStr ? ` &ndash; ${endTimeStr}` : ""} IST</div>
              ${durationStr ? `<div style="font-size:10px;color:#94a3b8;margin-top:3px;">${durationStr}</div>` : ""}
            </td></tr>
          </table>
        </td>
      </tr></table>
    </td></tr>
  </table>
</td>
</tr>

<!-- ═══ BODY ═══ -->
<tr>
<td class="content-padding" style="padding:30px;background-color:#ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>

    <!-- Left column (58%) -->
    <td class="columns" width="58%" valign="top" style="padding-right:15px;">

      <!-- Meeting Details card -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
        <tr><td style="padding:16px 20px 12px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:14px;"><tr valign="middle">
            <td width="32"><span style="background:#0052ff;color:#ffffff;padding:5px 8px;border-radius:6px;font-size:14px;">&#128197;</span></td>
            <td style="padding-left:8px;font-size:13px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;">Meeting Details</td>
          </tr></table>
          <div style="border-bottom:1px solid #f1f5f9;padding:10px 0;">
            <div style="font-size:11px;color:#64748b;">Meeting Title</div>
            <div style="font-size:14px;font-weight:600;color:#0f172a;margin-top:2px;">${title}</div>
          </div>
          <div style="border-bottom:1px solid #f1f5f9;padding:10px 0;">
            <div style="font-size:11px;color:#64748b;">Organized By</div>
            <div style="font-size:14px;font-weight:600;color:#0f172a;margin-top:2px;">${hostName || "CCENTRIK Sales Team"}</div>
            <div style="font-size:12px;color:#64748b;">CCENTRIK</div>
          </div>
          <div style="border-bottom:1px solid #f1f5f9;padding:10px 0;">
            <div style="font-size:11px;color:#64748b;">Organizer Email</div>
            <a href="mailto:${hostEmail || FROM_ADDR}" style="font-size:13px;color:#0052ff;text-decoration:none;margin-top:2px;display:block;">${hostEmail || FROM_ADDR}</a>
          </div>
          ${companyName ? `<div style="border-bottom:1px solid #f1f5f9;padding:10px 0;">
            <div style="font-size:11px;color:#64748b;">Company</div>
            <div style="font-size:14px;font-weight:600;color:#0f172a;margin-top:2px;">${companyName}</div>
          </div>` : ""}
          <div style="border-bottom:1px solid #f1f5f9;padding:10px 0;">
            <div style="font-size:11px;color:#64748b;">Date &amp; Time</div>
            <div style="font-size:13px;font-weight:500;color:#0f172a;margin-top:2px;">${dayMonthStr} &bull; ${timeStr}${endTimeStr ? ` &ndash; ${endTimeStr}` : ""} IST</div>
          </div>
          <div style="${meetingLink || (!isOnline && location) ? "border-bottom:1px solid #f1f5f9;" : ""}padding:10px 0;">
            <div style="font-size:11px;color:#64748b;">Meeting Type</div>
            <div style="font-size:13px;font-weight:500;color:#0f172a;margin-top:2px;">${typeLabel}</div>
          </div>
          ${meetingLink ? `<div style="padding:10px 0;">
            <div style="font-size:11px;color:#64748b;">Meeting Link</div>
            <a href="${meetingLink}" target="_blank" style="font-size:13px;color:#0052ff;text-decoration:none;word-break:break-all;margin-top:2px;display:block;">${meetingLink}</a>
          </div>` : (!isOnline && location ? `<div style="padding:10px 0;">
            <div style="font-size:11px;color:#64748b;">Location</div>
            <a href="https://maps.google.com/?q=${encodeURIComponent(location)}" target="_blank" style="font-size:13px;color:#0052ff;text-decoration:none;margin-top:2px;display:block;">${location} &#8599;</a>
          </div>` : "")}
        </td></tr>
      </table>

      <!-- CTA Buttons -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:20px;">
        <tr><td>
          ${meetingLink ? `<a href="${meetingLink}" target="_blank" style="background-color:#0052ff;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;display:block;text-align:center;margin-bottom:10px;font-size:14px;">&#9654; Join Meeting</a>` : ""}
          <a href="${gcalUrl}" target="_blank" style="border:1.5px solid #cbd5e1;color:#0052ff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:block;text-align:center;background-color:#ffffff;font-size:14px;">&#128197; Add to Google Calendar</a>
        </td></tr>
      </table>

      ${agendaHtml ? `<!-- Agenda -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:16px;">
        <tr><td style="padding:16px 20px;">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">&#128221; Agenda / Notes</div>
          <div style="font-size:13.5px;color:#0f172a;line-height:1.75;">${agendaHtml}</div>
        </td></tr>
      </table>` : ""}

      <!-- Confirmation -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr><td style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px 16px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr valign="top">
            <td width="20" style="font-size:16px;padding-top:1px;">&#9989;</td>
            <td style="padding-left:8px;">
              <div style="font-size:13px;font-weight:600;color:#14532d;">This meeting has been scheduled by CCENTRIK.</div>
              <div style="font-size:12px;color:#166534;margin-top:3px;line-height:1.5;">You will receive reminders before the meeting starts.</div>
            </td>
          </tr></table>
        </td></tr>
      </table>

    </td>

    <!-- Right column (42%) -->
    <td class="columns" width="42%" valign="top">

      <!-- Date & Time card -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:16px;">
        <tr><td style="padding:16px;">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">&#128197; Date &amp; Time</div>
          <div style="font-size:14px;color:#0f172a;">${dayNameStr}</div>
          <div style="font-size:15px;font-weight:600;color:#0f172a;">${dayMonthStr}</div>
          <div style="font-size:16px;font-weight:700;color:#0f172a;margin-top:6px;">${timeStr}${endTimeStr ? ` &ndash; ${endTimeStr}` : ""}</div>
          <div style="font-size:11px;color:#64748b;margin-bottom:14px;">India Standard Time (IST)${durationStr ? ` &middot; ${durationStr}` : ""}</div>
          <a href="${gcalUrl}" target="_blank" style="font-size:12px;color:#0052ff;text-decoration:none;font-weight:600;">&#128197; Add to Calendar</a>
        </td></tr>
      </table>

      <!-- Meeting Mode card -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:16px;">
        <tr><td style="padding:16px;">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">${isOnline ? "&#128249;" : "&#128205;"} Meeting Mode</div>
          <div style="font-size:13px;font-weight:600;color:#0f172a;">${typeLabel}</div>
          ${meetingLink ? `
          <div style="margin-top:8px;">
            <div style="font-size:11px;color:#64748b;font-weight:500;margin-bottom:4px;font-family:Arial,Helvetica,sans-serif;">Join Meeting:</div>
            <div style="font-size:12px;color:#0052ff;word-break:break-all;margin-bottom:10px;font-family:Arial,Helvetica,sans-serif;">${meetingLink}</div>
            <a href="${meetingLink}" target="_blank" style="display:inline-block;background:${isTeams ? "#6264A7" : isZoom ? "#2D8CFF" : "#0052ff"};color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:8px;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">${isGoogleMeet ? "Join Google Meet" : isTeams ? "Join Teams Meeting" : isZoom ? "Join Zoom Meeting" : "Join Meeting"}</a>
          </div>` : (location ? `<div style="font-size:12px;color:#64748b;line-height:1.5;margin-top:6px;font-family:Arial,Helvetica,sans-serif;">${location}</div>` : "")}
        </td></tr>
      </table>

      <!-- Organizer card -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:16px;">
        <tr><td style="padding:16px;">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">&#128101; Organizer</div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr valign="top">
            <td width="34">
              <div style="background-color:#0052ff;color:#ffffff;font-size:12px;font-weight:700;width:30px;height:30px;line-height:30px;text-align:center;border-radius:50%;">${hostInitials}</div>
            </td>
            <td style="padding-left:10px;">
              <div style="font-size:13px;font-weight:600;color:#0f172a;">${hostName || "CCENTRIK Sales Team"}</div>
              <div style="font-size:11px;color:#64748b;">${hostEmail || FROM_ADDR}</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Organizer</div>
            </td>
          </tr></table>
          <div style="margin-top:12px;padding-top:10px;border-top:1px solid #f1f5f9;">
            <a href="${gcalUrl}" target="_blank" style="font-size:12px;color:#0052ff;text-decoration:none;font-weight:500;">&#10133; Add to My Calendar</a>
          </div>
        </td></tr>
      </table>

      <!-- Need Help card -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
        <tr><td style="padding:16px;">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">&#127911; Need Help?</div>
          <div style="font-size:12px;color:#64748b;line-height:1.5;">If you have any questions, feel free to reach out.</div>
          <a href="mailto:${hostEmail || FROM_ADDR}" style="font-size:12px;color:#0052ff;text-decoration:none;font-weight:600;display:block;margin-top:8px;">${hostEmail || FROM_ADDR}</a>
        </td></tr>
      </table>

    </td>
  </tr></table>
</td>
</tr>

<!-- ═══ DARK FOOTER ═══ -->
<tr>
<td style="background-color:#002994;padding:28px 30px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr valign="middle">
    <td>
      <div style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">CCENTRIK</div>
      <div style="font-size:11px;color:#93c5fd;margin-top:4px;">Driving Connections. Building Success.</div>
    </td>
    <td align="right">
      <div style="font-size:12px;color:#ffffff;margin-bottom:4px;">&#9993; support@ccentrik.com</div>
      <div style="font-size:12px;color:#93c5fd;">&#127760; www.ccentrik.com</div>
    </td>
  </tr></table>
</td>
</tr>

<!-- Copyright -->
<tr><td style="background-color:#f8fafc;padding:16px 30px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;">
  &copy; ${new Date().getFullYear()} CCENTRIK CRM &middot; This is an automated meeting invitation &middot; Do not reply directly.
</td></tr>

</table>
</td></tr>
</table>

</body>
</html>`;

  const text = `Hello ${customerName || "there"},\n\n${hostName || "The CENTRIK Sales Team"} from CENTRIK has invited you to${purposeLabel ? ` a ${purposeLabel}` : " a meeting"}${companyName ? ` regarding ${companyName}` : ""}.\n\nMeeting: ${title}${purposeLabel ? `\nPurpose: ${purposeLabel}` : ""}\nDate: ${dateStr}\nTime: ${timeStr}${endTimeStr ? " – " + endTimeStr : ""} IST${durationStr ? ` (${durationStr})` : ""}\nMode: ${typeLabel}${meetingLink ? `\nJoin: ${meetingLink}` : location ? `\nLocation: ${location}` : ""}\n\nOrganized by: ${hostName || "CENTRIK Sales Team"} — CENTRIK${hostEmail ? `\nContact: ${hostEmail}` : ""}\n\nWe look forward to connecting with you.\n\nThe CENTRIK Sales Team\n© ${new Date().getFullYear()} Ccentrik CRM`;

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

// ─── Meeting Reminder Email ───────────────────────────────────────────────────
const sendMeetingReminderEmail = async ({ to, customerName, title, startTime, endTime, meetingType, meetingLink, location, hostName, hostEmail, timeLabel, meetingId }) => {
  const isOnline   = meetingType !== "in_person" && meetingType !== "in-person";
  const typeLabel  = meetingType === "google_meet" ? "Google Meet"
    : meetingType === "teams" ? "Microsoft Teams"
    : meetingType === "zoom"  ? "Zoom"
    : isOnline                ? "Online Meeting"
    : "In-Person Meeting";

  const dateStr = new Date(startTime).toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Kolkata" });
  const timeStr = new Date(startTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
  const endTimeStr = endTime ? new Date(endTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : null;
  const mapsUrl = location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}` : null;
  const BACKEND_BASE = process.env.BACKEND_URL || "https://backend-gamma-nine-32.vercel.app";
  const supportUrl = `mailto:${hostEmail || FROM_ADDR}`;

  const actionBtn = isOnline && meetingLink
    ? `<a href="${meetingLink}" target="_blank" style="display:inline-block;background:#0a52ff;color:#ffffff;padding:13px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">&#9654; Join ${typeLabel}</a>`
    : mapsUrl
    ? `<a href="${mapsUrl}" target="_blank" style="display:inline-block;background:#10B981;color:#ffffff;padding:13px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">&#128205; Open in Google Maps</a>`
    : "";

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Meeting Reminder</title></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f6fb">
<tr><td align="center" style="padding:30px 10px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

  <!-- Header -->
  <tr><td style="background:#ffffff;padding:20px 32px;border-bottom:1px solid #eef0f6;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
      <td><span style="font-size:24px;font-weight:700;color:#0a52ff;font-family:Arial,Helvetica,sans-serif;">CENTRIK</span></td>
      <td align="right"><span style="font-size:13px;font-weight:600;color:#26335d;font-family:Arial,Helvetica,sans-serif;">&#9200; Meeting Reminder</span></td>
    </tr></table>
  </td></tr>

  <!-- Reminder banner -->
  <tr><td style="padding:20px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#FF6B35,#FF9500);border-radius:14px;">
      <tr><td style="padding:24px 28px;text-align:center;">
        <div style="font-size:36px;font-weight:800;color:#ffffff;font-family:Arial,Helvetica,sans-serif;margin-bottom:6px;">&#9200; ${timeLabel}</div>
        <div style="font-size:15px;color:rgba(255,255,255,0.9);font-family:Arial,Helvetica,sans-serif;">Your meeting is coming up soon!</div>
      </td></tr>
    </table>
  </td></tr>

  <!-- Meeting details -->
  <tr><td style="padding:0 24px 20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5ebf7;border-radius:14px;overflow:hidden;">
      <tr><td style="padding:16px 20px;border-bottom:1px solid #eef2f8;">
        <div style="font-size:11px;color:#667089;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;font-family:Arial,Helvetica,sans-serif;">Meeting</div>
        <div style="font-size:17px;font-weight:700;color:#1a2540;font-family:Arial,Helvetica,sans-serif;">${title || "Meeting"}</div>
      </td></tr>
      <tr><td style="padding:12px 20px;border-bottom:1px solid #eef2f8;">
        <div style="font-size:11px;color:#667089;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;font-family:Arial,Helvetica,sans-serif;">&#128336; Date &amp; Time</div>
        <div style="font-size:14px;color:#1a2540;font-family:Arial,Helvetica,sans-serif;">${dateStr}</div>
        <div style="font-size:15px;font-weight:700;color:#0a52ff;font-family:Arial,Helvetica,sans-serif;">${timeStr}${endTimeStr ? " – " + endTimeStr : ""} IST</div>
      </td></tr>
      <tr><td style="padding:12px 20px;">
        <div style="font-size:11px;color:#667089;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;font-family:Arial,Helvetica,sans-serif;">${isOnline ? "&#127909; Meeting Platform" : "&#128205; Location"}</div>
        <div style="font-size:14px;color:#1a2540;font-family:Arial,Helvetica,sans-serif;">${isOnline ? typeLabel : (location || "—")}</div>
        ${isOnline && meetingLink ? `<div style="margin-top:4px;"><a href="${meetingLink}" style="font-size:12px;color:#0a52ff;text-decoration:none;word-break:break-all;">${meetingLink}</a></div>` : ""}
      </td></tr>
    </table>
  </td></tr>

  <!-- CTA -->
  <tr><td style="padding:0 24px 24px;text-align:center;">
    ${actionBtn}
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#0036c7;padding:20px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
      <td><div style="font-size:22px;font-weight:700;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">CENTRIK</div></td>
      <td align="right"><a href="${supportUrl}" style="font-size:12px;color:rgba(255,255,255,0.8);text-decoration:none;">Contact: ${hostEmail || FROM_ADDR}</a></td>
    </tr></table>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  const text = `Meeting Reminder: ${timeLabel}\n\n${title}\nDate: ${dateStr}\nTime: ${timeStr}${endTimeStr ? " – " + endTimeStr : ""} IST\n${isOnline ? `Join: ${meetingLink || typeLabel}` : `Location: ${location || "—"}`}\n\nOrganized by ${hostName || "Ccentrik Team"}\n\n— Ccentrik CRM`;

  // Transport: per-user SMTP if available, else global SMTP, else Resend
  const subjectLine  = `Reminder ${timeLabel}: ${title}`;
  const fromDisplay  = `${hostName || FROM_NAME} <${hostEmail || COMPANY_EMAIL}>`;

  if (globalTransport) {
    return globalTransport.sendMail({ from: fromDisplay, to, subject: subjectLine, html, text });
  }
  if (!resend) { console.warn("[sendMeetingReminder] No email transport available"); return { skipped: true }; }
  const result = await resend.emails.send({ from: FROM, to: Array.isArray(to) ? to : [to], subject: subjectLine, html, text });
  if (result.error) throw new Error(result.error.message || "Resend send failed");
  return result;
};

module.exports = { sendMail, sendWelcomeEmail, sendNotificationEmail, sendSensitiveFieldAlert, sendMeetingInviteEmail, sendMeetingCancellationEmail, sendMeetingReminderEmail };
