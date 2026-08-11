CREATE TYPE "ProviderPlatform" AS ENUM ('DEEPSEEK', 'VOLCENGINE_ARK', 'CUSTOM_OPENAI');
CREATE TYPE "ProviderProtocol" AS ENUM ('CHAT_COMPLETIONS', 'RESPONSES');
CREATE TYPE "ProviderTestStatus" AS ENUM ('NEVER', 'SUCCEEDED', 'FAILED');

CREATE TABLE "ProviderConfig" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "platform" "ProviderPlatform" NOT NULL,
  "protocol" "ProviderProtocol" NOT NULL,
  "baseUrl" TEXT NOT NULL,
  "modelName" TEXT NOT NULL,
  "apiKeyCiphertext" TEXT NOT NULL,
  "apiKeyNonce" TEXT NOT NULL,
  "keyMask" TEXT NOT NULL,
  "supportsWriting" BOOLEAN NOT NULL DEFAULT false,
  "supportsDoubaoCheck" BOOLEAN NOT NULL DEFAULT false,
  "supportsWebSearch" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "lastTestAt" TIMESTAMP(3),
  "lastTestStatus" "ProviderTestStatus" NOT NULL DEFAULT 'NEVER',
  "lastTestError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderConfig_tenantId_alias_key" ON "ProviderConfig"("tenantId", "alias");
CREATE INDEX "ProviderConfig_tenantId_enabled_idx" ON "ProviderConfig"("tenantId", "enabled");
ALTER TABLE "ProviderConfig" ADD CONSTRAINT "ProviderConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
