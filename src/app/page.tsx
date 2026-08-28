import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-6">
      <div className="text-center max-w-2xl">
        <p className="text-cyan-400 tracking-[0.3em] text-sm mb-4 font-mono">
          BROWSER ARENA SHOOTER
        </p>
        <h1 className="text-6xl font-extrabold mb-6 bg-gradient-to-r from-cyan-300 to-blue-500 bg-clip-text text-transparent">
          ARENA
        </h1>
        <p className="text-slate-400 mb-10">
          Fast 1v1 duels. Sharpen your aim. Climb the leaderboard.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <Link
            href="/practice"
            className="px-8 py-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition"
          >
            PRACTICE
          </Link>
          <Link
            href="/arena"
            className="px-8 py-3 rounded-lg bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold transition"
          >
            PLAY NOW
          </Link>
          <button
            disabled
            className="px-8 py-3 rounded-lg bg-slate-800 text-slate-500 font-bold cursor-not-allowed"
            title="Coming in the next phase"
          >
            LEADERBOARD
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm text-slate-500 font-mono">
          <div className="border border-slate-800 rounded-lg py-3">
            <div className="text-cyan-400 text-xl font-bold">0</div>
            PLAYERS ONLINE
          </div>
          <div className="border border-slate-800 rounded-lg py-3">
            <div className="text-cyan-400 text-xl font-bold">1v1</div>
            CORE MODE
          </div>
          <div className="border border-slate-800 rounded-lg py-3">
            <div className="text-cyan-400 text-xl font-bold">FPS</div>
            ARENA STYLE
          </div>
        </div>
      </div>
    </main>
  );
}
