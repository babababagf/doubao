import { app } from 'electron'
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { isWorkspaceId } from '../shared/workspace-session-model'
import { createInitialState, type DesktopState } from '../shared/task-machine'

type StoredDesktopState = Omit<DesktopState, 'version'> & { version?: number }

export class LocalStateStore {
  private readonly states = new Map<string, DesktopState>()
  private readonly mutationTails = new Map<string, Promise<void>>()
  private readonly legacyFilePath = join(app.getPath('userData'), 'publisher-state.json')
  private readonly olderLegacyFilePath = join(app.getPath('userData'), 'publisher-mock-state.json')
  private readonly migrationMarkerPath = join(app.getPath('userData'), 'workspaces', '.legacy-state-claimed')

  async load(workspaceId: string): Promise<DesktopState> {
    this.requireWorkspaceId(workspaceId)
    const cached = this.states.get(workspaceId)
    if (cached) return cached
    try {
      const stored = await this.readStoredState(workspaceId)
      const parsed = JSON.parse(stored.content) as StoredDesktopState
      if (!Array.isArray(parsed.tasks) || !Array.isArray(parsed.logs) || !Array.isArray(parsed.accounts) || !parsed.settings) throw new Error('invalid state')
      if (parsed.version === 1 || parsed.version === 2) {
        const upgraded = createInitialState()
        this.states.set(workspaceId, { ...upgraded, accounts: this.upgradeAccounts(parsed.accounts), logs: ['已清除旧版演示/本地任务状态，请连接任务服务后同步真实任务', ...parsed.logs].slice(0, 100) })
        await this.save(workspaceId)
      } else if (parsed.version === 3) {
        const upgraded = createInitialState()
        this.states.set(workspaceId, { ...upgraded, logs: ['旧版平台级浏览器资料未自动归属到新媒体账号，请为各账号重新完成一次本机登录', ...parsed.logs].slice(0, 100) })
        await this.save(workspaceId)
      } else if (parsed.version === 4) {
        const upgraded = createInitialState()
        this.states.set(workspaceId, { ...upgraded, queuePaused: parsed.queuePaused, accounts: this.upgradeAccounts(parsed.accounts), tasks: parsed.tasks.map((task) => ({ ...task, pendingResultUrl: null, attentionReason: null, canResume: false, canResolvePublished: false })), logs: ['发布助手状态已升级为全自动发布安全状态；平台成功链接会先落本机再回传', ...parsed.logs].slice(0, 100) })
        await this.save(workspaceId)
      } else if (parsed.version === 5) {
        const upgraded = createInitialState()
        this.states.set(workspaceId, { ...upgraded, queuePaused: parsed.queuePaused, tasks: parsed.tasks.map((task) => ({ ...task, attentionReason: null, canResume: false, canResolvePublished: false })), accounts: this.upgradeAccounts(parsed.accounts), logs: ['发布助手状态已升级为跨电脑媒体会话恢复版本；正在从任务服务同步账号标识', ...parsed.logs].slice(0, 100) })
        await this.save(workspaceId)
      } else if (parsed.version === 6) {
        const upgraded = createInitialState()
        this.states.set(workspaceId, { ...upgraded, queuePaused: parsed.queuePaused, accounts: this.upgradeAccounts(parsed.accounts), tasks: parsed.tasks.map((task) => ({ ...task, attentionReason: null, canResume: false, canResolvePublished: false })), logs: ['发布助手状态已升级为可审计的安全续发版本；正在从任务服务同步异常原因', ...parsed.logs].slice(0, 100) })
        await this.save(workspaceId)
      } else if (parsed.version === 7) {
        const upgraded = createInitialState()
        this.states.set(workspaceId, { ...upgraded, queuePaused: parsed.queuePaused, accounts: this.upgradeAccounts(parsed.accounts), tasks: parsed.tasks.map((task) => ({ ...task, canResolvePublished: false })), logs: ['发布助手状态已升级为异常结果人工核验版本；正在从任务服务同步可核验范围', ...parsed.logs].slice(0, 100) })
        await this.save(workspaceId)
      } else if (parsed.version === 8) {
        this.states.set(workspaceId, parsed as DesktopState)
        if (stored.isLegacy) await this.save(workspaceId)
      } else throw new Error('unsupported state version')
    } catch {
      this.states.set(workspaceId, createInitialState())
      await this.save(workspaceId)
    }
    return this.states.get(workspaceId)!
  }

  async mutate(workspaceId: string, change: (state: DesktopState) => DesktopState): Promise<DesktopState> {
    this.requireWorkspaceId(workspaceId)
    const tail = this.mutationTails.get(workspaceId) ?? Promise.resolve()
    const operation = tail.then(async () => {
      const next = change(await this.load(workspaceId))
      this.states.set(workspaceId, next)
      await this.save(workspaceId)
      return next
    })
    this.mutationTails.set(workspaceId, operation.then(() => undefined, () => undefined))
    return operation
  }

  private async save(workspaceId: string): Promise<void> {
    const state = this.states.get(workspaceId)
    if (!state) return
    const filePath = this.workspaceFilePath(workspaceId)
    await mkdir(dirname(filePath), { recursive: true })
    const temporary = `${filePath}.tmp`
    await writeFile(temporary, JSON.stringify(state), 'utf8')
    await rename(temporary, filePath)
  }

  private async readStoredState(workspaceId: string): Promise<{ content: string; isLegacy: boolean }> {
    try { return { content: await readFile(this.workspaceFilePath(workspaceId), 'utf8'), isLegacy: false } }
    catch {
      try { await access(this.migrationMarkerPath); throw new Error('legacy already claimed') } catch (error) { if (error instanceof Error && error.message === 'legacy already claimed') throw error }
      await mkdir(dirname(this.migrationMarkerPath), { recursive: true })
      try { await writeFile(this.migrationMarkerPath, workspaceId, { encoding: 'utf8', flag: 'wx' }) } catch { throw new Error('legacy already claimed') }
      let content: string
      try { content = await readFile(this.legacyFilePath, 'utf8') } catch { content = await readFile(this.olderLegacyFilePath, 'utf8') }
      return { content, isLegacy: true }
    }
  }

  private workspaceFilePath(workspaceId: string): string { return join(app.getPath('userData'), 'workspaces', workspaceId, 'publisher-state.json') }
  private upgradeAccounts(accounts: DesktopState['accounts']): DesktopState['accounts'] {
    return accounts.map((account) => ({ ...account, remoteAccountId: account.remoteAccountId ?? null, backupAvailable: account.backupAvailable ?? false, backupCapturedAt: account.backupCapturedAt ?? null }))
  }
  private requireWorkspaceId(workspaceId: string): void { if (!isWorkspaceId(workspaceId)) throw new Error('工作区标识无效') }
}
