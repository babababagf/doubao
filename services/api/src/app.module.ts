import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { resolve } from 'node:path'

import { AuthModule } from './auth/auth.module'
import { AiModule } from './ai/ai.module'
import { HealthModule } from './health/health.module'
import { MerchantModule } from './merchant/merchant.module'
import { PrismaModule } from './prisma/prisma.module'
import { TenancyModule } from './tenancy/tenancy.module'
import { SiteModule } from './site/site.module'
import { DoubaoModule } from './doubao/doubao.module'
import { PublisherModule } from './publisher/publisher.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // 同时支持从仓库根目录、API目录及编译后的 dist 目录启动。
      envFilePath: [
        resolve(process.cwd(), 'services/api/.env.local'),
        resolve(process.cwd(), 'services/api/.env'),
        resolve(process.cwd(), '.env.local'),
        resolve(process.cwd(), '.env'),
        resolve(__dirname, '../../.env.local'),
        resolve(__dirname, '../../.env'),
      ],
    }),
    PrismaModule,
    AiModule,
    DoubaoModule,
    HealthModule,
    AuthModule,
    MerchantModule,
    TenancyModule,
    SiteModule,
    PublisherModule,
  ],
})
export class AppModule {}
