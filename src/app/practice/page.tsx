"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AimTrainer, AimStats } from "@/game/AimTrainer";
import StatsHUD from "@/app/components/StatsHUD";

const initialStats: AimStats = {
  shots: 0,
  hits: 0,
  misses: 0,
  accuracy: 0,
  targetsDestroyed: 0,
  score: 0,
  avgReactionMs: 0,
};

export default function PracticePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trainerRef = useRef<AimTrainer | null>(null);
  const [stats, setStats] = useState<AimStats>(initialStats);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    const trainer = new AimTrainer(canvasRef.current, setStats);
    trainerRef.current = trainer;

    return () => {
      trainer.dispose();
    };
  }, []);

  const handleStart = () => {
    trainerRef.current?.start();
    setStarted(true);
    canvasRef.current?.requestPointerLock();
  };

  return (
    <main className="fixed inset-0 overflow-hidden bg-black">
      <canvas
        ref={canvasRef}
        className="block"
        style={{ width: "100%", height: "100%" }}
      />

      {started && <StatsHUD stats={stats} />}
      {started && <div className="crosshair" />}

      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 text-center px-6">
          <h1 className="text-3xl font-bold text-cyan-400 mb-2">
            PRACTICE MODE
          </h1>
          <p className="text-slate-400 mb-6 max-w-sm">
            Click start, then click again on the canvas to lock your mouse.
            Shoot the spheres. Track your accuracy and reaction time.
          </p>
          <button
            onClick={handleStart}
            className="px-8 py-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition mb-4"
          >
            START
          </button>
          <Link
            href="/"
            className="text-slate-500 text-sm hover:text-slate-300"
          >
            ← Back to home
          </Link>
        </div>
      )}
    </main>
  );
}
