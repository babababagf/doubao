-- DNS 所有权验证与证书启用是两个独立阶段；本迁移不改变任何既有域名状态。
ALTER TABLE "DomainBinding"
  ADD COLUMN "verificationToken" TEXT,
  ADD COLUMN "verificationRequestedAt" TIMESTAMP(3),
  ADD COLUMN "ownershipVerifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "DomainBinding_verificationToken_key" ON "DomainBinding"("verificationToken");
