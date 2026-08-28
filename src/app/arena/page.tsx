"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArenaGame, ArenaState } from "@/game/ArenaGame";
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
};

export default function ArenaPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<ArenaGame | null>(null);
  const [state, setState] = useState<ArenaState>(initialState);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = new ArenaGame(canvasRef.current, setState);
    gameRef.current = game;
    return () => game.dispose();
  }, []);

  const handleStart = () => {
    gameRef.current?.start();
    setStarted(true);
    canvasRef.current?.requestPointerLock();
  };

  return (
    <main
      className="relative overflow-hidden bg-black"
      style={{ width: "100vw", height: "100vh" }}
    >
      <canvas
        ref={canvasRef}
        className="block"
        style={{ width: "100%", height: "100%" }}
      />

      {started && <ArenaHUD state={state} />}
      {started && !state.isPlayerDead && <div className="crosshair" />}

      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 text-center px-6">
          <h1 className="text-3xl font-bold text-cyan-400 mb-2">ARENA</h1>
          <p className="text-slate-400 mb-2 max-w-sm">
            WASD to move, mouse to look, click to shoot, R to reload.
          </p>
          <p className="text-slate-500 mb-6 max-w-sm text-sm">
            Take down the bot before it takes you down.
          </p>
          <button
            onClick={handleStart}
            className="px-8 py-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition mb-4"
          >
            START
          </button>
          <Link href="/" className="text-slate-500 text-sm hover:text-slate-300">
            ← Back to home
          </Link>
        </div>
      )}
    </main>
  );
}