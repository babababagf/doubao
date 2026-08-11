ALTER TYPE "ArticleSource" ADD VALUE IF NOT EXISTS 'AI_GENERATED';
ALTER TABLE "Article" ADD COLUMN "questionId" TEXT;
CREATE UNIQUE INDEX "Article_questionId_key" ON "Article"("questionId");
ALTER TABLE "Article" ADD CONSTRAINT "Article_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
