import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AUTH_ACCESS_COOKIE } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";

const sessionSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive().optional()
});

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, mode: "local" });
  }

  const parsed = sessionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Access token is required." }, { status: 400 });
  }

  const cookieStore = await cookies();
  cookieStore.set(AUTH_ACCESS_COOKIE, parsed.data.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: parsed.data.expires_in ?? 3600
  });

  return NextResponse.json({ ok: true, mode: "supabase" });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_ACCESS_COOKIE);
  return NextResponse.json({ ok: true });
}
