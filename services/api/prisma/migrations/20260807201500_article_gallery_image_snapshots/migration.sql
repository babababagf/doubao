-- 文章与文章版本分别保留已选图片 ID；历史文章安全默认为无配图快照。
ALTER TABLE "Article" ADD COLUMN "galleryImageIds" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ArticleVersion" ADD COLUMN "galleryImageIds" JSONB NOT NULL DEFAULT '[]';
