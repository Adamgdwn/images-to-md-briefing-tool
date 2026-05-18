import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    app: "screenshot-briefing-tool",
    version: "0.1.0"
  });
}
