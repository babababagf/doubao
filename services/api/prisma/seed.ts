import * as argon2 from 'argon2'
import { existsSync } from 'node:fs'

import { PrismaPg } from '@prisma/adapter-pg'
import { LoginRealm, PrismaClient, TenantKind, UserRole } from '../src/generated/prisma/client'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL 未设置，不能写入本地种子数据。')
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })

async function main(): Promise<void> {
  const passwordHash = await argon2.hash('demo123', { type: argon2.argon2id })
  const platformPasswordHash = await argon2.hash('admin123', { type: argon2.argon2id })
  await prisma.user.upsert({
    where: { usernameCanonical_loginRealm: { usernameCanonical: 'admin001', loginRealm: LoginRealm.SUPER_ADMIN } },
    update: { passwordHash: platformPasswordHash, role: UserRole.PLATFORM_ADMIN, tenantId: null },
    create: { usernameCanonical: 'admin001', loginRealm: LoginRealm.SUPER_ADMIN, passwordHash: platformPasswordHash, role: UserRole.PLATFORM_ADMIN },
  })
  const whiteLabel = await prisma.tenant.upsert({
    where: { id: 'seed-white-label' },
    update: { agentSeatLimit: 5, merchantSeatLimit: 50 },
    create: {
      id: 'seed-white-label',
      kind: TenantKind.WHITE_LABEL,
      name: '示例科技有限公司',
      expiresAt: new Date('2027-08-06T23:59:59.999Z'),
      agentSeatLimit: 5,
      merchantSeatLimit: 50,
    },
  })

  await prisma.brandConfiguration.upsert({
    where: { tenantId: whiteLabel.id },
    update: {},
    create: { tenantId: whiteLabel.id, nickname: '豆包获客', logoUrl: '', version: 1 },
  })
  await prisma.user.upsert({
    where: { usernameCanonical_loginRealm: { usernameCanonical: 'tenant001', loginRealm: LoginRealm.TENANT_ADMIN } },
    update: { passwordHash, role: UserRole.WHITE_LABEL_ADMIN, tenantId: whiteLabel.id },
    create: { usernameCanonical: 'tenant001', loginRealm: LoginRealm.TENANT_ADMIN, passwordHash, role: UserRole.WHITE_LABEL_ADMIN, tenantId: whiteLabel.id },
  })
  await prisma.quotaBalance.upsert({
    where: { tenantId: whiteLabel.id },
    update: {},
    create: { tenantId: whiteLabel.id, computePointsAvailable: 10000, writingLimit: 100 },
  })

  const agent = await prisma.tenant.upsert({
    where: { id: 'seed-agent' },
    update: { parentId: whiteLabel.id, whiteLabelId: whiteLabel.id, merchantSeatLimit: 10 },
    create: {
      id: 'seed-agent',
      kind: TenantKind.AGENT,
      name: '示例代理有限公司',
      parentId: whiteLabel.id,
      whiteLabelId: whiteLabel.id,
      expiresAt: new Date('2027-08-06T23:59:59.999Z'),
      merchantSeatLimit: 10,
    },
  })
  await prisma.user.upsert({
    where: { usernameCanonical_loginRealm: { usernameCanonical: 'agent001', loginRealm: LoginRealm.TENANT_ADMIN } },
    update: { passwordHash, role: UserRole.AGENT_ADMIN, tenantId: agent.id },
    create: { usernameCanonical: 'agent001', loginRealm: LoginRealm.TENANT_ADMIN, passwordHash, role: UserRole.AGENT_ADMIN, tenantId: agent.id },
  })
  await prisma.quotaBalance.upsert({
    where: { tenantId: agent.id },
    update: {},
    create: { tenantId: agent.id, computePointsAvailable: 1000, writingLimit: 10 },
  })

  const merchant = await prisma.tenant.upsert({
    where: { id: 'seed-merchant' },
    update: {},
    create: {
      id: 'seed-merchant',
      kind: TenantKind.MERCHANT,
      name: '示例科技有限公司',
      parentId: whiteLabel.id,
      whiteLabelId: whiteLabel.id,
      expiresAt: new Date('2027-08-06T23:59:59.999Z'),
    },
  })

  await prisma.user.upsert({
    where: { usernameCanonical_loginRealm: { usernameCanonical: 'demo001', loginRealm: LoginRealm.MERCHANT } },
    update: { passwordHash, role: UserRole.MERCHANT, tenantId: merchant.id },
    create: { usernameCanonical: 'demo001', loginRealm: LoginRealm.MERCHANT, passwordHash, role: UserRole.MERCHANT, tenantId: merchant.id },
  })

  await prisma.quotaBalance.upsert({
    where: { tenantId: merchant.id },
    update: {},
    create: { tenantId: merchant.id, keywordLimit: 50, computePointsAvailable: 10000, writingLimit: 100 },
  })

  await prisma.merchantProfile.upsert({
    where: { tenantId: merchant.id },
    update: {},
    create: { tenantId: merchant.id, companyName: '示例科技有限公司' },
  })
}

main().finally(async () => prisma.$disconnect())
