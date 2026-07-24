-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AiCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "apiKeyEnc" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "baseUrl" TEXT,
    "modelId" TEXT,
    "rateLimitEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rateLimitRpd" INTEGER NOT NULL DEFAULT 50,
    "rateLimitRpm" INTEGER NOT NULL DEFAULT 20,
    "fallbackApiKeyEnc" TEXT,
    "fallbackProvider" TEXT,
    "fallbackBaseUrl" TEXT,
    "fallbackModelId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AiCredential" ("apiKeyEnc", "baseUrl", "createdAt", "id", "modelId", "provider", "updatedAt", "userId") SELECT "apiKeyEnc", "baseUrl", "createdAt", "id", "modelId", "provider", "updatedAt", "userId" FROM "AiCredential";
DROP TABLE "AiCredential";
ALTER TABLE "new_AiCredential" RENAME TO "AiCredential";
CREATE UNIQUE INDEX "AiCredential_userId_key" ON "AiCredential"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
