$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "Screenshot Briefing Tool.lnk"
$Target = Join-Path $RootDir "scripts\launch-windows.cmd"
$Icon = Join-Path $RootDir "assets\screenshot-briefing-tool.ico"

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $Target
$Shortcut.WorkingDirectory = $RootDir
if (Test-Path $Icon) {
  $Shortcut.IconLocation = $Icon
}
$Shortcut.Description = "Launch the screenshot-to-brief review workspace"
$Shortcut.Save()

Write-Host "Installed desktop shortcut: $ShortcutPath"
