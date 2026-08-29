import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function getWindowStart(period: string): Date | null {
  const now = new Date();
  if (period === "daily") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (period === "weekly") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return start;
  }
  return null; // all-time
}

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get("period") || "all-time";
  const windowStart = getWindowStart(period);

  if (!windowStart) {
    const players = await prisma.user.findMany({
      orderBy: { rating: "desc" },
      take: 20,
      select: { username: true, rating: true, wins: true, losses: true, kills: true, deaths: true },
    });
    return NextResponse.json({
      players: players.map((p) => ({
        username: p.username,
        rating: p.rating,
        kills: p.kills,
        deaths: p.deaths,
        kd: p.deaths > 0 ? p.kills / p.deaths : p.kills,
      })),
    });
  }

  const grouped = await prisma.matchResult.groupBy({
    by: ["userId"],
    where: { createdAt: { gte: windowStart } },
    _sum: { kills: true, deaths: true },
  });

  const userIds = grouped.map((g) => g.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, rating: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const players = grouped
    .map((g) => {
      const user = userMap.get(g.userId);
      const kills = g._sum.kills ?? 0;
      const deaths = g._sum.deaths ?? 0;
      return {
        username: user?.username ?? "Unknown",
        rating: user?.rating ?? 0,
        kills,
        deaths,
        kd: deaths > 0 ? kills / deaths : kills,
      };
    })
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 20);

  return NextResponse.json({ players });
}