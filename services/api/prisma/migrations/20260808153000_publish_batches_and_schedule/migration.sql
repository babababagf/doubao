ALTER TYPE "PublishTaskStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED' BEFORE 'QUEUED';
CREATE TYPE "PublishDeduplicationMode" AS ENUM ('PER_PLATFORM', 'ALL_PLATFORMS');

CREATE TABLE "PublishBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "toutiaoDailyLimit" INTEGER NOT NULL DEFAULT 3,
    "douyinDailyLimit" INTEGER NOT NULL DEFAULT 3,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "deduplicationMode" "PublishDeduplicationMode" NOT NULL DEFAULT 'PER_PLATFORM',
    "totalCount" INTEGER NOT NULL,
    "estimatedTaskCount" INTEGER NOT NULL,
    "skippedDuplicateCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishBatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PublishTask"
    ADD COLUMN "batchId" TEXT,
    ADD COLUMN "mediaAccountId" TEXT,
    ADD COLUMN "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "PublishBatch_idempotencyKey_key" ON "PublishBatch"("idempotencyKey");
CREATE INDEX "PublishBatch_tenantId_createdAt_idx" ON "PublishBatch"("tenantId", "createdAt");
CREATE INDEX "PublishTask_tenantId_status_scheduledAt_idx" ON "PublishTask"("tenantId", "status", "scheduledAt");
DROP INDEX IF EXISTS "MediaAccount_tenantId_platform_key";
CREATE UNIQUE INDEX "MediaAccount_tenantId_platform_localReferenceId_key" ON "MediaAccount"("tenantId", "platform", "localReferenceId");
CREATE INDEX "MediaAccount_tenantId_platform_status_idx" ON "MediaAccount"("tenantId", "platform", "status");

UPDATE "PublishTask" AS task
SET "mediaAccountId" = account."id"
FROM "MediaAccount" AS account
WHERE task."tenantId" = account."tenantId" AND task."platform" = account."platform";

CREATE UNIQUE INDEX "PublishTask_tenantId_articleId_platform_key" ON "PublishTask"("tenantId", "articleId", "platform");

ALTER TABLE "PublishBatch" ADD CONSTRAINT "PublishBatch_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishTask" ADD CONSTRAINT "PublishTask_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "PublishBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PublishTask" ADD CONSTRAINT "PublishTask_mediaAccountId_fkey"
    FOREIGN KEY ("mediaAccountId") REFERENCES "MediaAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
