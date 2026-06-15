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

const sendMail = async ({ to, subject, html, text, replyTo, attachments }) => {
  // Try Resend first if configured
  if (resend) {
    try {
      const result = await resend.emails.send({
        from:    FROM,
        to:      Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
        ...(replyTo     ? { reply_to: replyTo } : {}),
        ...(attachments ? { attachments }        : {}),
      });
      if (result.error) throw new Error(result.error.message || "Resend send failed");
      return result;
    } catch (resendErr) {
      console.warn("[sendMail] Resend failed:", resendErr.message, "— falling back to Gmail SMTP");
    }
  }

  // Fall back to Gmail / SMTP transport
  if (globalTransport) {
    return globalTransport.sendMail({
      from:    FROM,
      to:      Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      ...(replyTo     ? { replyTo }     : {}),
      ...(attachments ? { attachments } : {}),
    });
  }

  console.warn("[sendMail] No email transport configured — email skipped:", subject);
  return { skipped: true };
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
const sendMeetingInviteEmail = async ({ to, customerName, title, startTime, endTime, meetingType, meetingLink, location, description, hostName, hostEmail, senderEmail, senderPassword, meetingPurpose, companyName, meetingId, sequence = 0, allAttendees = [], gmailAccessToken = null }) => {
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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Meeting Invitation &#8211; ${title || "Meeting"}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6fb;">
<tr><td align="center" style="padding:28px 12px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.09);">

  <!-- HEADER: logo + badge -->
  <tr>
    <td style="padding:18px 28px;border-bottom:1px solid #f0f2f8;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr valign="middle">
          <td><img src="${LOGO}" alt="Ccentrik" height="30" style="display:block;border:0;"/></td>
          <td align="right" style="font-size:11px;font-weight:700;color:#0a52ff;text-transform:uppercase;letter-spacing:0.12em;white-space:nowrap;">&#11015; MEETING INVITATION</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- HERO: heading + date widget -->
  <tr>
    <td style="padding:32px 28px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr valign="top">
          <td style="padding-right:20px;">
            <div style="font-size:36px;font-weight:800;color:#111827;line-height:1.1;font-family:Arial,Helvetica,sans-serif;">You're Invited</div>
            <div style="font-size:36px;font-weight:800;color:#0a52ff;line-height:1.1;margin-bottom:16px;font-family:Arial,Helvetica,sans-serif;">to a Meeting</div>
            <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">
              <strong>${hostName || "Ccentrik Team"}</strong> from <strong style="color:#0a52ff;">CCENTRIK</strong> has invited you to a meeting regarding <strong>${title}</strong>.
            </p>
            ${purposeLabel ? `<span style="display:inline-block;border:1.5px solid #0a52ff;color:#0a52ff;font-size:12px;font-weight:600;padding:4px 14px;border-radius:20px;font-family:Arial,Helvetica,sans-serif;">Purpose: ${purposeLabel}</span>` : ""}
          </td>
          <td width="170" style="min-width:150px;">
            <table role="presentation" width="170" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f4;border-radius:14px;overflow:hidden;">
              <tr>
                <td align="center" style="background:#0a52ff;padding:9px 8px;">
                  <span style="font-size:10px;font-weight:700;color:#ffffff;letter-spacing:0.13em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">${monthYearLabel}</span>
                </td>
              </tr>
              <tr>
                <td align="center" style="background:#ffffff;padding:14px 8px 16px;">
                  <div style="font-size:58px;font-weight:800;color:#111827;line-height:1;font-family:Arial,Helvetica,sans-serif;">${dayNum}</div>
                  <div style="font-size:13px;color:#6B7280;font-weight:500;margin-top:4px;font-family:Arial,Helvetica,sans-serif;">${dayNameStr}</div>
                  <div style="height:1px;background:#e2e8f4;margin:10px 14px;"></div>
                  <div style="font-size:12px;color:#0a52ff;font-weight:700;font-family:Arial,Helvetica,sans-serif;">${timeStr}${endTimeStr ? " &#8211; " + endTimeStr : ""} IST</div>
                  ${durationStr ? `<div style="font-size:11px;color:#9CA3AF;margin-top:3px;font-family:Arial,Helvetica,sans-serif;">${durationStr}</div>` : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- TWO-COLUMN: meeting details (left) + date/mode/organizer (right) -->
  <tr>
    <td style="padding:0 28px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr valign="top">

          <!-- LEFT: Meeting Details card -->
          <td width="52%" style="padding-right:8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f4;border-radius:12px;overflow:hidden;">
              <tr>
                <td style="background:#f5f8ff;padding:11px 16px;border-bottom:1px solid #e2e8f4;">
                  <span style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.08em;font-family:Arial,Helvetica,sans-serif;">&#128197; MEETING DETAILS</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 16px 8px;">
                  <div style="margin-bottom:12px;">
                    <div style="font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;font-family:Arial,Helvetica,sans-serif;">Meeting Title</div>
                    <div style="font-size:14px;font-weight:700;color:#111827;font-family:Arial,Helvetica,sans-serif;">${title}</div>
                  </div>
                  <div style="margin-bottom:12px;">
                    <div style="font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;font-family:Arial,Helvetica,sans-serif;">Organized By</div>
                    <div style="font-size:14px;font-weight:700;color:#111827;font-family:Arial,Helvetica,sans-serif;">${hostName || "Ccentrik Team"}</div>
                    ${companyName ? `<div style="font-size:12px;color:#6B7280;font-family:Arial,Helvetica,sans-serif;">${companyName}</div>` : ""}
                  </div>
                  ${hostEmail ? `<div style="margin-bottom:12px;">
                    <div style="font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;font-family:Arial,Helvetica,sans-serif;">Organizer Email</div>
                    <div style="font-size:13px;color:#0a52ff;font-family:Arial,Helvetica,sans-serif;">${hostEmail}</div>
                  </div>` : ""}
                  ${companyName ? `<div style="margin-bottom:12px;">
                    <div style="font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;font-family:Arial,Helvetica,sans-serif;">Company</div>
                    <div style="font-size:14px;font-weight:700;color:#111827;font-family:Arial,Helvetica,sans-serif;">${companyName}</div>
                  </div>` : ""}
                  <div style="margin-bottom:12px;">
                    <div style="font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;font-family:Arial,Helvetica,sans-serif;">Date &amp; Time</div>
                    <div style="font-size:13px;color:#374151;font-family:Arial,Helvetica,sans-serif;">${dayMonthStr} &bull; ${timeStr}${endTimeStr ? " &#8211; " + endTimeStr : ""} IST</div>
                  </div>
                  <div style="margin-bottom:${meetingLink ? "12px" : "8px"};">
                    <div style="font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;font-family:Arial,Helvetica,sans-serif;">Meeting Type</div>
                    <div style="font-size:14px;color:#374151;font-family:Arial,Helvetica,sans-serif;">${typeLabel}</div>
                  </div>
                  ${meetingLink ? `<div style="margin-bottom:8px;">
                    <div style="font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;font-family:Arial,Helvetica,sans-serif;">Meeting Link</div>
                    <a href="${meetingLink}" target="_blank" style="font-size:13px;color:#0a52ff;text-decoration:none;word-break:break-all;font-family:Arial,Helvetica,sans-serif;">${meetingLink}</a>
                  </div>` : ""}
                </td>
              </tr>
            </table>
          </td>

          <!-- RIGHT: stacked cards -->
          <td width="48%" style="padding-left:8px;">

            <!-- Date & Time card -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f4;border-radius:12px;overflow:hidden;margin-bottom:8px;">
              <tr>
                <td style="background:#f5f8ff;padding:11px 16px;border-bottom:1px solid #e2e8f4;">
                  <span style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.08em;font-family:Arial,Helvetica,sans-serif;">&#128197; DATE &amp; TIME</span>
                </td>
              </tr>
              <tr>
                <td style="padding:13px 16px;">
                  <div style="font-size:12px;color:#6B7280;margin-bottom:2px;font-family:Arial,Helvetica,sans-serif;">${dayNameStr}</div>
                  <div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:7px;font-family:Arial,Helvetica,sans-serif;">${dayMonthStr}</div>
                  <div style="font-size:14px;font-weight:600;color:#111827;margin-bottom:3px;font-family:Arial,Helvetica,sans-serif;">${timeStr}${endTimeStr ? " &#8211; " + endTimeStr : ""}</div>
                  <div style="font-size:11px;color:#6B7280;margin-bottom:12px;font-family:Arial,Helvetica,sans-serif;">India Standard Time (IST)${durationStr ? " &bull; " + durationStr : ""}</div>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="padding-right:5px;">
                        <a href="${gcalUrl}" target="_blank" style="display:block;text-align:center;background:#0a52ff;color:#ffffff;font-size:11px;font-weight:700;padding:8px 4px;border-radius:8px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">&#128197; Add to Google Calendar</a>
                      </td>
                      <td style="padding-left:5px;">
                        <a href="${outlookCalUrl}" target="_blank" style="display:block;text-align:center;background:#ffffff;border:1px solid #d1d5db;color:#374151;font-size:11px;font-weight:600;padding:8px 4px;border-radius:8px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">+ Add to My Calendar</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Meeting Mode card -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f4;border-radius:12px;overflow:hidden;margin-bottom:8px;">
              <tr>
                <td style="background:#f5f8ff;padding:11px 16px;border-bottom:1px solid #e2e8f4;">
                  <span style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.08em;font-family:Arial,Helvetica,sans-serif;">&#128250; MEETING MODE</span>
                </td>
              </tr>
              <tr>
                <td style="padding:13px 16px;">
                  <div style="font-size:15px;font-weight:700;color:#111827;font-family:Arial,Helvetica,sans-serif;">${isGoogleMeet ? "Google Meet" : isTeams ? "Microsoft Teams" : isZoom ? "Zoom Meeting" : isInPerson ? "In-Person Meeting" : typeLabel}</div>
                  ${meetingLink ? `<div style="margin-top:6px;"><a href="${meetingLink}" target="_blank" style="font-size:12px;color:#0a52ff;text-decoration:none;word-break:break-all;font-family:Arial,Helvetica,sans-serif;">${meetingLink}</a></div>` : ""}
                  ${isInPerson && location ? `<div style="margin-top:6px;font-size:13px;color:#374151;font-family:Arial,Helvetica,sans-serif;">&#128205; ${location}</div>` : ""}
                </td>
              </tr>
            </table>

            <!-- Organizer card -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f4;border-radius:12px;overflow:hidden;">
              <tr>
                <td style="background:#f5f8ff;padding:11px 16px;border-bottom:1px solid #e2e8f4;">
                  <span style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.08em;font-family:Arial,Helvetica,sans-serif;">&#128101; ORGANIZER</span>
                </td>
              </tr>
              <tr>
                <td style="padding:13px 16px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr valign="middle">
                      <td style="padding-right:11px;">
                        <div style="width:38px;height:38px;background:#dbe4f7;border-radius:50%;text-align:center;line-height:38px;font-size:13px;font-weight:700;color:#374151;font-family:Arial,Helvetica,sans-serif;">${hostInitials}</div>
                      </td>
                      <td>
                        <div style="font-size:14px;font-weight:700;color:#111827;font-family:Arial,Helvetica,sans-serif;">${hostName || "Ccentrik Team"}</div>
                        <div style="font-size:12px;color:#0a52ff;font-family:Arial,Helvetica,sans-serif;">${hostEmail || ""}</div>
                        <div style="font-size:11px;color:#9CA3AF;font-family:Arial,Helvetica,sans-serif;">Organizer</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- AGENDA + HELP row -->
  <tr>
    <td style="padding:0 28px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr valign="top">
          <td width="52%" style="padding-right:8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f4;border-radius:12px;overflow:hidden;">
              <tr>
                <td style="background:#f5f8ff;padding:11px 16px;border-bottom:1px solid #e2e8f4;">
                  <span style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.08em;font-family:Arial,Helvetica,sans-serif;">&#128221; AGENDA / NOTES</span>
                </td>
              </tr>
              <tr>
                <td style="padding:13px 16px;">
                  <div style="font-size:14px;color:#374151;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">${description ? description.replace(/\n/g, "<br/>") : "<span style=\"color:#9CA3AF;font-style:italic;\">No agenda provided</span>"}</div>
                </td>
              </tr>
            </table>
          </td>
          <td width="48%" style="padding-left:8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f4;border-radius:12px;overflow:hidden;">
              <tr>
                <td style="background:#f5f8ff;padding:11px 16px;border-bottom:1px solid #e2e8f4;">
                  <span style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.08em;font-family:Arial,Helvetica,sans-serif;">&#127911; NEED HELP?</span>
                </td>
              </tr>
              <tr>
                <td style="padding:13px 16px;">
                  <div style="font-size:13px;color:#374151;line-height:1.6;margin-bottom:8px;font-family:Arial,Helvetica,sans-serif;">If you have any questions, feel free to reach out.</div>
                  <div style="font-size:13px;font-weight:600;color:#0a52ff;font-family:Arial,Helvetica,sans-serif;">${hostEmail || "support@ccentrik.com"}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Green confirmation banner -->
  <tr>
    <td style="padding:0 28px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;">
        <tr valign="top">
          <td width="44" style="padding:15px 0 15px 18px;">
            <div style="width:26px;height:26px;background:#16a34a;border-radius:6px;text-align:center;line-height:26px;font-size:14px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">&#10003;</div>
          </td>
          <td style="padding:15px 18px 15px 10px;">
            <div style="font-size:14px;font-weight:700;color:#15803d;margin-bottom:3px;font-family:Arial,Helvetica,sans-serif;">This meeting has been scheduled by CCENTRIK.</div>
            <div style="font-size:13px;color:#16a34a;font-family:Arial,Helvetica,sans-serif;">You will receive reminders before the meeting starts.</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="padding:18px 28px 26px;border-top:1px solid #f0f2f8;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr valign="top">
          <td>
            <div style="font-size:17px;font-weight:800;color:#9CA3AF;letter-spacing:0.05em;font-family:Arial,Helvetica,sans-serif;">CCENTRIK</div>
            <div style="font-size:12px;color:#D1D5DB;margin-top:2px;font-family:Arial,Helvetica,sans-serif;">Driving Connections. Building Success.</div>
          </td>
          <td align="right">
            <div style="font-size:12px;color:#9CA3AF;margin-bottom:4px;font-family:Arial,Helvetica,sans-serif;">&#9993; support@ccentrik.com</div>
            <div style="font-size:12px;color:#9CA3AF;font-family:Arial,Helvetica,sans-serif;">&#127760; www.ccentrik.com</div>
          </td>
        </tr>
      </table>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid #f0f2f8;text-align:center;font-size:11px;color:#D1D5DB;font-family:Arial,Helvetica,sans-serif;">
        &copy; 2026 CCENTRIK CRM &middot; This is an automated meeting invitation &middot; Do not reply directly.
      </div>
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

  const subjectLine = `Meeting Invitation – ${title}`;

  // Gmail API first — uses stored OAuth2 token, HTTPS only, no domain verification needed
  if (gmailAccessToken) {
    const fromName  = hostName || FROM_NAME;
    const fromEmail = senderEmail || COMPANY_EMAIL;
    // fold base64 at 76 chars per line (RFC 2045)
    const foldB64 = (b64) => b64.match(/.{1,76}/g)?.join("\r\n") || b64;
    const icsB64  = foldB64(icsBuffer.toString("base64"));
    const ts      = Date.now();
    const b1      = `----=_Mixed_${ts}`;
    const b2      = `----=_Alt_${ts}`;
    const subjB64 = `=?UTF-8?B?${Buffer.from(subjectLine).toString("base64")}?=`;
    const toAddr  = Array.isArray(to) ? to.join(", ") : to;
    // Use 8bit transfer encoding for text/html and text/plain — avoids double-encoding the large HTML blob
    const mime = [
      `From: "${fromName}" <${fromEmail}>`,
      `To: ${toAddr}`,
      `Subject: ${subjB64}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${b1}"`,
      ``,
      `--${b1}`,
      `Content-Type: multipart/alternative; boundary="${b2}"`,
      ``,
      `--${b2}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: 8bit`,
      ``,
      text,
      `--${b2}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: 8bit`,
      ``,
      html,
      `--${b2}`,
      `Content-Type: text/calendar; method=REQUEST; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      icsB64,
      `--${b2}--`,
      `--${b1}`,
      `Content-Type: text/calendar; method=REQUEST; name="invite.ics"`,
      `Content-Disposition: attachment; filename="invite.ics"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      icsB64,
      `--${b1}--`,
    ].join("\r\n");
    const raw = Buffer.from(mime).toString("base64url");
    const resp = await fetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${gmailAccessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gmail API send failed (${resp.status})`);
    }
    return resp.json();
  }

  // Resend fallback — Vercel blocks outbound SMTP; Resend uses HTTPS
  if (resend) {
    const result = await resend.emails.send({
      from:        FROM,
      to:          Array.isArray(to) ? to : [to],
      subject:     subjectLine,
      html,
      text,
      ...(hostEmail ? { reply_to: hostEmail } : {}),
      attachments: [{
        filename:    "invite.ics",
        content:     icsBuffer,
        contentType: "text/calendar; method=REQUEST",
      }],
    });
    if (result.error) throw new Error(result.error.message || "Resend send failed");
    return result;
  }

  // SMTP fallback (local dev or non-Vercel hosting where SMTP is not blocked)
  const usePerUser = !!(senderEmail && senderPassword);
  const transport  = usePerUser
    ? nodemailer.createTransport({
        host: "smtp.gmail.com", port: 465, secure: true,
        auth: { user: senderEmail, pass: senderPassword },
        tls:  { rejectUnauthorized: false },
      })
    : globalTransport;

  const effectiveSender = usePerUser ? senderEmail : COMPANY_EMAIL;
  const fromDisplay     = `${hostName || FROM_NAME} <${effectiveSender}>`;

  if (transport) {
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

  console.warn("[sendMeetingInvite] No email transport available — invite skipped");
  return { skipped: true };
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
