import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getSupabaseAuthClient, isSupabaseConfigured } from "@/lib/supabase";

export const AUTH_ACCESS_COOKIE = "briefing-tool-access-token";
export const LOCAL_USER_ID = "local-user";

export type AuthContext = {
  mode: "local" | "supabase";
  userId: string;
  email: string | null;
};

export function authMode() {
  return isSupabaseConfigured() ? "supabase" : "local";
}

export async function getCurrentAuth(): Promise<AuthContext | null> {
  if (!isSupabaseConfigured()) {
    return {
      mode: "local",
      userId: LOCAL_USER_ID,
      email: null
    };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_ACCESS_COOKIE)?.value;
  return token ? verifySupabaseToken(token) : null;
}

export async function requirePageAuth(): Promise<AuthContext> {
  const auth = await getCurrentAuth();
  if (!auth) {
    redirect("/login");
  }
  return auth;
}

export async function requireApiAuth(request: Request): Promise<{ auth: AuthContext } | { response: NextResponse }> {
  if (!isSupabaseConfigured()) {
    return {
      auth: {
        mode: "local",
        userId: LOCAL_USER_ID,
        email: null
      }
    };
  }

  const token = bearerToken(request) ?? cookieToken(request);
  if (!token) {
    return { response: unauthorizedResponse() };
  }

  const auth = await verifySupabaseToken(token);
  if (!auth) {
    return { response: unauthorizedResponse() };
  }
  return { auth };
}

export function storeOwnerId(auth: AuthContext) {
  return auth.mode === "supabase" ? auth.userId : undefined;
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
}

async function verifySupabaseToken(token: string): Promise<AuthContext | null> {
  const supabase = getSupabaseAuthClient();
  if (!supabase) {
    return null;
  }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }
  return {
    mode: "supabase",
    userId: data.user.id,
    email: data.user.email ?? null
  };
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authorization.slice("bearer ".length).trim() || null;
}

function cookieToken(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookiesByName = new Map(
    cookieHeader
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const [name, ...rest] = item.split("=");
        return [name, decodeURIComponent(rest.join("="))] as const;
      })
  );
  return cookiesByName.get(AUTH_ACCESS_COOKIE) ?? null;
}
