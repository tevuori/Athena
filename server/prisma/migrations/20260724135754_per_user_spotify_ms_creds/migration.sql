-- CreateTable
CREATE TABLE "SpotifyCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clientIdEnc" TEXT NOT NULL,
    "clientSecretEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SpotifyCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MicrosoftCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clientIdEnc" TEXT NOT NULL,
    "clientSecretEnc" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'common',
    "refreshTokenEnc" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MicrosoftCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SpotifyCredential_userId_key" ON "SpotifyCredential"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MicrosoftCredential_userId_key" ON "MicrosoftCredential"("userId");
