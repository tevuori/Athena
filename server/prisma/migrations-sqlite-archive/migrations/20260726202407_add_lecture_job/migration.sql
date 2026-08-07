-- CreateTable
CREATE TABLE "LectureJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "videoFileId" TEXT NOT NULL,
    "style" TEXT NOT NULL DEFAULT 'outline',
    "detail" TEXT NOT NULL DEFAULT 'standard',
    "language" TEXT NOT NULL DEFAULT 'en',
    "videoType" TEXT NOT NULL DEFAULT 'slides',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "stage" TEXT NOT NULL DEFAULT '',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT NOT NULL DEFAULT '',
    "noteId" TEXT,
    "folderId" TEXT,
    "slideCount" INTEGER NOT NULL DEFAULT 0,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "meta" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LectureJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LectureJob_userId_idx" ON "LectureJob"("userId");

-- CreateIndex
CREATE INDEX "LectureJob_userId_status_idx" ON "LectureJob"("userId", "status");
