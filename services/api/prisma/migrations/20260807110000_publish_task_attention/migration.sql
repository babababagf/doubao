-- 本地发布助手遇到验证码、登录失效或最终确认时只能暂停人工处理，不能伪造成功或失败。
ALTER TYPE "PublishTaskStatus" ADD VALUE IF NOT EXISTS 'ATTENTION';
