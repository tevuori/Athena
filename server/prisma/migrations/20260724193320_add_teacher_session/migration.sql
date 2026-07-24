-- CreateTable
CREATE TABLE "TeacherSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Teach Me session',
    "sourceIds" TEXT NOT NULL DEFAULT '[]',
    "messages" TEXT NOT NULL DEFAULT '[]',
    "state" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeacherSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TeacherSession_userId_idx" ON "TeacherSession"("userId");

-- CreateIndex
CREATE INDEX "TeacherSession_userId_updatedAt_idx" ON "TeacherSession"("userId", "updatedAt");
