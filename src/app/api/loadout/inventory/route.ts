import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const FALLBACKS = {
  primary: { key: "rifle", name: "Assault Rifle", damage: 20, fireRate: 750, magazineSize: 30 },
  secondary: { key: "pistol", name: "Combat Pistol", damage: 25, fireRate: 400, magazineSize: 12 },
  melee: { key: "knife", name: "Combat Knife", damage: 75, fireRate: 150, magazineSize: 1 },
} as const;

type WeaponData = { key: string; name: string; damage: number; fireRate: number; magazineSize: number };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ...FALLBACKS });
  }

  const categories = ["primary", "secondary", "melee"] as const;
  const result: Record<string, WeaponData> = {};

  for (const category of categories) {
    const stat = await prisma.playerWeaponStat.findFirst({
      where: { userId: user.id, selected: true, weapon: { category } },
      include: { weapon: true },
    });

    if (stat) {
      result[category] = {
        key: stat.weapon.key,
        name: stat.weapon.name,
        damage: stat.weapon.damage,
        fireRate: stat.weapon.fireRate,
        magazineSize: stat.weapon.magazineSize,
      };
    } else {
      const fallbackWeapon = await prisma.weapon.findUnique({ where: { key: FALLBACKS[category].key } });
      result[category] = fallbackWeapon
        ? {
            key: fallbackWeapon.key,
            name: fallbackWeapon.name,
            damage: fallbackWeapon.damage,
            fireRate: fallbackWeapon.fireRate,
            magazineSize: fallbackWeapon.magazineSize,
          }
        : FALLBACKS[category];
    }
  }

  return NextResponse.json(result);
}