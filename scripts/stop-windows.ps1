$ErrorActionPreference = "SilentlyContinue"
$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$PidDir = Join-Path $RootDir "data\pids"

foreach ($Name in @("web", "parser")) {
  $PidFile = Join-Path $PidDir "$Name.pid"
  if (Test-Path $PidFile) {
    $ExistingPid = Get-Content $PidFile | Select-Object -First 1
    $ParsedPid = 0
    if ($ExistingPid -and [int]::TryParse($ExistingPid, [ref]$ParsedPid) -and $ParsedPid -gt 1) {
      Stop-Process -Id $ParsedPid
      Write-Host "Stopped $Name ($ExistingPid)"
    }
    Remove-Item $PidFile -Force
  }
}
