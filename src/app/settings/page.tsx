"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Settings {
  mouseSens: number;
  aimSens: number;
  keyForward: string;
  keyBackward: string;
  keyLeft: string;
  keyRight: string;
  keyJump: string;
  keyReload: string;
}

const KEY_LABELS: { field: keyof Settings; label: string }[] = [
  { field: "keyForward", label: "Forward" },
  { field: "keyBackward", label: "Backward" },
  { field: "keyLeft", label: "Left" },
  { field: "keyRight", label: "Right" },
  { field: "keyJump", label: "Jump" },
  { field: "keyReload", label: "Reload" },
];

const TABS = ["General", "Controls", "Graphics", "Audio"] as const;

export default function SettingsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Controls");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [listeningFor, setListeningFor] = useState<keyof Settings | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then(setSettings);
  }, []);

  useEffect(() => {
    if (!listeningFor) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      setSettings((prev) => (prev ? { ...prev, [listeningFor]: e.code } : prev));
      setListeningFor(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [listeningFor]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
  };

  if (!settings) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500 font-mono">Loading settings...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-cyan-400">SETTINGS</h1>
          <div className="flex gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm transition disabled:opacity-50"
            >
              {saving ? "SAVING..." : "SAVE PROGRESS"}
            </button>
            <Link href="/" className="text-slate-500 text-sm hover:text-slate-300 self-center">← Home</Link>
          </div>
        </div>

        <div className="grid grid-cols-[180px_1fr] gap-8">
          <div className="space-y-2 font-mono text-sm">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`w-full text-left px-4 py-3 rounded-lg border transition ${
                  tab === t
                    ? "border-cyan-500 bg-slate-900 text-slate-200"
                    : "border-slate-800 text-slate-500 hover:text-slate-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div>
            {tab === "General" && (
              <p className="text-slate-500 font-mono text-sm">No general settings yet.</p>
            )}

            {tab === "Controls" && (
              <div className="space-y-6">
                <SliderRow
                  label="Mouse sens"
                  value={settings.mouseSens}
                  min={0.1}
                  max={2}
                  step={0.05}
                  onChange={(v) => setSettings({ ...settings, mouseSens: v })}
                />
                <SliderRow
                  label="Aim sens"
                  value={settings.aimSens}
                  min={0.1}
                  max={2}
                  step={0.05}
                  onChange={(v) => setSettings({ ...settings, aimSens: v })}
                />

                <div>
                  <div className="text-slate-400 text-xs font-mono tracking-wider mb-3">BINDINGS</div>
                  <div className="space-y-2">
                    {KEY_LABELS.map(({ field, label }) => (
                      <div key={field} className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-4 py-3">
                        <span className="text-slate-300 text-sm">{label}</span>
                        <button
                          onClick={() => setListeningFor(field)}
                          className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 font-mono text-xs min-w-[80px]"
                        >
                          {listeningFor === field ? "Press a key..." : formatKeyCode(settings[field])}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === "Graphics" && (
              <p className="text-slate-500 font-mono text-sm">
                Graphics options aren&apos;t connected to rendering yet in this build — coming in a later pass.
              </p>
            )}

            {tab === "Audio" && (
              <p className="text-slate-500 font-mono text-sm">
                No sound system implemented yet — audio settings will appear here once one exists.
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-sm text-slate-300 mb-2">
        <span>{label}</span>
        <span className="font-mono text-cyan-400">{value.toFixed(2)}x</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-cyan-500"
      />
    </div>
  );
}

function formatKeyCode(code: string): string {
  if (code === "Space") return "Space";
  if (code.startsWith("Key")) return code.slice(3);
  return code;
}