ALTER TABLE "Keyword"
ADD COLUMN "brandTerms" JSONB NOT NULL DEFAULT '[]'::jsonb;
