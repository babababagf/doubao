import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { DomainManagementService } from './domain-management.service'
import { ProvisioningController } from './provisioning.controller'
import { ProvisioningService } from './provisioning.service'
import { TenantManagementService } from './tenant-management.service'
import { TenantAdminService } from './tenant-admin.service'
import { ProviderConfigService } from './provider-config.service'
import { ObjectStorageConfigService } from './object-storage-config.service'
import { SecurityModule } from '../security/security.module'
import { DoubaoModule } from '../doubao/doubao.module'
import { PlatformUpdatePolicyService } from './platform-update-policy.service'
import { PlatformDomainConfigService } from './platform-domain-config.service'

@Module({
  imports: [PrismaModule, AuthModule, SecurityModule, DoubaoModule],
  controllers: [ProvisioningController],
  providers: [ProvisioningService, DomainManagementService, TenantManagementService, TenantAdminService, ProviderConfigService, ObjectStorageConfigService, PlatformUpdatePolicyService, PlatformDomainConfigService],
  exports: [ObjectStorageConfigService, PlatformUpdatePolicyService, PlatformDomainConfigService],
})
export class TenancyModule {}
