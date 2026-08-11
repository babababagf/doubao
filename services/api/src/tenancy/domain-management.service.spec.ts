import { describe, expect, it } from "vitest";

import type { AdminActor } from "../auth/auth.types";
import { DomainBindingStatus } from "../generated/prisma/client";
import { DomainManagementService } from "./domain-management.service";

const platformActor = {
  userId: "platform-1",
  tenantId: null,
  username: "admin001",
  role: "PLATFORM_ADMIN",
  status: "ACTIVE",
} as unknown as AdminActor;

function domain(
  ownershipVerifiedAt: Date | null,
  status: DomainBindingStatus = DomainBindingStatus.PENDING_VERIFICATION,
) {
  return {
    id: "domain-1",
    tenantId: "tenant-1",
    hostname: "content.example.com",
    purpose: "CONTENT_ROOT",
    status,
    verificationToken: "token",
    verificationRequestedAt: new Date(),
    ownershipVerifiedAt,
    createdAt: new Date(),
    tenant: { id: "tenant-1", name: "测试贴牌", kind: "WHITE_LABEL" },
  };
}

describe("DomainManagementService 域名启用", () => {
  it("只允许已验证所有权的域名在总后台人工确认后启用", async () => {
    const source = domain(new Date("2026-08-07T00:00:00.000Z"));
    const prisma = {
      domainBinding: { findUnique: async () => source },
      $transaction: async (
        work: (tx: {
          domainBinding: {
            update: (input: {
              data: { status: DomainBindingStatus };
            }) => Promise<typeof source>;
          };
          auditLog: { create: () => Promise<void> };
        }) => Promise<unknown>,
      ) =>
        work({
          domainBinding: {
            update: async ({ data }) => ({ ...source, ...data }),
          },
          auditLog: { create: async () => undefined },
        }),
    };
    const service = new DomainManagementService(prisma as never);

    await expect(
      service.setStatus(platformActor, source.id, { status: "active" }),
    ).resolves.toMatchObject({ status: "active", ownershipStatus: "active" });
    await expect(
      service.setStatus(
        { ...platformActor, role: "WHITE_LABEL_ADMIN" },
        source.id,
        { status: "disabled" },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "FORBIDDEN" }),
    });
  });

  it("未完成 TXT 所有权验证时拒绝启用", async () => {
    const source = domain(null);
    const service = new DomainManagementService({
      domainBinding: { findUnique: async () => source },
    } as never);
    await expect(
      service.setStatus(platformActor, source.id, { status: "active" }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "DOMAIN_OWNERSHIP_NOT_VERIFIED",
      }),
    });
  });
});
