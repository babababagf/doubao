CREATE TABLE "MediaSessionBackup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mediaAccountId" TEXT NOT NULL,
    "sourceDeviceId" TEXT,
    "schemaVersion" INTEGER NOT NULL,
    "payloadCiphertext" BYTEA NOT NULL,
    "payloadNonce" BYTEA NOT NULL,
    "payloadAuthTag" BYTEA NOT NULL,
    "wrappedDataKey" BYTEA NOT NULL,
    "keyWrapNonce" BYTEA NOT NULL,
    "keyWrapAuthTag" BYTEA NOT NULL,
    "keyProvider" TEXT NOT NULL,
    "keyVersion" TEXT NOT NULL,
    "payloadSha256" TEXT NOT NULL,
    "payloadBytes" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "lastRestoredAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaSessionBackup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaSessionBackup_mediaAccountId_key" ON "MediaSessionBackup"("mediaAccountId");
CREATE INDEX "MediaSessionBackup_tenantId_revokedAt_updatedAt_idx" ON "MediaSessionBackup"("tenantId", "revokedAt", "updatedAt");
CREATE INDEX "MediaSessionBackup_sourceDeviceId_idx" ON "MediaSessionBackup"("sourceDeviceId");

ALTER TABLE "MediaSessionBackup" ADD CONSTRAINT "MediaSessionBackup_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaSessionBackup" ADD CONSTRAINT "MediaSessionBackup_mediaAccountId_fkey"
    FOREIGN KEY ("mediaAccountId") REFERENCES "MediaAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaSessionBackup" ADD CONSTRAINT "MediaSessionBackup_sourceDeviceId_fkey"
    FOREIGN KEY ("sourceDeviceId") REFERENCES "PublisherDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
