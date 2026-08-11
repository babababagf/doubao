-- 发布任务只能由领取它的本地发布助手继续执行。租约到期后由服务端转为人工处理，绝不自动重试或伪造发布成功。
ALTER TABLE "PublishTask" ADD COLUMN "leaseDeviceId" TEXT;
ALTER TABLE "PublishTask" ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);
ALTER TABLE "PublishTask" ADD COLUMN "leaseHeartbeatAt" TIMESTAMP(3);

CREATE INDEX "PublishTask_status_leaseExpiresAt_idx" ON "PublishTask"("status", "leaseExpiresAt");

ALTER TABLE "PublishTask" ADD CONSTRAINT "PublishTask_leaseDeviceId_fkey"
  FOREIGN KEY ("leaseDeviceId") REFERENCES "PublisherDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 已在执行但没有设备归属的历史任务无法安全恢复，统一要求人工检查。
UPDATE "PublishTask"
  SET "status" = 'ATTENTION',
      "failureReason" = '历史执行任务缺少设备租约，需要人工确认后再继续'
  WHERE "status" = 'RUNNING';
