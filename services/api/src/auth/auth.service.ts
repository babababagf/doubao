import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as argon2 from 'argon2'
import { createHash, randomBytes } from 'node:crypto'

import { AccountStatus, LoginRealm, SessionAudience, UserRole } from '../generated/prisma/client'
import { isValidAccountText, normalizeUsername } from '../common/password-policy'
import { PrismaService } from '../prisma/prisma.service'
import { MERCHANT_SESSION_COOKIE, SUPER_ADMIN_SESSION_COOKIE, TENANT_ADMIN_SESSION_COOKIE, type AdminActor, type MerchantActor, type PublisherActor } from './auth.types'
import { LoginProtectionService } from './login-protection.service'

type TenantAccess = { status: AccountStatus; expiresAt: Date; parent?: { status: AccountStatus; expiresAt: Date } | null } | null

export interface LoginResult {
  sessionId: string
  token: string
  expiresAt: Date
}

@Injectable()
export class AuthService {
  private readonly sessionHours: number

  constructor(
    private readonly prisma: PrismaService,
    private readonly loginProtection: LoginProtectionService,
    config: ConfigService,
  ) {
    this.sessionHours = Number(config.get<string>('SESSION_TTL_HOURS', '24'))
  }

  async loginMerchant(username: string, password: string): Promise<LoginResult> {
    return this.loginForAudience(username, password, LoginRealm.MERCHANT, SessionAudience.MERCHANT_WEB, [UserRole.MERCHANT])
  }

  async loginPublisherDesktop(username: string, password: string, deviceRef: string): Promise<LoginResult> {
    if (!isValidPublisherDeviceRef(deviceRef)) throw this.invalidCredentials()
    return this.loginForAudience(username, password, LoginRealm.MERCHANT, SessionAudience.PUBLISHER_DESKTOP, [UserRole.MERCHANT], deviceRef)
  }

  async loginTenantAdmin(username: string, password: string): Promise<LoginResult> {
    return this.loginForAudience(username, password, LoginRealm.TENANT_ADMIN, SessionAudience.TENANT_ADMIN_WEB, [UserRole.WHITE_LABEL_ADMIN, UserRole.AGENT_ADMIN])
  }

  async loginSuperAdmin(username: string, password: string): Promise<LoginResult> {
    return this.loginForAudience(username, password, LoginRealm.SUPER_ADMIN, SessionAudience.SUPER_ADMIN_WEB, [UserRole.PLATFORM_ADMIN])
  }

  private async loginForAudience(username: string, password: string, realm: LoginRealm, audience: SessionAudience, roles: UserRole[], deviceRef?: string): Promise<LoginResult> {
    if (!isValidAccountText(username) || !isValidAccountText(password)) {
      throw this.invalidCredentials()
    }

    const usernameCanonical = normalizeUsername(username)
    await this.loginProtection.assertAllowed(realm, usernameCanonical)

    const user = await this.prisma.user.findUnique({
      where: { usernameCanonical_loginRealm: { usernameCanonical, loginRealm: realm } },
      include: { tenant: { include: { parent: { select: { status: true, expiresAt: true } } } } },
    })
    if (!user || !roles.includes(user.role) || !this.isActorUsable(user.status, user.tenant)) {
      await this.recordFailedLogin(realm, audience, usernameCanonical, user?.id, user?.tenant?.id)
      throw this.invalidCredentials()
    }

    const validPassword = await argon2.verify(user.passwordHash, password)
    if (!validPassword) {
      await this.recordFailedLogin(realm, audience, usernameCanonical, user.id, user.tenant?.id)
      throw this.invalidCredentials()
    }

    const publisherDevice = audience === SessionAudience.PUBLISHER_DESKTOP && deviceRef && user.tenant
      ? await this.prisma.publisherDevice.upsert({
        where: { tenantId_deviceRefHash: { tenantId: user.tenant.id, deviceRefHash: this.hashDeviceRef(deviceRef) } },
        update: { lastSeenAt: new Date(), revokedAt: null },
        create: { tenantId: user.tenant.id, deviceRefHash: this.hashDeviceRef(deviceRef) },
      })
      : null
    if (audience === SessionAudience.PUBLISHER_DESKTOP && !publisherDevice) {
      await this.recordFailedLogin(realm, audience, usernameCanonical, user.id, user.tenant?.id)
      throw this.invalidCredentials()
    }

    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + this.sessionHours * 60 * 60 * 1000)
    const session = await this.prisma.session.create({
      data: {
        tokenHash: this.hashToken(token),
        userId: user.id,
        audience,
        expiresAt,
        publisherDeviceId: publisherDevice?.id ?? null,
      },
    })

    await this.loginProtection.clearFailures(realm, usernameCanonical)
    await this.recordLoginAudit({
      action: 'auth.login.succeeded', realm, audience, usernameCanonical,
      entityId: user.id, actorUserId: user.id, tenantId: user.tenant?.id ?? null, actorTenantId: user.tenant?.id ?? null,
    })

    return { sessionId: session.id, token, expiresAt }
  }

  async logoutMerchant(token: string | undefined): Promise<void> {
    await this.logoutAudience(token, SessionAudience.MERCHANT_WEB)
  }

  async logoutPublisherDesktop(token: string | undefined): Promise<void> {
    await this.logoutAudience(token, SessionAudience.PUBLISHER_DESKTOP)
  }

  async logoutTenantAdmin(token: string | undefined): Promise<void> {
    await this.logoutAudience(token, SessionAudience.TENANT_ADMIN_WEB)
  }

  async logoutSuperAdmin(token: string | undefined): Promise<void> {
    await this.logoutAudience(token, SessionAudience.SUPER_ADMIN_WEB)
  }

  private async logoutAudience(token: string | undefined, audience: SessionAudience): Promise<void> {
    if (!token) {
      return
    }

    await this.prisma.session.updateMany({
      where: { tokenHash: this.hashToken(token), audience, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  async resolveMerchantSession(token: string | undefined): Promise<MerchantActor | null> {
    const actor = await this.resolveAudienceSession(token, SessionAudience.MERCHANT_WEB, [UserRole.MERCHANT])
    return actor?.tenantId ? actor as MerchantActor : null
  }

  async resolvePublisherDesktopSession(token: string | undefined): Promise<PublisherActor | null> {
    if (!token) return null
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: { user: { include: { tenant: { include: { parent: { select: { status: true, expiresAt: true } } } } } } },
    })
    if (
      !session || session.audience !== SessionAudience.PUBLISHER_DESKTOP || !session.publisherDeviceId || session.revokedAt || session.expiresAt <= new Date()
      || session.user.role !== UserRole.MERCHANT || !this.isActorUsable(session.user.status, session.user.tenant)
    ) return null
    return {
      userId: session.user.id,
      tenantId: session.user.tenant?.id ?? '',
      username: session.user.usernameCanonical,
      role: session.user.role,
      status: session.user.status,
      publisherDeviceId: session.publisherDeviceId,
    }
  }

  async resolveTenantAdminSession(token: string | undefined): Promise<AdminActor | null> {
    return this.resolveAudienceSession(token, SessionAudience.TENANT_ADMIN_WEB, [UserRole.WHITE_LABEL_ADMIN, UserRole.AGENT_ADMIN])
  }

  async resolveSuperAdminSession(token: string | undefined): Promise<AdminActor | null> {
    return this.resolveAudienceSession(token, SessionAudience.SUPER_ADMIN_WEB, [UserRole.PLATFORM_ADMIN])
  }

  private async resolveAudienceSession(token: string | undefined, audience: SessionAudience, roles: UserRole[]): Promise<AdminActor | null> {
    if (!token) {
      return null
    }

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: { user: { include: { tenant: { include: { parent: { select: { status: true, expiresAt: true } } } } } } },
    })
    if (
      !session ||
      session.audience !== audience ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !roles.includes(session.user.role) ||
      !this.isActorUsable(session.user.status, session.user.tenant)
    ) {
      return null
    }

    return {
      userId: session.user.id,
      tenantId: session.user.tenant?.id ?? null,
      username: session.user.usernameCanonical,
      role: session.user.role,
      status: session.user.status,
    }
  }

  static cookieName(): string {
    return MERCHANT_SESSION_COOKIE
  }

  static tenantCookieName(): string { return TENANT_ADMIN_SESSION_COOKIE }
  static superCookieName(): string { return SUPER_ADMIN_SESSION_COOKIE }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  private hashDeviceRef(deviceRef: string): string {
    return createHash('sha256').update(deviceRef).digest('hex')
  }

  private isActorUsable(userStatus: AccountStatus, tenant: TenantAccess | undefined): boolean {
    if (userStatus !== AccountStatus.ACTIVE) return false
    if (!tenant) return true
    const now = new Date()
    if (tenant.status !== AccountStatus.ACTIVE || tenant.expiresAt <= now) return false
    return !tenant.parent || (tenant.parent.status === AccountStatus.ACTIVE && tenant.parent.expiresAt > now)
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: '账号或密码错误' })
  }

  private async recordFailedLogin(realm: LoginRealm, audience: SessionAudience, usernameCanonical: string, userId?: string, tenantId?: string): Promise<void> {
    const locked = await this.loginProtection.recordFailure(realm, usernameCanonical)
    await this.recordLoginAudit({
      action: locked ? 'auth.login.locked' : 'auth.login.failed', realm, audience, usernameCanonical,
      entityId: userId ?? `principal:${this.hashLoginPrincipal(realm, usernameCanonical)}`,
      actorUserId: null, tenantId: tenantId ?? null, actorTenantId: null,
    })
  }

  private async recordLoginAudit(input: {
    action: 'auth.login.succeeded' | 'auth.login.failed' | 'auth.login.locked'
    realm: LoginRealm
    audience: SessionAudience
    usernameCanonical: string
    entityId: string
    actorUserId: string | null
    tenantId: string | null
    actorTenantId: string | null
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          actorTenantId: input.actorTenantId,
          action: input.action,
          entityType: 'Authentication',
          entityId: input.entityId,
          detail: {
            realm: input.realm.toLowerCase(),
            audience: input.audience.toLowerCase(),
            principalHash: this.hashLoginPrincipal(input.realm, input.usernameCanonical),
          },
        },
      })
    } catch {
      // 审计故障不影响已完成的认证；业务日志中也不记录账号、密码或令牌。
    }
  }

  private hashLoginPrincipal(realm: LoginRealm, usernameCanonical: string): string {
    return createHash('sha256').update(`${realm}:${usernameCanonical}`).digest('hex')
  }
}

function isValidPublisherDeviceRef(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
