"use client";

import { useState } from "react";
import { CheckCircle2, LogIn, RefreshCw, Settings } from "lucide-react";

type ClaudeCodeStatus = {
  installed: boolean;
  path: string | null;
  version: string | null;
  loggedIn: boolean;
  authMethod: string | null;
  apiProvider: string | null;
  apiKeySource: string | null;
  message: string;
};

export function ProviderPanel({ initialStatus }: { initialStatus: ClaudeCodeStatus }) {
  const [status, setStatus] = useState<ClaudeCodeStatus | null>(initialStatus);
  const [message, setMessage] = useState("");

  async function refresh() {
    const response = await fetch("/api/providers/anthropic/status");
    const data = await response.json();
    setStatus(data.claude_code);
  }

  async function connect() {
    setMessage("Opening Claude sign-in...");
    const response = await fetch("/api/providers/anthropic/connect", { method: "POST" });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Complete sign-in in the opened terminal, then refresh status." : data.error || "Could not open sign-in.");
  }

  async function useClaudeCode() {
    setMessage("Switching provider mode...");
    const response = await fetch("/api/providers/anthropic/mode", { method: "POST" });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Claude account mode enabled. Relaunch the app for background services to inherit it." : data.error || "Could not enable Claude account mode.");
    await refresh();
  }

  return (
    <section className="mx-auto grid max-w-3xl gap-4 border border-line bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Anthropic Provider</h2>
          <p className="mt-1 text-sm text-slate-600">Use your local Claude Code sign-in for image interpretation without storing an API key in this app.</p>
        </div>
        <button onClick={refresh} className="inline-flex h-10 items-center gap-2 border border-line px-3 text-sm font-medium" title="Refresh status">
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 border border-line bg-slate-50 p-4 text-sm md:grid-cols-2">
        <StatusRow label="Installed" value={status?.installed ? "Yes" : "No"} />
        <StatusRow label="Signed in" value={status?.loggedIn ? "Yes" : "No"} />
        <StatusRow label="Auth method" value={status?.authMethod ?? "n/a"} />
        <StatusRow label="Provider" value={status?.apiProvider ?? "n/a"} />
        <StatusRow label="Version" value={status?.version ?? "n/a"} />
        <StatusRow label="Path" value={status?.path ?? "n/a"} />
      </div>

      <p className="text-sm text-slate-600">{status?.message ?? "Checking Claude Code..."}</p>

      <div className="flex flex-wrap gap-2">
        <button onClick={connect} className="inline-flex h-10 items-center gap-2 bg-pine px-4 text-sm font-medium text-white" title="Open Claude sign-in">
          <LogIn size={16} />
          Open Claude Sign-In
        </button>
        <button onClick={useClaudeCode} className="inline-flex h-10 items-center gap-2 border border-line bg-white px-4 text-sm font-medium" title="Use Claude account mode">
          <Settings size={16} />
          Use Claude Account
        </button>
        {status?.loggedIn ? (
          <span className="inline-flex h-10 items-center gap-2 px-2 text-sm text-pine">
            <CheckCircle2 size={16} />
            Connected
          </span>
        ) : null}
      </div>

      <p className="min-h-5 text-sm text-slate-600">{message}</p>
    </section>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-all text-slate-800">{value}</p>
    </div>
  );
}
