import { NextResponse } from "next/server";
import { openClaudeCodeLogin } from "@/lib/claudeCode";

export async function POST() {
  try {
    await openClaudeCodeLogin();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
