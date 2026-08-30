"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

interface LeaderboardPlayer {
  username: string;
  rating: number;
  kills: number;
  deaths: number;
  kd: number;
}

const PERIODS = [
  { key: "daily", label: "DAILY" },
  { key: "weekly", label: "WEEKLY" },
  { key: "all-time", label: "ALL-TIME" },
] as const;

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["key"]>("daily");
  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leaderboard?period=${period}`)
      .then((res) => res.json())
      .then((data) => setPlayers(data.players))
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <div className="min-h-screen bg-black">
      <Navbar />
      <main className="px-6 py-8 flex flex-col items-center">
        <div className="w-full max-w-4xl">
          <div className="flex gap-0 mb-6 text-sm font-bold">
            {PERIODS.map((p, i) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-5 py-2 border border-[#1c1c20] transition ${i > 0 ? "-ml-px" : ""} ${
                  period === p.key ? "bg-white text-black border-white" : "bg-black text-[#8a8a90] hover:text-white"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-[#7a7a82] font-mono">Loading...</p>
          ) : players.length === 0 ? (
            <p className="text-[#7a7a82] font-mono">Get a kill to enter the leaderboard.</p>
          ) : (
            <div>
              <div className="grid grid-cols-[60px_1fr_100px_100px_100px] text-[#7a7a82] text-xs uppercase tracking-wider px-2 pb-2 border-b border-[#1c1c20]">
                <span>#</span>
                <span>Player</span>
                <span className="text-right">K</span>
                <span className="text-right">D</span>
                <span className="text-right">K/D</span>
              </div>
              {players.map((p, i) => (
                <div
                  key={p.username}
                  className="grid grid-cols-[60px_1fr_100px_100px_100px] items-center px-2 py-3 border-b border-[#141416] font-mono text-sm"
                >
                  <span className={rankColor(i)}>#{i + 1}</span>
                  <span className="flex items-center gap-3 text-[#e5e5e8]">
                    <span className="w-6 h-6 rounded-full bg-[#1c1c20] flex items-center justify-center">
                      <PersonIcon />
                    </span>
                    {p.username}
                  </span>
                  <span className="text-right text-white">{p.kills}</span>
                  <span className="text-right text-[#8a8a90]">{p.deaths}</span>
                  <span className="text-right text-[#e5e5e8]">{p.kd.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function rankColor(i: number) {
  if (i === 0) return "text-yellow-400 font-bold";
  if (i === 2) return "text-orange-400 font-bold";
  return "text-[#7a7a82]";
}

function PersonIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8a8a90" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
    </svg>
  );
}