#requires -version 5.1
<#
.SYNOPSIS
  Installs and immediately starts the per-user OpenGames Local AI logon task.
#>

$ErrorActionPreference = "Stop"
$TaskName = "OpenGames Local AI"
$SupervisorScript = Join-Path $PSScriptRoot "Start-OpenGamesBackground.ps1"
$BrowserPolicyScript = Join-Path $PSScriptRoot "Set-OpenGamesBrowserPolicy.ps1"
$PowerShellExe = Join-Path $PSHOME "powershell.exe"
$GameOrigin = "https://games.drewcassidy.dev"

if (-not (Test-Path -LiteralPath $SupervisorScript)) {
  throw "Background supervisor not found: $SupervisorScript"
}

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$actionArguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$SupervisorScript`""
$action = New-ScheduledTaskAction -Execute $PowerShellExe -Argument $actionArguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal `
  -UserId $currentUser `
  -LogonType Interactive `
  -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)
$task = New-ScheduledTask `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "Keeps LM Studio, the OpenGames loopback bridge, and the shared local game model ready in the background."

Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host "Installed and started '$TaskName'." -ForegroundColor Green
Write-Host "It will run hidden whenever $currentUser signs in."

$windowsPrincipal = [Security.Principal.WindowsPrincipal]::new(
  [Security.Principal.WindowsIdentity]::GetCurrent()
)
$isAdministrator = $windowsPrincipal.IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
if ($isAdministrator) {
  & $BrowserPolicyScript
} else {
  $policyArguments = "-NoProfile -ExecutionPolicy Bypass -File `"$BrowserPolicyScript`""
  $policyProcess = Start-Process `
    -FilePath $PowerShellExe `
    -Verb RunAs `
    -ArgumentList $policyArguments `
    -Wait `
    -PassThru
  if ($policyProcess.ExitCode -ne 0) {
    throw "The browser policy installer exited with code $($policyProcess.ExitCode)."
  }
}
Write-Host "Allowed only $GameOrigin to reach the local bridge in Edge/Chrome."
