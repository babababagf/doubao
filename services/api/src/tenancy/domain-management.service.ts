import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { resolveTxt } from "node:dns/promises";
import { randomUUID } from "node:crypto";

import { DomainBindingStatus, UserRole } from "../generated/prisma/client";
import type { AdminActor } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

type DomainView = {
  id: string;
  hostname: string;
  purpose: "content_root" | "content_host" | "tenant_admin" | "merchant_web";
  status: "pending_verification" | "active" | "disabled";
  ownershipStatus:
    | "not_requested"
    | "pending_dns"
    | "ownership_verified_waiting_certificate"
    | "active"
    | "disabled";
  tenant: {
    id: string;
    name: string;
    kind: "white_label" | "agent" | "merchant";
  };
  dnsRecordName: string | null;
  dnsRecordValue: string | null;
  ownershipVerifiedAt: string | null;
  createdAt: string;
};

function issueToken(): string {
  return randomUUID().replaceAll("-", "");
}
function recordName(hostname: string): string {
  return `_doubaohk-verify.${hostname}`;
}
function recordValue(token: string): string {
  return `doubaohk-verification=${token}`;
}

@Injectable()
export class DomainManagementService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AdminActor): Promise<DomainView[]> {
    this.requirePlatform(actor);
    const rows = await this.prisma.domainBinding.findMany({
      include: { tenant: { select: { id: true, name: true, kind: true } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => this.view(row));
  }

  async issueVerificationToken(
    actor: AdminActor,
    domainId: string,
  ): Promise<DomainView> {
    this.requirePlatform(actor);
    const domain = await this.findDomain(domainId);
    if (domain.status === DomainBindingStatus.DISABLED)
      throw new ConflictException({
        code: "DOMAIN_DISABLED",
        message: "已停用域名不能发起验证",
      });
    const token = domain.verificationToken ?? issueToken();
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.domainBinding.update({
        where: { id: domain.id },
        data: {
          verificationToken: token,
          verificationRequestedAt: new Date(),
          ownershipVerifiedAt: null,
        },
        include: { tenant: { select: { id: true, name: true, kind: true } } },
      });
      await tx.auditLog.create({
        data: {
          tenantId: domain.tenantId,
          actorUserId: actor.userId,
          actorTenantId: actor.tenantId,
          action: "domain.verification.requested",
          entityType: "DomainBinding",
          entityId: domain.id,
          detail: { hostname: domain.hostname },
        },
      });
      return result;
    });
    return this.view(updated);
  }

  async verifyDnsOwnership(
    actor: AdminActor,
    domainId: string,
  ): Promise<DomainView> {
    this.requirePlatform(actor);
    const domain = await this.findDomain(domainId);
    if (domain.status === DomainBindingStatus.DISABLED)
      throw new ConflictException({
        code: "DOMAIN_DISABLED",
        message: "已停用域名不能校验",
      });
    if (!domain.verificationToken)
      return this.issueVerificationToken(actor, domainId);

    const records = await resolveTxt(recordName(domain.hostname))
      .then((values) => values.map((record) => record.join("")))
      .catch(() => []);
    const matched = records.some(
      (record) => record.trim() === recordValue(domain.verificationToken!),
    );
    if (!matched)
      throw new ConflictException({
        code: "DOMAIN_DNS_RECORD_NOT_FOUND",
        message: `未找到 ${recordName(domain.hostname)} 的验证 TXT 记录，请确认解析已生效后重试`,
      });

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.domainBinding.update({
        where: { id: domain.id },
        data: { ownershipVerifiedAt: new Date() },
        include: { tenant: { select: { id: true, name: true, kind: true } } },
      });
      await tx.auditLog.create({
        data: {
          tenantId: domain.tenantId,
          actorUserId: actor.userId,
          actorTenantId: actor.tenantId,
          action: "domain.ownership.verified",
          entityType: "DomainBinding",
          entityId: domain.id,
          detail: {
            hostname: domain.hostname,
            status: "waiting_certificate_and_site_publish",
          },
        },
      });
      return result;
    });
    return this.view(updated);
  }

  async setStatus(
    actor: AdminActor,
    domainId: string,
    input: { status?: unknown },
  ): Promise<DomainView> {
    this.requirePlatform(actor);
    const status =
      input?.status === "active"
        ? DomainBindingStatus.ACTIVE
        : input?.status === "disabled"
          ? DomainBindingStatus.DISABLED
          : null;
    if (!status)
      throw new ConflictException({
        code: "DOMAIN_STATUS_INVALID",
        message: "域名状态只能设为 active 或 disabled",
      });
    const domain = await this.findDomain(domainId);
    if (status === DomainBindingStatus.ACTIVE && !domain.ownershipVerifiedAt)
      throw new ConflictException({
        code: "DOMAIN_OWNERSHIP_NOT_VERIFIED",
        message:
          "请先完成 DNS TXT 所有权验证，并人工确认 HTTPS 证书、网关路由和站点文件后再启用域名",
      });
    if (domain.status === status) return this.view(domain);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.domainBinding.update({
        where: { id: domain.id },
        data: { status },
        include: { tenant: { select: { id: true, name: true, kind: true } } },
      });
      await tx.auditLog.create({
        data: {
          tenantId: domain.tenantId,
          actorUserId: actor.userId,
          actorTenantId: actor.tenantId,
          action: "domain.status.updated",
          entityType: "DomainBinding",
          entityId: domain.id,
          detail: {
            hostname: domain.hostname,
            previousStatus: domain.status.toLowerCase(),
            status: status.toLowerCase(),
            deploymentConfirmedByOperator:
              status === DomainBindingStatus.ACTIVE,
          },
        },
      });
      return result;
    });
    return this.view(updated);
  }

  private async findDomain(id: string) {
    const domain = await this.prisma.domainBinding.findUnique({
      where: { id },
      include: { tenant: { select: { id: true, name: true, kind: true } } },
    });
    if (!domain)
      throw new NotFoundException({
        code: "DOMAIN_NOT_FOUND",
        message: "域名绑定记录不存在",
      });
    return domain;
  }

  private view(
    row: Awaited<ReturnType<DomainManagementService["findDomain"]>>,
  ): DomainView {
    const token = row.verificationToken;
    return {
      id: row.id,
      hostname: row.hostname,
      purpose: row.purpose.toLowerCase() as DomainView["purpose"],
      status: row.status.toLowerCase() as DomainView["status"],
      ownershipStatus:
        row.status === DomainBindingStatus.ACTIVE
          ? "active"
          : row.status === DomainBindingStatus.DISABLED
            ? "disabled"
            : row.ownershipVerifiedAt
              ? "ownership_verified_waiting_certificate"
              : token
                ? "pending_dns"
                : "not_requested",
      tenant: {
        id: row.tenant.id,
        name: row.tenant.name,
        kind: row.tenant.kind.toLowerCase() as DomainView["tenant"]["kind"],
      },
      dnsRecordName: token ? recordName(row.hostname) : null,
      dnsRecordValue: token ? recordValue(token) : null,
      ownershipVerifiedAt: row.ownershipVerifiedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private requirePlatform(actor: AdminActor): void {
    if (actor.role !== UserRole.PLATFORM_ADMIN)
      throw new UnauthorizedException({
        code: "FORBIDDEN",
        message: "仅总后台可管理域名绑定",
      });
  }
}
