-- AI 生成文章不再经过人工审核：历史待审核 AI 文章及其版本快照直接转为可发布。
UPDATE "Article"
SET "status" = 'PUBLISHABLE'
WHERE "source" = 'AI_GENERATED'
  AND "status" = 'PENDING_REVIEW';

UPDATE "ArticleVersion"
SET "status" = 'PUBLISHABLE'
WHERE "source" = 'AI_GENERATED'
  AND "status" = 'PENDING_REVIEW';
