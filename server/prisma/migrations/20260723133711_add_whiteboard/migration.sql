-- CreateTable
CREATE TABLE "Whiteboard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Untitled',
    "content" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Whiteboard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Whiteboard_userId_idx" ON "Whiteboard"("userId");

-- CreateIndex
CREATE INDEX "Whiteboard_userId_updatedAt_idx" ON "Whiteboard"("userId", "updatedAt");
