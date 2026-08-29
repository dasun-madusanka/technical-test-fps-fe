"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MultiplayerArena, MultiplayerState } from "@/game/MultiplayerArena";
import { GameSettings, WeaponConfig } from "@/game/ArenaGame";
import { getGameSocket, disconnectGameSocket } from "@/lib/gameSocket";

const initialState: MultiplayerState = {
  connectionStatus: "connecting",
  myHealth: 100,
  myAmmo: 30,
  isReloading: false,
  myKills: 0,
  myDeaths: 0,
  opponentUsername: "",
  opponentHealth: 100,
  opponentKills: 0,
  isDead: false,
  respawnCountdown: 0,
  killFeed: [],
  matchOver: false,
  won: false,
};

export default function QueuePage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<MultiplayerArena | null>(null);
  const [state, setState] = useState<MultiplayerState>(initialState);
  const [error, setError] = useState("");
  const [weapon, setWeapon] = useState<WeaponConfig | null>(null);
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [reportStatus, setReportStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const hasReported = useRef(false);

  useEffect(() => {
    fetch("/api/loadout/equipped")
      .then((res) => (res.ok ? res.json() : null))
      .then(setWeapon)
      .catch(() => setWeapon(null));
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then(setSettings)
      .catch(() => setSettings(null));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      const res = await fetch("/api/game-token");
      if (!res.ok) {
        setError("You need to log in to play multiplayer.");
        return;
      }
      const { token, userId } = await res.json();
      if (cancelled || !canvasRef.current || !weapon || !settings) return;

      const socket = getGameSocket(token);
      const game = new MultiplayerArena(
        canvasRef.current,
        socket,
        setState,
        undefined,
        weapon,
        settings
      );
      game.setMyUserId(userId);
      gameRef.current = game;
    }

    setup();

    return () => {
      cancelled = true;
      gameRef.current?.dispose();
    };
  }, [weapon, settings]);

  useEffect(() => {
    if (state.matchOver && !hasReported.current) {
      hasReported.current = true;
      setReportStatus("saving");

      fetch("/api/matches/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          won: state.won,
          kills: state.myKills,
          deaths: state.myDeaths,
          weaponKey: weapon?.key ?? "rifle",
        }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("failed");
          setReportStatus("saved");
        })
        .catch(() => setReportStatus("error"));
    }
  }, [state.matchOver, state.won, state.myKills, state.myDeaths, weapon]);

  return (
    <main className="relative overflow-hidden bg-black" style={{ width: "100vw", height: "100vh" }}>
      <canvas ref={canvasRef} className="block" style={{ width: "100%", height: "100%" }} />

      {state.connectionStatus === "matched" && !state.matchOver && (
        <>
          <div className="crosshair" />
          <div className="absolute bottom-6 left-6 z-10 font-mono text-sm text-slate-200 space-y-2 w-56">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-400">HEALTH</span>
                <span>{state.myHealth}</span>
              </div>
              <div className="h-2 bg-slate-800 rounded overflow-hidden">
                <div
                  className="h-full bg-red-500 transition-all"
                  style={{ width: `${state.myHealth}%` }}
                />
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">AMMO</span>
              <span className={state.isReloading ? "text-yellow-400" : ""}>
                {state.isReloading ? "RELOADING..." : `${state.myAmmo} / ${weapon?.magazineSize ?? 30}`}
              </span>
            </div>
          </div>

          <div className="absolute top-4 right-4 z-10 font-mono text-sm bg-black/50 border border-cyan-500/30 rounded-lg px-4 py-2 text-slate-200">
            <div className="flex justify-between gap-6">
              <span className="text-cyan-400">You</span>
              <span>{state.myKills}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-orange-400">{state.opponentUsername || "Opponent"}</span>
              <span>{state.opponentKills}</span>
            </div>
          </div>

          <div className="absolute top-4 left-4 z-10 font-mono text-xs text-slate-300 space-y-1">
            {state.killFeed.map((msg, i) => (
              <div key={i} className="bg-black/40 px-2 py-1 rounded">
                {msg}
              </div>
            ))}
          </div>

          {state.isDead && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60">
              <div className="text-red-500 text-4xl font-bold mb-3">ELIMINATED</div>
              <div className="text-slate-300 font-mono">
                Respawning in {state.respawnCountdown}...
              </div>
            </div>
          )}
        </>
      )}

      {state.matchOver && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80">
          <div className={`text-5xl font-bold mb-4 ${state.won ? "text-cyan-400" : "text-red-500"}`}>
            {state.won ? "VICTORY" : "DEFEAT"}
          </div>
          <div className="text-3xl font-mono text-slate-200 mb-6">
            {state.myKills} - {state.opponentKills}
          </div>

          <div className="text-slate-500 font-mono text-sm mb-6">
            {reportStatus === "saving" && "Saving match result..."}
            {reportStatus === "saved" && "Stats updated."}
            {reportStatus === "error" && "Could not save stats (are you logged in?)"}
          </div>

          <button
            onClick={() => {
              disconnectGameSocket();
              router.push("/");
            }}
            className="px-6 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition"
          >
            RETURN HOME
          </button>
        </div>
      )}

      {(state.connectionStatus === "connecting" || state.connectionStatus === "queued") &&
        !state.matchOver && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 text-center px-6">
            <h1 className="text-2xl font-bold text-cyan-400 mb-3">
              {state.connectionStatus === "connecting" ? "CONNECTING..." : "SEARCHING FOR OPPONENT..."}
            </h1>
            <p className="text-slate-500 font-mono text-sm">
              This may take a moment if no one else is queued.
            </p>
          </div>
        )}

      {(error || state.connectionStatus === "error" || state.connectionStatus === "disconnected") && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 text-center px-6">
          <p className="text-red-400 font-mono mb-4">{error || "Connection to game server lost."}</p>
          <Link href="/" className="text-cyan-400 hover:underline">
            ← Back to home
          </Link>
        </div>
      )}
    </main>
  );
}