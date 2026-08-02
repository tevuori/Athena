-- AlterTable
ALTER TABLE "Trip" ADD COLUMN "dayNumber" INTEGER;
ALTER TABLE "Trip" ADD COLUMN "tourId" TEXT;

-- CreateTable
CREATE TABLE "HikingTour" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "baseLat" REAL NOT NULL,
    "baseLon" REAL NOT NULL,
    "baseName" TEXT NOT NULL,
    "endLat" REAL,
    "endLon" REAL,
    "endName" TEXT,
    "numDays" INTEGER NOT NULL,
    "difficulty" TEXT NOT NULL,
    "totalDistanceM" REAL NOT NULL DEFAULT 0,
    "totalAscentM" REAL NOT NULL DEFAULT 0,
    "totalDurationS" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HikingTour_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "HikingTour_userId_idx" ON "HikingTour"("userId");

-- CreateIndex
CREATE INDEX "Trip_tourId_idx" ON "Trip"("tourId");
