CREATE TABLE "WebsiteMetricDaily" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "phoneExposureCount" INTEGER NOT NULL DEFAULT 0,
    "phoneClickCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteMetricDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebsiteMetricDaily_tenantId_date_key" ON "WebsiteMetricDaily"("tenantId", "date");
CREATE INDEX "WebsiteMetricDaily_tenantId_date_idx" ON "WebsiteMetricDaily"("tenantId", "date");

ALTER TABLE "WebsiteMetricDaily" ADD CONSTRAINT "WebsiteMetricDaily_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
