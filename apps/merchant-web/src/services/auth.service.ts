import type { LoginRequest, LoginResponse } from '@doubaohk/api-contract'

import { apiRequest } from './http'

export function login(payload: LoginRequest): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function logout(): Promise<void> {
  return apiRequest<void>('/auth/logout', { method: 'POST' })
}

export function exchangeAdminHandoff(token: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/admin-handoff/exchange', {
    method: 'POST',
    cache: 'no-store',
    body: JSON.stringify({ token }),
  })
}
