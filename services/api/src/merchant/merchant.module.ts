import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { AiModule } from '../ai/ai.module'
import { TenancyModule } from '../tenancy/tenancy.module'
import { SiteModule } from '../site/site.module'
import { MerchantController } from './merchant.controller'
import { MerchantContentService } from './merchant-content.service'
import { MerchantService } from './merchant.service'

@Module({
  imports: [AuthModule, AiModule, TenancyModule, SiteModule],
  controllers: [MerchantController],
  providers: [MerchantService, MerchantContentService],
})
export class MerchantModule {}
