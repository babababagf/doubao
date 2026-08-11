import type { PublisherSessionStore } from './publisher-session'
import type { MediaPlatform } from '../shared/media-platform'
import type { RemoteUpdatePolicy } from '../shared/update-policy'
import type { PublisherAttentionReason } from '../shared/task-machine'

export type { PublisherAttentionReason } from '../shared/task-machine'

export type RemotePublisherTask = { id: string; platform: MediaPlatform; status: 'queued' | 'running' | 'attention'; createdAt: string; failureReason: string | null; attentionReason: PublisherAttentionReason | null; canResume: boolean; canResolvePublished: boolean; attemptCount: number; targetAccount: { id: string | null; localReferenceId: string | null; maskedName: string | null }; article: { version: number; title: string; content: string; imageCount: number; galleryId: string | null; galleryImageIds: string[] } }
export type RemotePublisherTaskImages = { requiredCount: number; availability: 'not_required' | 'legacy_snapshot_missing' | 'source_missing' | 'ready'; images: Array<{ id: string; fileName: string; mimeType: string; url: string }>; missingImageIds: string[] }
export type RemoteMediaSessionBundle = { schemaVersion: 1; platform: MediaPlatform; localReferenceId: string; capturedAt: string; cookies: Array<{ name: string; value: string; domain: string; hostOnly?: boolean; path: string; secure: boolean; httpOnly: boolean; session?: boolean; sameSite?: string; partitionKey?: string; expirationDate?: number; expires?: number }>; origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }>; sessionStorage: Array<{ name: string; value: string }>; indexedDB?: unknown[] }> }
export type RemotePublisherBootstrap = { username: string; queuedCount: number; activeCount: number; finalPublicationMode: 'automatic_submission_with_attention_fallback'; accounts: Array<{ id: string | null; platform: MediaPlatform; status: string; maskedName: string | null; localReferenceId: string | null; lastVerifiedAt: string | null; failureReason: string | null; backupAvailable: boolean; backupCapturedAt: string | null }> }

function apiBaseUrl(): string {
  const raw = process.env.PUBLISHER_API_BASE_URL ?? 'http://127.0.0.1:3010/api'
  const url = new URL(raw)
  const localHttp = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  if (!localHttp && url.protocol !== 'https:') throw new Error('发布助手 API 地址必须使用 HTTPS；本机开发仅允许 localhost')
  return url.toString().replace(/\/$/, '')
}

async function responseError(response: Response): Promise<Error> {
  try { const body = await response.json() as { message?: unknown }; return new Error(typeof body.message === 'string' ? body.message : `请求失败（${response.status}）`) } catch { return new Error(`请求失败（${response.status}）`) }
}

export class PublisherApi {
  constructor(private readonly sessions: PublisherSessionStore) {}

  async login(username: string, password: string, deviceRef: string): Promise<void> {
    const response = await fetch(`${apiBaseUrl()}/publisher/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password, deviceRef }) })
    if (!response.ok) throw await responseError(response)
    const value = await response.json() as { accessToken?: unknown; expiresAt?: unknown }
    if (typeof value.accessToken !== 'string' || typeof value.expiresAt !== 'string') throw new Error('发布助手登录响应无效')
    await this.sessions.save({ accessToken: value.accessToken, username, expiresAt: value.expiresAt })
  }

  async logout(workspaceId?: string): Promise<void> {
    const session = workspaceId ? await this.sessions.loadWorkspace(workspaceId) : await this.sessions.load()
    if (session) {
      await fetch(`${apiBaseUrl()}/publisher/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${session.accessToken}` }, signal: AbortSignal.timeout(10_000) }).catch(() => undefined)
      await this.sessions.clearWorkspace(session.workspaceId)
      return
    }
  }
  async bootstrap(workspaceId?: string): Promise<RemotePublisherBootstrap> { return this.request('/publisher/bootstrap', {}, workspaceId) }
  async tasks(workspaceId?: string): Promise<RemotePublisherTask[]> { return this.request('/publisher/tasks', {}, workspaceId) }
  async taskImages(taskId: string, workspaceId?: string): Promise<RemotePublisherTaskImages> { return this.request(`/publisher/tasks/${encodeURIComponent(taskId)}/images`, {}, workspaceId) }
  async updatePolicy(workspaceId?: string): Promise<RemoteUpdatePolicy> { return this.request('/publisher/update-policy', {}, workspaceId) }
  async claim(taskId: string, workspaceId?: string): Promise<RemotePublisherTask> { return this.request(`/publisher/tasks/${encodeURIComponent(taskId)}/claim`, { method: 'POST' }, workspaceId) }
  async heartbeat(taskId: string, workspaceId?: string): Promise<RemotePublisherTask> { return this.request(`/publisher/tasks/${encodeURIComponent(taskId)}/heartbeat`, { method: 'POST' }, workspaceId) }
  async attention(taskId: string, reason: PublisherAttentionReason, workspaceId?: string): Promise<RemotePublisherTask> { return this.request(`/publisher/tasks/${encodeURIComponent(taskId)}/attention`, { method: 'POST', body: JSON.stringify({ reason }) }, workspaceId) }
  async resume(taskId: string, workspaceId?: string): Promise<RemotePublisherTask> { return this.request(`/publisher/tasks/${encodeURIComponent(taskId)}/resume`, { method: 'POST' }, workspaceId) }
  async complete(taskId: string, resultUrl: string, workspaceId?: string): Promise<void> { await this.request<object>(`/publisher/tasks/${encodeURIComponent(taskId)}/complete`, { method: 'POST', body: JSON.stringify({ resultUrl }) }, workspaceId) }
  async resolvePublished(taskId: string, resultUrl: string, workspaceId?: string): Promise<void> { await this.request<object>(`/publisher/tasks/${encodeURIComponent(taskId)}/resolve-published`, { method: 'POST', body: JSON.stringify({ resultUrl }) }, workspaceId) }
  async accountState(platform: MediaPlatform, localReferenceId: string, label: string, state: 'connection_requested' | 'verification_required' | 'connected', workspaceId?: string): Promise<void> { await this.request(`/publisher/media-accounts/${platform}/state`, { method: 'POST', body: JSON.stringify({ state, localReferenceId, label }) }, workspaceId) }
  async saveSessionBackup(accountId: string, bundle: RemoteMediaSessionBundle, workspaceId?: string): Promise<void> { await this.request(`/publisher/media-accounts/${encodeURIComponent(accountId)}/session-backup`, { method: 'PUT', body: JSON.stringify(bundle) }, workspaceId) }
  async restoreSessionBackup(accountId: string, workspaceId?: string): Promise<{ bundle: RemoteMediaSessionBundle; capturedAt: string; crossDevice: boolean }> { return this.request(`/publisher/media-accounts/${encodeURIComponent(accountId)}/session-backup`, {}, workspaceId) }
  async revokeSessionBackup(accountId: string, workspaceId?: string): Promise<void> { await this.request(`/publisher/media-accounts/${encodeURIComponent(accountId)}/session-backup`, { method: 'DELETE' }, workspaceId) }

  private async request<T>(path: string, init: RequestInit = {}, workspaceId?: string): Promise<T> {
    const session = workspaceId ? await this.sessions.loadWorkspace(workspaceId) : await this.sessions.load()
    if (!session) throw new Error('请先登录发布助手')
    const headers = new Headers(init.headers)
    headers.set('authorization', `Bearer ${session.accessToken}`)
    if (init.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json')
    const response = await fetch(`${apiBaseUrl()}${path}`, { ...init, headers })
    if (response.status === 401) await this.sessions.clearWorkspace(session.workspaceId)
    if (!response.ok) throw await responseError(response)
    return await response.json() as T
  }
}
