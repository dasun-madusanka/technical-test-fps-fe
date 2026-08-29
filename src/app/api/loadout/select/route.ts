import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { weaponId } = await req.json();
  const weapon = await prisma.weapon.findUnique({ where: { id: weaponId } });
  if (!weapon) {
    return NextResponse.json({ error: "Weapon not found." }, { status: 404 });
  }

  // deselect other weapons in the same category
  const sameCategory = await prisma.weapon.findMany({
    where: { category: weapon.category },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.playerWeaponStat.updateMany({
      where: { userId: user.id, weaponId: { in: sameCategory.map((w) => w.id) } },
      data: { selected: false },
    }),
    prisma.playerWeaponStat.upsert({
      where: { userId_weaponId: { userId: user.id, weaponId } },
      update: { selected: true },
      create: { userId: user.id, weaponId, selected: true },
    }),
  ]);

  return NextResponse.json({ ok: true });
}