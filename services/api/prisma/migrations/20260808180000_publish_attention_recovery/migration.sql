CREATE TYPE "PublishAttentionReason" AS ENUM (
    'LOGIN_REQUIRED',
    'CAPTCHA_REQUIRED',
    'MANUAL_CONFIRMATION',
    'PLATFORM_CHANGED',
    'ASSETS_MISSING',
    'CONTENT_INVALID',
    'FILL_FAILED',
    'SUBMISSION_UNKNOWN',
    'SUBMISSION_REJECTED',
    'LEASE_EXPIRED'
);

ALTER TABLE "PublishTask"
    ADD COLUMN "attentionReason" "PublishAttentionReason";

UPDATE "PublishTask"
SET "attentionReason" = CASE "failureReason"
    WHEN '本机平台登录已失效，需要重新扫码验证' THEN 'LOGIN_REQUIRED'::"PublishAttentionReason"
    WHEN '平台要求验证码或安全验证，需要用户在本机处理' THEN 'CAPTCHA_REQUIRED'::"PublishAttentionReason"
    WHEN '内容已填写，等待用户在平台最终确认发布' THEN 'MANUAL_CONFIRMATION'::"PublishAttentionReason"
    WHEN '平台页面或发布流程发生变化，需要人工处理' THEN 'PLATFORM_CHANGED'::"PublishAttentionReason"
    WHEN '文章配图快照缺失或源图片不可用，需要人工补齐后重新创建发布任务' THEN 'ASSETS_MISSING'::"PublishAttentionReason"
    WHEN '文章标题或正文不符合平台发布要求，需要人工修改后重新创建任务' THEN 'CONTENT_INVALID'::"PublishAttentionReason"
    WHEN '平台编辑器未确认完整写入内容，需要人工核对页面或适配器' THEN 'FILL_FAILED'::"PublishAttentionReason"
    WHEN '已触发平台最终提交但结果未知，禁止自动重试，请人工核验平台作品状态' THEN 'SUBMISSION_UNKNOWN'::"PublishAttentionReason"
    WHEN '平台明确拒绝本次发布，请人工检查内容或账号状态后处理' THEN 'SUBMISSION_REJECTED'::"PublishAttentionReason"
    WHEN '发布助手执行租约已过期，需要人工确认后再继续' THEN 'LEASE_EXPIRED'::"PublishAttentionReason"
    ELSE NULL
END
WHERE "status" = 'ATTENTION';

CREATE INDEX "PublishTask_tenantId_status_attentionReason_idx"
    ON "PublishTask"("tenantId", "status", "attentionReason");
