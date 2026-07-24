#requires -version 5.1
<#
.SYNOPSIS
  Keeps the OpenGames local AI stack running invisibly for the signed-in user.

.DESCRIPTION
  This is the action used by the "OpenGames Local AI" logon task. It keeps
  LM Studio's loopback server and the OpenGames bridge alive, and ensures the
  one configured model shared by AI Dungeon Door and AI People's Court stays
  loaded. It never opens a browser or exposes either service to the network.
#>
param(
  [ValidateRange(10, 300)]
  [int]$PollSeconds = 30,
  [switch]$Once
)

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BridgeScript = Join-Path $ProjectRoot "bridge\server.mjs"
$BridgeHealthUrl = "http://127.0.0.1:8934/health"
$CourtEnsureUrl = "http://127.0.0.1:8934/api/court/ensure"
$LmStudioHealthUrl = "http://127.0.0.1:1234/v1/models"
$LmsExe = Join-Path $env:USERPROFILE ".lmstudio\bin\lms.exe"
$NodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$NodeExe = if ($NodeCommand) {
  $NodeCommand.Source
} else {
  Join-Path $env:ProgramFiles "nodejs\node.exe"
}

$StateRoot = Join-Path $ProjectRoot ".runtime"
$SupervisorLog = Join-Path $StateRoot "background.log"
$BridgeOutLog = Join-Path $StateRoot "bridge.out.log"
$BridgeErrorLog = Join-Path $StateRoot "bridge.error.log"
New-Item -ItemType Directory -Path $StateRoot -Force | Out-Null

function Write-BackgroundLog([string]$Message) {
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $SupervisorLog -Value "$timestamp $Message"
}

function Invoke-LocalJson(
  [string]$Uri,
  [ValidateSet("GET", "POST")]
  [string]$Method = "GET",
  [int]$TimeoutSec = 4
) {
  try {
    return Invoke-RestMethod -Uri $Uri -Method $Method -TimeoutSec $TimeoutSec
  } catch {
    return $null
  }
}

function Wait-ForEndpoint([string]$Uri, [int]$Attempts, [int]$DelaySeconds) {
  for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
    $result = Invoke-LocalJson -Uri $Uri
    if ($null -ne $result) {
      return $result
    }
    Start-Sleep -Seconds $DelaySeconds
  }
  return $null
}

function Ensure-LmStudioServer {
  if ($null -ne (Invoke-LocalJson -Uri $LmStudioHealthUrl)) {
    return $true
  }
  if (-not (Test-Path -LiteralPath $LmsExe)) {
    Write-BackgroundLog "LM Studio CLI is missing at $LmsExe"
    return $false
  }
  Write-BackgroundLog "Starting LM Studio server."
  try {
    $process = Start-Process -FilePath $LmsExe `
      -ArgumentList @("server", "start") `
      -WindowStyle Hidden `
      -Wait `
      -PassThru
    if ($process.ExitCode -ne 0) {
      Write-BackgroundLog "LM Studio server start exited with code $($process.ExitCode)."
    }
  } catch {
    Write-BackgroundLog "LM Studio server start failed: $($_.Exception.Message)"
  }
  return $null -ne (Wait-ForEndpoint -Uri $LmStudioHealthUrl -Attempts 15 -DelaySeconds 2)
}

function Ensure-Bridge {
  $health = Invoke-LocalJson -Uri $BridgeHealthUrl
  if ($null -ne $health -and $health.capabilities -contains "court-chat") {
    return $health
  }
  if (-not (Test-Path -LiteralPath $NodeExe)) {
    Write-BackgroundLog "Node.js is missing at $NodeExe"
    return $null
  }
  if (-not (Test-Path -LiteralPath $BridgeScript)) {
    Write-BackgroundLog "Bridge entry point is missing at $BridgeScript"
    return $null
  }
  Write-BackgroundLog "Starting OpenGames bridge."
  try {
    $quotedBridgeScript = '"' + $BridgeScript + '"'
    Start-Process -FilePath $NodeExe `
      -ArgumentList $quotedBridgeScript `
      -WorkingDirectory $ProjectRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput $BridgeOutLog `
      -RedirectStandardError $BridgeErrorLog | Out-Null
  } catch {
    Write-BackgroundLog "Bridge start failed: $($_.Exception.Message)"
    return $null
  }
  return Wait-ForEndpoint -Uri $BridgeHealthUrl -Attempts 10 -DelaySeconds 1
}

function Ensure-GameModel($Health) {
  if ($null -eq $Health -or -not $Health.installed) {
    Write-BackgroundLog "Configured game model is unavailable."
    return
  }
  if ($Health.loaded) {
    return
  }
  Write-BackgroundLog "Loading persistent game model $($Health.modelId)."
  $result = Invoke-LocalJson -Uri $CourtEnsureUrl -Method "POST" -TimeoutSec 150
  if ($null -eq $result -or -not $result.ok) {
    Write-BackgroundLog "Model ensure failed; the supervisor will retry."
  } else {
    Write-BackgroundLog "Game model is loaded."
  }
}

$createdNew = $false
$mutex = [System.Threading.Mutex]::new(
  $true,
  "Local\OpenGamesLocalAIBackground",
  [ref]$createdNew
)
if (-not $createdNew) {
  $mutex.Dispose()
  exit 0
}

Write-BackgroundLog "Background supervisor started from $ProjectRoot"
try {
  do {
    if (Ensure-LmStudioServer) {
      $health = Ensure-Bridge
      Ensure-GameModel -Health $health
    }
    if (-not $Once) {
      Start-Sleep -Seconds $PollSeconds
    }
  } while (-not $Once)
} finally {
  Write-BackgroundLog "Background supervisor stopped."
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
