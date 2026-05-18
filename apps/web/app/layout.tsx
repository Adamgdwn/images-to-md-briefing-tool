import type { Metadata } from "next";
import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Screenshot Briefing Tool",
  description: "Internal workflow for screenshot extraction, review, and build briefs."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="sticky top-0 z-50 shadow-sm">
          <header className="border-b border-line bg-white">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
              <Link href="/" className="text-base font-semibold tracking-normal">
                Screenshot Briefing Tool
              </Link>
              <nav className="flex items-center gap-4 text-sm text-slate-600">
                <Link href="/login">Sign In</Link>
                <Link href="/provider">Provider</Link>
                <Link href="/projects">Projects</Link>
              </nav>
            </div>
          </header>
          <AppNav />
        </div>
        {children}
      </body>
    </html>
  );
}
