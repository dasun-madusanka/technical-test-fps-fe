import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const equippedStat = await prisma.playerWeaponStat.findFirst({
    where: { userId: user.id, selected: true, weapon: { category: "primary" } },
    include: { weapon: true },
  });

  if (!equippedStat) {
    const fallback = await prisma.weapon.findUnique({ where: { key: "rifle" } });
    return NextResponse.json({
      key: fallback?.key ?? "rifle",
      name: fallback?.name ?? "Assault Rifle",
      damage: fallback?.damage ?? 20,
      fireRate: fallback?.fireRate ?? 750,
      magazineSize: fallback?.magazineSize ?? 30,
    });
  }

  return NextResponse.json({
    key: equippedStat.weapon.key,
    name: equippedStat.weapon.name,
    damage: equippedStat.weapon.damage,
    fireRate: equippedStat.weapon.fireRate,
    magazineSize: equippedStat.weapon.magazineSize,
  });
}