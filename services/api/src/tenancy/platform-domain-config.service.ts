import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import { UserRole } from "../generated/prisma/client";
import type { AdminActor } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

const singletonId = "platform";
const hostnamePattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
type PlatformDomains = {
  superAdminHostname: string | null;
  tenantAdminHostname: string | null;
  merchantWebHostname: string | null;
  contentRootHostname: string | null;
  updatedAt: string | null;
};

@Injectable()
export class PlatformDomainConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getForSuper(actor: AdminActor): Promise<PlatformDomains> {
    this.requirePlatform(actor);
    return this.view(
      await this.prisma.platformDomainConfiguration.findUnique({
        where: { id: singletonId },
      }),
    );
  }

  async save(actor: AdminActor, input: unknown): Promise<PlatformDomains> {
    this.requirePlatform(actor);
    const data = this.input(input);
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.platformDomainConfiguration.upsert({
        where: { id: singletonId },
        create: { id: singletonId, ...data },
        update: data,
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          actorTenantId: actor.tenantId,
          action: "platform_domains.updated",
          entityType: "PlatformDomainConfiguration",
          entityId: singletonId,
          detail: data,
        },
      });
      return saved;
    });
    return this.view(row);
  }

  async contentRootHostname(): Promise<string | null> {
    const row = await this.prisma.platformDomainConfiguration.findUnique({
      where: { id: singletonId },
      select: { contentRootHostname: true },
    });
    return row?.contentRootHostname ?? null;
  }

  private input(value: unknown) {
    if (!value || typeof value !== "object")
      throw new ConflictException({
        code: "PLATFORM_DOMAIN_INPUT_INVALID",
        message: "平台域名配置格式无效",
      });
    const input = value as Record<string, unknown>;
    const names = {
      superAdminHostname: this.hostname(input.superAdminHostname),
      tenantAdminHostname: this.hostname(input.tenantAdminHostname),
      merchantWebHostname: this.hostname(input.merchantWebHostname),
      contentRootHostname: this.hostname(input.contentRootHostname),
    };
    const active = Object.values(names).filter((item): item is string =>
      Boolean(item),
    );
    if (new Set(active).size !== active.length)
      throw new ConflictException({
        code: "PLATFORM_DOMAIN_DUPLICATED",
        message: "四类平台入口域名不能重复，请为不同入口配置不同主机名",
      });
    return names;
  }

  private hostname(value: unknown): string | null {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string")
      throw new ConflictException({
        code: "PLATFORM_DOMAIN_INPUT_INVALID",
        message: "平台域名必须为不含协议的公网主机名，或留空",
      });
    const hostname = value.trim().toLowerCase();
    if (!hostnamePattern.test(hostname))
      throw new ConflictException({
        code: "PLATFORM_DOMAIN_INPUT_INVALID",
        message: "平台域名必须为不含协议的公网主机名，或留空",
      });
    return hostname;
  }

  private view(
    row: {
      superAdminHostname: string | null;
      tenantAdminHostname: string | null;
      merchantWebHostname: string | null;
      contentRootHostname: string | null;
      updatedAt: Date;
    } | null,
  ): PlatformDomains {
    return {
      superAdminHostname: row?.superAdminHostname ?? null,
      tenantAdminHostname: row?.tenantAdminHostname ?? null,
      merchantWebHostname: row?.merchantWebHostname ?? null,
      contentRootHostname: row?.contentRootHostname ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  private requirePlatform(actor: AdminActor): void {
    if (actor.role !== UserRole.PLATFORM_ADMIN)
      throw new UnauthorizedException({
        code: "FORBIDDEN",
        message: "仅总后台可配置平台入口域名",
      });
  }
}
