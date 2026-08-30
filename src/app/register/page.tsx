"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();

    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Something went wrong.");
      return;
    }
    router.push("/profile");
    router.refresh();
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-black px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm xa-panel p-8"
      >
        <h1 className="text-2xl font-black text-white mb-6 text-center uppercase">
          CREATE ACCOUNT
        </h1>

        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded-lg px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <input
            type="text"
            placeholder="Username"
            required
            className="w-full xa-input px-3 py-2"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
          <input
            type="email"
            placeholder="Email"
            required
            className="w-full xa-input px-3 py-2"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            type="password"
            placeholder="Password"
            required
            className="w-full xa-input px-3 py-2"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <input
            type="password"
            placeholder="Confirm Password"
            required
            className="w-full xa-input px-3 py-2"
            value={form.confirmPassword}
            onChange={(e) =>
              setForm({ ...form, confirmPassword: e.target.value })
            }
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="xa-btn-primary w-full mt-6 py-2.5 disabled:opacity-50"
        >
          {loading ? "Creating..." : "CREATE ACCOUNT"}
        </button>

        <p className="text-[#7a7a82] text-sm text-center mt-4">
          Already have an account?{" "}
          <Link href="/login" className="text-white hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </main>
  );
}