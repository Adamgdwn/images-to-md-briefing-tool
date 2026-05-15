"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Link as LinkIcon, LogIn } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export function AuthPanel() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(supabase ? "" : "Local mode is active because Supabase env vars are not configured.");

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setStatus("Continuing in local laptop mode.");
      router.push("/projects");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setStatus(error.message);
      return;
    }
    router.push("/projects");
  }

  async function sendMagicLink() {
    if (!supabase) {
      setStatus("Magic links require Supabase env vars.");
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/projects`
      }
    });
    setStatus(error ? error.message : "Magic link sent.");
  }

  async function signUp() {
    if (!supabase) {
      setStatus("Account creation requires Supabase env vars.");
      return;
    }
    const { error } = await supabase.auth.signUp({ email, password });
    setStatus(error ? error.message : "Account created. Check email if confirmation is required.");
  }

  return (
    <form onSubmit={signIn} className="mx-auto grid max-w-md gap-4 border border-line bg-white p-6">
      <label className="grid gap-1 text-sm font-medium">
        Email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-10 border border-line px-3 text-sm"
          required={Boolean(supabase)}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-10 border border-line px-3 text-sm"
          required={Boolean(supabase)}
        />
      </label>
      <div className="grid gap-2 sm:grid-cols-3">
        <button className="inline-flex h-10 items-center justify-center gap-2 bg-pine px-3 text-sm font-medium text-white" title="Sign in">
          <LogIn size={16} />
          Sign In
        </button>
        <button
          type="button"
          onClick={sendMagicLink}
          className="inline-flex h-10 items-center justify-center gap-2 border border-line bg-white px-3 text-sm font-medium"
          title="Send magic link"
        >
          <LinkIcon size={16} />
          Magic Link
        </button>
        <button
          type="button"
          onClick={signUp}
          className="inline-flex h-10 items-center justify-center gap-2 border border-line bg-white px-3 text-sm font-medium"
          title="Create account"
        >
          <KeyRound size={16} />
          Sign Up
        </button>
      </div>
      <p className="min-h-5 text-sm text-slate-600">{status}</p>
    </form>
  );
}
