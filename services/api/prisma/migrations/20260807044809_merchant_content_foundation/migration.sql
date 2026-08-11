-- CreateEnum
CREATE TYPE "KnowledgeLibraryCategory" AS ENUM ('PRODUCT_SERVICE', 'PRODUCT_FEATURE', 'BRAND_STORY', 'USER_PAIN_POINT', 'TRUST_PROOF', 'CUSTOMER_CASE', 'OTHER');

-- CreateEnum
CREATE TYPE "ArticleSource" AS ENUM ('AI_MOCK', 'MANUAL');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "WebsiteTemplate" AS ENUM ('MINIMAL_ENTERPRISE', 'LOCAL_STORE', 'BRAND_CONTENT');

-- CreateEnum
CREATE TYPE "WebsiteStatus" AS ENUM ('NOT_GENERATED', 'LOCAL_MOCK_READY', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "MediaPlatform" AS ENUM ('TOUTIAO', 'DOUYIN');

-- CreateEnum
CREATE TYPE "MediaAccountStatus" AS ENUM ('CONNECTED', 'EXPIRED', 'VERIFICATION_REQUIRED', 'UNBOUND', 'CONNECTION_REQUESTED');

-- CreateEnum
CREATE TYPE "PublishTaskStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'STOPPED');

-- CreateEnum
CREATE TYPE "DoubaoApiStatus" AS ENUM ('SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "status" "KeywordStatus" NOT NULL DEFAULT 'ENABLED',
    "articleCreated" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeLibrary" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "KnowledgeLibraryCategory" NOT NULL,
    "content" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gallery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gallery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryImage" (
    "id" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "objectKey" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WritingInstruction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WritingInstruction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" "ArticleSource" NOT NULL DEFAULT 'MANUAL',
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "keywordId" TEXT,
    "knowledgeLibraryIds" JSONB NOT NULL DEFAULT '[]',
    "galleryId" TEXT,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "instructionId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantWebsite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "template" "WebsiteTemplate" NOT NULL DEFAULT 'MINIMAL_ENTERPRISE',
    "hostname" TEXT,
    "status" "WebsiteStatus" NOT NULL DEFAULT 'NOT_GENERATED',
    "lastGeneratedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantWebsite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoubaoCheckResult" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "matched" BOOLEAN NOT NULL,
    "matchedName" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "apiStatus" "DoubaoApiStatus" NOT NULL,

    CONSTRAINT "DoubaoCheckResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "platform" "MediaPlatform" NOT NULL,
    "status" "MediaAccountStatus" NOT NULL DEFAULT 'UNBOUND',
    "maskedName" TEXT,
    "localReferenceId" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "platform" "MediaPlatform" NOT NULL,
    "status" "PublishTaskStatus" NOT NULL DEFAULT 'QUEUED',
    "completedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Question_tenantId_keywordId_status_deletedAt_idx" ON "Question"("tenantId", "keywordId", "status", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Question_keywordId_normalizedText_key" ON "Question"("keywordId", "normalizedText");

-- CreateIndex
CREATE INDEX "KnowledgeLibrary_tenantId_deletedAt_updatedAt_idx" ON "KnowledgeLibrary"("tenantId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "Gallery_tenantId_deletedAt_updatedAt_idx" ON "Gallery"("tenantId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "GalleryImage_galleryId_deletedAt_createdAt_idx" ON "GalleryImage"("galleryId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "WritingInstruction_tenantId_deletedAt_updatedAt_idx" ON "WritingInstruction"("tenantId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "Article_tenantId_deletedAt_updatedAt_idx" ON "Article"("tenantId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "Article_tenantId_status_idx" ON "Article"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantWebsite_tenantId_key" ON "MerchantWebsite"("tenantId");

-- CreateIndex
CREATE INDEX "DoubaoCheckResult_tenantId_checkedAt_idx" ON "DoubaoCheckResult"("tenantId", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAccount_tenantId_platform_key" ON "MediaAccount"("tenantId", "platform");

-- CreateIndex
CREATE INDEX "PublishTask_tenantId_status_createdAt_idx" ON "PublishTask"("tenantId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeLibrary" ADD CONSTRAINT "KnowledgeLibrary_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gallery" ADD CONSTRAINT "Gallery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryImage" ADD CONSTRAINT "GalleryImage_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "Gallery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingInstruction" ADD CONSTRAINT "WritingInstruction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "Gallery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_instructionId_fkey" FOREIGN KEY ("instructionId") REFERENCES "WritingInstruction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantWebsite" ADD CONSTRAINT "MerchantWebsite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoubaoCheckResult" ADD CONSTRAINT "DoubaoCheckResult_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAccount" ADD CONSTRAINT "MediaAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishTask" ADD CONSTRAINT "PublishTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishTask" ADD CONSTRAINT "PublishTask_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
