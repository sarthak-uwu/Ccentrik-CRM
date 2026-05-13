$token = [System.Environment]::GetEnvironmentVariable("FIREBASE_TOKEN", "User")
if (-not $token) { Write-Error "FIREBASE_TOKEN not set. Run firebase login:ci once."; exit 1 }

Write-Host "Building frontend..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\frontend"
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }

Write-Host "Deploying to Firebase..." -ForegroundColor Cyan
Set-Location $PSScriptRoot
firebase deploy --only hosting --token $token

Write-Host "Done!" -ForegroundColor Green
