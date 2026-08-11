ALTER TABLE "GalleryImage" ADD COLUMN "publicUrl" TEXT;

CREATE TABLE "GalleryUploadSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryUploadSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GalleryUploadSession_objectKey_key" ON "GalleryUploadSession"("objectKey");
CREATE INDEX "GalleryUploadSession_tenantId_galleryId_expiresAt_idx" ON "GalleryUploadSession"("tenantId", "galleryId", "expiresAt");

ALTER TABLE "GalleryUploadSession" ADD CONSTRAINT "GalleryUploadSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GalleryUploadSession" ADD CONSTRAINT "GalleryUploadSession_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "Gallery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
