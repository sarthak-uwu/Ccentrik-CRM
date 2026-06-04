# Run this ONCE to configure Firebase Functions environment variables.
# These values are stored securely in Firebase and used by the Cloud Function.
#
# FILL IN the values below before running this script.

$SUPABASE_URL             = "https://uljlkctbyglaixbhdfft.supabase.co"
$SUPABASE_SERVICE_ROLE_KEY = "PASTE_YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE"
$FIREBASE_WEB_API_KEY      = "AIzaSyAiJrt5Ar6pypMMvCmDIEOyPj_Ze07PYIU"
$FIREBASE_SERVICE_ACCOUNT  = "PASTE_YOUR_BASE64_FIREBASE_SERVICE_ACCOUNT_HERE"
$RESEND_API_KEY            = "PASTE_YOUR_RESEND_API_KEY_HERE"    # or leave blank
$GMAIL_USER                = ""  # optional Gmail SMTP user
$GMAIL_PASS                = ""  # optional Gmail SMTP app password

Write-Host "Setting Firebase Functions environment variables..." -ForegroundColor Cyan

firebase functions:config:set `
  supabase.url="$SUPABASE_URL" `
  supabase.service_role_key="$SUPABASE_SERVICE_ROLE_KEY" `
  firebase.web_api_key="$FIREBASE_WEB_API_KEY" `
  firebase.service_account="$FIREBASE_SERVICE_ACCOUNT" `
  resend.api_key="$RESEND_API_KEY" `
  gmail.user="$GMAIL_USER" `
  gmail.pass="$GMAIL_PASS"

Write-Host "Done. Now run deploy.ps1 to deploy." -ForegroundColor Green
