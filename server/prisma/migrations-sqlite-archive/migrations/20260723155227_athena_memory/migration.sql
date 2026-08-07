-- CreateTable
CREATE TABLE "AthenaMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AthenaMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AthenaMemory_userId_category_idx" ON "AthenaMemory"("userId", "category");

-- CreateIndex
CREATE INDEX "AthenaMemory_userId_updatedAt_idx" ON "AthenaMemory"("userId", "updatedAt");
