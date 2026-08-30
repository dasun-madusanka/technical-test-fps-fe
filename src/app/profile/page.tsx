import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import Navbar from "@/app/components/Navbar";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const totalGames = user.wins + user.losses;
  const winRate = totalGames > 0 ? ((user.wins / totalGames) * 100).toFixed(1) : "0.0";
  const kd = user.deaths > 0 ? (user.kills / user.deaths).toFixed(2) : user.kills.toFixed(2);

  return (
    <div className="min-h-screen bg-black">
      <Navbar />
      <main className="px-6 py-8">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8">
          {/* account card */}
          <div>
            <div className="xa-panel p-5 flex items-center gap-3 mb-4">
              <span className="w-14 h-14 bg-[#1c1c20] flex items-center justify-center shrink-0">
                <PersonIcon />
              </span>
              <div>
                <div className="text-white font-bold">{user.username}</div>
                <div className="text-[#7a7a82] text-xs font-mono mt-1">Level {user.level}</div>
              </div>
            </div>
            <Link href="/" className="block text-center xa-btn-secondary py-2.5 text-sm">
              ← BACK HOME
            </Link>
          </div>

          {/* stats */}
          <div>
            <div className="mb-4 text-[#7a7a82] text-xs font-bold uppercase tracking-wider">Record</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 text-sm font-mono">
              <StatCard label="Rating" value={user.rating} first />
              <StatCard label="Games" value={totalGames} />
              <StatCard label="Wins" value={user.wins} />
              <StatCard label="Losses" value={user.losses} />
              <StatCard label="Win Rate" value={`${winRate}%`} first />
              <StatCard label="Kills" value={user.kills} />
              <StatCard label="Deaths" value={user.deaths} />
              <StatCard label="K/D" value={kd} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, first = false }: { label: string; value: string | number; first?: boolean }) {
  return (
    <div className={`xa-panel py-4 text-center ${first ? "" : "-ml-px"}`}>
      <div className="text-white text-xl font-bold">{value}</div>
      <div className="text-[#7a7a82] text-xs mt-1">{label}</div>
    </div>
  );
}

function PersonIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8a8a90" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
    </svg>
  );
}