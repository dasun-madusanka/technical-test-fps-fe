"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV_LINKS = [
  { href: "/", label: "PLAY" },
  { href: "/loadout", label: "LOADOUT" },
  { href: "/leaderboard", label: "LEADERBOARD" },
  { href: "/settings", label: "SETTINGS" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => setUsername(data.user?.username ?? null))
      .catch(() => setUsername(null));
  }, []);

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-[#1c1c20] bg-black">
      <div className="flex items-center gap-10">
        <Link href="/" className="flex items-center gap-1 select-none">
          <span className="text-2xl font-black italic tracking-tight text-white">
            x<span className="not-italic">Arena</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-bold tracking-wider uppercase pb-1 border-b-2 transition ${
                  active
                    ? "text-white border-white"
                    : "text-[#8a8a90] border-transparent hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-4">
        <Link
          href="/profile"
          className="xa-btn-primary flex items-center gap-2 px-4 py-2 text-sm"
        >
          <PersonPlusIcon />
          SAVE PROGRESS
        </Link>

        <Link
          href="/profile"
          className="flex items-center gap-2 pl-1 pr-3 py-1 border border-[#1c1c20] hover:border-[#3a3a3f] transition"
        >
          <span className="w-7 h-7 rounded-full bg-[#1c1c20] flex items-center justify-center">
            <PersonIcon />
          </span>
          <span className="text-sm font-mono text-[#c9c9cf]">
            {username ?? "Guest"}
          </span>
        </Link>
      </div>
    </header>
  );
}

function PersonPlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
    </svg>
  );
}