import { Module } from '@nestjs/common'

import { AuthController } from './auth.controller'
import { AdminAuthController } from './admin-auth.controller'
import { MerchantSessionGuard } from './merchant-session.guard'
import { TenantAdminSessionGuard } from './tenant-admin-session.guard'
import { SuperAdminSessionGuard } from './super-admin-session.guard'
import { AuthService } from './auth.service'
import { PublisherSessionGuard } from './publisher-session.guard'
import { PublisherAuthController } from './publisher-auth.controller'
import { LoginProtectionService } from './login-protection.service'

@Module({
  controllers: [AuthController, AdminAuthController, PublisherAuthController],
  providers: [AuthService, LoginProtectionService, MerchantSessionGuard, TenantAdminSessionGuard, SuperAdminSessionGuard, PublisherSessionGuard],
  exports: [AuthService, MerchantSessionGuard, TenantAdminSessionGuard, SuperAdminSessionGuard, PublisherSessionGuard],
})
export class AuthModule {}
