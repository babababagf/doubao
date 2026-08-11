import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { PublisherController } from './publisher.controller'
import { PublisherService } from './publisher.service'
import { TenancyModule } from '../tenancy/tenancy.module'
import { SecurityModule } from '../security/security.module'
import { MediaSessionBackupService } from './media-session-backup.service'

@Module({ imports: [AuthModule, PrismaModule, SecurityModule, TenancyModule], controllers: [PublisherController], providers: [MediaSessionBackupService, PublisherService] })
export class PublisherModule {}
