-- 同一商户内部的多个媒体账号必须逐条执行；不同商户可各自拥有一条运行中任务。
CREATE UNIQUE INDEX "PublishTask_one_running_per_tenant_key"
ON "PublishTask"("tenantId")
WHERE "status" = 'RUNNING';
