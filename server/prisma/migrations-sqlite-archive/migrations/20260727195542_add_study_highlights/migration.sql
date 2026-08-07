-- CreateTable
CREATE TABLE "StudyHighlight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "contentKey" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "contextBefore" TEXT NOT NULL DEFAULT '',
    "contextAfter" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT 'yellow',
    "annotation" TEXT,
    "sourceName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudyHighlight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StudyHighlight_userId_idx" ON "StudyHighlight"("userId");

-- CreateIndex
CREATE INDEX "StudyHighlight_userId_scope_scopeId_idx" ON "StudyHighlight"("userId", "scope", "scopeId");

-- CreateIndex
CREATE INDEX "StudyHighlight_userId_contentKey_idx" ON "StudyHighlight"("userId", "contentKey");
