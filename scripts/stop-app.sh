#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT_DIR/data/pids"

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user stop screenshot-briefing-web.service >/dev/null 2>&1 || true
  systemctl --user stop screenshot-briefing-parser.service >/dev/null 2>&1 || true
fi

stop_pid() {
  local name="$1"
  local pid_file="$PID_DIR/$name.pid"
  if [ -f "$pid_file" ]; then
    local pid
    pid="$(cat "$pid_file")"
    if [[ "$pid" =~ ^[0-9]+$ ]] && [ "$pid" -gt 1 ] && kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
      printf "Stopped %s (%s)\n" "$name" "$pid"
    fi
    rm -f "$pid_file"
  fi
}

stop_pid web
stop_pid parser
