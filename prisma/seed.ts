import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const weapons = [
    {
      key: "rifle",
      name: "Assault Rifle",
      category: "primary",
      damage: 20,
      fireRate: 750,
      magazineSize: 30,
      variants: [
        { name: "Standard", unlockType: "kills", unlockAmount: 0, sortOrder: 0 },
        { name: "Rookie", unlockType: "kills", unlockAmount: 10, sortOrder: 1 },
        { name: "Dustline", unlockType: "kills", unlockAmount: 100, sortOrder: 2 },
        { name: "Mossbreak", unlockType: "kills", unlockAmount: 400, sortOrder: 3 },
        { name: "Frostline", unlockType: "headshots", unlockAmount: 25, sortOrder: 4 },
        { name: "Hellfire", unlockType: "headshots", unlockAmount: 100, sortOrder: 5 },
      ],
    },
    {
      key: "sniper",
      name: "Sniper Rifle",
      category: "primary",
      damage: 90,
      fireRate: 60,
      magazineSize: 5,
      variants: [
        { name: "Standard", unlockType: "kills", unlockAmount: 0, sortOrder: 0 },
        { name: "Marksman", unlockType: "kills", unlockAmount: 20, sortOrder: 1 },
        { name: "Longshot", unlockType: "headshots", unlockAmount: 15, sortOrder: 2 },
      ],
    },
    {
      key: "pistol",
      name: "Combat Pistol",
      category: "secondary",
      damage: 25,
      fireRate: 400,
      magazineSize: 12,
      variants: [
        { name: "Standard", unlockType: "kills", unlockAmount: 0, sortOrder: 0 },
        { name: "Sidearm Pro", unlockType: "kills", unlockAmount: 50, sortOrder: 1 },
      ],
    },
    {
      key: "knife",
      name: "Combat Knife",
      category: "melee",
      damage: 75,
      fireRate: 150,
      magazineSize: 1,
      variants: [
        { name: "Standard", unlockType: "kills", unlockAmount: 0, sortOrder: 0 },
        { name: "Bloodedge", unlockType: "kills", unlockAmount: 30, sortOrder: 1 },
      ],
    },
  ];

  for (const w of weapons) {
    const weapon = await prisma.weapon.upsert({
      where: { key: w.key },
      update: {},
      create: {
        key: w.key,
        name: w.name,
        category: w.category,
        damage: w.damage,
        fireRate: w.fireRate,
        magazineSize: w.magazineSize,
      },
    });

    for (const v of w.variants) {
      const existing = await prisma.weaponVariant.findFirst({
        where: { weaponId: weapon.id, name: v.name },
      });
      if (!existing) {
        await prisma.weaponVariant.create({
          data: { ...v, weaponId: weapon.id },
        });
      }
    }
  }

  console.log("Weapons seeded.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());