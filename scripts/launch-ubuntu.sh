#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_NAME="Screenshot Briefing Tool"
WEB_URL="${WEB_URL:-http://127.0.0.1:3000/projects}"
PARSER_URL="${PARSER_URL:-http://127.0.0.1:8000}"
APP_DATA_DIR="${APP_DATA_DIR:-../../data}"
LOG_DIR="$ROOT_DIR/data/logs"
PID_DIR="$ROOT_DIR/data/pids"

mkdir -p "$LOG_DIR" "$PID_DIR"

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

if [ -f "$ROOT_DIR/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env.local"
  set +a
fi

status() {
  printf "%s\n" "$1"
  if command -v notify-send >/dev/null 2>&1; then
    notify-send "$APP_NAME" "$1" >/dev/null 2>&1 || true
  fi
}

fail() {
  if command -v zenity >/dev/null 2>&1; then
    zenity --error --title="$APP_NAME" --text="$1" >/dev/null 2>&1 || true
  fi
  printf "ERROR: %s\n" "$1" >&2
  exit 1
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "$2"
  fi
}

wait_for_url() {
  local url="$1"
  local label="$2"
  local attempts="${3:-80}"
  for _ in $(seq 1 "$attempts"); do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  fail "$label did not become ready. Check logs in $LOG_DIR."
}

is_running() {
  local pid_file="$1"
  [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" >/dev/null 2>&1
}

stop_from_pid_file() {
  local pid_file="$1"
  if [ -f "$pid_file" ]; then
    local pid
    pid="$(cat "$pid_file")"
    if [[ "$pid" =~ ^[0-9]+$ ]] && [ "$pid" -gt 1 ]; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
    rm -f "$pid_file"
  fi
}

can_use_systemd_user() {
  command -v systemd-run >/dev/null 2>&1 && systemctl --user is-active default.target >/dev/null 2>&1
}

start_service() {
  local name="$1"
  local command="$2"
  local log_file="$3"
  local pid_file="$PID_DIR/$name.pid"
  local unit="screenshot-briefing-$name"

  if can_use_systemd_user; then
    systemctl --user stop "$unit.service" >/dev/null 2>&1 || true
    systemd-run \
      --user \
      --unit="$unit" \
      --collect \
      --setenv="PATH=$LAUNCH_PATH" \
      --setenv="PARSER_URL=${PARSER_URL:-http://127.0.0.1:8000}" \
      --setenv="APP_DATA_DIR=${APP_DATA_DIR:-../../data}" \
      --setenv="ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}" \
      --setenv="ANTHROPIC_AUTH_MODE=${ANTHROPIC_AUTH_MODE:-claude_code}" \
      --setenv="ANTHROPIC_MODEL=${ANTHROPIC_MODEL:-claude-3-5-sonnet-latest}" \
      --setenv="CLAUDE_CODE_PATH=${CLAUDE_CODE_PATH:-claude}" \
      --setenv="CLAUDE_CODE_MODEL=${CLAUDE_CODE_MODEL:-sonnet}" \
      --setenv="CLAUDE_CODE_TIMEOUT_SECONDS=${CLAUDE_CODE_TIMEOUT_SECONDS:-180}" \
      --setenv="OCR_PRIMARY_BACKEND=${OCR_PRIMARY_BACKEND:-paddleocr}" \
      --setenv="OCR_FALLBACK_BACKEND=${OCR_FALLBACK_BACKEND:-tesseract}" \
      --setenv="OCR_MIN_CONFIDENCE=${OCR_MIN_CONFIDENCE:-0.45}" \
      --setenv="OCR_PADDLE_LANG=${OCR_PADDLE_LANG:-en}" \
      bash -lc "$command >>'$log_file' 2>&1" >/dev/null
    sleep 0.5
    systemctl --user show "$unit.service" --property=MainPID --value > "$pid_file" 2>/dev/null || true
  else
    stop_from_pid_file "$pid_file"
    nohup bash -lc "$command" >>"$log_file" 2>&1 &
    echo $! > "$pid_file"
  fi
}

require_command node "Node.js 20+ is required. Install Node, then launch again."
require_command npm "npm is required. Install Node.js/npm, then launch again."
require_command python3 "Python 3.11+ is required. Install Python, then launch again."
require_command curl "curl is required for service readiness checks."

NPM_BIN="$(command -v npm)"
LAUNCH_PATH="$PATH"

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js 20+ is required. Current version is $(node -v)."
fi

status "Preparing app..."

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  npm install >>"$LOG_DIR/npm-install.log" 2>&1
fi

if [ ! -d "$ROOT_DIR/services/parser/.venv" ]; then
  python3 -m venv "$ROOT_DIR/services/parser/.venv"
fi

"$ROOT_DIR/services/parser/.venv/bin/python" -m pip install -r "$ROOT_DIR/services/parser/requirements.txt" >>"$LOG_DIR/pip-install.log" 2>&1

if ! curl -fsS --max-time 1 "$PARSER_URL/health" >/dev/null 2>&1; then
  stop_from_pid_file "$PID_DIR/parser.pid"
  status "Starting parser service..."
  start_service "parser" "cd '$ROOT_DIR/services/parser' && exec '$ROOT_DIR/services/parser/.venv/bin/python' -m uvicorn app.main:app --host 127.0.0.1 --port 8000" "$LOG_DIR/parser.log"
fi

wait_for_url "$PARSER_URL/health" "Parser service"

if ! curl -fsS --max-time 1 "$WEB_URL" >/dev/null 2>&1; then
  stop_from_pid_file "$PID_DIR/web.pid"
  status "Starting web app..."
  start_service "web" "cd '$ROOT_DIR' && exec '$NPM_BIN' --workspace apps/web run dev -- --hostname 127.0.0.1" "$LOG_DIR/web.log"
fi

wait_for_url "$WEB_URL" "Web app"

status "Opening $APP_NAME..."
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$WEB_URL" >/dev/null 2>&1 || true
fi

if command -v zenity >/dev/null 2>&1; then
  zenity --info --title="$APP_NAME" --text="$APP_NAME is running.\n\nOpen: $WEB_URL\nLogs: $LOG_DIR\n\nUse scripts/stop-app.sh to stop it." >/dev/null 2>&1 || true
else
  printf "%s is running at %s\nLogs: %s\n" "$APP_NAME" "$WEB_URL" "$LOG_DIR"
fi
