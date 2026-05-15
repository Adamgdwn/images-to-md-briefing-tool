$ErrorActionPreference = "SilentlyContinue"
$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$PidDir = Join-Path $RootDir "data\pids"

foreach ($Name in @("web", "parser")) {
  $PidFile = Join-Path $PidDir "$Name.pid"
  if (Test-Path $PidFile) {
    $ExistingPid = Get-Content $PidFile
    if ($ExistingPid -and ([int]$ExistingPid) -gt 1) {
      Stop-Process -Id ([int]$ExistingPid)
      Write-Host "Stopped $Name ($ExistingPid)"
    }
    Remove-Item $PidFile -Force
  }
}
