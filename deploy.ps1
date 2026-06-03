# Prefer token-based deploy if FIREBASE_TOKEN is present; otherwise fall back to your currently logged-in Firebase CLI session.
$token = [System.Environment]::GetEnvironmentVariable("FIREBASE_TOKEN", "User")


Write-Host "Building frontend..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\frontend"
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }

Write-Host "Deploying to Firebase..." -ForegroundColor Cyan
Set-Location $PSScriptRoot

if ($token) {
  firebase deploy --only hosting --token $token
} else {
  firebase deploy --only hosting
}


Write-Host "Done!" -ForegroundColor Green
