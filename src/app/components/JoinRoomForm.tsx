"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function JoinRoomForm() {
  const router = useRouter();
  const [code, setCode] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed) {
      router.push(`/lobby/${trimmed}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 justify-center mt-4">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Enter room code"
        maxLength={5}
        className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm font-mono outline-none focus:border-cyan-500 uppercase"
      />
      <button
        type="submit"
        className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-bold transition"
      >
        JOIN
      </button>
    </form>
  );
}