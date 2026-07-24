#requires -version 5.1
param([switch]$Dev)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$LmStudioUrl = "http://127.0.0.1:1234"
$BridgeUrl = "http://127.0.0.1:8934"
$DevUrl = "http://localhost:4321"
$GameUrl = if ($Dev) { "$DevUrl/ai-peoples-court/" } else { "https://games.drewcassidy.dev/ai-peoples-court/" }
$LmsExe = "$env:USERPROFILE\.lmstudio\bin\lms.exe"

Write-Host ""
Write-Host "AI People's Court - local cast startup" -ForegroundColor Cyan
Write-Host "----------------------------------------"

try {
  Invoke-RestMethod -Uri "$LmStudioUrl/v1/models" -TimeoutSec 3 | Out-Null
  Write-Host "[OK] LM Studio is reachable." -ForegroundColor Green
} catch {
  if (Test-Path -LiteralPath $LmsExe) {
    Write-Host "[..] Starting the LM Studio server..." -ForegroundColor Yellow
    & $LmsExe server start | Out-Null
    Start-Sleep -Seconds 2
  } else {
    Write-Host "[!!] LM Studio is not reachable. Start its local server, then use Retry in the game." -ForegroundColor Yellow
  }
}

try {
  $BridgeHealth = Invoke-RestMethod -Uri "$BridgeUrl/health" -TimeoutSec 2
  if ($BridgeHealth.capabilities -contains "court-chat") {
    Write-Host "[OK] OpenGames court bridge is already running." -ForegroundColor Green
  } else {
    Write-Host "[!!] An older bridge is already using port 8934." -ForegroundColor Yellow
    Write-Host "     Close its console window, then run this launcher again." -ForegroundColor Yellow
    return
  }
} catch {
  Write-Host "[..] Starting the OpenGames local AI bridge..." -ForegroundColor Yellow
  Start-Process powershell -WindowStyle Normal -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$ProjectRoot'; Write-Host 'OpenGames local AI bridge - close this window to stop it.' -ForegroundColor Cyan; node bridge/server.mjs"
  ) | Out-Null
  Start-Sleep -Seconds 2
}

if ($Dev) {
  try {
    Invoke-WebRequest -Uri $DevUrl -UseBasicParsing -TimeoutSec 2 | Out-Null
  } catch {
    Write-Host "[..] Starting the Astro development server..." -ForegroundColor Yellow
    Start-Process powershell -WindowStyle Normal -ArgumentList @(
      "-NoExit",
      "-Command",
      "Set-Location '$ProjectRoot'; npm run dev"
    ) | Out-Null
    Start-Sleep -Seconds 3
  }
}

Write-Host "[OK] Opening $GameUrl" -ForegroundColor Green
Start-Process $GameUrl
