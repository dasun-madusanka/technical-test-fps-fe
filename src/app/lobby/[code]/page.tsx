"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Socket } from "socket.io-client";
import { getGameSocket, disconnectGameSocket } from "@/lib/gameSocket";

interface LobbyPlayer {
  id: string;
  username: string;
  ready: boolean;
}

interface ChatMsg {
  username: string;
  message: string;
  timestamp: number;
}

export default function LobbyPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);
  const navigatingToMatch = useRef(false);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      const res = await fetch("/api/game-token");
      if (!res.ok) {
        setError("You need to log in to join a lobby.");
        return;
      }
      const { token, userId } = await res.json();
      if (cancelled) return;
      setMyUserId(userId);

      const socket = getGameSocket(token);
      socketRef.current = socket;

      const onPlayerJoined = (data: { players: LobbyPlayer[] }) => setPlayers(data.players);
      const onRoomError = (data: { message: string }) => setError(data.message);
      const onChatMessage = (msg: ChatMsg) => setMessages((prev) => [...prev, msg]);
      const onMatchFound = () => {
        navigatingToMatch.current = true;
        router.push(`/match/${params.code}`);
      };

      socket.on("room:playerJoined", onPlayerJoined);
      socket.on("room:error", onRoomError);
      socket.on("room:chatMessage", onChatMessage);
      socket.on("match:found", onMatchFound);

      const attemptJoin = () => socket.emit("room:join", { roomCode: params.code });
      if (socket.connected) attemptJoin();
      else socket.once("connect", attemptJoin);

      return () => {
        socket.off("room:playerJoined", onPlayerJoined);
        socket.off("room:error", onRoomError);
        socket.off("room:chatMessage", onChatMessage);
        socket.off("match:found", onMatchFound);
      };
    }

    const cleanupPromise = connect();
    return () => {
      cancelled = true;
      cleanupPromise.then((cleanup) => cleanup && cleanup());
      // Only actually leave the room if the user is navigating away
      // (not when transitioning into the match we just started).
      if (!navigatingToMatch.current) {
        socketRef.current?.emit("room:leave");
      }
    };
  }, [params.code, router]);

  const sendChat = () => {
    if (!chatInput.trim()) return;
    socketRef.current?.emit("room:chat", { message: chatInput.trim() });
    setChatInput("");
  };

  const startMatch = () => {
    socketRef.current?.emit("room:start");
  };

  const handleLeave = () => {
    socketRef.current?.emit("room:leave");
    disconnectGameSocket();
  };

  const inviteLink = typeof window !== "undefined"
    ? `${window.location.origin}/lobby/${params.code}`
    : "";

  if (error) {
    return (
      <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-red-400 font-mono mb-4">{error}</p>
        <Link href="/" className="text-cyan-400 hover:underline">← Back to home</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 flex flex-col items-center">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-200">
              LOBBY <span className="text-cyan-400 font-mono">{params.code}</span>
            </h1>
            <p className="text-slate-500 text-sm mt-1">1v1 Duel · Arena</p>
          </div>
          <Link href="/" onClick={handleLeave} className="text-slate-500 text-sm hover:text-slate-300">
            Leave
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8">
          <PlayerSlot player={players[0]} myUserId={myUserId} label="Host" />
          <PlayerSlot player={players[1]} myUserId={myUserId} label="Challenger" />
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 mb-6 flex items-center gap-3">
          <span className="text-slate-500 text-sm font-mono flex-1 truncate">{inviteLink}</span>
          <button
            onClick={() => navigator.clipboard.writeText(inviteLink)}
            className="px-4 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-mono transition"
          >
            Copy
          </button>
        </div>

        {players.length >= 2 && players[0]?.id === myUserId && (
          <button
            onClick={startMatch}
            className="w-full py-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition mb-6"
          >
            START MATCH
          </button>
        )}
        {players.length < 2 && (
          <p className="text-center text-slate-500 font-mono text-sm mb-6">Waiting for opponent...</p>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-slate-500 text-xs font-mono mb-3 tracking-wider">LOBBY CHAT</div>
          <div className="h-40 overflow-y-auto space-y-1 mb-3 font-mono text-sm">
            {messages.length === 0 && <p className="text-slate-600">No messages yet</p>}
            {messages.map((m, i) => (
              <div key={i}>
                <span className="text-cyan-400">{m.username}</span>
                <span className="text-slate-500">: </span>
                <span className="text-slate-300">{m.message}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
              placeholder="Type a message"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500"
            />
            <button onClick={sendChat} className="px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm transition">
              Send
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function PlayerSlot({ player, myUserId, label }: { player?: LobbyPlayer; myUserId: string | null; label: string }) {
  return (
    <div className="border border-slate-800 rounded-lg p-6 text-center bg-slate-900">
      <div className="w-16 h-16 mx-auto rounded-full bg-slate-800 flex items-center justify-center mb-3">
        <span className="text-slate-500 text-xl">?</span>
      </div>
      {player ? (
        <>
          <div className="text-slate-200 font-bold">
            {player.username}
            {player.id === myUserId && <span className="text-cyan-400 text-xs ml-2">(you)</span>}
          </div>
          <div className="text-slate-500 text-xs font-mono mt-1">{label}</div>
        </>
      ) : (
        <div className="text-slate-600 font-mono text-sm">Waiting...</div>
      )}
    </div>
  );
}