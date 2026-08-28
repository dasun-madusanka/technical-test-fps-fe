import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { getCurrentUser } from "@/lib/auth";

const GAME_SERVER_SECRET = process.env.JWT_SECRET as string;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username },
    GAME_SERVER_SECRET,
    { expiresIn: "5m" }
  );

  return NextResponse.json({ token, userId: user.id, username: user.username });
}