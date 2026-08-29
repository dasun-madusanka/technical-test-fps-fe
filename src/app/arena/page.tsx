"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArenaGame, ArenaState, WeaponConfig } from "@/game/ArenaGame";
import ArenaHUD from "@/app/components/ArenaHUD";

const initialState: ArenaState = {
  playerHealth: 100,
  playerAmmo: 30,
  magazineSize: 30,
  isReloading: false,
  playerKills: 0,
  playerDeaths: 0,
  botKills: 0,
  isPlayerDead: false,
  respawnCountdown: 0,
  killFeed: [],
  matchOver: false,
  playerWon: false,
};

export default function ArenaPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<ArenaGame | null>(null);
  const [state, setState] = useState<ArenaState>(initialState);
  const [started, setStarted] = useState(false);
  const [weapon, setWeapon] = useState<WeaponConfig | null>(null);
  const [reportStatus, setReportStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const hasReported = useRef(false);

  useEffect(() => {
    fetch("/api/loadout/equipped")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setWeapon(data))
      .catch(() => setWeapon(null));
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !weapon) return;
    const game = new ArenaGame(canvasRef.current, setState, weapon);
    gameRef.current = game;
    return () => game.dispose();
  }, [weapon]);

  useEffect(() => {
    if (state.matchOver && !hasReported.current) {
      hasReported.current = true;
      setReportStatus("saving");

      fetch("/api/matches/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          won: state.playerWon,
          kills: state.playerKills,
          deaths: state.playerDeaths,
          weaponKey: weapon?.key ?? "rifle",
        }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("failed");
          setReportStatus("saved");
        })
        .catch(() => setReportStatus("error"));
    }
  }, [state.matchOver, state.playerWon, state.playerKills, state.playerDeaths, weapon]);

  const handleStart = () => {
    hasReported.current = false;
    setReportStatus("idle");
    gameRef.current?.start();
    setStarted(true);
    canvasRef.current?.requestPointerLock();
  };

  return (
    <main className="relative overflow-hidden bg-black" style={{ width: "100vw", height: "100vh" }}>
      <canvas ref={canvasRef} className="block" style={{ width: "100%", height: "100%" }} />

      {started && <ArenaHUD state={state} reportStatus={reportStatus} />}
      {started && !state.isPlayerDead && !state.matchOver && <div className="crosshair" />}

      {!started && weapon && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 text-center px-6">
          <h1 className="text-3xl font-bold text-cyan-400 mb-2">ARENA</h1>
          <p className="text-slate-400 mb-1 max-w-sm">
            WASD to move, mouse to look, click to shoot, R to reload, Space to jump.
          </p>
          <p className="text-cyan-400 font-mono text-sm mb-2">Equipped: {weapon.name}</p>
          <p className="text-slate-500 mb-6 max-w-sm text-sm">First to 10 kills wins the match.</p>
          <button
            onClick={handleStart}
            className="px-8 py-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition mb-4"
          >
            START
          </button>
          <Link href="/" className="text-slate-500 text-sm hover:text-slate-300">← Back to home</Link>
        </div>
      )}

      {!weapon && !started && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70">
          <p className="text-slate-500 font-mono">Loading loadout...</p>
        </div>
      )}

      {state.matchOver && (
        <div className="absolute bottom-10 left-0 right-0 z-30 flex justify-center gap-4">
          <button
            onClick={handleStart}
            className="px-6 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition"
          >
            PLAY AGAIN
          </button>
          <Link href="/profile" className="px-6 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition">
            VIEW PROFILE
          </Link>
        </div>
      )}
    </main>
  );
}