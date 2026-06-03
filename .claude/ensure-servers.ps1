# Ensures backend (:5000) and frontend (:5173) are running after any file change.
# Called by the PostToolUse hook in settings.json.
$nodeDir = 'C:\Program Files\nodejs'
$env:PATH = "$nodeDir;$env:PATH"
$root = 'c:\Users\Admin\Downloads\Ccentrik-CRM-main'

$be = netstat -ano 2>$null | Select-String ':5000 '
if (-not $be) {
    Start-Process powershell -ArgumentList "-NoProfile -NoExit -Command `"`$env:PATH='$nodeDir;'+`$env:PATH; Set-Location '$root\backend'; node server.js`"" -WindowStyle Normal
}

$fe = netstat -ano 2>$null | Select-String ':5173 '
if (-not $fe) {
    Start-Process powershell -ArgumentList "-NoProfile -NoExit -Command `"`$env:PATH='$nodeDir;'+`$env:PATH; Set-Location '$root\frontend'; npm run dev`"" -WindowStyle Normal
}
