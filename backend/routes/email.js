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

const ALLOWED_DOMAIN = "ccentrik.com";

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

// ── Helper: CRM mapping — match recipient email across leads, customers, pipeline
async function mapEmailToCRM(toEmails) {
  for (const raw of toEmails) {
    const email = raw.replace(/^.*<(.+)>$/, "$1").trim().toLowerCase();
    if (!email) continue;

    // 1. Check leads
    const { data: lead } = await supabase.from("leads")
      .select("id, contact_name, company_name")
      .ilike("email", email)
      .limit(1).maybeSingle();
    if (lead) {
      return {
        leadId: lead.id, dealId: null, customerId: null, pipelineId: null,
        crmModule: "lead",
        crmRecordName: [lead.contact_name, lead.company_name].filter(Boolean).join(" / "),
      };
    }

    // 2. Check customers
    const { data: customer } = await supabase.from("customers")
      .select("id, contact_name, company_name")
      .ilike("email", email)
      .limit(1).maybeSingle();
    if (customer) {
      return {
        leadId: null, dealId: null, customerId: customer.id, pipelineId: null,
        crmModule: "customer",
        crmRecordName: [customer.contact_name, customer.company_name].filter(Boolean).join(" / "),
      };
    }

    // 3. Check pipeline
    const { data: pipe } = await supabase.from("pipeline")
      .select("id, contact_name, company_name")
      .ilike("email", email)
      .limit(1).maybeSingle();
    if (pipe) {
      return {
        leadId: null, dealId: null, customerId: null, pipelineId: pipe.id,
        crmModule: "pipeline",
        crmRecordName: [pipe.contact_name, pipe.company_name].filter(Boolean).join(" / "),
      };
    }
  }

  // No CRM match
  return { leadId: null, dealId: null, customerId: null, pipelineId: null, crmModule: null, crmRecordName: null };
}

// ── GET /api/email/accounts ─ list connected accounts ─────────────────────────
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

// ── GET /api/email/auth-url/gmail ─ returns OAuth URL as JSON for JS redirect ─
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

// ── GET /api/email/connect/gmail ─ OAuth redirect (legacy / direct navigation) ─
router.get("/connect/gmail", authenticate, (req, res) => {
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) {
    return res.status(503).json({ error: "Gmail OAuth not configured." });
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

// ── GET /api/email/callback/gmail ─ OAuth callback from Google ────────────────
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

    // ── Domain restriction: only @ccentrik.com accounts allowed ──────────────
    const domain = email.split("@")[1]?.toLowerCase();
    if (domain !== ALLOWED_DOMAIN) {
      console.warn(`Gmail connect rejected — non-${ALLOWED_DOMAIN} account: ${email}`);
      return res.redirect(`${FRONTEND_URL}/settings?email_sync_error=domain_restricted`);
    }

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

// ── DELETE /api/email/accounts/:id ─ disconnect an account ───────────────────
router.delete("/accounts/:id", authenticate, async (req, res) => {
  const { error } = await supabase.from("email_accounts")
    .update({ is_active: false })
    .eq("id", req.params.id)
    .eq("user_id", req.profile.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// ── POST /api/email/sync ─ pull recent sent emails for the current user ───────
router.post("/sync", authenticate, async (req, res) => {
  if (!GMAIL_CLIENT_ID) return res.json({ synced: 0, reason: "not_configured" });

  const { data: accounts } = await supabase.from("email_accounts")
    .select("*")
    .eq("user_id", req.profile.id)
    .eq("is_active", true)
    .eq("provider", "gmail");

  if (!accounts?.length) return res.json({ synced: 0 });

  // Get sender's display name once
  const { data: senderProfile } = await supabase.from("profiles")
    .select("full_name").eq("id", req.profile.id).maybeSingle();
  const senderName = senderProfile?.full_name || "";

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

          // Auto-map to CRM record across leads / customers / pipeline
          const { leadId, dealId, customerId, pipelineId, crmModule, crmRecordName } = await mapEmailToCRM(toEmails);

          // Only log emails that match a CRM record — non-CRM emails are skipped
          if (!leadId && !customerId && !pipelineId) continue;

          const { error: upsertErr } = await supabase.from("email_sync_log").upsert({
            email_account_id: account.id,
            user_id:          req.profile.id,
            sender_name:      senderName,
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
            customer_id:      customerId,
            pipeline_id:      pipelineId,
            crm_module:       crmModule,
            crm_record_name:  crmRecordName,
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

// ── GET /api/email/pending ─ CRM-matched emails waiting for classification ────
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

// ── POST /api/email/classify ─ user picks type + reason → creates activity ───
router.post("/classify", authenticate, async (req, res) => {
  const { id, activity_type, reason } = req.body;
  if (!id || !activity_type) return res.status(400).json({ error: "id and activity_type are required" });
  if (!reason || !reason.trim()) return res.status(400).json({ error: "reason is required" });

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
    reason.trim()         ? `Reason: ${reason.trim()}`        : null,
    log.snippet           ? `\n${log.snippet}`                : null,
    log.attachment_count > 0 ? `Attachments: ${log.attachment_count}` : null,
    `Thread: ${log.thread_id || log.message_id}`,
  ].filter(Boolean).join("\n");

  // Determine related_type / related_id across all mapped modules
  const related_type = log.lead_id ? "lead" : log.customer_id ? "customer" : log.pipeline_id ? "pipeline" : null;
  const related_id   = log.lead_id || log.customer_id || log.pipeline_id || null;

  const { data: activity, error: actErr } = await supabase.from("activities").insert({
    type:         "email_sent",
    title,
    description:  desc,
    status:       "done",
    created_by:   req.profile.id,
    user_id:      req.profile.id,
    lead_id:      log.lead_id      || null,
    deal_id:      log.deal_id      || null,
    customer_id:  log.customer_id  || null,
    related_type,
    related_id,
    metadata: {
      email_type:       activity_type,
      reason:           reason.trim(),
      message_id:       log.message_id,
      thread_id:        log.thread_id,
      subject:          log.subject,
      to_emails:        log.to_emails,
      attachment_count: log.attachment_count,
      sent_at:          log.sent_at,
      crm_module:       log.crm_module,
      crm_record_name:  log.crm_record_name,
    },
  }).select().single();

  if (actErr) return res.status(400).json({ error: actErr.message });

  await supabase.from("email_sync_log").update({
    status:        "classified",
    activity_type,
    activity_id:   activity.id,
    reason:        reason.trim(),
  }).eq("id", id);

  res.json({ success: true, activity });
});

// ── POST /api/email/dismiss ─ skip without creating an activity ───────────────
router.post("/dismiss", authenticate, async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "id required" });
  await supabase.from("email_sync_log")
    .update({ status: "dismissed" })
    .eq("id", id)
    .eq("user_id", req.profile.id);
  res.json({ success: true });
});

// ── GET /api/email/log ─ Email Activity Log with role-based visibility ─────────
router.get("/log", authenticate, async (req, res) => {
  const { user_id: filterUser, from, to, record_name, email, module, status: filterStatus } = req.query;
  const role = req.profile.role;

  let query = supabase.from("email_sync_log")
    .select("*")
    .in("status", ["classified", "pending", "dismissed"])
    .order("sent_at", { ascending: false })
    .limit(200);

  // Role-based visibility: employees/inside_sales see only their own
  const isRestricted = role === "employee" || role === "inside_sales";
  if (isRestricted) {
    query = query.eq("user_id", req.profile.id);
  } else if (role === "sales_manager") {
    // Sales manager sees own + their team — simplified to own for now
    query = query.eq("user_id", req.profile.id);
  }

  // Optional filters
  if (filterUser  && !isRestricted) query = query.eq("user_id", filterUser);
  if (from)        query = query.gte("sent_at", from);
  if (to)          query = query.lte("sent_at", to);
  if (record_name) query = query.ilike("crm_record_name", `%${record_name}%`);
  if (email)       query = query.or(`from_email.ilike.%${email}%`);
  if (module)      query = query.eq("crm_module", module);
  if (filterStatus) query = query.eq("status", filterStatus);

  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

// ── GET /api/email/stats ─ email count summary per user / per CRM record ──────
router.get("/stats", authenticate, async (req, res) => {
  const role = req.profile.role;

  let query = supabase.from("email_sync_log")
    .select("user_id, sender_name, lead_id, customer_id, pipeline_id, crm_module, crm_record_name, status")
    .eq("status", "classified");

  const isRestricted = role === "employee" || role === "inside_sales" || role === "sales_manager";
  if (isRestricted) query = query.eq("user_id", req.profile.id);

  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });

  const rows = data || [];

  // Aggregate by user
  const byUser = {};
  rows.forEach(({ user_id, sender_name }) => {
    if (!byUser[user_id]) byUser[user_id] = { name: sender_name || user_id, count: 0 };
    byUser[user_id].count++;
  });

  // Aggregate by CRM record
  const byRecord = {};
  rows.forEach(({ lead_id, customer_id, pipeline_id, crm_module, crm_record_name }) => {
    const key = lead_id || customer_id || pipeline_id;
    if (!key) return;
    if (!byRecord[key]) byRecord[key] = { name: crm_record_name, module: crm_module, count: 0 };
    byRecord[key].count++;
  });

  res.json({ total: rows.length, byUser, byRecord });
});

// ── PATCH /api/email/log/:id ─ update remarks / follow-up (any authenticated user on own records)
router.patch("/log/:id", authenticate, async (req, res) => {
  const { reason, follow_up_date, follow_up_status } = req.body;
  const role = req.profile.role;
  const isAdmin = ["owner", "sales_head", "sales_manager"].includes(role);

  // Build update payload — only allow the fields the user sent
  const update = {};
  if (reason           !== undefined) update.reason           = reason;
  if (follow_up_date   !== undefined) update.follow_up_date   = follow_up_date || null;
  if (follow_up_status !== undefined) update.follow_up_status = follow_up_status;

  if (!Object.keys(update).length) return res.status(400).json({ error: "Nothing to update" });

  // Employees can only edit their own records; admins can edit anyone's
  let query = supabase.from("email_sync_log").update(update).eq("id", req.params.id);
  if (!isAdmin) query = query.eq("user_id", req.profile.id);

  const { error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// ── DELETE /api/email/log/:id ─ restricted to owner / sales_head / super admin
router.delete("/log/:id", authenticate, async (req, res) => {
  const role = req.profile.role;
  if (!["owner", "sales_head"].includes(role)) {
    return res.status(403).json({ error: "Only Sales Head or Owner can delete email activity records." });
  }
  const { error } = await supabase.from("email_sync_log").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
