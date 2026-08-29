import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { variantId } = await req.json();

  const variant = await prisma.weaponVariant.findUnique({ where: { id: variantId } });
  if (!variant) {
    return NextResponse.json({ error: "Variant not found." }, { status: 404 });
  }

  const stat = await prisma.playerWeaponStat.findUnique({
    where: { userId_weaponId: { userId: user.id, weaponId: variant.weaponId } },
  });

  const progress = variant.unlockType === "kills" ? stat?.kills ?? 0 : stat?.headshots ?? 0;
  if (progress < variant.unlockAmount) {
    return NextResponse.json({ error: "This skin is still locked." }, { status: 403 });
  }

  await prisma.playerWeaponStat.upsert({
    where: { userId_weaponId: { userId: user.id, weaponId: variant.weaponId } },
    update: { selectedVariantId: variantId },
    create: { userId: user.id, weaponId: variant.weaponId, selectedVariantId: variantId },
  });

  return NextResponse.json({ ok: true });
}