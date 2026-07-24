#requires -version 5.1

$ErrorActionPreference = "Stop"
$TaskName = "OpenGames Local AI"
$BrowserPolicyScript = Join-Path $PSScriptRoot "Set-OpenGamesBrowserPolicy.ps1"
$PowerShellExe = Join-Path $PSHOME "powershell.exe"

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -ne $task) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed '$TaskName'. Existing LM Studio or bridge processes were left running."
} else {
  Write-Host "'$TaskName' is not installed."
}

$windowsPrincipal = [Security.Principal.WindowsPrincipal]::new(
  [Security.Principal.WindowsIdentity]::GetCurrent()
)
$isAdministrator = $windowsPrincipal.IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
if ($isAdministrator) {
  & $BrowserPolicyScript -Remove
} else {
  $policyArguments = "-NoProfile -ExecutionPolicy Bypass -File `"$BrowserPolicyScript`" -Remove"
  $policyProcess = Start-Process `
    -FilePath $PowerShellExe `
    -Verb RunAs `
    -ArgumentList $policyArguments `
    -Wait `
    -PassThru
  if ($policyProcess.ExitCode -ne 0) {
    throw "The browser policy remover exited with code $($policyProcess.ExitCode)."
  }
}
Write-Host "Removed the OpenGames Edge/Chrome local-network allowlist entries."
