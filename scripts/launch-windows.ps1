$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RootDir

$AppName = "Screenshot Briefing Tool"
$WebBaseUrl = if ($env:WEB_BASE_URL) { $env:WEB_BASE_URL } else { "http://127.0.0.1:3000" }
$WebUrl = if ($env:WEB_URL) { $env:WEB_URL } else { "$WebBaseUrl/projects" }
$ParserUrl = if ($env:PARSER_URL) { $env:PARSER_URL } else { "http://127.0.0.1:8000" }

$LogDir = Join-Path $RootDir "data\logs"
$PidDir = Join-Path $RootDir "data\pids"
New-Item -ItemType Directory -Force -Path $LogDir, $PidDir | Out-Null

function Convert-EnvValue($Value) {
  $Trimmed = $Value.Trim()
  if ($Trimmed.Length -ge 2 -and $Trimmed.StartsWith('"') -and $Trimmed.EndsWith('"')) {
    return $Trimmed.Substring(1, $Trimmed.Length - 2).Replace('\"', '"').Replace('\\', '\')
  }
  if ($Trimmed.Length -ge 2 -and $Trimmed.StartsWith("'") -and $Trimmed.EndsWith("'")) {
    return $Trimmed.Substring(1, $Trimmed.Length - 2)
  }
  return $Trimmed
}

foreach ($EnvFileName in @(".env", ".env.local")) {
  $EnvFile = Join-Path $RootDir $EnvFileName
  if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
      if ($_ -match "^\s*#" -or $_ -notmatch "=") { return }
      $Parts = $_ -split "=", 2
      [Environment]::SetEnvironmentVariable($Parts[0].Trim(), (Convert-EnvValue $Parts[1]), "Process")
    }
  }
}

$WebBaseUrl = if ($env:WEB_BASE_URL) { $env:WEB_BASE_URL.TrimEnd("/") } else { $WebBaseUrl.TrimEnd("/") }
$WebUrl = if ($env:WEB_URL) { $env:WEB_URL.TrimEnd("/") } else { "$WebBaseUrl/projects" }
$ParserUrl = if ($env:PARSER_URL) { $env:PARSER_URL.TrimEnd("/") } else { $ParserUrl.TrimEnd("/") }
$WebHealthUrl = if ($env:WEB_HEALTH_URL) { $env:WEB_HEALTH_URL } else { "$WebBaseUrl/api/health" }
$ParserHealthUrl = if ($env:PARSER_HEALTH_URL) { $env:PARSER_HEALTH_URL } else { "$ParserUrl/health" }
$env:WEB_BASE_URL = $WebBaseUrl
$env:WEB_URL = $WebUrl
$env:PARSER_URL = $ParserUrl
$env:APP_DATA_DIR = if ($env:APP_DATA_DIR) { $env:APP_DATA_DIR } else { "../../data" }

function Show-Message($Message) {
  Write-Host $Message
}

function Fail($Message) {
  Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
  [System.Windows.MessageBox]::Show($Message, $AppName, "OK", "Error") | Out-Null
  throw $Message
}

function Require-Command($Name, $Message) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Fail $Message
  }
}

function Test-Url($Url) {
  try {
    Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
    return $true
  }
  catch {
    return $false
  }
}

function Test-Health($Url, $ExpectedApp) {
  try {
    $Response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    $Json = $Response.Content | ConvertFrom-Json
    return $Json.status -eq "ok" -and $Json.app -eq $ExpectedApp
  }
  catch {
    return $false
  }
}

function Wait-ForHealth($Url, $Label, $ExpectedApp) {
  for ($i = 0; $i -lt 80; $i++) {
    if (Test-Health $Url $ExpectedApp) {
      return
    }
    Start-Sleep -Seconds 1
  }
  Fail "$Label did not become ready. Check logs in $LogDir."
}

function Wait-ForUrl($Url, $Label) {
  for ($i = 0; $i -lt 80; $i++) {
    if (Test-Url $Url) {
      return
    }
    Start-Sleep -Seconds 1
  }
  Fail "$Label did not become ready. Check logs in $LogDir."
}

function Stop-FromPidFile($Name) {
  $PidFile = Join-Path $PidDir "$Name.pid"
  if (Test-Path $PidFile) {
    $ExistingPid = Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    $ParsedPid = 0
    if ($ExistingPid -and [int]::TryParse($ExistingPid, [ref]$ParsedPid) -and $ParsedPid -gt 1) {
      Stop-Process -Id $ParsedPid -ErrorAction SilentlyContinue
    }
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
  }
}

Require-Command node "Node.js 20+ is required. Install Node.js and launch again."
Require-Command npm "npm is required. Install Node.js/npm and launch again."
Require-Command python "Python 3.11+ is required. Install Python and launch again."

$ParserUri = [Uri]$ParserUrl
$ParserHost = if ($ParserUri.Host) { $ParserUri.Host } else { "127.0.0.1" }
$ParserPort = if ($ParserUri.Port -gt 0) { $ParserUri.Port } else { 8000 }
$WebUri = [Uri]$WebBaseUrl
$WebHost = if ($WebUri.Host) { $WebUri.Host } else { "127.0.0.1" }
$WebPort = if ($WebUri.Port -gt 0) { $WebUri.Port } else { 3000 }

$NodeMajor = [int]((node -p "process.versions.node.split('.')[0]") | Select-Object -First 1)
if ($NodeMajor -lt 20) {
  Fail "Node.js 20+ is required."
}

Show-Message "Preparing app..."

if (-not (Test-Path "node_modules") -or -not (Test-Path "node_modules/.bin/next.cmd")) {
  npm install *> (Join-Path $LogDir "npm-install.log")
}

if (-not (Test-Path "services/parser/.venv/Scripts/python.exe")) {
  python -m venv services/parser/.venv
}

& "services/parser/.venv/Scripts/python.exe" -m pip install -r services/parser/requirements.txt *> (Join-Path $LogDir "pip-install.log")

if (-not (Test-Health $ParserHealthUrl "screenshot-briefing-parser")) {
  Stop-FromPidFile "parser"
  Show-Message "Starting parser service..."
  $Parser = Start-Process -PassThru -WindowStyle Hidden -FilePath "services/parser/.venv/Scripts/python.exe" -ArgumentList "-m", "uvicorn", "app.main:app", "--host", $ParserHost, "--port", $ParserPort -WorkingDirectory "services/parser" -RedirectStandardOutput (Join-Path $LogDir "parser.log") -RedirectStandardError (Join-Path $LogDir "parser.err.log")
  Set-Content -Path (Join-Path $PidDir "parser.pid") -Value $Parser.Id
}

Wait-ForHealth $ParserHealthUrl "Parser service" "screenshot-briefing-parser"

if (-not (Test-Health $WebHealthUrl "screenshot-briefing-tool")) {
  Stop-FromPidFile "web"
  Show-Message "Starting web app..."
  $Web = Start-Process -PassThru -WindowStyle Hidden -FilePath "npm.cmd" -ArgumentList "--workspace", "apps/web", "run", "dev", "--", "--hostname", $WebHost, "--port", $WebPort -WorkingDirectory $RootDir -RedirectStandardOutput (Join-Path $LogDir "web.log") -RedirectStandardError (Join-Path $LogDir "web.err.log")
  Set-Content -Path (Join-Path $PidDir "web.pid") -Value $Web.Id
}

Wait-ForHealth $WebHealthUrl "Web app" "screenshot-briefing-tool"
Wait-ForUrl $WebUrl "Web app"
Start-Process $WebUrl

Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
[System.Windows.MessageBox]::Show("$AppName is running.`n`nOpen: $WebUrl`nLogs: $LogDir", $AppName, "OK", "Information") | Out-Null
