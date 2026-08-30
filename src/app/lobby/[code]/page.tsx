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
      const [tokenRes, weaponRes] = await Promise.all([
        fetch("/api/game-token"),
        fetch("/api/loadout/equipped"),
      ]);

      if (!tokenRes.ok) {
        setError("You need to log in to join a lobby.");
        return;
      }
      const { token, userId } = await tokenRes.json();
      const weapon = weaponRes.ok ? await weaponRes.json() : null;
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

      const attemptJoin = () =>
        socket.emit("room:join", {
          roomCode: params.code,
          weapon: weapon
            ? { damage: weapon.damage, fireRate: weapon.fireRate, magazineSize: weapon.magazineSize }
            : undefined,
        });
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

  const inviteLink =
    typeof window !== "undefined" ? `${window.location.origin}/lobby/${params.code}` : "";

  if (error) {
    return (
      <main className="min-h-screen bg-black flex flex-col items-center justify-center px-6 text-center">
        <p className="text-red-400 font-mono mb-4">{error}</p>
        <Link href="/" className="text-white hover:underline">← Back to home</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-8 py-8">
      <div className="w-full">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-black text-white">
            LOBBY <span className="text-[#7a7a82] font-mono">{params.code}</span>
          </h1>
          <Link
            href="/"
            onClick={handleLeave}
            className="xa-btn-secondary px-5 py-2 text-sm"
          >
            LEAVE
          </Link>
        </div>

        <div className="flex gap-10 mb-8">
          <div>
            <div className="text-[#7a7a82] text-xs font-bold uppercase tracking-wider mb-2">Mode</div>
            <div className="xa-input px-4 py-2 text-sm font-bold">1V1 DUEL</div>
          </div>
          <div>
            <div className="text-[#7a7a82] text-xs font-bold uppercase tracking-wider mb-2">Map</div>
            <div className="xa-input px-4 py-2 text-sm font-bold">ARENA</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6">
          <div className="flex items-center justify-center gap-8">
            <PlayerSlot player={players[0]} myUserId={myUserId} label="Host" />
            <span className="text-white font-black text-2xl">VS</span>
            <PlayerSlot player={players[1]} myUserId={myUserId} label="Challenger" />
          </div>

          <div className="xa-panel flex flex-col h-[420px]">
            <div className="text-[#7a7a82] text-xs font-bold uppercase tracking-wider px-4 pt-4 pb-3 border-b border-[#1c1c20]">
              Lobby Chat
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 font-mono text-sm">
              {messages.length === 0 && <p className="text-[#5a5a60]">No messages yet</p>}
              {messages.map((m, i) => (
                <div key={i}>
                  <span className="text-white">{m.username}</span>
                  <span className="text-[#7a7a82]">: </span>
                  <span className="text-[#c9c9cf]">{m.message}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 p-3 border-t border-[#1c1c20]">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                placeholder="Type a message"
                className="xa-input flex-1 px-3 py-2 text-sm"
              />
              <button onClick={sendChat} className="xa-btn-secondary px-3 py-2">
                <SendIcon />
              </button>
            </div>
          </div>
        </div>

        {players.length >= 2 && players[0]?.id === myUserId && (
          <button onClick={startMatch} className="xa-btn-primary w-full py-3 mt-6">
            START MATCH
          </button>
        )}
        {players.length < 2 && (
          <p className="text-center text-[#7a7a82] font-mono text-sm mt-6">Waiting for opponent...</p>
        )}

        <div className="xa-panel flex items-center gap-3 px-4 py-3 mt-6">
          <span className="text-[#7a7a82] text-sm font-mono flex-1 truncate">{inviteLink}</span>
          <button
            onClick={() => navigator.clipboard.writeText(inviteLink)}
            className="xa-btn-secondary px-4 py-1.5 text-sm"
          >
            COPY
          </button>
        </div>
      </div>
    </main>
  );
}

function PlayerSlot({ player, myUserId, label }: { player?: LobbyPlayer; myUserId: string | null; label: string }) {
  return (
    <div className="xa-panel p-8 text-center w-56">
      <div className="w-20 h-20 mx-auto bg-[#1c1c20] flex items-center justify-center mb-4">
        <span className="text-[#7a7a82] text-2xl">?</span>
      </div>
      {player ? (
        <>
          <div className="text-white font-bold">
            {player.username}
            {player.id === myUserId && <span className="text-[#7a7a82] text-xs ml-2">(you)</span>}
          </div>
          <div className="text-[#7a7a82] text-xs font-mono mt-1">{label}</div>
        </>
      ) : (
        <div className="text-[#5a5a60] font-mono text-sm">WAITING_</div>
      )}
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}