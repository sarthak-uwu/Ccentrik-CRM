const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
});

const sendWelcomeEmail = async ({ to, loginEmail, name, tempPassword, role }) => {
  const displayEmail = loginEmail || to;
  const appUrl = process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes("localhost")
    ? process.env.FRONTEND_URL
    : "https://ccentrik-crm.web.app";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:Inter,-apple-system,sans-serif;background:#F8FAFC;margin:0;padding:0}
    .c{max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
    .h{background:linear-gradient(135deg,#091628,#1B76D3);padding:32px;text-align:center}
    .h h1{color:white;font-size:22px;margin:0;letter-spacing:-0.5px}
    .h p{color:rgba(255,255,255,0.7);font-size:13px;margin:6px 0 0}
    .b{padding:32px}
    .box{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:16px;margin:20px 0}
    .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F1F5F9;align-items:center}
    .row:last-child{border-bottom:none}
    .btn{display:inline-block;background:linear-gradient(135deg,#1B76D3,#0EA5E9);color:white;padding:13px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin:16px 0}
    .warn{background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:12px 14px;margin-top:16px;color:#92400E;font-size:13px}
    .f{padding:20px;background:#F8FAFC;text-align:center;color:#94A3B8;font-size:12px;border-top:1px solid #E2E8F0}
  </style></head><body>
  <div class="c">
    <div class="h">
      <h1>Welcome to Ccentrik CRM</h1>
      <p>Your account is ready</p>
    </div>
    <div class="b">
      <p style="font-size:16px;color:#0F172A">Hi <strong>${name}</strong>,</p>
      <p style="color:#475569;font-size:14px;line-height:1.6">You've been invited to join <strong>Ccentrik CRM</strong>. Use the credentials below to log in:</p>
      <div class="box">
        <div class="row"><span style="color:#64748B;font-size:13px">Login Email</span><span style="font-weight:600;font-size:13px;color:#1B76D3">${displayEmail}</span></div>
        <div class="row"><span style="color:#64748B;font-size:13px">Temporary Password</span><span style="font-weight:700;font-size:14px;font-family:monospace;background:#F1F5F9;padding:3px 8px;border-radius:4px">${tempPassword}</span></div>
        <div class="row"><span style="color:#64748B;font-size:13px">Role</span><span style="font-weight:600;font-size:13px;text-transform:capitalize">${role.replace(/_/g, " ")}</span></div>
      </div>
      <a href="${appUrl}/login" class="btn">Login to Ccentrik CRM →</a>
      <div class="warn">⚠️ Please change your password immediately after first login.</div>
    </div>
    <div class="f">© ${new Date().getFullYear()} Ccentrik &nbsp;·&nbsp; This is an automated message, please do not reply</div>
  </div></body></html>`;

  return transporter.sendMail({
    from: `"Ccentrik CRM" <${process.env.GMAIL_USER}>`,
    to,
    subject: "You've been invited to Ccentrik CRM",
    html,
  });
};

module.exports = { transporter, sendWelcomeEmail };
