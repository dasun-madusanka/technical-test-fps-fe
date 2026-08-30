"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

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
      <div className="min-h-screen bg-black">
        <Navbar />
        <main className="flex items-center justify-center py-20">
          <p className="text-[#7a7a82] font-mono">Loading settings...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <Navbar />
      <main className="px-6 py-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-[220px_1fr] gap-6">
            {/* sidebar */}
            <div className="space-y-3">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`w-full flex items-center gap-3 text-left px-4 py-4 text-sm font-bold uppercase tracking-wide transition ${
                    tab === t ? "xa-tab-active" : "xa-tab-inactive hover:text-white"
                  }`}
                >
                  <TabIcon tab={t} active={tab === t} />
                  {t}
                </button>
              ))}
            </div>

            {/* right panel */}
            <div className="space-y-0">
              {tab === "Controls" && (
                <>
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

                  <div className="flex items-center justify-between xa-panel px-6 py-4">
                    <span className="text-sm text-[#c9c9cf]">Aim</span>
                    <div className="flex text-xs font-bold uppercase">
                      <span className="px-4 py-2 bg-white text-black">Hold</span>
                      <span className="px-4 py-2 bg-black text-[#8a8a90] border border-[#1c1c20] border-l-0">
                        Toggle
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-1 py-5">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#c9c9cf]">
                      Bindings
                    </span>
                    <button className="text-xs text-[#8a8a90] hover:text-white flex items-center gap-1">
                      ↺ Reset all
                    </button>
                  </div>

                  <div>
                    {KEY_LABELS.map(({ field, label }) => (
                      <div
                        key={field}
                        className="flex items-center justify-between xa-panel px-6 py-4 -mt-px"
                      >
                        <span className="text-sm text-[#c9c9cf]">{label}</span>
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => setListeningFor(field)}
                            className="px-3 py-1 bg-[#1c1c20] hover:bg-[#26262b] text-white font-mono text-xs min-w-[70px] text-center"
                          >
                            {listeningFor === field
                              ? "Press a key..."
                              : formatKeyCode(settings[field])}
                          </button>
                          <button className="text-[#8a8a90] hover:text-white text-lg leading-none">+</button>
                          <button className="text-[#8a8a90] hover:text-white">↺</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-6">
                    <button
                      onClick={save}
                      disabled={saving}
                      className="xa-btn-primary px-6 py-2.5 text-sm disabled:opacity-50"
                    >
                      {saving ? "SAVING..." : "SAVE PROGRESS"}
                    </button>
                  </div>
                </>
              )}

              {tab === "General" && (
                <p className="text-[#7a7a82] font-mono text-sm px-1 py-4">
                  No general settings yet.
                </p>
              )}

              {tab === "Graphics" && <GraphicsTab />}

              {tab === "Audio" && <AudioTab />}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function TabIcon({ tab, active }: { tab: string; active: boolean }) {
  const color = active ? "#0a0a0a" : "#8a8a90";
  const common = { width: 16, height: 16, fill: "none", stroke: color, strokeWidth: 2 } as const;
  if (tab === "General") return <svg {...common} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" /></svg>;
  if (tab === "Controls") return <svg {...common} viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" /></svg>;
  if (tab === "Graphics") return <svg {...common} viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="14" rx="1" /><path d="M8 21h8M12 18v3" /></svg>;
  return <svg {...common} viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3Z" /><path d="M16 8a5 5 0 0 1 0 8" /></svg>;
}

function SliderRow({
  label, value, min, max, step, onChange,
}: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between xa-panel px-6 py-4">
      <span className="text-sm text-[#c9c9cf]">{label}</span>
      <div className="flex items-center gap-4">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-56 accent-white"
        />
        <span className="font-mono text-white text-sm w-14 text-right">{value.toFixed(2)}x</span>
      </div>
    </div>
  );
}

/** Visual-only (not persisted) — matches the reference screens */
function GraphicsTab() {
  const [preset, setPreset] = useState("High");
  const [fov, setFov] = useState(75);
  const [renderScale, setRenderScale] = useState("100%");
  const [antiAlias, setAntiAlias] = useState("MSAA");
  const [shadows, setShadows] = useState("High");
  const [bloom, setBloom] = useState("On");
  const [effects, setEffects] = useState("High");
  const [textures, setTextures] = useState("High");
  const [viewmodel, setViewmodel] = useState("High");
  const [scope, setScope] = useState("Always");
  const [debugUI, setDebugUI] = useState("Simple");

  return (
    <div>
      <Segmented label="Preset" options={["Low", "Medium", "High", "Ultra", "Custom"]} value={preset} onChange={setPreset} />
      <div className="flex items-center justify-between xa-panel px-6 py-4 -mt-px">
        <span className="text-sm text-[#c9c9cf]">FOV</span>
        <div className="flex items-center gap-4">
          <input type="range" min={60} max={110} value={fov} onChange={(e) => setFov(Number(e.target.value))} className="w-56 accent-white" />
          <span className="font-mono text-white text-sm w-10 text-right">{fov}</span>
        </div>
      </div>
      <Segmented label="Render scale" options={["50%", "60%", "67%", "85%", "100%", "125%"]} value={renderScale} onChange={setRenderScale} rowClass="-mt-px" />
      <Segmented label="Anti-alias" options={["Off", "MSAA"]} value={antiAlias} onChange={setAntiAlias} rowClass="-mt-px" />
      <Segmented label="Shadows" options={["Off", "Low", "Med", "High", "Ultra"]} value={shadows} onChange={setShadows} rowClass="-mt-px" />
      <Segmented label="Bloom" options={["Off", "On"]} value={bloom} onChange={setBloom} rowClass="-mt-px" />
      <Segmented label="Effects" options={["Off", "Low", "Med", "High"]} value={effects} onChange={setEffects} rowClass="-mt-px" />
      <Segmented label="Textures" options={["Low", "Med", "High", "Ultra"]} value={textures} onChange={setTextures} rowClass="-mt-px" />
      <Segmented label="Viewmodel" options={["Low", "High"]} value={viewmodel} onChange={setViewmodel} rowClass="-mt-px" />
      <Segmented label="Scope" options={["ADS", "Always"]} value={scope} onChange={setScope} rowClass="-mt-px" />
      <Segmented label="Debug UI" options={["None", "Simple", "Advanced"]} value={debugUI} onChange={setDebugUI} rowClass="-mt-px" />
      <p className="text-[#5a5a60] font-mono text-xs pt-4">
        Graphics options aren&apos;t connected to rendering yet in this build.
      </p>
    </div>
  );
}

function AudioTab() {
  const [volume, setVolume] = useState(80);
  return (
    <div className="flex items-center justify-between xa-panel px-6 py-4">
      <span className="text-sm text-[#c9c9cf]">Master volume</span>
      <div className="flex items-center gap-4">
        <input type="range" min={0} max={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-56 accent-white" />
        <span className="font-mono text-white text-sm w-10 text-right">{volume}%</span>
      </div>
    </div>
  );
}

function Segmented({
  label, options, value, onChange, rowClass = "",
}: { label: string; options: string[]; value: string; onChange: (v: string) => void; rowClass?: string }) {
  return (
    <div className={`flex items-center justify-between xa-panel px-6 py-4 ${rowClass}`}>
      <span className="text-sm text-[#c9c9cf]">{label}</span>
      <div className="flex text-xs font-bold">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`px-4 py-2 border border-[#1c1c20] ${
              value === opt ? "bg-white text-black border-white" : "bg-black text-[#8a8a90]"
            } -ml-px first:ml-0`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatKeyCode(code: string): string {
  if (code === "Space") return "Space";
  if (code.startsWith("Key")) return code.slice(3);
  return code;
}