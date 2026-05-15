"use client";

import Link from "next/link";
import { ArrowLeft, Home, KeyRound, PanelsTopLeft, Settings } from "lucide-react";

export function AppNav() {
  return (
    <div className="border-b border-line bg-mist">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-6 py-2">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="inline-flex h-9 items-center gap-2 border border-line bg-white px-3 text-sm font-medium"
          title="Go back"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <Link href="/" className="inline-flex h-9 items-center gap-2 border border-line bg-white px-3 text-sm font-medium" title="Home">
          <Home size={16} />
          Home
        </Link>
        <Link href="/projects" className="inline-flex h-9 items-center gap-2 border border-line bg-white px-3 text-sm font-medium" title="Projects">
          <PanelsTopLeft size={16} />
          Projects
        </Link>
        <Link href="/provider" className="inline-flex h-9 items-center gap-2 border border-line bg-white px-3 text-sm font-medium" title="Provider settings">
          <Settings size={16} />
          Provider
        </Link>
        <Link href="/login" className="inline-flex h-9 items-center gap-2 border border-line bg-white px-3 text-sm font-medium" title="Sign in">
          <KeyRound size={16} />
          Sign In
        </Link>
      </div>
    </div>
  );
}
