#requires -version 5.1
<#
.SYNOPSIS
  Checks LM Studio, starts the local AI Dungeon Door bridge, and opens the game.

.DESCRIPTION
  Makes no permanent system changes: it only starts two ordinary,
  stoppable processes (LM Studio's local server, if installed, and this
  repo's bridge/server.mjs) in their own visible console windows that the
  player can close at any time. See docs/bridge.md for what the bridge
  actually does.

  Model loading itself is NOT done by this script — the bridge loads its
  configured model on-demand (just-in-time) the moment the game page
  connects, with this game's own tuned context/GPU/TTL settings (see
  bridge/models.mjs). That means simply opening the game is enough; no
  Refresh click and no separate "load the model" step is ever required.
  This script only reports what it observes, via the bridge's own /health
  endpoint, so the model identifier is never duplicated/hardcoded here.

.PARAMETER Dev
  Opens the local dev server (http://localhost:4321) instead of the
  hosted production site, and starts `npm run dev` if it isn't already
  running. Use this while developing; players should omit it.
#>
param(
  [switch]$Dev
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot
$LmStudioUrl = "http://127.0.0.1:1234"
$BridgeUrl = "http://127.0.0.1:8934"
$BridgeHealthUrl = "$BridgeUrl/health"
$DevServerUrl = "http://localhost:4321"
$GameUrl = if ($Dev) { "$DevServerUrl/ai-dungeon-door/" } else { "https://games.drewcassidy.dev/ai-dungeon-door/" }
$LmsExe = "$env:USERPROFILE\.lmstudio\bin\lms.exe"

function Write-Status($label, $ok, $detail) {
  $mark = if ($ok) { "[OK]  " } else { "[--]  " }
  $color = if ($ok) { "Green" } else { "Yellow" }
  Write-Host $mark -NoNewline -ForegroundColor $color
  Write-Host "$label - $detail"
}

Write-Host ""
Write-Host "AI Dungeon Door - startup check" -ForegroundColor Cyan
Write-Host "--------------------------------"

# 1. LM Studio server reachability ----------------------------------------
# Only the server process needs to be running here - which model gets
# loaded, and when, is entirely the bridge's job (step 2's /health check
# reports it once the bridge itself is up).
$lmStudioUp = $false
try {
  Invoke-RestMethod -Uri "$LmStudioUrl/v1/models" -TimeoutSec 3 | Out-Null
  $lmStudioUp = $true
} catch {
  $lmStudioUp = $false
}

if ($lmStudioUp) {
  Write-Status "LM Studio" $true "reachable at $LmStudioUrl"
} else {
  Write-Status "LM Studio" $false "not reachable at $LmStudioUrl"
  if (Test-Path $LmsExe) {
    Write-Host "       Attempting to start it via lms.exe..."
    try {
      & $LmsExe server start | Out-Null
      Start-Sleep -Seconds 2
      Invoke-RestMethod -Uri "$LmStudioUrl/v1/models" -TimeoutSec 5 | Out-Null
      $lmStudioUp = $true
      Write-Status "LM Studio" $true "started and reachable at $LmStudioUrl"
    } catch {
      Write-Host "       Could not start LM Studio automatically." -ForegroundColor Yellow
    }
  } else {
    Write-Host "       lms.exe not found at $LmsExe - install LM Studio, or the game will" -ForegroundColor Yellow
    Write-Host "       run in offline story mode (still fully playable)." -ForegroundColor Yellow
  }
}

# 2. Bridge -----------------------------------------------------------------
$bridgeUp = $false
try {
  Invoke-RestMethod -Uri $BridgeHealthUrl -TimeoutSec 2 | Out-Null
  $bridgeUp = $true
} catch {
  $bridgeUp = $false
}

if ($bridgeUp) {
  Write-Status "Bridge" $true "already running at $BridgeUrl"
} else {
  Write-Host "       Starting the local bridge..."
  Start-Process powershell -WindowStyle Normal -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$RepoRoot'; Write-Host 'AI Dungeon Door bridge - close this window to stop it.' -ForegroundColor Cyan; node bridge/server.mjs"
  ) | Out-Null
  Start-Sleep -Seconds 2
  try {
    Invoke-RestMethod -Uri $BridgeHealthUrl -TimeoutSec 3 | Out-Null
    $bridgeUp = $true
    Write-Status "Bridge" $true "started at $BridgeUrl"
  } catch {
    Write-Status "Bridge" $false "failed to start - check the new console window for errors"
  }
}

# Report the configured model via the bridge's own /health - never guessed
# or duplicated here. Loading happens automatically once the game connects.
if ($bridgeUp) {
  try {
    $health = Invoke-RestMethod -Uri $BridgeHealthUrl -TimeoutSec 3
    if ($health.installed) {
      $loadState = if ($health.loaded) { "already loaded" } else { "will load automatically on connect" }
      Write-Status "Model" $true "$($health.friendlyName) ($($health.modelId)) - $loadState"
    } else {
      Write-Status "Model" $false "configured model not installed - game will use offline story mode"
    }
  } catch {
    Write-Status "Model" $false "could not query bridge health"
  }
}

if (-not $lmStudioUp) {
  Write-Host ""
  Write-Host "  LM Studio isn't running, so the door will narrate itself with" -ForegroundColor Yellow
  Write-Host "  polished prewritten text instead of the local model - the game" -ForegroundColor Yellow
  Write-Host "  is still fully playable. To enable local AI narration, start LM" -ForegroundColor Yellow
  Write-Host "  Studio (or run: $LmsExe server start) and reopen the game - no" -ForegroundColor Yellow
  Write-Host "  other step is needed, it reconnects and loads the model itself." -ForegroundColor Yellow
  Write-Host ""
}

# 3. Dev server (only with -Dev) -----------------------------------------
if ($Dev) {
  $devUp = $false
  try {
    Invoke-WebRequest -Uri $DevServerUrl -TimeoutSec 2 -UseBasicParsing | Out-Null
    $devUp = $true
  } catch {
    $devUp = $false
  }
  if ($devUp) {
    Write-Status "Dev server" $true "already running at $DevServerUrl"
  } else {
    Write-Host "       Starting the Astro dev server..."
    Start-Process powershell -WindowStyle Normal -ArgumentList @(
      "-NoExit", "-Command",
      "Set-Location '$RepoRoot'; Write-Host 'AI Dungeon Door dev server - close this window to stop it.' -ForegroundColor Cyan; npm run dev"
    ) | Out-Null
    Start-Sleep -Seconds 3
    Write-Status "Dev server" $true "starting at $DevServerUrl (give it a few seconds)"
  }
}

# 4. Open the game --------------------------------------------------------
Write-Host ""
Write-Host "Opening $GameUrl" -ForegroundColor Cyan
Write-Host "No Refresh click needed - the game connects, loads the model, and" -ForegroundColor DarkGray
Write-Host "streams its opening scene automatically." -ForegroundColor DarkGray
Start-Process $GameUrl

Write-Host ""
Write-Host "Done. Closing the bridge/dev-server console windows stops them - nothing" -ForegroundColor DarkGray
Write-Host "here makes permanent changes to LM Studio or this machine." -ForegroundColor DarkGray
