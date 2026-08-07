-- CreateTable
CREATE TABLE "UsageStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "feature" TEXT NOT NULL,
    "day" DATETIME NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "UsageStat_day_idx" ON "UsageStat"("day");

-- CreateIndex
CREATE UNIQUE INDEX "UsageStat_feature_day_key" ON "UsageStat"("feature", "day");
