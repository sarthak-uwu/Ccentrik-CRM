const express = require("express");
const router  = express.Router();
const { supabase } = require("../config/db");
const { authenticate } = require("../middleware/auth");

const GMAIL_CLIENT_ID     = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const BACKEND_URL         = process.env.BACKEND_URL || "https://backend-gamma-nine-32.vercel.app";
const FRONTEND_URL        = process.env.FRONTEND_URL || "https://ccentrik-crm.web.app";
const GMAIL_REDIRECT_URI  = `${BACKEND_URL}/api/email/callback/gmail`;
const GOOGLE_TOKEN_URL    = "https://oauth2.googleapis.com/token";
const GMAIL_API           = "https://www.googleapis.com/gmail/v1/users/me";

// ── Helper: refresh Gmail access token if expired ──────────────────────────────
async function refreshGmailToken(account) {
  if (!account.refresh_token) throw new Error("No refresh token");
  const r = await fetch(GOOGLE_TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: account.refresh_token,
      grant_type:    "refresh_token",
    }),
  });
  const data = await r.json();
  if (!data.access_token) throw new Error(data.error_description || "Token refresh failed");
  const expiry = data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null;
  await supabase.from("email_accounts").update({
    access_token: data.access_token,
    token_expiry: expiry,
  }).eq("id", account.id);
  return data.access_token;
}

// ── Helper: get valid access token (refresh if needed) ────────────────────────
async function getValidToken(account) {
  if (account.token_expiry && new Date(account.token_expiry) > new Date(Date.now() + 60000)) {
    return account.access_token;
  }
  return refreshGmailToken(account);
}

// ── Helper: Gmail API call ─────────────────────────────────────────────────────
async function gmailFetch(path, token) {
  const r = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gmail API error ${r.status}`);
  }
  return r.json();
}

// ── Helper: CRM mapping — match recipient email to lead/deal ──────────────────
async function mapEmailToCRM(toEmails) {
  let leadId = null, dealId = null;
  for (const raw of toEmails) {
    const email = raw.replace(/^.*<(.+)>$/, "$1").trim().toLowerCase();
    if (!email) continue;
    // Match lead by email or other_notes
    const { data: lead } = await supabase.from("leads")
      .select("id")
      .or(`email.ilike.${email},other_notes.ilike.%${email}%`)
      .limit(1)
      .maybeSingle();
    if (lead) { leadId = lead.id; break; }
  }
  return { leadId, dealId };
}

// GET /api/email/accounts ─ list connected accounts
router.get("/accounts", authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from("email_accounts")
    .select("id, provider, email, is_active, last_sync_at, created_at")
    .eq("user_id", req.profile.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

// GET /api/email/connect/gmail ─ OAuth redirect to Google
router.get("/connect/gmail", authenticate, (req, res) => {
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) {
    return res.status(503).json({
      error: "Gmail OAuth not configured. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in environment variables.",
    });
  }
  const params = new URLSearchParams({
    client_id:     GMAIL_CLIENT_ID,
    redirect_uri:  GMAIL_REDIRECT_URI,
    response_type: "code",
    scope:         "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email",
    access_type:   "offline",
    prompt:        "consent",
    state:         req.profile.id,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// GET /api/email/auth-url/gmail ─ returns Google OAuth URL as JSON so the client can redirect
router.get("/auth-url/gmail", authenticate, (req, res) => {
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) {
    return res.status(503).json({ error: "Gmail OAuth not configured. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET." });
  }
  const params = new URLSearchParams({
    client_id:     GMAIL_CLIENT_ID,
    redirect_uri:  GMAIL_REDIRECT_URI,
    response_type: "code",
    scope:         "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email",
    access_type:   "offline",
    prompt:        "consent",
    state:         req.profile.id,
  });
  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

// GET /api/email/callback/gmail ─ OAuth callback from Google
router.get("/callback/gmail", async (req, res) => {
  const { code, state: userId, error: oauthErr } = req.query;
  const failUrl = `${FRONTEND_URL}/settings?email_sync_error=1`;
  if (oauthErr || !code || !userId) return res.redirect(failUrl);

  try {
    // Exchange code for tokens
    const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     GMAIL_CLIENT_ID,
        client_secret: GMAIL_CLIENT_SECRET,
        redirect_uri:  GMAIL_REDIRECT_URI,
        grant_type:    "authorization_code",
      }),
    });
    const tokens = await tokenResp.json();
    if (!tokens.access_token) throw new Error(tokens.error_description || "No access token");

    // Get Gmail profile (email address)
    const gmailProfile = await gmailFetch("/profile", tokens.access_token);
    const email        = gmailProfile.emailAddress;

    await supabase.from("email_accounts").upsert({
      user_id:       userId,
      provider:      "gmail",
      email,
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_expiry:  tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
      history_id:    gmailProfile.historyId?.toString() || null,
      last_sync_at:  new Date().toISOString(),
      is_active:     true,
    }, { onConflict: "user_id,email" });

    res.redirect(`${FRONTEND_URL}/settings?email_sync_connected=gmail`);
  } catch (err) {
    console.error("Gmail OAuth callback error:", err.message);
    res.redirect(failUrl);
  }
});

// DELETE /api/email/accounts/:id ─ disconnect an account
router.delete("/accounts/:id", authenticate, async (req, res) => {
  const { error } = await supabase.from("email_accounts")
    .update({ is_active: false })
    .eq("id", req.params.id)
    .eq("user_id", req.profile.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// POST /api/email/sync ─ pull recent sent emails for the current user
router.post("/sync", authenticate, async (req, res) => {
  if (!GMAIL_CLIENT_ID) return res.json({ synced: 0, reason: "not_configured" });

  const { data: accounts } = await supabase.from("email_accounts")
    .select("*")
    .eq("user_id", req.profile.id)
    .eq("is_active", true)
    .eq("provider", "gmail");

  if (!accounts?.length) return res.json({ synced: 0 });

  let totalSynced = 0;

  for (const account of accounts) {
    try {
      const token = await getValidToken(account);

      // Fetch sent emails since last sync (or last 24 h for first sync)
      const since = account.last_sync_at
        ? Math.floor(new Date(account.last_sync_at).getTime() / 1000)
        : Math.floor((Date.now() - 24 * 3600 * 1000) / 1000);

      const listData = await gmailFetch(
        `/messages?q=in:sent after:${since}&maxResults=15`,
        token
      );
      const messages = listData.messages || [];

      for (const msg of messages) {
        try {
          const msgData = await gmailFetch(
            `/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=To&metadataHeaders=From&metadataHeaders=Cc&metadataHeaders=Bcc&metadataHeaders=Date`,
            token
          );

          const hdrMap = {};
          (msgData.payload?.headers || []).forEach((h) => { hdrMap[h.name.toLowerCase()] = h.value; });

          const toEmails  = (hdrMap["to"]  || "").split(",").map((e) => e.trim()).filter(Boolean);
          const ccEmails  = (hdrMap["cc"]  || "").split(",").map((e) => e.trim()).filter(Boolean);
          const bccEmails = (hdrMap["bcc"] || "").split(",").map((e) => e.trim()).filter(Boolean);
          const sentAt    = hdrMap["date"] ? new Date(hdrMap["date"]).toISOString() : new Date().toISOString();
          const attachCount = (msgData.payload?.parts || []).filter((p) => p.filename).length;

          // Auto-map to CRM lead / deal
          const { leadId, dealId } = await mapEmailToCRM(toEmails);

          const { error: upsertErr } = await supabase.from("email_sync_log").upsert({
            email_account_id: account.id,
            user_id:          req.profile.id,
            message_id:       msg.id,
            thread_id:        msgData.threadId,
            subject:          hdrMap["subject"] || "(No Subject)",
            from_email:       hdrMap["from"]    || account.email,
            to_emails:        toEmails,
            cc_emails:        ccEmails,
            bcc_emails:       bccEmails,
            sent_at:          sentAt,
            attachment_count: attachCount,
            snippet:          (msgData.snippet || "").slice(0, 300),
            direction:        "outbound",
            status:           "pending",
            lead_id:          leadId,
            deal_id:          dealId,
          }, { onConflict: "email_account_id,message_id", ignoreDuplicates: true });

          if (!upsertErr) totalSynced++;
        } catch (msgErr) {
          console.warn("Email parse error:", msgErr.message);
        }
      }

      // Update last_sync_at
      const newProfile = await gmailFetch("/profile", token);
      await supabase.from("email_accounts").update({
        last_sync_at: new Date().toISOString(),
        history_id:   newProfile.historyId?.toString() || account.history_id,
      }).eq("id", account.id);

    } catch (accErr) {
      console.error(`Sync failed for ${account.email}:`, accErr.message);
    }
  }

  res.json({ synced: totalSynced });
});

// GET /api/email/pending ─ emails waiting for user to classify
router.get("/pending", authenticate, async (req, res) => {
  const { data, error } = await supabase.from("email_sync_log")
    .select("*")
    .eq("user_id", req.profile.id)
    .eq("status", "pending")
    .eq("direction", "outbound")
    .order("sent_at", { ascending: false })
    .limit(5);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

// POST /api/email/classify ─ user picks activity type → creates activity
router.post("/classify", authenticate, async (req, res) => {
  const { id, activity_type } = req.body;
  if (!id || !activity_type) return res.status(400).json({ error: "id and activity_type are required" });

  const { data: log, error: fetchErr } = await supabase.from("email_sync_log")
    .select("*")
    .eq("id", id)
    .eq("user_id", req.profile.id)
    .single();
  if (fetchErr || !log) return res.status(404).json({ error: "Email not found" });

  const title = `📧 ${activity_type}: ${log.subject || "(No Subject)"}`;
  const desc  = [
    `To: ${(log.to_emails || []).join(", ")}`,
    log.cc_emails?.length ? `CC: ${log.cc_emails.join(", ")}` : null,
    log.snippet            ? `\n${log.snippet}`              : null,
    log.attachment_count > 0 ? `Attachments: ${log.attachment_count}` : null,
    `Thread: ${log.thread_id || log.message_id}`,
  ].filter(Boolean).join("\n");

  const { data: activity, error: actErr } = await supabase.from("activities").insert({
    type:         "email_sent",
    title,
    description:  desc,
    status:       "done",
    created_by:   req.profile.id,
    user_id:      req.profile.id,
    lead_id:      log.lead_id  || null,
    deal_id:      log.deal_id  || null,
    related_type: log.lead_id ? "lead" : log.deal_id ? "deal" : null,
    related_id:   log.lead_id || log.deal_id || null,
    metadata: {
      email_type:       activity_type,
      message_id:       log.message_id,
      thread_id:        log.thread_id,
      subject:          log.subject,
      to_emails:        log.to_emails,
      attachment_count: log.attachment_count,
      sent_at:          log.sent_at,
    },
  }).select().single();

  if (actErr) return res.status(400).json({ error: actErr.message });

  await supabase.from("email_sync_log").update({
    status:        "classified",
    activity_type,
    activity_id:   activity.id,
  }).eq("id", id);

  res.json({ success: true, activity });
});

// POST /api/email/dismiss ─ skip without creating an activity
router.post("/dismiss", authenticate, async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "id required" });
  await supabase.from("email_sync_log")
    .update({ status: "dismissed" })
    .eq("id", id)
    .eq("user_id", req.profile.id);
  res.json({ success: true });
});

module.exports = router;
