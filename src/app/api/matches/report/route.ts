import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const RATING_WIN = 25;
const RATING_LOSS = -18;
const XP_PER_KILL = 10;
const XP_WIN_BONUS = 50;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { won, kills, deaths, headshots = 0, weaponKey } = await req.json();

  if (typeof won !== "boolean" || typeof kills !== "number" || typeof deaths !== "number") {
    return NextResponse.json({ error: "Invalid match report." }, { status: 400 });
  }

  const ratingDelta = won ? RATING_WIN : RATING_LOSS;
  const xpGained = kills * XP_PER_KILL + (won ? XP_WIN_BONUS : 0);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      wins: { increment: won ? 1 : 0 },
      losses: { increment: won ? 0 : 1 },
      kills: { increment: kills },
      deaths: { increment: deaths },
      rating: { increment: ratingDelta },
      xp: { increment: xpGained },
    },
  });

  await prisma.matchResult.create({
    data: {
      userId: user.id,
      won,
      kills,
      deaths,
    },
  });

  if (weaponKey) {
    const weapon = await prisma.weapon.findUnique({ where: { key: weaponKey } });
    if (weapon) {
      await prisma.playerWeaponStat.upsert({
        where: { userId_weaponId: { userId: user.id, weaponId: weapon.id } },
        update: {
          kills: { increment: kills },
          headshots: { increment: headshots },
        },
        create: {
          userId: user.id,
          weaponId: weapon.id,
          kills,
          headshots,
        },
      });
    }
  }

  return NextResponse.json({
    rating: updated.rating,
    xp: updated.xp,
    ratingDelta,
    xpGained,
  });
}