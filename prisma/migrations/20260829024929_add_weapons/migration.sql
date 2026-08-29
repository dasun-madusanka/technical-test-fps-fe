-- CreateTable
CREATE TABLE "Weapon" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "damage" INTEGER NOT NULL,
    "fireRate" INTEGER NOT NULL,
    "magazineSize" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "WeaponVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weaponId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unlockType" TEXT NOT NULL,
    "unlockAmount" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "WeaponVariant_weaponId_fkey" FOREIGN KEY ("weaponId") REFERENCES "Weapon" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerWeaponStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "weaponId" TEXT NOT NULL,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "headshots" INTEGER NOT NULL DEFAULT 0,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "PlayerWeaponStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlayerWeaponStat_weaponId_fkey" FOREIGN KEY ("weaponId") REFERENCES "Weapon" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Weapon_key_key" ON "Weapon"("key");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerWeaponStat_userId_weaponId_key" ON "PlayerWeaponStat"("userId", "weaponId");
