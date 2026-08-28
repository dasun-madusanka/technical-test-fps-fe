import { ArenaState } from "@/game/ArenaGame";

export default function ArenaHUD({ state }: { state: ArenaState }) {
  return (
    <>
      {/* Health + ammo bottom bar */}
      <div className="absolute bottom-6 left-6 z-10 font-mono text-sm text-slate-200 space-y-2 w-56">
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-slate-400">HEALTH</span>
            <span>{state.playerHealth}</span>
          </div>
          <div className="h-2 bg-slate-800 rounded overflow-hidden">
            <div
              className="h-full bg-red-500 transition-all"
              style={{ width: `${state.playerHealth}%` }}
            />
          </div>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">AMMO</span>
          <span className={state.isReloading ? "text-yellow-400" : ""}>
            {state.isReloading
              ? "RELOADING..."
              : `${state.playerAmmo} / ${state.magazineSize}`}
          </span>
        </div>
      </div>

      {/* Scoreboard top right */}
      <div className="absolute top-4 right-4 z-10 font-mono text-sm bg-black/50 border border-cyan-500/30 rounded-lg px-4 py-2 text-slate-200">
        <div className="flex justify-between gap-6">
          <span className="text-cyan-400">You</span>
          <span>
            {state.playerKills} - {state.playerDeaths}
          </span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-orange-400">Bot</span>
          <span>
            {state.botKills} - {state.playerKills}
          </span>
        </div>
      </div>

      {/* Kill feed top left */}
      <div className="absolute top-4 left-4 z-10 font-mono text-xs text-slate-300 space-y-1">
        {state.killFeed.map((msg, i) => (
          <div key={i} className="bg-black/40 px-2 py-1 rounded">
            {msg}
          </div>
        ))}
      </div>

      {/* Death / respawn overlay */}
      {state.isPlayerDead && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60">
          <div className="text-red-500 text-4xl font-bold mb-3">
            ELIMINATED
          </div>
          <div className="text-slate-300 font-mono">
            Respawning in {state.respawnCountdown}...
          </div>
        </div>
      )}
    </>
  );
}