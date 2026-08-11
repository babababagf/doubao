-- CreateEnum
CREATE TYPE "LoginRealm" AS ENUM ('SUPER_ADMIN', 'TENANT_ADMIN', 'MERCHANT');

-- CreateEnum
CREATE TYPE "EntitlementEntryType" AS ENUM ('SEAT_RESERVE', 'COMPUTE_ALLOCATE', 'WRITING_ALLOCATE', 'COMPUTE_CONSUME', 'WRITING_CONSUME', 'RELEASE');

-- CreateEnum
CREATE TYPE "DomainPurpose" AS ENUM ('CONTENT_ROOT', 'CONTENT_HOST', 'TENANT_ADMIN', 'MERCHANT_WEB');

-- CreateEnum
CREATE TYPE "DomainBindingStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'DISABLED');

-- DropIndex
DROP INDEX "User_usernameCanonical_key";

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "agentSeatLimit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "closedAt" TIMESTAMP(3),
ADD COLUMN "merchantSeatLimit" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "loginRealm" "LoginRealm" NOT NULL DEFAULT 'MERCHANT';

-- CreateTable
CREATE TABLE "EntitlementLedger" (
    "id" TEXT NOT NULL,
    "sourceTenantId" TEXT,
    "targetTenantId" TEXT,
    "type" "EntitlementEntryType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntitlementLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainBinding" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "purpose" "DomainPurpose" NOT NULL,
    "status" "DomainBindingStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DomainBinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EntitlementLedger_idempotencyKey_key" ON "EntitlementLedger"("idempotencyKey");
CREATE INDEX "EntitlementLedger_sourceTenantId_createdAt_idx" ON "EntitlementLedger"("sourceTenantId", "createdAt");
CREATE INDEX "EntitlementLedger_targetTenantId_createdAt_idx" ON "EntitlementLedger"("targetTenantId", "createdAt");
CREATE UNIQUE INDEX "DomainBinding_hostname_key" ON "DomainBinding"("hostname");
CREATE INDEX "DomainBinding_tenantId_purpose_status_idx" ON "DomainBinding"("tenantId", "purpose", "status");
CREATE UNIQUE INDEX "User_usernameCanonical_loginRealm_key" ON "User"("usernameCanonical", "loginRealm");

-- AddForeignKey
ALTER TABLE "EntitlementLedger" ADD CONSTRAINT "EntitlementLedger_sourceTenantId_fkey" FOREIGN KEY ("sourceTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EntitlementLedger" ADD CONSTRAINT "EntitlementLedger_targetTenantId_fkey" FOREIGN KEY ("targetTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DomainBinding" ADD CONSTRAINT "DomainBinding_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
