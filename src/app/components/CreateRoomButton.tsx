"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";

const GAME_SERVER_URL = "http://localhost:4000";

export default function CreateRoomButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);

    const [tokenRes, weaponRes] = await Promise.all([
      fetch("/api/game-token"),
      fetch("/api/loadout/equipped"),
    ]);

    if (!tokenRes.ok) {
      alert("You need to log in to create a private lobby.");
      setLoading(false);
      return;
    }
    const { token } = await tokenRes.json();
    const weapon = weaponRes.ok ? await weaponRes.json() : null;

    const socket = io(GAME_SERVER_URL, { auth: { token }, transports: ["websocket"] });
    socket.on("connect", () => {
      socket.emit("room:create", {
        weapon: weapon
          ? { damage: weapon.damage, fireRate: weapon.fireRate, magazineSize: weapon.magazineSize }
          : undefined,
      });
    });
    socket.on("room:created", (data: { roomCode: string }) => {
      socket.disconnect();
      router.push(`/lobby/${data.roomCode}`);
    });
  };

  return (
    <button
      onClick={handleCreate}
      disabled={loading}
      className="xa-btn-secondary px-8 py-3 text-sm disabled:opacity-50"
    >
      {loading ? "CREATING..." : "PRIVATE LOBBY"}
    </button>
  );
}