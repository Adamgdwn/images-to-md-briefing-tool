import { NextResponse } from "next/server";
import { getClaudeCodeStatus } from "@/lib/claudeCode";

export async function GET() {
  return NextResponse.json({ claude_code: await getClaudeCodeStatus() });
}
