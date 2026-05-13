const { Resend } = require("resend");
const crypto = require("crypto");

let _resend = null;
const getResend = () => {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
};

const FROM = () =>
  `${process.env.MAIL_FROM_NAME || "Ccentrik CRM"} <${process.env.MAIL_FROM_ADDRESS || "noreply@ccentrik.com"}>`;
const APP_URL = process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes("localhost")
  ? process.env.FRONTEND_URL
  : "https://ccentrik-crm.web.app";

const BRAND = {
  gradient: "linear-gradient(135deg,#0B1120 0%,#1B3A6B 100%)",
  accent: "#3B82F6",
  accentDark: "#1D4ED8",
};

function baseLayout(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F1F5F9;padding:40px 0;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto;">

        <!-- Header -->
        <tr><td style="background:${BRAND.gradient};border-radius:16px 16px 0 0;padding:32px 36px 28px;text-align:center;">
          <p style="margin:0 0 6px;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.5);">CCENTRIK</p>
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;">${title}</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#FFFFFF;padding:36px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;">
          ${bodyHtml}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#F8FAFC;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 16px 16px;padding:20px 36px;text-align:center;">
          <p style="margin:0;font-size:11.5px;color:#94A3B8;line-height:1.7;">
            © ${new Date().getFullYear()} Ccentrik &nbsp;·&nbsp; This is an automated system message — please do not reply directly.<br/>
            You received this because your account was provisioned on Ccentrik CRM.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function credentialBox(rows) {
  const cells = rows.map(([label, value, mono]) => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #F1F5F9;font-size:12.5px;color:#64748B;width:44%;">${label}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #F1F5F9;font-size:12.5px;font-weight:600;color:#0F172A;${mono ? "font-family:monospace;background:#F8FAFC;" : ""}">${value}</td>
    </tr>`).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;margin:20px 0;overflow:hidden;">${cells}</table>`;
}

function ctaButton(label, url) {
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 20px;">
    <tr><td style="background:${BRAND.accent};border-radius:8px;">
      <a href="${url}" style="display:inline-block;padding:13px 32px;font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;letter-spacing:-0.2px;">${label} →</a>
    </td></tr>
  </table>`;
}

function warningBox(text) {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
    <tr><td style="background:#FEF3C7;border:1px solid #FCD34D;border-left:4px solid #F59E0B;border-radius:8px;padding:12px 14px;font-size:13px;color:#78350F;">
      ⚠️ ${text}
    </td></tr>
  </table>`;
}

// ─── Welcome / Invitation ─────────────────────────────────────────────────────

const sendWelcomeEmail = async ({ to, loginEmail, name, tempPassword, role }) => {
  const displayEmail = loginEmail || to;
  const roleLabel = role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const html = baseLayout("Welcome to Ccentrik CRM", `
    <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#0F172A;">Hi ${name},</p>
    <p style="margin:0 0 22px;font-size:14px;color:#475569;line-height:1.65;">
      You've been invited to <strong>Ccentrik CRM</strong>. Your account is active and ready. Use the credentials below to sign in for the first time.
    </p>
    ${credentialBox([
      ["Login Email", displayEmail, false],
      ["Temporary Password", tempPassword, true],
      ["Your Role", roleLabel, false],
    ])}
    ${ctaButton("Login to Ccentrik CRM", `${APP_URL}/login`)}
    ${warningBox("Change your password immediately after your first login to secure your account.")}
  `);

  const text = `Hi ${name},\n\nYou've been invited to Ccentrik CRM.\n\nLogin Email: ${displayEmail}\nTemporary Password: ${tempPassword}\nRole: ${roleLabel}\n\nLogin at: ${APP_URL}/login\n\nChange your password immediately after first login.\n\n— Ccentrik CRM`;

  return getResend().emails.send({
    from: FROM(),
    to: [to],
    reply_to: "support@ccentrik.com",
    subject: "You've been invited to Ccentrik CRM",
    html,
    text,
    headers: {
      "X-Entity-Ref-ID": crypto.randomUUID(),
      "List-Unsubscribe": "<mailto:unsubscribe@ccentrik.com>",
    },
    tags: [{ name: "category", value: "invitation" }],
  });
};

// ─── Password Reset ───────────────────────────────────────────────────────────

const sendPasswordResetEmail = async ({ to, name, resetLink, expiresInMinutes = 60 }) => {
  const html = baseLayout("Reset Your Password", `
    <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#0F172A;">Hi ${name || "there"},</p>
    <p style="margin:0 0 22px;font-size:14px;color:#475569;line-height:1.65;">
      We received a request to reset the password for your Ccentrik CRM account. Click the button below to set a new password. This link is valid for <strong>${expiresInMinutes} minutes</strong>.
    </p>
    ${ctaButton("Reset My Password", resetLink)}
    <p style="margin:20px 0 0;font-size:13px;color:#64748B;line-height:1.65;">
      If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.<br/><br/>
      Or copy this link into your browser:<br/>
      <span style="word-break:break-all;color:${BRAND.accent};font-size:12px;">${resetLink}</span>
    </p>
  `);

  const text = `Hi ${name || "there"},\n\nReset your Ccentrik CRM password by visiting:\n${resetLink}\n\nThis link expires in ${expiresInMinutes} minutes.\n\nIf you didn't request this, ignore this email.\n\n— Ccentrik CRM`;

  return getResend().emails.send({
    from: FROM(),
    to: [to],
    reply_to: "support@ccentrik.com",
    subject: "Reset your Ccentrik CRM password",
    html,
    text,
    headers: {
      "X-Entity-Ref-ID": crypto.randomUUID(),
    },
    tags: [{ name: "category", value: "password-reset" }],
  });
};

// ─── System Notification ──────────────────────────────────────────────────────

const sendNotificationEmail = async ({ to, name, subject, title, message, ctaLabel, ctaUrl }) => {
  const buttonHtml = ctaLabel && ctaUrl ? ctaButton(ctaLabel, ctaUrl) : "";

  const html = baseLayout(title || subject, `
    <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#0F172A;">Hi ${name || "there"},</p>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.65;">${message}</p>
    ${buttonHtml}
  `);

  const text = `Hi ${name || "there"},\n\n${message}${ctaUrl ? `\n\n${ctaLabel || "Open"}: ${ctaUrl}` : ""}\n\n— Ccentrik CRM`;

  return getResend().emails.send({
    from: FROM(),
    to: [to],
    reply_to: "support@ccentrik.com",
    subject,
    html,
    text,
    headers: {
      "X-Entity-Ref-ID": crypto.randomUUID(),
      "List-Unsubscribe": "<mailto:unsubscribe@ccentrik.com>",
    },
    tags: [{ name: "category", value: "notification" }],
  });
};

module.exports = { sendWelcomeEmail, sendPasswordResetEmail, sendNotificationEmail };
