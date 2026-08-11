CREATE TYPE "StorageProvider" AS ENUM ('ALIBABA_OSS');
CREATE TYPE "StorageTestStatus" AS ENUM ('NEVER', 'SUCCEEDED', 'FAILED');

CREATE TABLE "ObjectStorageConfig" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "provider" "StorageProvider" NOT NULL DEFAULT 'ALIBABA_OSS',
  "region" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "cdnBaseUrl" TEXT,
  "accessKeyIdCiphertext" TEXT NOT NULL,
  "accessKeyIdNonce" TEXT NOT NULL,
  "accessKeySecretCiphertext" TEXT NOT NULL,
  "accessKeySecretNonce" TEXT NOT NULL,
  "accessKeyIdMask" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "lastTestAt" TIMESTAMP(3),
  "lastTestStatus" "StorageTestStatus" NOT NULL DEFAULT 'NEVER',
  "lastTestError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ObjectStorageConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ObjectStorageConfig_tenantId_key" ON "ObjectStorageConfig"("tenantId");
CREATE INDEX "ObjectStorageConfig_enabled_idx" ON "ObjectStorageConfig"("enabled");
ALTER TABLE "ObjectStorageConfig" ADD CONSTRAINT "ObjectStorageConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
