import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const weapons = await prisma.weapon.findMany({
    include: { variants: { orderBy: { sortOrder: "asc" } } },
  });

  const stats = await prisma.playerWeaponStat.findMany({
    where: { userId: user.id },
  });

  const statsByWeapon = new Map(stats.map((s) => [s.weaponId, s]));

  const result = weapons.map((w) => {
    const stat = statsByWeapon.get(w.id);
    return {
      id: w.id,
      key: w.key,
      name: w.name,
      category: w.category,
      damage: w.damage,
      fireRate: w.fireRate,
      magazineSize: w.magazineSize,
      kills: stat?.kills ?? 0,
      headshots: stat?.headshots ?? 0,
      selected: stat?.selected ?? false,
      selectedVariantId: stat?.selectedVariantId ?? null,
      variants: w.variants.map((v) => {
        const progress =
          v.unlockType === "kills"
            ? (stat?.kills ?? 0)
            : (stat?.headshots ?? 0);
        return {
          id: v.id,
          name: v.name,
          unlockType: v.unlockType,
          unlockAmount: v.unlockAmount,
          progress: Math.min(progress, v.unlockAmount),
          unlocked: progress >= v.unlockAmount,
        };
      }),
    };
  });

  return NextResponse.json({ weapons: result });
}
