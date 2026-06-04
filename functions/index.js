const functions = require("firebase-functions");

// Map Firebase Functions config keys → process.env so backend code works unchanged.
// These are set via: firebase functions:config:set supabase.url="..." etc.
try {
  const cfg = functions.config();
  if (cfg.supabase?.url)               process.env.SUPABASE_URL                = cfg.supabase.url;
  if (cfg.supabase?.service_role_key)  process.env.SUPABASE_SERVICE_ROLE_KEY   = cfg.supabase.service_role_key;
  if (cfg.firebase?.service_account)   process.env.FIREBASE_SERVICE_ACCOUNT    = cfg.firebase.service_account;
  if (cfg.firebase?.web_api_key)       process.env.FIREBASE_WEB_API_KEY        = cfg.firebase.web_api_key;
  if (cfg.resend?.api_key)             process.env.RESEND_API_KEY              = cfg.resend.api_key;
  if (cfg.gmail?.user)                 process.env.GMAIL_USER                  = cfg.gmail.user;
  if (cfg.gmail?.pass)                 process.env.GMAIL_PASS                  = cfg.gmail.pass;
} catch (_) { /* config not available locally — use process.env directly */ }

const app = require("./server");

// Export Express app as a Firebase Cloud Function
exports.api = functions.https.onRequest(app);
