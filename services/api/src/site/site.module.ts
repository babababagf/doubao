import { Module } from '@nestjs/common'

import { PrismaModule } from '../prisma/prisma.module'
import { TenancyModule } from '../tenancy/tenancy.module'
import { PublicSiteController } from './public-site.controller'
import { StaticSiteService } from './static-site.service'

@Module({ imports: [PrismaModule, TenancyModule], controllers: [PublicSiteController], providers: [StaticSiteService], exports: [StaticSiteService] })
export class SiteModule {}
