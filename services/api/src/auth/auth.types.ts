import type { AccountStatus, UserRole } from '../generated/prisma/client'

export const MERCHANT_SESSION_COOKIE = 'doubaohk_merchant_session'
export const TENANT_ADMIN_SESSION_COOKIE = 'doubaohk_tenant_admin_session'
export const SUPER_ADMIN_SESSION_COOKIE = 'doubaohk_super_admin_session'

export interface MerchantActor {
  userId: string
  tenantId: string
  username: string
  role: UserRole
  status: AccountStatus
}

export interface PublisherActor extends MerchantActor {
  publisherDeviceId: string
}

export interface AdminActor {
  userId: string
  tenantId: string | null
  username: string
  role: UserRole
  status: AccountStatus
}
