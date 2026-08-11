-- 企业资料与网站快照必须可追溯：迁移历史资料当前状态为一个不可变版本，网站保存所引用版本。
CREATE TABLE "MerchantProfileVersion" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "companyName" TEXT NOT NULL,
  "aliases" JSONB NOT NULL DEFAULT '[]',
  "industry" TEXT NOT NULL DEFAULT '',
  "coreBusiness" TEXT NOT NULL DEFAULT '',
  "serviceAreas" JSONB NOT NULL DEFAULT '[]',
  "introduction" TEXT NOT NULL DEFAULT '',
  "advantages" JSONB NOT NULL DEFAULT '[]',
  "products" JSONB NOT NULL DEFAULT '[]',
  "address" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL DEFAULT '',
  "wechat" TEXT NOT NULL DEFAULT '',
  "businessHours" TEXT NOT NULL DEFAULT '',
  "credentials" JSONB NOT NULL DEFAULT '[]',
  "cases" JSONB NOT NULL DEFAULT '[]',
  "proofMaterials" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MerchantProfileVersion_pkey" PRIMARY KEY ("id")
);

INSERT INTO "MerchantProfileVersion" ("id", "profileId", "tenantId", "version", "companyName", "aliases", "industry", "coreBusiness", "serviceAreas", "introduction", "advantages", "products", "address", "phone", "wechat", "businessHours", "credentials", "cases", "proofMaterials", "createdAt")
SELECT 'migration-profile-v' || "version" || '-' || "id", "id", "tenantId", "version", "companyName", "aliases", "industry", "coreBusiness", "serviceAreas", "introduction", "advantages", "products", "address", "phone", "wechat", "businessHours", "credentials", "cases", "proofMaterials", "updatedAt"
FROM "MerchantProfile";

CREATE UNIQUE INDEX "MerchantProfileVersion_profileId_version_key" ON "MerchantProfileVersion"("profileId", "version");
CREATE INDEX "MerchantProfileVersion_tenantId_profileId_version_idx" ON "MerchantProfileVersion"("tenantId", "profileId", "version");
ALTER TABLE "MerchantProfileVersion" ADD CONSTRAINT "MerchantProfileVersion_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "MerchantProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MerchantProfileVersion" ADD CONSTRAINT "MerchantProfileVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MerchantWebsite" ADD COLUMN "profileVersionId" TEXT;
UPDATE "MerchantWebsite" AS website SET "profileVersionId" = version_row."id"
FROM "MerchantProfile" AS profile
JOIN "MerchantProfileVersion" AS version_row ON version_row."profileId" = profile."id" AND version_row."version" = profile."version"
WHERE website."tenantId" = profile."tenantId";
CREATE INDEX "MerchantWebsite_profileVersionId_idx" ON "MerchantWebsite"("profileVersionId");
ALTER TABLE "MerchantWebsite" ADD CONSTRAINT "MerchantWebsite_profileVersionId_fkey" FOREIGN KEY ("profileVersionId") REFERENCES "MerchantProfileVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
