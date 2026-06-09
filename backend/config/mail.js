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

  const LOGO_URL = "https://ccentrik-crm.web.app/logo-blue.png";
  const isGoogleMeetInvite = meetingType === "google_meet";
  const isTeamsInvite      = meetingType === "teams";
  const isInPersonInvite   = meetingType === "in_person" || meetingType === "in-person";

  const locationRowHtml = isInPersonInvite ? `
      <tr>
        <td style="padding:14px 20px;border-bottom:1px solid #e8edf5;vertical-align:top;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="top">
            <td width="36" style="padding-right:14px;padding-top:2px;">
              <div style="width:32px;height:32px;background:#1a3569;border-radius:8px;text-align:center;line-height:32px;font-size:16px;color:#ffffff;">&#128205;</div>
            </td>
            <td>
              <div style="font-size:11px;font-weight:700;color:#8896b0;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Location</div>
              <div style="font-size:14px;color:#1a2540;font-weight:600;">${location || "Venue TBD"}</div>
              ${location ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}" target="_blank" style="display:inline-block;margin-top:6px;font-size:12px;color:#1a56db;text-decoration:none;">&#128506; View on Google Maps</a>` : ""}
            </td>
          </tr></table>
        </td>
      </tr>` : meetingLink ? `
      <tr>
        <td style="padding:14px 20px;border-bottom:1px solid #e8edf5;vertical-align:top;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="top">
            <td width="36" style="padding-right:14px;padding-top:2px;">
              <div style="width:32px;height:32px;background:${isTeamsInvite ? "#6264a7" : "#1a3569"};border-radius:8px;text-align:center;line-height:32px;font-size:16px;">&#127909;</div>
            </td>
            <td>
              <div style="font-size:11px;font-weight:700;color:#8896b0;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Meeting Link</div>
              <div style="font-size:13px;color:#1a2540;margin-bottom:8px;">Online Meeting — ${isGoogleMeetInvite ? "Google Meet" : isTeamsInvite ? "Microsoft Teams" : "Virtual"}</div>
              <a href="${meetingLink}" target="_blank" style="display:inline-block;background:${isTeamsInvite ? "#6264a7" : isGoogleMeetInvite ? "#1a73e8" : "#1a3569"};color:#ffffff;padding:9px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">${isGoogleMeetInvite ? "&#127909; Join on Google Meet" : isTeamsInvite ? "&#128188; Join on Microsoft Teams" : "&#9654; Join Meeting"}</a>
            </td>
          </tr></table>
        </td>
      </tr>` : "";

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Meeting Invitation – ${title || "Meeting"}</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f9;font-family:Arial,Helvetica,sans-serif;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0f4f9" style="background:#f0f4f9;">
<tr><td align="center" style="padding:28px 16px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.10);">

  <!-- ═══ HEADER ═══ -->
  <tr>
    <td style="background:#1a3569;padding:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding:18px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
              <td>
                <img src="${LOGO_URL}" alt="CCENTRIK" height="30" style="display:block;border:0;filter:brightness(0) invert(1);" />
              </td>
              <td align="right" style="font-size:12px;color:rgba(255,255,255,0.80);font-style:italic;white-space:nowrap;padding-left:12px;">
                Driving Technology. Enabling Growth.
              </td>
            </tr></table>
          </td>
        </tr>
        <!-- diagonal accent strip -->
        <tr>
          <td style="height:6px;background:linear-gradient(90deg,#2563eb,#1e40af,#1a3569);font-size:0;line-height:0;">&nbsp;</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ═══ HERO ═══ -->
  <tr>
    <td style="padding:32px 28px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
        <td style="padding-right:18px;" width="68">
          <div style="width:64px;height:64px;background:#eaf0fb;border-radius:14px;text-align:center;line-height:64px;font-size:30px;">&#128197;</div>
        </td>
        <td>
          <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#1a2540;font-family:Arial,Helvetica,sans-serif;">You Have Been Invited!</h1>
          <p style="margin:0;font-size:13.5px;color:#5a6a85;line-height:1.6;">Dear <strong style="color:#1a2540;">${customerName || "there"}</strong>, you have been invited to a meeting with <strong style="color:#1a56db;">Ccentrik</strong>. Please find the meeting details below.</p>
        </td>
      </tr></table>
    </td>
  </tr>

  ${purposeLabel ? `
  <!-- ═══ PURPOSE BOX ═══ -->
  <tr>
    <td style="padding:0 28px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1.5px solid #c7d7f0;border-radius:10px;background:#f5f8ff;">
        <tr><td style="padding:16px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
            <td width="36" style="padding-right:14px;">
              <div style="width:32px;height:32px;background:#1a3569;border-radius:8px;text-align:center;line-height:32px;font-size:16px;">&#128100;</div>
            </td>
            <td>
              <div style="font-size:11px;font-weight:700;color:#1a56db;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">Purpose of the Meeting</div>
              <div style="font-size:13.5px;color:#374151;line-height:1.6;">${purposeLabel}</div>
            </td>
          </tr></table>
        </td></tr>
      </table>
    </td>
  </tr>` : ""}

  <!-- ═══ MEETING DETAILS ═══ -->
  <tr>
    <td style="padding:0 28px 20px;">
      <div style="font-size:16px;font-weight:700;color:#1a2540;margin-bottom:12px;font-family:Arial,Helvetica,sans-serif;">&#128197; Meeting Details</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1.5px solid #e0e8f5;border-radius:10px;overflow:hidden;">

        <!-- Title -->
        <tr>
          <td style="padding:14px 20px;border-bottom:1px solid #e8edf5;background:#f8fafc;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
              <td width="36" style="padding-right:14px;">
                <div style="width:32px;height:32px;background:#1a3569;border-radius:8px;text-align:center;line-height:32px;font-size:16px;color:#ffffff;">&#128197;</div>
              </td>
              <td>
                <div style="font-size:11px;font-weight:700;color:#8896b0;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;">Meeting Title</div>
                <div style="font-size:14px;font-weight:700;color:#1a2540;">${title || "—"}</div>
              </td>
            </tr></table>
          </td>
        </tr>

        <!-- Date -->
        <tr>
          <td style="padding:14px 20px;border-bottom:1px solid #e8edf5;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
              <td width="36" style="padding-right:14px;">
                <div style="width:32px;height:32px;background:#1a3569;border-radius:8px;text-align:center;line-height:32px;font-size:16px;color:#ffffff;">&#128198;</div>
              </td>
              <td>
                <div style="font-size:11px;font-weight:700;color:#8896b0;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;">Date</div>
                <div style="font-size:14px;color:#1a2540;">${dateStr}</div>
              </td>
            </tr></table>
          </td>
        </tr>

        <!-- Time -->
        <tr>
          <td style="padding:14px 20px;border-bottom:1px solid #e8edf5;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
              <td width="36" style="padding-right:14px;">
                <div style="width:32px;height:32px;background:#1a3569;border-radius:8px;text-align:center;line-height:32px;font-size:16px;color:#ffffff;">&#128336;</div>
              </td>
              <td>
                <div style="font-size:11px;font-weight:700;color:#8896b0;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;">Time</div>
                <div style="font-size:14px;color:#1a2540;">${timeStr}${endTimeStr ? ` – ${endTimeStr}` : ""} (IST)${durationStr ? `<span style="color:#6b7a99;font-size:12px;margin-left:6px;">${durationStr}</span>` : ""}</div>
              </td>
            </tr></table>
          </td>
        </tr>

        <!-- Location / Meeting Link -->
        ${locationRowHtml}

        ${description ? `
        <!-- Reason / Agenda -->
        <tr>
          <td style="padding:14px 20px;border-bottom:1px solid #e8edf5;vertical-align:top;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="top">
              <td width="36" style="padding-right:14px;padding-top:2px;">
                <div style="width:32px;height:32px;background:#1a3569;border-radius:8px;text-align:center;line-height:32px;font-size:16px;color:#ffffff;">&#128196;</div>
              </td>
              <td>
                <div style="font-size:11px;font-weight:700;color:#8896b0;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;">Reason / Agenda</div>
                <div style="font-size:13.5px;color:#374151;line-height:1.7;">${description.replace(/\n/g, "<br/>")}</div>
              </td>
            </tr></table>
          </td>
        </tr>` : ""}

        <!-- Organizer -->
        <tr>
          <td style="padding:14px 20px;vertical-align:top;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
              <td width="36" style="padding-right:14px;">
                <div style="width:32px;height:32px;background:#1a3569;border-radius:8px;text-align:center;line-height:32px;font-size:16px;color:#ffffff;">&#128100;</div>
              </td>
              <td>
                <div style="font-size:11px;font-weight:700;color:#8896b0;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;">Organizer</div>
                <div style="font-size:14px;color:#1a2540;font-weight:600;">${hostName || "Ccentrik Team"}${companyName ? `<span style="color:#6b7a99;font-weight:400;font-size:13px;"> | ${companyName}</span>` : ""}</div>
                ${hostEmail ? `<div style="font-size:12px;margin-top:2px;"><a href="mailto:${hostEmail}" style="color:#1a56db;text-decoration:none;">${hostEmail}</a></div>` : ""}
              </td>
            </tr></table>
          </td>
        </tr>

      </table>
    </td>
  </tr>

  <!-- ═══ ADD TO CALENDAR ═══ -->
  <tr>
    <td style="padding:0 28px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1.5px solid #e0e8f5;border-radius:10px;overflow:hidden;">
        <tr><td style="padding:16px 20px;">
          <div style="font-size:13px;font-weight:700;color:#1a56db;margin-bottom:12px;">&#128197; Add to your calendar</div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="padding-right:8px;">
              <a href="${gcalUrl}" target="_blank" style="display:inline-block;background:#ffffff;border:1.5px solid #d0daea;padding:8px 14px;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;color:#374151;">&#128198; Google Calendar</a>
            </td>
            <td style="padding-right:8px;">
              <a href="${outlookCalUrl}" target="_blank" style="display:inline-block;background:#ffffff;border:1.5px solid #d0daea;padding:8px 14px;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;color:#374151;">&#128188; Outlook</a>
            </td>
            ${appleCalUrl ? `<td><a href="${appleCalUrl}" target="_blank" style="display:inline-block;background:#ffffff;border:1.5px solid #d0daea;padding:8px 14px;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;color:#374151;">&#63743; Apple Calendar</a></td>` : ""}
          </tr></table>
        </td></tr>
      </table>
    </td>
  </tr>

  <!-- ═══ CTA BANNER ═══ -->
  <tr>
    <td style="padding:0 28px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a3569;border-radius:10px;">
        <tr><td style="padding:18px 22px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
            <td style="padding-right:14px;" width="36">
              <div style="font-size:24px;">&#128197;</div>
            </td>
            <td>
              <div style="font-size:14px;font-weight:700;color:#ffffff;margin-bottom:3px;">We look forward to your valuable time and insights.</div>
              <div style="font-size:12.5px;color:rgba(255,255,255,0.78);">Please confirm your availability at your earliest convenience.</div>
            </td>
          </tr></table>
        </td></tr>
      </table>
    </td>
  </tr>

  <!-- ═══ SIGNATURE ═══ -->
  <tr>
    <td style="padding:0 28px 24px;border-top:1px solid #e8edf5;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding-top:20px;"><tr valign="top">
        <td style="padding-right:16px;">
          <div style="font-size:13.5px;color:#374151;line-height:1.8;">
            Best Regards,<br/>
            <strong style="color:#1a2540;">${hostName || "Ccentrik Team"}</strong><br/>
            ${companyName ? `<span style="color:#5a6a85;">${companyName}</span><br/>` : ""}
            ${hostEmail ? `<a href="mailto:${hostEmail}" style="color:#1a56db;text-decoration:none;font-size:13px;">${hostEmail}</a><br/>` : ""}
            <span style="color:#5a6a85;font-size:12px;">Ccentrik &nbsp;|&nbsp; www.ccentrik.com</span>
          </div>
        </td>
        <td align="right" valign="middle" style="padding-top:4px;">
          <img src="${LOGO_URL}" alt="Ccentrik" height="28" style="display:block;border:0;" />
        </td>
      </tr></table>
    </td>
  </tr>

  <!-- ═══ FOOTER ═══ -->
  <tr>
    <td style="background:#1a3569;padding:14px 28px;border-radius:0 0 14px 14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
        <td>
          <a href="https://www.ccentrik.in" style="color:rgba(255,255,255,0.75);font-size:11px;text-decoration:none;margin-right:14px;">&#127760; www.ccentrik.in</a>
          <a href="mailto:info@ccentrik.in" style="color:rgba(255,255,255,0.75);font-size:11px;text-decoration:none;margin-right:14px;">&#128231; info@ccentrik.in</a>
          <span style="color:rgba(255,255,255,0.75);font-size:11px;">&#128222; +91 124 479 3900</span>
        </td>
        <td align="right">
          <span style="color:rgba(255,255,255,0.60);font-size:11px;">India | USA | UAE</span>
        </td>
      </tr></table>
    </td>
  </tr>

</table>

</td></tr>
</table>

</body>
</html>`;

  const text = `Dear ${customerName || "there"},\n\nYou have been invited to a meeting with Ccentrik. Please find the meeting details below.\n\nMeeting Title: ${title}\nDate: ${dateStr}\nTime: ${timeStr}${endTimeStr ? " – " + endTimeStr : ""} (IST)${durationStr ? " · " + durationStr : ""}${purposeLabel ? "\nPurpose: " + purposeLabel : ""}${meetingLink ? "\nMeeting Link: " + meetingLink : location ? "\nLocation: " + location : ""}${description ? "\n\nReason / Agenda:\n" + description : ""}\n\nWe look forward to your valuable time and insights. Please confirm your availability at your earliest convenience.\n\nBest Regards,\n${hostName || "Ccentrik Team"}${companyName ? "\n" + companyName : ""}${hostEmail ? "\n" + hostEmail : ""}\n\nCcentrik | www.ccentrik.com | info@ccentrik.in | +91 124 479 3900`;

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
  const subjectLine     = `Meeting Invitation – ${title}`;

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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Meeting Cancelled</title>
</head>
<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#1a1a1a;">

<p style="margin:0 0 16px;">Hello ${customerName || "there"},</p>

<p style="margin:0 0 16px;">We regret to inform you that the following meeting has been cancelled.</p>

<p style="margin:0 0 16px;">
<strong>Meeting Title:</strong> ${title}<br/>
<strong>Originally Scheduled:</strong> ${dateStr}
</p>

<p style="margin:0 0 16px;">The calendar event has been automatically removed. We apologize for any inconvenience.</p>

<p style="margin:0 0 16px;">If you have any questions, please feel free to reach out.</p>

<p style="margin:0;">
Regards,<br/>
<strong>${hostName || "The Ccentrik Team"}</strong>${hostEmail ? `<br/><a href="mailto:${hostEmail}" style="color:#1a56db;">${hostEmail}</a>` : ""}
</p>

</body>
</html>`;

  const text = `Hello ${customerName || "there"},\n\nWe regret to inform you that the meeting "${title}" scheduled for ${dateStr} has been cancelled.\n\nThe calendar event has been automatically removed. We apologize for any inconvenience.\n\nIf you have any questions, please feel free to reach out.\n\nRegards,\n${hostName || "The Ccentrik Team"}${hostEmail ? "\n" + hostEmail : ""}`;

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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Meeting Reminder</title>
</head>
<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#1a1a1a;">

<p style="margin:0 0 16px;">Hello ${customerName || "there"},</p>

<p style="margin:0 0 16px;">This is a reminder that you have a meeting <strong>${timeLabel}</strong>.</p>

<p style="margin:0 0 16px;">
<strong>Meeting Title:</strong> ${title}<br/>
<strong>Date:</strong> ${dateStr}<br/>
<strong>Time:</strong> ${timeStr}${endTimeStr ? ` – ${endTimeStr}` : ""} (IST)${isOnline && meetingLink ? `<br/><strong>Meeting Link:</strong> <a href="${meetingLink}" style="color:#1a56db;">${meetingLink}</a>` : (!isOnline && location ? `<br/><strong>Location:</strong> ${location}` : "")}
</p>

<p style="margin:0 0 16px;">Please let me know if you have any questions.</p>

<p style="margin:0;">
Regards,<br/>
<strong>${hostName || "The Ccentrik Team"}</strong>${hostEmail ? `<br/><a href="mailto:${hostEmail}" style="color:#1a56db;">${hostEmail}</a>` : ""}
</p>

</body>
</html>`;

  const text = `Meeting Reminder: ${timeLabel}\n\n${title}\nDate: ${dateStr}\nTime: ${timeStr}${endTimeStr ? " – " + endTimeStr : ""} IST\n${isOnline ? "Meeting Link: " + (meetingLink || typeLabel) : "Location: " + (location || "—")}\n\nRegards,\n${hostName || "Ccentrik Team"}${hostEmail ? "\n" + hostEmail : ""}`;

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
