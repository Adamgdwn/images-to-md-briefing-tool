#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons"
DESKTOP_FILE="$APP_DIR/screenshot-briefing-tool.desktop"
DESKTOP_COPY="$HOME/Desktop/screenshot-briefing-tool.desktop"

mkdir -p "$APP_DIR" "$ICON_DIR"
cp "$ROOT_DIR/assets/screenshot-briefing-tool.svg" "$ICON_DIR/screenshot-briefing-tool.svg"
cp "$ROOT_DIR/assets/screenshot-briefing-tool.ico" "$ICON_DIR/screenshot-briefing-tool.ico"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Screenshot Briefing Tool
Comment=Launch the screenshot-to-brief review workspace
Exec=$ROOT_DIR/scripts/launch-ubuntu.sh
Icon=$ICON_DIR/screenshot-briefing-tool.svg
Terminal=false
Categories=Development;Office;
StartupNotify=true
EOF

chmod +x "$DESKTOP_FILE"

if [ -d "$HOME/Desktop" ]; then
  cp "$DESKTOP_FILE" "$DESKTOP_COPY"
  chmod +x "$DESKTOP_COPY"
  if command -v gio >/dev/null 2>&1; then
    gio set "$DESKTOP_COPY" metadata::trusted true >/dev/null 2>&1 || true
  fi
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APP_DIR" >/dev/null 2>&1 || true
fi

printf "Installed launcher: %s\n" "$DESKTOP_FILE"
if [ -f "$DESKTOP_COPY" ]; then
  printf "Desktop icon: %s\n" "$DESKTOP_COPY"
fi
