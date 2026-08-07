-- CreateTable
CREATE TABLE "ItemLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "srcType" TEXT NOT NULL,
    "srcId" TEXT NOT NULL,
    "dstType" TEXT NOT NULL,
    "dstId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ItemLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ItemLink_userId_srcType_srcId_idx" ON "ItemLink"("userId", "srcType", "srcId");

-- CreateIndex
CREATE INDEX "ItemLink_userId_dstType_dstId_idx" ON "ItemLink"("userId", "dstType", "dstId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemLink_userId_srcType_srcId_dstType_dstId_key" ON "ItemLink"("userId", "srcType", "srcId", "dstType", "dstId");
