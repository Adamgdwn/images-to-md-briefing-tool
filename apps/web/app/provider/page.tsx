import { ProviderPanel } from "@/components/ProviderPanel";
import { getClaudeCodeStatus } from "@/lib/claudeCode";

export default async function ProviderPage() {
  const status = await getClaudeCodeStatus();
  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-6 py-10">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-2xl font-semibold tracking-normal">Provider Settings</h1>
        <p className="mt-2 text-sm text-slate-600">Connect the local Claude account used by Claude Code for image-to-Markdown interpretation.</p>
      </div>
      <ProviderPanel initialStatus={status} />
    </main>
  );
}
