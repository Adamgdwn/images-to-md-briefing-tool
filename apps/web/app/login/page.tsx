import { AuthPanel } from "@/components/AuthPanel";

export default function LoginPage() {
  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-6 py-10">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-normal">Sign In</h1>
        <p className="mt-2 text-sm text-slate-600">Use Supabase email/password or a magic link when hosted auth is configured.</p>
      </div>
      <AuthPanel />
    </main>
  );
}
