ALTER TABLE "Session" ADD COLUMN "publisherDeviceId" TEXT;

CREATE TABLE "PublisherDevice" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "deviceRefHash" TEXT NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PublisherDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublisherDevice_tenantId_deviceRefHash_key" ON "PublisherDevice"("tenantId", "deviceRefHash");
CREATE INDEX "PublisherDevice_tenantId_lastSeenAt_idx" ON "PublisherDevice"("tenantId", "lastSeenAt");

ALTER TABLE "Session" ADD CONSTRAINT "Session_publisherDeviceId_fkey" FOREIGN KEY ("publisherDeviceId") REFERENCES "PublisherDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PublisherDevice" ADD CONSTRAINT "PublisherDevice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
