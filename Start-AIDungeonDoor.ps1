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
$PreferredModels = @("qwen2.5-0.5b-instruct", "smollm2-360m-instruct")
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

# 1. LM Studio reachability + model check -------------------------------
$lmStudioUp = $false
$loadedModelIds = @()
try {
  $models = Invoke-RestMethod -Uri "$LmStudioUrl/v1/models" -TimeoutSec 3
  $lmStudioUp = $true
  $loadedModelIds = $models.data | ForEach-Object { $_.id }
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
      $models = Invoke-RestMethod -Uri "$LmStudioUrl/v1/models" -TimeoutSec 5
      $lmStudioUp = $true
      $loadedModelIds = $models.data | ForEach-Object { $_.id }
      Write-Status "LM Studio" $true "started and reachable at $LmStudioUrl"
    } catch {
      Write-Host "       Could not start LM Studio automatically." -ForegroundColor Yellow
    }
  }
}

$chosenModel = $null
if ($lmStudioUp) {
  foreach ($preferred in $PreferredModels) {
    if ($loadedModelIds -contains $preferred) {
      $chosenModel = $preferred
      break
    }
  }
  if ($chosenModel) {
    Write-Status "Model" $true "$chosenModel is available"
  } elseif (Test-Path $LmsExe) {
    Write-Host "       No preferred model loaded yet - trying to load $($PreferredModels[0])..."
    try {
      & $LmsExe load $PreferredModels[0] -y --ttl 1800 | Out-Null
      $chosenModel = $PreferredModels[0]
      Write-Status "Model" $true "$chosenModel loaded (auto-unloads after 30 min idle)"
    } catch {
      Write-Status "Model" $false "could not auto-load $($PreferredModels[0]) - see docs/model-selection.md"
    }
  } else {
    $preferredList = $PreferredModels -join ", "
    Write-Status "Model" $false "none of ($preferredList) are loaded"
  }
}

if (-not $lmStudioUp) {
  Write-Host ""
  Write-Host "  LM Studio isn't running, so the door will narrate itself with" -ForegroundColor Yellow
  Write-Host "  polished prewritten text instead of the local model - the game" -ForegroundColor Yellow
  Write-Host "  is still fully playable. To enable local AI narration:" -ForegroundColor Yellow
  Write-Host "    1. Open LM Studio, or run: $LmsExe server start"
  Write-Host "    2. Load a small model, e.g.: $LmsExe load qwen2.5-0.5b-instruct -y"
  Write-Host "    3. Click the reconnect button in the game once it's ready."
  Write-Host ""
}

# 2. Bridge -------------------------------------------------------------
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
Start-Process $GameUrl

Write-Host ""
Write-Host "Done. Closing the bridge/dev-server console windows stops them - nothing" -ForegroundColor DarkGray
Write-Host "here makes permanent changes to LM Studio or this machine." -ForegroundColor DarkGray
