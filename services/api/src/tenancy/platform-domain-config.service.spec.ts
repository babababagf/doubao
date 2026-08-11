import { describe, expect, it } from "vitest";

import type { AdminActor } from "../auth/auth.types";
import { PlatformDomainConfigService } from "./platform-domain-config.service";

const platformActor = {
  userId: "platform-1",
  tenantId: null,
  username: "admin001",
  role: "PLATFORM_ADMIN",
  status: "ACTIVE",
} as unknown as AdminActor;

describe("PlatformDomainConfigService", () => {
  it("只允许总后台保存四类互不重复的裸主机名", async () => {
    const upsert = async ({ create }: { create: Record<string, unknown> }) => ({
      ...create,
      updatedAt: new Date("2026-08-07T00:00:00.000Z"),
    });
    const prisma = {
      $transaction: async (
        work: (tx: {
          platformDomainConfiguration: { upsert: typeof upsert };
          auditLog: { create: () => Promise<void> };
        }) => Promise<unknown>,
      ) =>
        work({
          platformDomainConfiguration: { upsert },
          auditLog: { create: async () => undefined },
        }),
    };
    const service = new PlatformDomainConfigService(prisma as never);

    await expect(
      service.save(platformActor, {
        superAdminHostname: "admin.example.com",
        tenantAdminHostname: "console.example.com",
        merchantWebHostname: "client.example.com",
        contentRootHostname: "content.example.com",
      }),
    ).resolves.toMatchObject({ contentRootHostname: "content.example.com" });
    await expect(
      service.save(platformActor, {
        superAdminHostname: "https://admin.example.com",
        tenantAdminHostname: "",
        merchantWebHostname: "",
        contentRootHostname: "",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "PLATFORM_DOMAIN_INPUT_INVALID",
      }),
    });
    await expect(
      service.save(platformActor, {
        superAdminHostname: "admin.example.com",
        tenantAdminHostname: "admin.example.com",
        merchantWebHostname: "",
        contentRootHostname: "",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "PLATFORM_DOMAIN_DUPLICATED" }),
    });
    await expect(
      service.save(
        { ...platformActor, role: "WHITE_LABEL_ADMIN" },
        {
          superAdminHostname: "",
          tenantAdminHostname: "",
          merchantWebHostname: "",
          contentRootHostname: "",
        },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "FORBIDDEN" }),
    });
  });
});
