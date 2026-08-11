import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";

import { CurrentAdmin } from "../auth/admin-session.decorator";
import { SuperAdminSessionGuard } from "../auth/super-admin-session.guard";
import { TenantAdminSessionGuard } from "../auth/tenant-admin-session.guard";
import type { AdminActor } from "../auth/auth.types";
import { DomainManagementService } from "./domain-management.service";
import { ProvisioningService } from "./provisioning.service";
import { TenantManagementService } from "./tenant-management.service";
import { TenantAdminService } from "./tenant-admin.service";
import { ProviderConfigService } from "./provider-config.service";
import { ObjectStorageConfigService } from "./object-storage-config.service";
import { PlatformUpdatePolicyService } from "./platform-update-policy.service";
import { PlatformDomainConfigService } from "./platform-domain-config.service";
import { DoubaoCheckService } from "../doubao/doubao-check.service";

function requireIdempotencyKey(value: string | undefined): string {
  if (!value || !/^[a-zA-Z0-9_-]{8,100}$/.test(value)) {
    throw new UnprocessableEntityException({
      code: "IDEMPOTENCY_KEY_REQUIRED",
      message: "请提供 8-100 位的 Idempotency-Key，避免重复开户",
    });
  }
  return value;
}

@Controller()
export class ProvisioningController {
  constructor(
    private readonly provisioning: ProvisioningService,
    private readonly domains: DomainManagementService,
    private readonly tenants: TenantManagementService,
    private readonly tenantAdmin: TenantAdminService,
    private readonly providers: ProviderConfigService,
    private readonly storage: ObjectStorageConfigService,
    private readonly doubaoChecks: DoubaoCheckService,
    private readonly updatePolicy: PlatformUpdatePolicyService,
    private readonly platformDomains: PlatformDomainConfigService,
  ) {}

  @Get("tenant/doubao-checks")
  @UseGuards(TenantAdminSessionGuard)
  listDoubaoChecks(@CurrentAdmin() actor: AdminActor) {
    return this.doubaoChecks.list(actor);
  }

  @Post("tenant/doubao-checks")
  @UseGuards(TenantAdminSessionGuard)
  createDoubaoCheck(
    @CurrentAdmin() actor: AdminActor,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.doubaoChecks.create(
      actor,
      body as never,
      requireIdempotencyKey(idempotencyKey),
    );
  }

  @Get("tenant/doubao-checks/:batchId/failures")
  @UseGuards(TenantAdminSessionGuard)
  listDoubaoCheckFailures(
    @CurrentAdmin() actor: AdminActor,
    @Param("batchId") batchId: string,
  ) {
    return this.doubaoChecks.listFailures(actor, batchId);
  }

  @Post("tenant/doubao-checks/:batchId/retry-failures")
  @UseGuards(TenantAdminSessionGuard)
  retryDoubaoCheckFailures(
    @CurrentAdmin() actor: AdminActor,
    @Param("batchId") batchId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.doubaoChecks.retryFailures(
      actor,
      batchId,
      requireIdempotencyKey(idempotencyKey),
    );
  }

  @Get("tenant/object-storage")
  @UseGuards(TenantAdminSessionGuard)
  getObjectStorageConfig(@CurrentAdmin() actor: AdminActor) {
    return this.storage.get(actor);
  }

  @Put("tenant/object-storage")
  @UseGuards(TenantAdminSessionGuard)
  saveObjectStorageConfig(
    @CurrentAdmin() actor: AdminActor,
    @Body() body: unknown,
  ) {
    return this.storage.save(actor, body as never);
  }

  @Post("tenant/object-storage/test")
  @UseGuards(TenantAdminSessionGuard)
  testObjectStorageConfig(@CurrentAdmin() actor: AdminActor) {
    return this.storage.test(actor);
  }

  @Patch("tenant/object-storage/enabled")
  @UseGuards(TenantAdminSessionGuard)
  setObjectStorageEnabled(
    @CurrentAdmin() actor: AdminActor,
    @Body() body: unknown,
  ) {
    return this.storage.setEnabled(actor, body as { enabled?: unknown });
  }

  @Delete("tenant/object-storage")
  @UseGuards(TenantAdminSessionGuard)
  removeObjectStorageConfig(@CurrentAdmin() actor: AdminActor) {
    return this.storage.remove(actor);
  }

  @Get("tenant/provider-configs")
  @UseGuards(TenantAdminSessionGuard)
  listProviderConfigs(@CurrentAdmin() actor: AdminActor) {
    return this.providers.list(actor);
  }

  @Post("tenant/provider-configs")
  @UseGuards(TenantAdminSessionGuard)
  createProviderConfig(
    @CurrentAdmin() actor: AdminActor,
    @Body() body: unknown,
  ) {
    return this.providers.create(actor, body as never);
  }

  @Put("tenant/provider-configs/:providerId")
  @UseGuards(TenantAdminSessionGuard)
  updateProviderConfig(
    @CurrentAdmin() actor: AdminActor,
    @Param("providerId") providerId: string,
    @Body() body: unknown,
  ) {
    return this.providers.update(actor, providerId, body as never);
  }

  @Post("tenant/provider-configs/:providerId/test")
  @UseGuards(TenantAdminSessionGuard)
  testProviderConfig(
    @CurrentAdmin() actor: AdminActor,
    @Param("providerId") providerId: string,
  ) {
    return this.providers.test(actor, providerId);
  }

  @Patch("tenant/provider-configs/:providerId/enabled")
  @UseGuards(TenantAdminSessionGuard)
  setProviderEnabled(
    @CurrentAdmin() actor: AdminActor,
    @Param("providerId") providerId: string,
    @Body() body: unknown,
  ) {
    return this.providers.setEnabled(
      actor,
      providerId,
      body as { enabled?: unknown },
    );
  }

  @Delete("tenant/provider-configs/:providerId")
  @UseGuards(TenantAdminSessionGuard)
  removeProviderConfig(
    @CurrentAdmin() actor: AdminActor,
    @Param("providerId") providerId: string,
  ) {
    return this.providers.remove(actor, providerId);
  }

  @Get("tenant/bootstrap")
  @UseGuards(TenantAdminSessionGuard)
  tenantBootstrap(@CurrentAdmin() actor: AdminActor) {
    return this.tenantAdmin.bootstrap(actor);
  }

  @Get("tenant/managed-agents")
  @UseGuards(TenantAdminSessionGuard)
  listManagedAgents(@CurrentAdmin() actor: AdminActor) {
    return this.tenantAdmin.listAgents(actor);
  }

  @Get("tenant/managed-merchants")
  @UseGuards(TenantAdminSessionGuard)
  listManagedMerchants(@CurrentAdmin() actor: AdminActor) {
    return this.tenantAdmin.listMerchants(actor);
  }

  @Patch("tenant/managed-tenants/:tenantId/status")
  @UseGuards(TenantAdminSessionGuard)
  updateManagedTenantStatus(
    @CurrentAdmin() actor: AdminActor,
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
  ) {
    return this.tenantAdmin.updateChildStatus(
      actor,
      tenantId,
      body as { status?: unknown },
    );
  }

  @Get("super/tenants")
  @UseGuards(SuperAdminSessionGuard)
  listTenants(@CurrentAdmin() actor: AdminActor) {
    return this.tenants.list(actor);
  }

  @Patch("super/tenants/:tenantId/status")
  @UseGuards(SuperAdminSessionGuard)
  updateTenantStatus(
    @CurrentAdmin() actor: AdminActor,
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
  ) {
    return this.tenants.updateStatus(
      actor,
      tenantId,
      body as { status?: unknown },
    );
  }

  @Get("super/audit-logs")
  @UseGuards(SuperAdminSessionGuard)
  listAuditLogs(@CurrentAdmin() actor: AdminActor) {
    return this.tenants.listAuditLogs(actor);
  }

  @Get("super/task-operations")
  @UseGuards(SuperAdminSessionGuard)
  listTaskOperations(@CurrentAdmin() actor: AdminActor) {
    return this.tenants.listTaskOperations(actor);
  }

  @Get("super/publisher-update-policy")
  @UseGuards(SuperAdminSessionGuard)
  getPublisherUpdatePolicy(@CurrentAdmin() actor: AdminActor) {
    return this.updatePolicy.getForSuper(actor);
  }

  @Put("super/publisher-update-policy")
  @UseGuards(SuperAdminSessionGuard)
  savePublisherUpdatePolicy(
    @CurrentAdmin() actor: AdminActor,
    @Body() body: unknown,
  ) {
    return this.updatePolicy.save(actor, body);
  }

  @Get("super/platform-domains")
  @UseGuards(SuperAdminSessionGuard)
  getPlatformDomains(@CurrentAdmin() actor: AdminActor) {
    return this.platformDomains.getForSuper(actor);
  }

  @Put("super/platform-domains")
  @UseGuards(SuperAdminSessionGuard)
  savePlatformDomains(
    @CurrentAdmin() actor: AdminActor,
    @Body() body: unknown,
  ) {
    return this.platformDomains.save(actor, body);
  }

  @Get("super/domains")
  @UseGuards(SuperAdminSessionGuard)
  listDomains(@CurrentAdmin() actor: AdminActor) {
    return this.domains.list(actor);
  }

  @Post("super/domains/:domainId/verification-token")
  @UseGuards(SuperAdminSessionGuard)
  issueDomainVerificationToken(
    @CurrentAdmin() actor: AdminActor,
    @Param("domainId") domainId: string,
  ) {
    return this.domains.issueVerificationToken(actor, domainId);
  }

  @Post("super/domains/:domainId/verify-dns")
  @UseGuards(SuperAdminSessionGuard)
  verifyDomainDns(
    @CurrentAdmin() actor: AdminActor,
    @Param("domainId") domainId: string,
  ) {
    return this.domains.verifyDnsOwnership(actor, domainId);
  }

  @Patch("super/domains/:domainId/status")
  @UseGuards(SuperAdminSessionGuard)
  updateDomainStatus(
    @CurrentAdmin() actor: AdminActor,
    @Param("domainId") domainId: string,
    @Body() body: { status?: unknown },
  ) {
    return this.domains.setStatus(actor, domainId, body);
  }

  @Get("super/white-labels")
  @UseGuards(SuperAdminSessionGuard)
  listWhiteLabels(@CurrentAdmin() actor: AdminActor) {
    return this.provisioning.listWhiteLabels(actor);
  }

  @Put("super/white-labels/:whiteLabelId/brand")
  @UseGuards(SuperAdminSessionGuard)
  updateWhiteLabelBrand(
    @CurrentAdmin() actor: AdminActor,
    @Param("whiteLabelId") whiteLabelId: string,
    @Body() body: unknown,
  ) {
    return this.provisioning.updateWhiteLabelBrand(
      actor,
      whiteLabelId,
      body as never,
    );
  }

  @Post("super/white-labels")
  @UseGuards(SuperAdminSessionGuard)
  createWhiteLabel(
    @CurrentAdmin() actor: AdminActor,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.provisioning.createWhiteLabel(
      actor,
      body as never,
      requireIdempotencyKey(idempotencyKey),
    );
  }

  @Post("tenant/agents")
  @UseGuards(TenantAdminSessionGuard)
  createAgent(
    @CurrentAdmin() actor: AdminActor,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.provisioning.createAgent(
      actor,
      body as never,
      requireIdempotencyKey(idempotencyKey),
    );
  }

  @Post("tenant/merchants")
  @UseGuards(TenantAdminSessionGuard)
  createMerchant(
    @CurrentAdmin() actor: AdminActor,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.provisioning.createMerchant(
      actor,
      body as never,
      requireIdempotencyKey(idempotencyKey),
    );
  }
}
