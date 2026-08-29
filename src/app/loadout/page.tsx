"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Variant {
  id: string;
  name: string;
  unlockType: string;
  unlockAmount: number;
  progress: number;
  unlocked: boolean;
}

interface WeaponData {
  id: string;
  key: string;
  name: string;
  category: string;
  damage: number;
  fireRate: number;
  magazineSize: number;
  kills: number;
  headshots: number;
  selected: boolean;
  selectedVariantId: string | null;
  variants: Variant[];
}

const CATEGORIES = ["primary", "secondary", "melee"] as const;

export default function LoadoutPage() {
  const [weapons, setWeapons] = useState<WeaponData[]>([]);
  const [category, setCategory] =
    useState<(typeof CATEGORIES)[number]>("primary");
  const [activeWeaponId, setActiveWeaponId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/loadout")
      .then((res) => {
        if (!res.ok) throw new Error("unauthorized");
        return res.json();
      })
      .then((data) => {
        setWeapons(data.weapons);
        const firstInCategory = data.weapons.find(
          (w: WeaponData) => w.category === "primary",
        );
        setActiveWeaponId(firstInCategory?.id ?? null);
      })
      .catch(() => setError("Log in to view your loadout."))
      .finally(() => setLoading(false));
  }, []);

  const weaponsInCategory = weapons.filter((w) => w.category === category);
  const activeWeapon = weapons.find((w) => w.id === activeWeaponId);

  const handleSelect = async (weaponId: string) => {
    try {
      const res = await fetch("/api/loadout/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weaponId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Equip failed:", data.error || res.status);
        alert("Could not equip weapon — check console for details.");
        return;
      }

      setWeapons((prev) =>
        prev.map((w) =>
          w.category === prev.find((x) => x.id === weaponId)?.category
            ? { ...w, selected: w.id === weaponId }
            : w,
        ),
      );
    } catch (err) {
      console.error("Equip request failed:", err);
      alert("Network error while equipping weapon.");
    }
  };

  const handleSelectVariant = async (weaponId: string, variantId: string) => {
    try {
      const res = await fetch("/api/loadout/select-variant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Could not equip this skin.");
        return;
      }

      setWeapons((prev) =>
        prev.map((w) =>
          w.id === weaponId ? { ...w, selectedVariantId: variantId } : w,
        ),
      );
    } catch (err) {
      console.error("Equip variant failed:", err);
      alert("Network error while equipping skin.");
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500 font-mono">Loading loadout...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-red-400 font-mono mb-4">{error}</p>
        <Link href="/login" className="text-cyan-400 hover:underline">
          Log in
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-cyan-400">LOADOUT</h1>
          <Link
            href="/"
            className="text-slate-500 text-sm hover:text-slate-300"
          >
            ← Home
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-8">
          {/* left sidebar */}
          <div>
            <div className="flex gap-2 mb-4 font-mono text-sm">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setCategory(cat);
                    const first = weapons.find((w) => w.category === cat);
                    if (first) setActiveWeaponId(first.id);
                  }}
                  className={`px-3 py-1.5 rounded-md capitalize transition ${
                    category === cat
                      ? "bg-cyan-500 text-slate-950 font-bold"
                      : "bg-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {weaponsInCategory.map((w) => (
                <button
                  key={w.id}
                  onClick={() => setActiveWeaponId(w.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition ${
                    activeWeaponId === w.id
                      ? "border-cyan-500 bg-slate-900"
                      : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
                  }`}
                >
                  <div className="text-slate-200 font-bold text-sm">
                    {w.name}
                  </div>
                  {w.selected && (
                    <div className="text-cyan-400 text-xs font-mono mt-1">
                      EQUIPPED
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* right detail panel */}
          {activeWeapon && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-200">
                  {activeWeapon.name}
                </h2>
                <button
                  onClick={() => handleSelect(activeWeapon.id)}
                  disabled={activeWeapon.selected}
                  className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-sm transition"
                >
                  {activeWeapon.selected ? "EQUIPPED" : "EQUIP"}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-8 font-mono text-sm">
                <StatBox label="Damage" value={activeWeapon.damage} />
                <StatBox
                  label="Fire Rate"
                  value={`${activeWeapon.fireRate} RPM`}
                />
                <StatBox label="Magazine" value={activeWeapon.magazineSize} />
              </div>

              <div className="space-y-3">
                {activeWeapon.variants.map((v) => {
                  const isEquipped = activeWeapon.selectedVariantId === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() =>
                        v.unlocked && handleSelectVariant(activeWeapon.id, v.id)
                      }
                      disabled={!v.unlocked}
                      className={`w-full text-left border rounded-lg px-4 py-3 flex items-center justify-between transition ${
                        isEquipped
                          ? "border-cyan-500 bg-slate-900"
                          : v.unlocked
                            ? "border-slate-800 bg-slate-900/50 hover:border-slate-700 cursor-pointer"
                            : "border-slate-800 bg-slate-900/20 cursor-not-allowed opacity-60"
                      }`}
                    >
                      <div>
                        <div
                          className={`font-bold text-sm ${v.unlocked ? "text-slate-200" : "text-slate-500"}`}
                        >
                          {v.name} {!v.unlocked && "🔒"}
                          {isEquipped && (
                            <span className="text-cyan-400 text-xs ml-2">
                              EQUIPPED
                            </span>
                          )}
                        </div>
                        {v.unlockAmount > 0 && (
                          <div className="text-slate-500 text-xs font-mono mt-1">
                            Get {v.unlockAmount} {v.unlockType}
                          </div>
                        )}
                      </div>
                      {v.unlockAmount > 0 && (
                        <div className="w-40">
                          <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                            <div
                              className="h-full bg-cyan-500"
                              style={{
                                width: `${(v.progress / v.unlockAmount) * 100}%`,
                              }}
                            />
                          </div>
                          <div className="text-right text-slate-500 text-xs font-mono mt-1">
                            {v.progress}/{v.unlockAmount}
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-slate-800 rounded-lg py-3 text-center">
      <div className="text-cyan-400 font-bold">{value}</div>
      <div className="text-slate-500 text-xs mt-1">{label}</div>
    </div>
  );
}
