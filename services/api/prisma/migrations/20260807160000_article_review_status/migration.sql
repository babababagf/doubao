ALTER TYPE "ArticleStatus" ADD VALUE IF NOT EXISTS 'PENDING_REVIEW';
ALTER TYPE "ArticleStatus" ADD VALUE IF NOT EXISTS 'PUBLISHABLE';
ALTER TYPE "ArticleStatus" ADD VALUE IF NOT EXISTS 'DISABLED';

-- 旧 PUBLISHED 仅表示内容可在网站使用，并非媒体渠道已发布；迁移为新口径的可发布。
UPDATE "Article" SET "status" = 'PUBLISHABLE' WHERE "status" = 'PUBLISHED';
UPDATE "ArticleVersion" SET "status" = 'PUBLISHABLE' WHERE "status" = 'PUBLISHED';
