"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";

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
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("primary");
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
        const firstInCategory = data.weapons.find((w: WeaponData) => w.category === "primary");
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
        prev.map((w) => (w.id === weaponId ? { ...w, selectedVariantId: variantId } : w)),
      );
    } catch (err) {
      console.error("Equip variant failed:", err);
      alert("Network error while equipping skin.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black">
        <Navbar />
        <main className="flex items-center justify-center py-20">
          <p className="text-[#7a7a82] font-mono">Loading loadout...</p>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black">
        <Navbar />
        <main className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <p className="text-red-400 font-mono mb-4">{error}</p>
          <Link href="/login" className="text-white hover:underline">Log in</Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <Navbar />
      <main className="px-6 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
            {/* left sidebar */}
            <div>
              <div className="flex gap-2 mb-4 text-sm font-bold uppercase">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      setCategory(cat);
                      const first = weapons.find((w) => w.category === cat);
                      if (first) setActiveWeaponId(first.id);
                    }}
                    className={`px-3 py-1.5 transition ${
                      category === cat ? "bg-white text-black" : "bg-[#1c1c20] text-[#8a8a90] hover:text-white"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="space-y-0">
                {weaponsInCategory.map((w, i) => (
                  <button
                    key={w.id}
                    onClick={() => setActiveWeaponId(w.id)}
                    className={`w-full flex items-center gap-3 text-left px-4 py-4 border transition ${i > 0 ? "-mt-px" : ""} ${
                      activeWeaponId === w.id
                        ? "border-white bg-[#101013]"
                        : "border-[#1c1c20] bg-black hover:border-[#3a3a3f]"
                    }`}
                  >
                    <WeaponIcon />
                    <div>
                      <div className="text-[#e5e5e8] font-bold text-sm uppercase">{w.name}</div>
                      {w.selected && (
                        <div className="text-white text-xs font-mono mt-1">EQUIPPED</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* right detail panel */}
            {activeWeapon && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xl font-bold text-white uppercase tracking-wide">
                    {activeWeapon.name}
                  </h2>
                  <span className="text-[#7a7a82] text-sm font-mono">
                    {weaponsInCategory.findIndex((w) => w.id === activeWeapon.id) + 1} / {activeWeapon.variants.length}
                  </span>
                </div>

                <div className="mb-6">
                  <button
                    onClick={() => handleSelect(activeWeapon.id)}
                    disabled={activeWeapon.selected}
                    className="xa-btn-primary px-4 py-2 text-sm disabled:bg-[#3a3a3f] disabled:text-[#8a8a90]"
                  >
                    {activeWeapon.selected ? "EQUIPPED" : "EQUIP"}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-0 mb-8 text-sm font-mono">
                  <StatBox label="Damage" value={activeWeapon.damage} />
                  <StatBox label="Fire Rate" value={`${activeWeapon.fireRate} RPM`} />
                  <StatBox label="Magazine" value={activeWeapon.magazineSize} />
                </div>

                <div>
                  {activeWeapon.variants.map((v, i) => {
                    const isEquipped = activeWeapon.selectedVariantId === v.id;
                    return (
                      <button
                        key={v.id}
                        onClick={() => v.unlocked && handleSelectVariant(activeWeapon.id, v.id)}
                        disabled={!v.unlocked}
                        className={`w-full text-left border flex items-center gap-4 px-4 py-4 transition ${i > 0 ? "-mt-px" : ""} ${
                          isEquipped
                            ? "border-white bg-[#101013]"
                            : v.unlocked
                              ? "border-[#1c1c20] bg-black hover:border-[#3a3a3f] cursor-pointer"
                              : "border-[#1c1c20] bg-black/40 cursor-not-allowed opacity-60"
                        }`}
                      >
                        <div className="w-10 h-10 bg-[#1c1c20] flex items-center justify-center shrink-0">
                          {!v.unlocked && <LockIcon />}
                        </div>
                        <div className="flex-1">
                          <div className={`font-bold text-sm uppercase ${v.unlocked ? "text-[#e5e5e8]" : "text-[#7a7a82]"}`}>
                            {v.name}
                            {isEquipped && <span className="text-white text-xs ml-2">EQUIPPED</span>}
                          </div>
                          {v.unlockAmount > 0 && (
                            <div className="text-[#7a7a82] text-xs font-mono mt-1">
                              Get {v.unlockAmount} {v.unlockType}
                            </div>
                          )}
                        </div>
                        {v.unlockAmount > 0 && (
                          <div className="w-64">
                            <div className="h-1.5 bg-[#1c1c20] overflow-hidden">
                              <div
                                className="h-full bg-white"
                                style={{ width: `${(v.progress / v.unlockAmount) * 100}%` }}
                              />
                            </div>
                            <div className="text-right text-[#7a7a82] text-xs font-mono mt-1">
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
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="xa-panel py-3 text-center -ml-px first:ml-0">
      <div className="text-white font-bold">{value}</div>
      <div className="text-[#7a7a82] text-xs mt-1">{label}</div>
    </div>
  );
}

function WeaponIcon() {
  return (
    <svg width="28" height="20" viewBox="0 0 48 24" fill="none" stroke="#c9c9cf" strokeWidth="2">
      <path d="M4 16h30l4-6h6M8 16v4M14 10v6M20 10v6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8a8a90" strokeWidth="2">
      <rect x="5" y="11" width="14" height="9" rx="1" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}