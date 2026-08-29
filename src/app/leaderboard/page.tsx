"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
    <main className="min-h-screen bg-slate-950 px-6 py-12 flex flex-col items-center">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-cyan-400">GLOBAL LEADERBOARD</h1>
          <Link href="/" className="text-slate-500 text-sm hover:text-slate-300">← Home</Link>
        </div>

        <div className="flex gap-2 mb-6 font-mono text-sm">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-4 py-1.5 rounded-md transition ${
                period === p.key
                  ? "bg-cyan-500 text-slate-950 font-bold"
                  : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-slate-500 font-mono">Loading...</p>
        ) : players.length === 0 ? (
          <p className="text-slate-500 font-mono">
            Get a kill to enter the leaderboard.
          </p>
        ) : (
          <table className="w-full font-mono text-sm">
            <thead>
              <tr className="text-slate-500 text-left border-b border-slate-800">
                <th className="py-2">#</th>
                <th className="py-2">Player</th>
                <th className="py-2 text-right">K</th>
                <th className="py-2 text-right">D</th>
                <th className="py-2 text-right">K/D</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr key={p.username} className="border-b border-slate-900">
                  <td className="py-2 text-slate-500">
                    {i === 0 ? <span className="text-yellow-400">#1</span> :
                     i === 1 ? <span className="text-slate-300">#2</span> :
                     i === 2 ? <span className="text-orange-400">#3</span> :
                     `#${i + 1}`}
                  </td>
                  <td className="py-2 text-slate-200">{p.username}</td>
                  <td className="py-2 text-right text-cyan-400">{p.kills}</td>
                  <td className="py-2 text-right text-slate-400">{p.deaths}</td>
                  <td className="py-2 text-right text-slate-200">{p.kd.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}