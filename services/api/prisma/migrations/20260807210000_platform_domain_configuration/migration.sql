CREATE TABLE "PlatformDomainConfiguration" (
  "id" TEXT NOT NULL,
  "superAdminHostname" TEXT,
  "tenantAdminHostname" TEXT,
  "merchantWebHostname" TEXT,
  "contentRootHostname" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformDomainConfiguration_pkey" PRIMARY KEY ("id")
);
