import { NextResponse } from "next/server";
import { getClaudeCodeStatus } from "@/lib/claudeCode";
import { upsertEnvLocal } from "@/lib/envLocal";

export async function POST() {
  const status = await getClaudeCodeStatus();
  if (!status.installed || !status.path) {
    return NextResponse.json({ error: "Claude Code CLI is not installed." }, { status: 400 });
  }
  await upsertEnvLocal({
    ANTHROPIC_AUTH_MODE: "claude_code",
    CLAUDE_CODE_PATH: status.path,
    CLAUDE_CODE_MODEL: "sonnet"
  });
  return NextResponse.json({ ok: true, claude_code: status });
}
