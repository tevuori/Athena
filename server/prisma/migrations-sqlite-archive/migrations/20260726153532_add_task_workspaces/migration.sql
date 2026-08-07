-- CreateTable
CREATE TABLE "TaskWorkspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskWorkspace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "dueDate" DATETIME,
    "recurring" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "TaskWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("createdAt", "description", "dueDate", "id", "order", "priority", "recurring", "status", "title", "updatedAt", "userId") SELECT "createdAt", "description", "dueDate", "id", "order", "priority", "recurring", "status", "title", "updatedAt", "userId" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_userId_status_idx" ON "Task"("userId", "status");
CREATE INDEX "Task_userId_workspaceId_idx" ON "Task"("userId", "workspaceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TaskWorkspace_userId_idx" ON "TaskWorkspace"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskWorkspace_userId_name_key" ON "TaskWorkspace"("userId", "name");

-- Backfill: create a "Default" workspace for each existing user and
-- assign all their pre-existing tasks to it so no task is left unassigned.
INSERT INTO "TaskWorkspace" ("id", "userId", "name", "color", "createdAt", "updatedAt")
SELECT
  lower(hex(randomblob(16))),
  "id",
  'Default',
  '#6366f1',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User";

UPDATE "Task"
SET "workspaceId" = (
  SELECT "tw"."id" FROM "TaskWorkspace" "tw"
  WHERE "tw"."userId" = "Task"."userId" AND "tw"."name" = 'Default'
)
WHERE "workspaceId" IS NULL;
