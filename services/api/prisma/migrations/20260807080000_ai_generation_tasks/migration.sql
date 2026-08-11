CREATE TYPE "AiTaskType" AS ENUM ('QUESTION_EXPANSION', 'ARTICLE_WRITING');
CREATE TYPE "AiTaskStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIALLY_FAILED', 'FAILED', 'STOPPED');
ALTER TYPE "EntitlementEntryType" ADD VALUE IF NOT EXISTS 'WRITING_CONSUME';

ALTER TABLE "QuotaBalance" ADD COLUMN "computePointsReserved" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "QuotaBalance" ADD COLUMN "writingReserved" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "AiGenerationTask" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "type" "AiTaskType" NOT NULL,
  "status" "AiTaskStatus" NOT NULL DEFAULT 'QUEUED',
  "idempotencyKey" TEXT NOT NULL,
  "request" JSONB NOT NULL,
  "result" JSONB NOT NULL DEFAULT '{}',
  "totalCount" INTEGER NOT NULL,
  "completedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "computePointsReserved" INTEGER NOT NULL DEFAULT 0,
  "writingReserved" INTEGER NOT NULL DEFAULT 0,
  "failureReason" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiGenerationTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiGenerationTask_idempotencyKey_key" ON "AiGenerationTask"("idempotencyKey");
CREATE INDEX "AiGenerationTask_tenantId_status_createdAt_idx" ON "AiGenerationTask"("tenantId", "status", "createdAt");
ALTER TABLE "AiGenerationTask" ADD CONSTRAINT "AiGenerationTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
