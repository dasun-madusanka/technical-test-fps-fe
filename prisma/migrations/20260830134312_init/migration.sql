-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "deaths" INTEGER NOT NULL DEFAULT 0,
    "rating" INTEGER NOT NULL DEFAULT 1000,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Weapon" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "damage" INTEGER NOT NULL,
    "fireRate" INTEGER NOT NULL,
    "magazineSize" INTEGER NOT NULL,

    CONSTRAINT "Weapon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeaponVariant" (
    "id" TEXT NOT NULL,
    "weaponId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unlockType" TEXT NOT NULL,
    "unlockAmount" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WeaponVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerWeaponStat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weaponId" TEXT NOT NULL,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "headshots" INTEGER NOT NULL DEFAULT 0,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "selectedVariantId" TEXT,

    CONSTRAINT "PlayerWeaponStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mouseSens" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "aimSens" DOUBLE PRECISION NOT NULL DEFAULT 0.65,
    "keyForward" TEXT NOT NULL DEFAULT 'KeyW',
    "keyBackward" TEXT NOT NULL DEFAULT 'KeyS',
    "keyLeft" TEXT NOT NULL DEFAULT 'KeyA',
    "keyRight" TEXT NOT NULL DEFAULT 'KeyD',
    "keyJump" TEXT NOT NULL DEFAULT 'Space',
    "keyReload" TEXT NOT NULL DEFAULT 'KeyR',

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "won" BOOLEAN NOT NULL,
    "kills" INTEGER NOT NULL,
    "deaths" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Weapon_key_key" ON "Weapon"("key");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerWeaponStat_userId_weaponId_key" ON "PlayerWeaponStat"("userId", "weaponId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE INDEX "MatchResult_userId_createdAt_idx" ON "MatchResult"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "WeaponVariant" ADD CONSTRAINT "WeaponVariant_weaponId_fkey" FOREIGN KEY ("weaponId") REFERENCES "Weapon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerWeaponStat" ADD CONSTRAINT "PlayerWeaponStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerWeaponStat" ADD CONSTRAINT "PlayerWeaponStat_weaponId_fkey" FOREIGN KEY ("weaponId") REFERENCES "Weapon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
