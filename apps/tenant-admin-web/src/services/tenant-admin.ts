export interface Bootstrap {
  account: { id: string; companyName: string; role: 'white_label' | 'agent'; expiresAt: string }
  brand: { nickname: string; logoUrl: string; version: number }
  entitlements: { computePoints: number; writingRemaining: number; merchantUsage: number; merchantReserved: number; merchantLimit: number; agentUsage: number; agentLimit: number }
  capabilities: { canCreateAgent: boolean; canCreateMerchant: boolean; canManageProviders: boolean; canManageObjectStorage: boolean; canRunDoubaoChecks: boolean }
}

export interface ChildAccount {
  id: string
  companyName: string
  username: string
  kind: 'agent' | 'merchant'
  status: 'active' | 'disabled' | 'expired'
  expiresAt: string
  parentName: string
  computePoints: number
  writingRemaining: number
  keywordLimit: number
  doubaoCheckedCount: number
  doubaoIncludedCount: number
  latestDoubaoCheckedAt: string | null
}
export interface ProviderConfig { id: string; alias: string; platform: string; protocol: string; baseUrl: string; modelName: string; keyMask: string; supportsWriting: boolean; supportsDoubaoCheck: boolean; supportsWebSearch: boolean; enabled: boolean; lastTestAt: string | null; lastTestStatus: string; lastTestError: string | null }
export interface ProviderForm { alias: string; platform: 'deepseek' | 'volcengine_ark' | 'custom_openai'; protocol: 'chat_completions' | 'responses'; baseUrl: string; modelName: string; apiKey: string; supportsWriting: boolean; supportsDoubaoCheck: boolean; supportsWebSearch: boolean }
export interface ObjectStorageConfig { id: string; provider: string; region: string; bucket: string; cdnBaseUrl: string | null; accessKeyIdMask: string; enabled: boolean; lastTestAt: string | null; lastTestStatus: string; lastTestError: string | null }
export interface ObjectStorageForm { region: string; bucket: string; cdnBaseUrl: string; accessKeyId: string; accessKeySecret: string }
export interface DoubaoCheckBatch { id: string; scope: 'single_merchant' | 'all_merchants'; status: 'queued' | 'running' | 'succeeded' | 'partially_failed' | 'failed'; providerAlias: string; providerModel: string; targetMerchantCount: number; totalCount: number; completedCount: number; successfulCount: number; failedCount: number; matchedCount: number; failureReason: string | null; createdAt: string; startedAt: string | null; completedAt: string | null }
export interface DoubaoCheckFailure { id: string; merchantName: string; question: string; failureReason: string; checkedAt: string | null }

export interface AgentForm { username: string; password: string; companyName: string; merchantLimit: number; computePoints: number; writingLimit: number; primaryDomain: string; expiresAt: string }
export interface MerchantForm { username: string; password: string; companyName: string; keywordLimit: number; computePoints: number; writingLimit: number; primaryDomain: string; expiresAt: string }

export class ApiError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message) } }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, credentials: 'include', headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...(init?.headers ?? {}) } })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ code: 'UNKNOWN_ERROR', message: '请求失败，请稍后重试' })) as { code?: string; message?: string }
    throw new ApiError(response.status, payload.code ?? 'UNKNOWN_ERROR', payload.message ?? '请求失败，请稍后重试')
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

function payloadWithDomain<T extends { primaryDomain: string; expiresAt: string }>(payload: T): Omit<T, 'primaryDomain' | 'expiresAt'> & { primaryDomain?: string; expiresAt: string } {
  const { primaryDomain, expiresAt, ...rest } = payload
  const normalized = primaryDomain.trim()
  const base = { ...rest, expiresAt: new Date(expiresAt).toISOString() }
  return normalized ? { ...base, primaryDomain: normalized } : base
}

export function login(username: string, password: string): Promise<void> { return api('/tenant/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }) }
export function logout(): Promise<void> { return api('/tenant/auth/logout', { method: 'POST' }) }
export function bootstrap(): Promise<Bootstrap> { return api('/tenant/bootstrap') }
export function listAgents(): Promise<ChildAccount[]> { return api('/tenant/managed-agents') }
export function listMerchants(): Promise<ChildAccount[]> { return api('/tenant/managed-merchants') }
export function createAgent(payload: AgentForm): Promise<void> { return api('/tenant/agents', { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(payloadWithDomain(payload)) }) }
export function createMerchant(payload: MerchantForm): Promise<void> { return api('/tenant/merchants', { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(payloadWithDomain(payload)) }) }
export function updateChildStatus(tenantId: string, status: 'active' | 'disabled'): Promise<ChildAccount> { return api(`/tenant/managed-tenants/${tenantId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }) }
export function listProviderConfigs(): Promise<ProviderConfig[]> { return api('/tenant/provider-configs') }
export function createProviderConfig(payload: ProviderForm): Promise<ProviderConfig> { return api('/tenant/provider-configs', { method: 'POST', body: JSON.stringify(payload) }) }
export function updateProviderConfig(id: string, payload: ProviderForm): Promise<ProviderConfig> { return api(`/tenant/provider-configs/${id}`, { method: 'PUT', body: JSON.stringify(payload) }) }
export function testProviderConfig(id: string): Promise<ProviderConfig> { return api(`/tenant/provider-configs/${id}/test`, { method: 'POST' }) }
export function setProviderEnabled(id: string, enabled: boolean): Promise<ProviderConfig> { return api(`/tenant/provider-configs/${id}/enabled`, { method: 'PATCH', body: JSON.stringify({ enabled }) }) }
export function removeProviderConfig(id: string): Promise<void> { return api(`/tenant/provider-configs/${id}`, { method: 'DELETE' }) }
export function getObjectStorageConfig(): Promise<ObjectStorageConfig | null> { return api('/tenant/object-storage') }
export function saveObjectStorageConfig(payload: ObjectStorageForm): Promise<ObjectStorageConfig> { return api('/tenant/object-storage', { method: 'PUT', body: JSON.stringify(payload) }) }
export function testObjectStorageConfig(): Promise<ObjectStorageConfig> { return api('/tenant/object-storage/test', { method: 'POST' }) }
export function setObjectStorageEnabled(enabled: boolean): Promise<ObjectStorageConfig> { return api('/tenant/object-storage/enabled', { method: 'PATCH', body: JSON.stringify({ enabled }) }) }
export function removeObjectStorageConfig(): Promise<void> { return api('/tenant/object-storage', { method: 'DELETE' }) }
export function listDoubaoChecks(): Promise<DoubaoCheckBatch[]> { return api('/tenant/doubao-checks') }
export function createDoubaoCheck(payload: { merchantId?: string; all?: boolean; confirmedAll?: boolean }): Promise<DoubaoCheckBatch> { return api('/tenant/doubao-checks', { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(payload) }) }
export function listDoubaoCheckFailures(batchId: string): Promise<DoubaoCheckFailure[]> { return api(`/tenant/doubao-checks/${encodeURIComponent(batchId)}/failures`) }
export function retryDoubaoCheckFailures(batchId: string): Promise<DoubaoCheckBatch> { return api(`/tenant/doubao-checks/${encodeURIComponent(batchId)}/retry-failures`, { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() } }) }
