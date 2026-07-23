-- CreateTable
CREATE TABLE "NtfyConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "serverUrl" TEXT NOT NULL DEFAULT 'https://ntfy.sh',
    "tokenEnc" TEXT NOT NULL DEFAULT '',
    "notifyTopic" TEXT NOT NULL,
    "inboxTopic" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultPriority" INTEGER NOT NULL DEFAULT 3,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NtfyConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NtfyCronJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'notification',
    "message" TEXT NOT NULL DEFAULT '',
    "prompt" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "tags" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" DATETIME,
    "nextRunAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NtfyCronJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NtfyMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'out',
    "topic" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "tags" TEXT NOT NULL DEFAULT '',
    "cronJobId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NtfyMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "NtfyConfig_userId_key" ON "NtfyConfig"("userId");

-- CreateIndex
CREATE INDEX "NtfyCronJob_userId_enabled_nextRunAt_idx" ON "NtfyCronJob"("userId", "enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "NtfyCronJob_userId_idx" ON "NtfyCronJob"("userId");

-- CreateIndex
CREATE INDEX "NtfyMessage_userId_createdAt_idx" ON "NtfyMessage"("userId", "createdAt");
