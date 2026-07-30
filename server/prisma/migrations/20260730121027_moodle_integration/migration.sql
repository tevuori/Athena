-- CreateTable
CREATE TABLE "MoodleSync" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "courseName" TEXT NOT NULL DEFAULT '',
    "lastSyncAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignmentCount" INTEGER NOT NULL DEFAULT 0,
    "materialCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MoodleSync_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "size" INTEGER NOT NULL DEFAULT 0,
    "storageKey" TEXT NOT NULL,
    "externalUrl" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceRef" TEXT NOT NULL DEFAULT '',
    "folderId" TEXT,
    "userId" TEXT NOT NULL,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastOpenedAt" DATETIME,
    CONSTRAINT "VFile_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "VFolder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VFile" ("createdAt", "folderId", "id", "lastOpenedAt", "mimeType", "name", "size", "starred", "storageKey", "updatedAt", "userId") SELECT "createdAt", "folderId", "id", "lastOpenedAt", "mimeType", "name", "size", "starred", "storageKey", "updatedAt", "userId" FROM "VFile";
DROP TABLE "VFile";
ALTER TABLE "new_VFile" RENAME TO "VFile";
CREATE INDEX "VFile_userId_folderId_idx" ON "VFile"("userId", "folderId");
CREATE INDEX "VFile_userId_starred_idx" ON "VFile"("userId", "starred");
CREATE INDEX "VFile_userId_lastOpenedAt_idx" ON "VFile"("userId", "lastOpenedAt");
CREATE INDEX "VFile_userId_source_sourceRef_idx" ON "VFile"("userId", "source", "sourceRef");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MoodleSync_userId_idx" ON "MoodleSync"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MoodleSync_userId_courseId_key" ON "MoodleSync"("userId", "courseId");
