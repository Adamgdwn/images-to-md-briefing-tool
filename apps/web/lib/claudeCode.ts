import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ClaudeCodeStatus = {
  installed: boolean;
  path: string | null;
  version: string | null;
  loggedIn: boolean;
  authMethod: string | null;
  apiProvider: string | null;
  apiKeySource: string | null;
  message: string;
};

export async function getClaudeCodeStatus(): Promise<ClaudeCodeStatus> {
  const path = await findClaudePath();
  if (!path) {
    return {
      installed: false,
      path: null,
      version: null,
      loggedIn: false,
      authMethod: null,
      apiProvider: null,
      apiKeySource: null,
      message: "Claude Code CLI is not installed."
    };
  }

  const version = await runText(path, ["--version"]);
  const statusText = await runText(path, ["auth", "status"]);
  try {
    const status = JSON.parse(statusText);
    return {
      installed: true,
      path,
      version,
      loggedIn: Boolean(status.loggedIn),
      authMethod: status.authMethod ?? null,
      apiProvider: status.apiProvider ?? null,
      apiKeySource: status.apiKeySource ?? null,
      message: Boolean(status.loggedIn) ? "Claude account is connected through Claude Code." : "Claude Code is installed but not signed in."
    };
  } catch {
    return {
      installed: true,
      path,
      version,
      loggedIn: false,
      authMethod: null,
      apiProvider: null,
      apiKeySource: null,
      message: statusText || "Claude Code auth status could not be read."
    };
  }
}

export async function openClaudeCodeLogin() {
  const path = await findClaudePath();
  if (!path) {
    throw new Error("Claude Code CLI is not installed.");
  }

  const command = `${shellQuote(path)} auth login; echo; read -r -p "Press Enter to close this window..."`;
  const terminal = findTerminal();
  if (terminal) {
    const child = spawn(terminal.command, [...terminal.args, command], {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
    return;
  }

  const child = spawn(path, ["auth", "login"], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
}

async function findClaudePath(): Promise<string | null> {
  const configured = process.env.CLAUDE_CODE_PATH;
  if (configured) {
    const resolved = await resolveExecutable(configured);
    if (resolved) {
      return resolved;
    }
  }
  const candidates = [
    "claude",
    `${process.env.HOME}/.local/bin/claude`,
    `${process.env.HOME}/.npm-global/bin/claude`
  ];
  for (const candidate of candidates) {
    const resolved = await resolveExecutable(candidate);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

async function resolveExecutable(command: string): Promise<string | null> {
  try {
    const result = await execFileAsync("bash", ["-lc", `command -v ${shellQuote(command)}`], { timeout: 3000 });
    return result.stdout.trim() || null;
  } catch {
    return null;
  }
}

async function runText(command: string, args: string[]) {
  try {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    const result = await execFileAsync(command, args, {
      timeout: 10000,
      env
    });
    return result.stdout.trim();
  } catch (error) {
    if (typeof error === "object" && error && "stdout" in error) {
      return String((error as { stdout?: string }).stdout ?? "").trim();
    }
    return "";
  }
}

function findTerminal(): { command: string; args: string[] } | null {
  const candidates = [
    { command: "x-terminal-emulator", args: ["-e", "bash", "-lc"] },
    { command: "gnome-terminal", args: ["--", "bash", "-lc"] },
    { command: "konsole", args: ["-e", "bash", "-lc"] },
    { command: "xterm", args: ["-e", "bash", "-lc"] }
  ];
  for (const candidate of candidates) {
    try {
      spawn(candidate.command, ["--help"], { stdio: "ignore" }).kill();
      return candidate;
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
