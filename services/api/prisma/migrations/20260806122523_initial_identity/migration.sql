-- CreateEnum
CREATE TYPE "TenantKind" AS ENUM ('WHITE_LABEL', 'AGENT', 'MERCHANT');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLATFORM_ADMIN', 'WHITE_LABEL_ADMIN', 'AGENT_ADMIN', 'MERCHANT');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DISABLED');

-- CreateEnum
CREATE TYPE "SessionAudience" AS ENUM ('MERCHANT_WEB', 'TENANT_ADMIN_WEB', 'SUPER_ADMIN_WEB', 'PUBLISHER_DESKTOP');

-- CreateEnum
CREATE TYPE "KeywordStatus" AS ENUM ('ENABLED', 'DISABLED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "kind" "TenantKind" NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "whiteLabelId" TEXT,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "usernameCanonical" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "tenantId" TEXT,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "audience" "SessionAudience" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandConfiguration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "logoUrl" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotaBalance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "keywordLimit" INTEGER NOT NULL DEFAULT 0,
    "computePointsAvailable" INTEGER NOT NULL DEFAULT 0,
    "computePointsConsumed" INTEGER NOT NULL DEFAULT 0,
    "writingLimit" INTEGER NOT NULL DEFAULT 0,
    "writingUsed" INTEGER NOT NULL DEFAULT 0,
    "imageStorageBytes" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotaBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
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
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Keyword" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "status" "KeywordStatus" NOT NULL DEFAULT 'ENABLED',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Keyword_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tenant_parentId_idx" ON "Tenant"("parentId");

-- CreateIndex
CREATE INDEX "Tenant_whiteLabelId_idx" ON "Tenant"("whiteLabelId");

-- CreateIndex
CREATE INDEX "Tenant_kind_status_idx" ON "Tenant"("kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "User_usernameCanonical_key" ON "User"("usernameCanonical");

-- CreateIndex
CREATE INDEX "User_tenantId_role_idx" ON "User"("tenantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_audience_expiresAt_idx" ON "Session"("userId", "audience", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "BrandConfiguration_tenantId_key" ON "BrandConfiguration"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotaBalance_tenantId_key" ON "QuotaBalance"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantProfile_tenantId_key" ON "MerchantProfile"("tenantId");

-- CreateIndex
CREATE INDEX "Keyword_tenantId_status_deletedAt_idx" ON "Keyword"("tenantId", "status", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Keyword_tenantId_normalizedName_key" ON "Keyword"("tenantId", "normalizedName");

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_whiteLabelId_fkey" FOREIGN KEY ("whiteLabelId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandConfiguration" ADD CONSTRAINT "BrandConfiguration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotaBalance" ADD CONSTRAINT "QuotaBalance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantProfile" ADD CONSTRAINT "MerchantProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Keyword" ADD CONSTRAINT "Keyword_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
