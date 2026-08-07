-- AlterTable: rename USER → FREE and update default
UPDATE "User" SET role = 'FREE' WHERE role = 'USER';
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'FREE';

-- CreateTable: ErrorLog
CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL DEFAULT 'error',
    "source" TEXT NOT NULL DEFAULT 'server',
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "url" TEXT,
    "userAgent" TEXT,
    "userId" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ErrorLog_timestamp_idx" ON "ErrorLog"("timestamp");
CREATE INDEX "ErrorLog_resolved_idx" ON "ErrorLog"("resolved");
CREATE INDEX "ErrorLog_source_idx" ON "ErrorLog"("source");

-- AddForeignKey
ALTER TABLE "ErrorLog" ADD CONSTRAINT "ErrorLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
