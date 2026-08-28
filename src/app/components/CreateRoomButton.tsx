"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getGameSocket } from "@/lib/gameSocket";

export default function CreateRoomButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    const res = await fetch("/api/game-token");
    if (!res.ok) {
      alert("You need to log in to create a private lobby.");
      setLoading(false);
      return;
    }
    const { token } = await res.json();

    const socket = getGameSocket(token);
    const onCreated = (data: { roomCode: string }) => {
      socket.off("room:created", onCreated);
      router.push(`/lobby/${data.roomCode}`);
    };
    socket.on("room:created", onCreated);

    if (socket.connected) {
      socket.emit("room:create");
    } else {
      socket.once("connect", () => socket.emit("room:create"));
    }
  };

  return (
    <button
      onClick={handleCreate}
      disabled={loading}
      className="px-8 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition disabled:opacity-50"
    >
      {loading ? "CREATING..." : "PRIVATE LOBBY"}
    </button>
  );
}