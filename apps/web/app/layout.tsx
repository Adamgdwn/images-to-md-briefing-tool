import type { Metadata } from "next";
import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { SignOutButton } from "@/components/SignOutButton";
import { authMode, getCurrentAuth } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Screenshot Briefing Tool",
  description: "Internal workflow for screenshot extraction, review, and build briefs."
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const auth = await getCurrentAuth();
  const mode = authMode();

  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="sticky top-0 z-50 shadow-sm">
          <header className="border-b border-line bg-white">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
              <Link href="/" className="text-base font-semibold tracking-normal">
                Screenshot Briefing Tool
              </Link>
              <nav className="flex flex-wrap items-center justify-end gap-4 text-sm text-slate-600">
                <span className="border border-line bg-mist px-2 py-1 text-xs font-semibold uppercase">
                  {mode === "local" ? "Local mode" : auth ? auth.email ?? "Signed in" : "Signed out"}
                </span>
                {mode === "supabase" && auth ? <SignOutButton /> : <Link href="/login">Sign In</Link>}
                <Link href="/provider">Provider</Link>
                <Link href="/projects">Projects</Link>
              </nav>
            </div>
          </header>
          <AppNav mode={mode} signedIn={Boolean(auth)} />
        </div>
        {children}
      </body>
    </html>
  );
}
