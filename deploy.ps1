# Deploy: builds frontend and deploys to Firebase Hosting only.
# Backend runs separately on Render.com.
$token = [System.Environment]::GetEnvironmentVariable("FIREBASE_TOKEN", "User")
$root  = $PSScriptRoot

Write-Host "Building frontend..." -ForegroundColor Cyan
Set-Location "$root\frontend"
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Frontend build failed"; exit 1 }

Write-Host "Deploying frontend to Firebase Hosting..." -ForegroundColor Cyan
Set-Location $root

if ($token) {
  firebase deploy --only hosting --token $token
} else {
  firebase deploy --only hosting
}

if ($LASTEXITCODE -ne 0) { Write-Error "Firebase deploy failed"; exit 1 }

Write-Host ""
Write-Host "Done! Frontend live at https://ccentrik-crm.web.app" -ForegroundColor Green
