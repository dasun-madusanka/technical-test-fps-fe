-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "mouseSens" REAL NOT NULL DEFAULT 0.7,
    "aimSens" REAL NOT NULL DEFAULT 0.65,
    "keyForward" TEXT NOT NULL DEFAULT 'KeyW',
    "keyBackward" TEXT NOT NULL DEFAULT 'KeyS',
    "keyLeft" TEXT NOT NULL DEFAULT 'KeyA',
    "keyRight" TEXT NOT NULL DEFAULT 'KeyD',
    "keyJump" TEXT NOT NULL DEFAULT 'Space',
    "keyReload" TEXT NOT NULL DEFAULT 'KeyR',
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");
