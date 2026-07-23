-- CreateTable
CREATE TABLE "ProactiveAlertConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "hour" INTEGER NOT NULL DEFAULT 8,
    "minute" INTEGER NOT NULL DEFAULT 0,
    "categories" TEXT NOT NULL DEFAULT 'calendar,tasks,flashcards,habits',
    "customPrompt" TEXT NOT NULL DEFAULT '',
    "lastRunAt" DATETIME,
    "nextRunAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProactiveAlertConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProactiveAlertConfig_userId_key" ON "ProactiveAlertConfig"("userId");

-- CreateIndex
CREATE INDEX "ProactiveAlertConfig_enabled_nextRunAt_idx" ON "ProactiveAlertConfig"("enabled", "nextRunAt");
