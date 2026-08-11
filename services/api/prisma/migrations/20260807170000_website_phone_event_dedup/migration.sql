CREATE TABLE "WebsitePhoneEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "type" TEXT NOT NULL,
  "page" TEXT NOT NULL,
  "visitorHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebsitePhoneEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebsitePhoneEvent_tenantId_date_type_page_visitorHash_key" ON "WebsitePhoneEvent"("tenantId", "date", "type", "page", "visitorHash");
CREATE INDEX "WebsitePhoneEvent_tenantId_date_idx" ON "WebsitePhoneEvent"("tenantId", "date");
ALTER TABLE "WebsitePhoneEvent" ADD CONSTRAINT "WebsitePhoneEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
