CREATE TABLE "PlatformUpdatePolicy" (
  "id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "feedUrl" TEXT,
  "minimumVersion" TEXT,
  "releaseNotes" TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlatformUpdatePolicy_pkey" PRIMARY KEY ("id")
);
