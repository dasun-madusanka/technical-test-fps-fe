import { AimStats } from "@/game/AimTrainer";

export default function StatsHUD({ stats }: { stats: AimStats }) {
  return (
    <div className="absolute top-4 left-4 z-10 font-mono text-sm bg-black/50 backdrop-blur-sm border border-white/30/30 rounded-lg px-4 py-3 text-slate-200 space-y-1 min-w-[180px]">
      <div className="text-white font-bold mb-1 tracking-wider">
        AIM TRAINING
      </div>
      <div className="flex justify-between">
        <span className="text-slate-400">Shots</span>
        <span>{stats.shots}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-slate-400">Hits</span>
        <span>{stats.hits}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-slate-400">Misses</span>
        <span>{stats.misses}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-slate-400">Accuracy</span>
        <span>{stats.accuracy.toFixed(1)}%</span>
      </div>
      <div className="flex justify-between">
        <span className="text-slate-400">Avg Reaction</span>
        <span>{stats.avgReactionMs.toFixed(0)}ms</span>
      </div>
      <div className="flex justify-between border-t border-slate-700 pt-1 mt-1">
        <span className="text-slate-400">Score</span>
        <span className="text-white font-bold">{stats.score}</span>
      </div>
    </div>
  );
}