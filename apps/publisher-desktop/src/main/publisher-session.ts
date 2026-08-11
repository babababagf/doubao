import { app, safeStorage } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { emptyWorkspaceSessionVault, isWorkspaceId, removeWorkspaceSession, upsertWorkspaceSession, validWorkspaceSessions, type WorkspaceSessionRecord, type WorkspaceSessionVault } from '../shared/workspace-session-model'

type LegacyPublisherSession = { accessToken: string; username: string; expiresAt: string }
export type PublisherWorkspaceSummary = { workspaceId: string; username: string; expiresAt: string }
export type PublisherSessionStatus = {
  connected: boolean
  activeWorkspaceId: string | null
  username: string | null
  expiresAt: string | null
  protectionAvailable: boolean
  requiresWorkspaceSelection: boolean
  workspaces: PublisherWorkspaceSummary[]
}

export class PublisherSessionStore {
  private readonly filePath = join(app.getPath('userData'), 'publisher-session.bin')
  private activeId: string | null = null
  private initialSelectionResolved = false

  async status(): Promise<PublisherSessionStatus> {
    const vault = await this.readVault()
    if (!this.initialSelectionResolved) {
      if (vault.sessions.length === 1) this.activeId = vault.sessions[0]!.workspaceId
      this.initialSelectionResolved = true
    }
    if (this.activeId && !vault.sessions.some((session) => session.workspaceId === this.activeId)) this.activeId = null
    const active = vault.sessions.find((session) => session.workspaceId === this.activeId) ?? null
    return {
      connected: Boolean(active),
      activeWorkspaceId: active?.workspaceId ?? null,
      username: active?.username ?? null,
      expiresAt: active?.expiresAt ?? null,
      protectionAvailable: safeStorage.isEncryptionAvailable(),
      requiresWorkspaceSelection: vault.sessions.length > 1 && !active,
      workspaces: vault.sessions.map(({ workspaceId, username, expiresAt }) => ({ workspaceId, username, expiresAt })),
    }
  }

  async load(): Promise<WorkspaceSessionRecord | null> {
    const status = await this.status()
    if (!status.activeWorkspaceId) return null
    return this.loadWorkspace(status.activeWorkspaceId)
  }

  async list(): Promise<WorkspaceSessionRecord[]> { return [...(await this.readVault()).sessions] }

  async loadWorkspace(workspaceId: string): Promise<WorkspaceSessionRecord | null> {
    if (!isWorkspaceId(workspaceId)) return null
    return (await this.readVault()).sessions.find((session) => session.workspaceId === workspaceId) ?? null
  }

  async activeWorkspaceId(): Promise<string | null> { return (await this.status()).activeWorkspaceId }

  async save(session: LegacyPublisherSession): Promise<WorkspaceSessionRecord> {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('当前 Windows 用户环境不支持安全存储，不能保存发布助手会话')
    const result = upsertWorkspaceSession(await this.readVault(), session, randomUUID)
    await this.writeVault(result.vault)
    this.activeId = result.session.workspaceId
    return result.session
  }

  async activate(workspaceId: string): Promise<void> {
    if (!isWorkspaceId(workspaceId) || !(await this.readVault()).sessions.some((session) => session.workspaceId === workspaceId)) throw new Error('工作区不存在或会话已失效')
    this.activeId = workspaceId
  }

  deactivate(): void { this.activeId = null }

  async clearActive(): Promise<void> {
    const workspaceId = await this.activeWorkspaceId()
    if (!workspaceId) return
    await this.clearWorkspace(workspaceId)
  }

  async clearWorkspace(workspaceId: string): Promise<void> {
    if (!isWorkspaceId(workspaceId)) return
    await this.writeVault(removeWorkspaceSession(await this.readVault(), workspaceId))
    if (this.activeId === workspaceId) this.activeId = null
  }

  private async readVault(): Promise<WorkspaceSessionVault> {
    if (!safeStorage.isEncryptionAvailable()) return emptyWorkspaceSessionVault()
    try {
      const encrypted = await readFile(this.filePath)
      const value = JSON.parse(safeStorage.decryptString(encrypted)) as WorkspaceSessionVault | LegacyPublisherSession
      if ('version' in value && value.version === 2) {
        const sessions = validWorkspaceSessions(value)
        if (sessions.length !== value.sessions.length) await this.writeVault({ version: 2, sessions })
        return { version: 2, sessions }
      }
      if ('accessToken' in value && value.accessToken && value.username && value.expiresAt && new Date(value.expiresAt) > new Date()) {
        const migrated = upsertWorkspaceSession(emptyWorkspaceSessionVault(), value, randomUUID).vault
        await this.writeVault(migrated)
        return migrated
      }
      await this.clearFile()
      return emptyWorkspaceSessionVault()
    } catch { return emptyWorkspaceSessionVault() }
  }

  private async writeVault(vault: WorkspaceSessionVault): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('当前 Windows 用户环境不支持安全存储，不能保存发布助手会话')
    await mkdir(app.getPath('userData'), { recursive: true })
    const temporary = `${this.filePath}.tmp`
    await writeFile(temporary, safeStorage.encryptString(JSON.stringify(vault)))
    await rename(temporary, this.filePath)
  }

  private async clearFile(): Promise<void> { await rm(this.filePath, { force: true }) }
}
