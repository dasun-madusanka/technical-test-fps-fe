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
        className="xa-input px-3 py-2 text-sm font-mono uppercase"
      />
      <button type="submit" className="xa-btn-secondary px-4 py-2 text-sm">
        JOIN
      </button>
    </form>
  );
}
