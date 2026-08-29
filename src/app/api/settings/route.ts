import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DEFAULTS = {
  mouseSens: 0.7,
  aimSens: 0.65,
  keyForward: "KeyW",
  keyBackward: "KeyS",
  keyLeft: "KeyA",
  keyRight: "KeyD",
  keyJump: "Space",
  keyReload: "KeyR",
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(DEFAULTS);
  }

  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  return NextResponse.json(settings ?? DEFAULTS);
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await req.json();
  const data = {
    mouseSens: typeof body.mouseSens === "number" ? body.mouseSens : DEFAULTS.mouseSens,
    aimSens: typeof body.aimSens === "number" ? body.aimSens : DEFAULTS.aimSens,
    keyForward: body.keyForward || DEFAULTS.keyForward,
    keyBackward: body.keyBackward || DEFAULTS.keyBackward,
    keyLeft: body.keyLeft || DEFAULTS.keyLeft,
    keyRight: body.keyRight || DEFAULTS.keyRight,
    keyJump: body.keyJump || DEFAULTS.keyJump,
    keyReload: body.keyReload || DEFAULTS.keyReload,
  };

  const settings = await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, ...data },
  });

  return NextResponse.json(settings);
}