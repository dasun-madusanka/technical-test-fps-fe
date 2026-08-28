import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const totalGames = user.wins + user.losses;
  const winRate = totalGames > 0 ? ((user.wins / totalGames) * 100).toFixed(1) : "0.0";
  const kd = user.deaths > 0 ? (user.kills / user.deaths).toFixed(2) : user.kills.toFixed(2);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 flex flex-col items-center">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-cyan-400">{user.username}</h1>
            <p className="text-slate-500 font-mono text-sm">Level {user.level}</p>
          </div>
          <Link
            href="/"
            className="text-slate-500 text-sm hover:text-slate-300"
          >
            ← Home
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-sm">
          <StatCard label="Rating" value={user.rating} />
          <StatCard label="Games" value={totalGames} />
          <StatCard label="Wins" value={user.wins} />
          <StatCard label="Losses" value={user.losses} />
          <StatCard label="Win Rate" value={`${winRate}%`} />
          <StatCard label="Kills" value={user.kills} />
          <StatCard label="Deaths" value={user.deaths} />
          <StatCard label="K/D" value={kd} />
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-slate-800 rounded-lg py-4 text-center">
      <div className="text-cyan-400 text-xl font-bold">{value}</div>
      <div className="text-slate-500 text-xs mt-1">{label}</div>
    </div>
  );
}