-- CreateTable
CREATE TABLE "StudySource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL DEFAULT '',
    "textCache" TEXT NOT NULL DEFAULT '',
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudySource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudyChat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New Study Chat',
    "sourceIds" TEXT NOT NULL DEFAULT '[]',
    "messages" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudyChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Podcast" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scriptNoteId" TEXT,
    "sourceIds" TEXT NOT NULL DEFAULT '[]',
    "host1Label" TEXT NOT NULL DEFAULT 'Host A',
    "host2Label" TEXT NOT NULL DEFAULT 'Host B',
    "durationEstimate" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Podcast_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Podcast_scriptNoteId_fkey" FOREIGN KEY ("scriptNoteId") REFERENCES "Note" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Flashcard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deckId" TEXT NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL DEFAULT '',
    "easeFactor" REAL NOT NULL DEFAULT 2.5,
    "interval" INTEGER NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "dueDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewed" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Flashcard_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "FlashcardDeck" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Flashcard" ("back", "createdAt", "deckId", "dueDate", "easeFactor", "front", "id", "interval", "lastReviewed", "repetitions", "updatedAt") SELECT "back", "createdAt", "deckId", "dueDate", "easeFactor", "front", "id", "interval", "lastReviewed", "repetitions", "updatedAt" FROM "Flashcard";
DROP TABLE "Flashcard";
ALTER TABLE "new_Flashcard" RENAME TO "Flashcard";
CREATE INDEX "Flashcard_deckId_idx" ON "Flashcard"("deckId");
CREATE INDEX "Flashcard_dueDate_idx" ON "Flashcard"("dueDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "StudySource_userId_idx" ON "StudySource"("userId");

-- CreateIndex
CREATE INDEX "StudySource_userId_kind_idx" ON "StudySource"("userId", "kind");

-- CreateIndex
CREATE INDEX "StudyChat_userId_idx" ON "StudyChat"("userId");

-- CreateIndex
CREATE INDEX "StudyChat_userId_updatedAt_idx" ON "StudyChat"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Podcast_userId_idx" ON "Podcast"("userId");

-- CreateIndex
CREATE INDEX "Podcast_userId_createdAt_idx" ON "Podcast"("userId", "createdAt");
