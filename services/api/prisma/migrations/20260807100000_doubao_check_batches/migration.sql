-- 检测批次和逐题状态。历史结果保留为无 batch 的只读记录。
CREATE TYPE "DoubaoCheckBatchScope" AS ENUM ('SINGLE_MERCHANT', 'ALL_MERCHANTS');
CREATE TYPE "DoubaoCheckBatchStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIALLY_FAILED', 'FAILED');
ALTER TYPE "DoubaoApiStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "DoubaoApiStatus" ADD VALUE IF NOT EXISTS 'RUNNING';

CREATE TABLE "DoubaoCheckBatch" (
  "id" TEXT NOT NULL,
  "whiteLabelId" TEXT NOT NULL,
  "scope" "DoubaoCheckBatchScope" NOT NULL,
  "status" "DoubaoCheckBatchStatus" NOT NULL DEFAULT 'QUEUED',
  "idempotencyKey" TEXT NOT NULL,
  "providerConfigId" TEXT NOT NULL,
  "providerAlias" TEXT NOT NULL,
  "providerModel" TEXT NOT NULL,
  "targetMerchantCount" INTEGER NOT NULL,
  "totalCount" INTEGER NOT NULL,
  "completedCount" INTEGER NOT NULL DEFAULT 0,
  "successfulCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "matchedCount" INTEGER NOT NULL DEFAULT 0,
  "requestedByUserId" TEXT NOT NULL,
  "failureReason" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DoubaoCheckBatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DoubaoCheckBatch_idempotencyKey_key" ON "DoubaoCheckBatch"("idempotencyKey");
CREATE INDEX "DoubaoCheckBatch_whiteLabelId_status_createdAt_idx" ON "DoubaoCheckBatch"("whiteLabelId", "status", "createdAt");
ALTER TABLE "DoubaoCheckBatch" ADD CONSTRAINT "DoubaoCheckBatch_whiteLabelId_fkey" FOREIGN KEY ("whiteLabelId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DoubaoCheckResult" ADD COLUMN "batchId" TEXT;
ALTER TABLE "DoubaoCheckResult" ADD COLUMN "questionId" TEXT;
ALTER TABLE "DoubaoCheckResult" ADD COLUMN "failureReason" TEXT;
ALTER TABLE "DoubaoCheckResult" ALTER COLUMN "checkedAt" DROP NOT NULL;
ALTER TABLE "DoubaoCheckResult" ALTER COLUMN "apiStatus" SET DEFAULT 'PENDING';
CREATE INDEX "DoubaoCheckResult_batchId_apiStatus_idx" ON "DoubaoCheckResult"("batchId", "apiStatus");
CREATE UNIQUE INDEX "DoubaoCheckResult_batchId_questionId_key" ON "DoubaoCheckResult"("batchId", "questionId");
ALTER TABLE "DoubaoCheckResult" ADD CONSTRAINT "DoubaoCheckResult_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "DoubaoCheckBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DoubaoCheckResult" ADD CONSTRAINT "DoubaoCheckResult_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
