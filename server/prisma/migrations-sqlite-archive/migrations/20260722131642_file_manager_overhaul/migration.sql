/*
  Warnings:

  - Added the required column `updatedAt` to the `VFile` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `VFolder` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "size" INTEGER NOT NULL DEFAULT 0,
    "storageKey" TEXT NOT NULL,
    "folderId" TEXT,
    "userId" TEXT NOT NULL,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastOpenedAt" DATETIME,
    CONSTRAINT "VFile_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "VFolder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VFile" ("createdAt", "folderId", "id", "mimeType", "name", "size", "storageKey", "userId", "starred", "updatedAt") SELECT "createdAt", "folderId", "id", "mimeType", "name", "size", "storageKey", "userId", 0, "createdAt" FROM "VFile";
DROP TABLE "VFile";
ALTER TABLE "new_VFile" RENAME TO "VFile";
CREATE INDEX "VFile_userId_folderId_idx" ON "VFile"("userId", "folderId");
CREATE INDEX "VFile_userId_starred_idx" ON "VFile"("userId", "starred");
CREATE INDEX "VFile_userId_lastOpenedAt_idx" ON "VFile"("userId", "lastOpenedAt");
CREATE TABLE "new_VFolder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "VFolder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VFolder" ("createdAt", "id", "name", "parentId", "userId", "updatedAt") SELECT "createdAt", "id", "name", "parentId", "userId", "createdAt" FROM "VFolder";
DROP TABLE "VFolder";
ALTER TABLE "new_VFolder" RENAME TO "VFolder";
CREATE INDEX "VFolder_userId_parentId_idx" ON "VFolder"("userId", "parentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
