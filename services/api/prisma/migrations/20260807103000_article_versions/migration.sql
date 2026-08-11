-- 文章编辑后的发布内容必须可追溯。为现有文章建立版本 1，并将历史发布任务回填到该快照。
ALTER TABLE "Article" ADD COLUMN "currentVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "ArticleVersion" (
  "id" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "source" "ArticleSource" NOT NULL,
  "status" "ArticleStatus" NOT NULL,
  "knowledgeLibraryIds" JSONB NOT NULL DEFAULT '[]',
  "galleryId" TEXT,
  "imageCount" INTEGER NOT NULL DEFAULT 0,
  "instructionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArticleVersion_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ArticleVersion" ("id", "articleId", "tenantId", "version", "title", "content", "source", "status", "knowledgeLibraryIds", "galleryId", "imageCount", "instructionId", "createdAt")
SELECT 'migration-v1-' || "id", "id", "tenantId", 1, "title", "content", "source", "status", "knowledgeLibraryIds", "galleryId", "imageCount", "instructionId", "updatedAt"
FROM "Article";

CREATE UNIQUE INDEX "ArticleVersion_articleId_version_key" ON "ArticleVersion"("articleId", "version");
CREATE INDEX "ArticleVersion_tenantId_articleId_version_idx" ON "ArticleVersion"("tenantId", "articleId", "version");
ALTER TABLE "ArticleVersion" ADD CONSTRAINT "ArticleVersion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArticleVersion" ADD CONSTRAINT "ArticleVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublishTask" ADD COLUMN "articleVersionId" TEXT;
UPDATE "PublishTask" SET "articleVersionId" = 'migration-v1-' || "articleId";
CREATE INDEX "PublishTask_articleVersionId_idx" ON "PublishTask"("articleVersionId");
ALTER TABLE "PublishTask" ADD CONSTRAINT "PublishTask_articleVersionId_fkey" FOREIGN KEY ("articleVersionId") REFERENCES "ArticleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
