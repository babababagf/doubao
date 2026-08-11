ALTER TABLE "MerchantWebsite"
ADD COLUMN "artifactObjectPrefix" TEXT,
ADD COLUMN "artifactManifestUrl" TEXT,
ADD COLUMN "artifactUploadedAt" TIMESTAMP(3);
