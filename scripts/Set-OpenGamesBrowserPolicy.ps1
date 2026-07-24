#requires -version 5.1
param([switch]$Remove)

$ErrorActionPreference = "Stop"
$GameOrigin = "https://games.drewcassidy.dev"
$BrowserPolicyValueName = "8934"
$BrowserPolicyPaths = @(
  "HKLM:\Software\Policies\Microsoft\Edge\LocalNetworkAccessAllowedForUrls",
  "HKLM:\Software\Policies\Microsoft\Edge\LoopbackNetworkAllowedForUrls",
  "HKLM:\Software\Policies\Google\Chrome\LocalNetworkAccessAllowedForUrls",
  "HKLM:\Software\Policies\Google\Chrome\LoopbackNetworkAllowedForUrls"
)
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$StateRoot = Join-Path $ProjectRoot ".runtime"
$LogPath = Join-Path $StateRoot "browser-policy-install.log"
New-Item -ItemType Directory -Path $StateRoot -Force | Out-Null

try {
  foreach ($policyPath in $BrowserPolicyPaths) {
    if ($Remove) {
      $policy = Get-ItemProperty -Path $policyPath -ErrorAction SilentlyContinue
      $property = if ($policy) {
        $policy.PSObject.Properties[$BrowserPolicyValueName]
      } else {
        $null
      }
      $existing = if ($property) { $property.Value } else { $null }
      if ($existing -eq $GameOrigin) {
        Remove-ItemProperty -Path $policyPath -Name $BrowserPolicyValueName
      }
      continue
    }

    New-Item -Path $policyPath -Force | Out-Null
    $policy = Get-ItemProperty -Path $policyPath
    $property = $policy.PSObject.Properties[$BrowserPolicyValueName]
    $existing = if ($property) { $property.Value } else { $null }
    if ($null -ne $existing -and $existing -ne $GameOrigin) {
      throw "Browser policy value $policyPath\$BrowserPolicyValueName is already in use."
    }
    New-ItemProperty `
      -Path $policyPath `
      -Name $BrowserPolicyValueName `
      -PropertyType String `
      -Value $GameOrigin `
      -Force | Out-Null
  }

  $action = if ($Remove) { "removed" } else { "installed" }
  Set-Content -LiteralPath $LogPath -Value "$action $GameOrigin"
} catch {
  Set-Content -LiteralPath $LogPath -Value $_.Exception.ToString()
  throw
}
