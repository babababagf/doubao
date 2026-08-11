import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { LocalStateStore } from './local-state'
import { LocalDeviceIdentityStore } from './local-device'
import { MediaSessionManager } from './media-session'
import { PublisherApi, type PublisherAttentionReason } from './publisher-api'
import { safeAttentionReasonForSubmissionFailure, selectNextExecutableTask } from './publication-safety'
import { PublisherSessionStore } from './publisher-session'
import { UpdateManager } from './update-manager'
import { WorkspaceTaskPoller } from './workspace-poller'
import { cleanupPublisherAssets, downloadPublisherImages } from './publisher-assets'
import { publisherLinkTarget, publisherProtocol, type PublisherLinkTarget } from './publisher-deep-link'
import { validateLocalArticleDraft } from '../shared/publish-draft'
import { decideMediaConnectionProbe } from '../shared/media-connection-monitor'
import { recoverableTaskIdsForVerifiedAccount } from '../shared/automatic-task-recovery'
import { reconcileLocalAccountAvailability, recordLocalAccountConnected, recordLocalBrowserStartFailure, recordLocalLoginStillRequired, recordLocalPublisherOpen, recordMediaSessionBackup, recordMediaSessionBackupRefreshFailure, recordPendingPublicationResult, requestLocalAccountConnect, syncPublisherAccounts, syncPublisherTasks, toggleQueuePause, type LocalMediaAccount } from '../shared/task-machine'
import type { MediaPlatform } from '../shared/media-platform'

let mainWindow: BrowserWindow | null = null
const deviceIdentity = new LocalDeviceIdentityStore()
const publisherSessions = new PublisherSessionStore()
const workspaceStates = new LocalStateStore()
const mediaSessions = new MediaSessionManager()
const publisherApi = new PublisherApi(publisherSessions)
const updates = new UpdateManager()
let closingMediaSessions = false
let pendingPage: PublisherLinkTarget | null = null
let rendererReady = false
const taskHeartbeats = new Map<string, { taskId: string; timer: NodeJS.Timeout }>()
const workspaceExecutions = new Set<string>()
const mediaConnectionMonitors = new Map<string, NodeJS.Timeout>()
const mediaConnectionFinalizations = new Set<string>()

async function requireActiveWorkspaceId(): Promise<string> {
  const workspaceId = await publisherSessions.activeWorkspaceId()
  if (!workspaceId) throw new Error('请先登录或选择商户工作区')
  return workspaceId
}

function stopTaskHeartbeat(workspaceId?: string, taskId?: string): void {
  if (!workspaceId) {
    for (const heartbeat of taskHeartbeats.values()) clearInterval(heartbeat.timer)
    taskHeartbeats.clear()
    return
  }
  const heartbeat = taskHeartbeats.get(workspaceId)
  if (!heartbeat || (taskId && heartbeat.taskId !== taskId)) return
  clearInterval(heartbeat.timer)
  taskHeartbeats.delete(workspaceId)
}

function startTaskHeartbeat(workspaceId: string, taskId: string): void {
  stopTaskHeartbeat(workspaceId)
  const heartbeat = () => {
    void publisherApi.heartbeat(taskId, workspaceId).catch(() => stopTaskHeartbeat(workspaceId, taskId))
  }
  taskHeartbeats.set(workspaceId, { taskId, timer: setInterval(heartbeat, 60_000) })
  heartbeat()
}

function mediaConnectionKey(workspaceId: string, localReferenceId: string): string { return `${workspaceId}:${localReferenceId}` }

function stopMediaConnectionMonitor(workspaceId: string, localReferenceId: string): void {
  const key = mediaConnectionKey(workspaceId, localReferenceId)
  const monitor = mediaConnectionMonitors.get(key)
  if (monitor) clearInterval(monitor)
  mediaConnectionMonitors.delete(key)
}

function stopWorkspaceMediaConnectionMonitors(workspaceId?: string): void {
  for (const [key, monitor] of mediaConnectionMonitors) {
    if (workspaceId && !key.startsWith(`${workspaceId}:`)) continue
    clearInterval(monitor)
    mediaConnectionMonitors.delete(key)
  }
}

function sendActiveState(workspaceId: string, state: Awaited<ReturnType<LocalStateStore['load']>>): void {
  if (!rendererReady || !mainWindow || mainWindow.isDestroyed()) return
  void publisherSessions.activeWorkspaceId().then((activeWorkspaceId) => {
    if (activeWorkspaceId === workspaceId && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:state-updated', state)
  })
}

function sendSessionStatus(): void {
  if (!rendererReady || !mainWindow || mainWindow.isDestroyed()) return
  void publisherSessions.status().then((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:session-updated', status)
  })
}

async function syncWorkspace(workspaceId: string): Promise<Awaited<ReturnType<LocalStateStore['load']>>> {
  const [bootstrap, tasks] = await Promise.all([publisherApi.bootstrap(workspaceId), publisherApi.tasks(workspaceId)])
  const state = await workspaceStates.mutate(workspaceId, (current) => {
    const synced = syncPublisherTasks(syncPublisherAccounts(current, bootstrap.accounts), tasks)
    return reconcileLocalAccountAvailability(synced, (account) => mediaSessions.hasLocalProfile(workspaceId, account.platform, account.localReferenceId))
  })
  sendActiveState(workspaceId, state)
  return state
}

async function restoreCloudSessionWhenNeeded(workspaceId: string, account: LocalMediaAccount, force = false): Promise<void> {
  if (!force && mediaSessions.hasLocalProfile(workspaceId, account.platform, account.localReferenceId)) return
  if (!account.remoteAccountId || !account.backupAvailable) throw new Error('该媒体账号在本机没有浏览器资料，云端也没有可恢复的会话备份，请先扫码登录')
  const restored = await publisherApi.restoreSessionBackup(account.remoteAccountId, workspaceId)
  if (restored.bundle.platform !== account.platform || restored.bundle.localReferenceId !== account.localReferenceId) throw new Error('云端媒体账号会话与目标账号不匹配')
  await mediaSessions.restorePortableSession(workspaceId, restored.bundle)
}

async function refreshPortableSessionBackup(workspaceId: string, account: LocalMediaAccount, remoteAccountId = account.remoteAccountId): Promise<Awaited<ReturnType<LocalStateStore['load']>>> {
  if (!remoteAccountId) throw new Error('任务服务未返回媒体账号标识，无法刷新云端会话备份')
  const bundle = await mediaSessions.exportPortableSession(workspaceId, account.platform, account.localReferenceId)
  await publisherApi.saveSessionBackup(remoteAccountId, bundle, workspaceId)
  return workspaceStates.mutate(workspaceId, (current) => recordMediaSessionBackup(current, account.localReferenceId, { available: true, capturedAt: bundle.capturedAt }))
}

async function automaticallyResumeVerifiedAccountTasks(workspaceId: string, account: Pick<LocalMediaAccount, 'localReferenceId' | 'platform'>): Promise<void> {
  const taskIds = recoverableTaskIdsForVerifiedAccount(await publisherApi.tasks(workspaceId), account)
  if (!taskIds.length) return
  for (const taskId of taskIds) await publisherApi.resume(taskId, workspaceId)
  await syncWorkspace(workspaceId)
  void executeNextWorkspaceTask(workspaceId)
}

async function finalizeMediaConnection(workspaceId: string, localReferenceId: string): Promise<{ connected: boolean; state: Awaited<ReturnType<LocalStateStore['load']>> | null }> {
  const key = mediaConnectionKey(workspaceId, localReferenceId)
  if (mediaConnectionFinalizations.has(key)) return { connected: false, state: null }
  mediaConnectionFinalizations.add(key)
  try {
    const state = await workspaceStates.load(workspaceId)
    const account = state.accounts.find((item) => item.localReferenceId === localReferenceId)
    if (!account) return { connected: false, state: null }
    const verified = await mediaSessions.verifyPublisherAccess(workspaceId, account.platform, account.localReferenceId).catch((error: unknown) => ({ ok: false as const, reason: error instanceof Error ? error.message : '平台发布页验证失败' }))
    if (!verified.ok) {
      const next = await workspaceStates.mutate(workspaceId, (current) => recordLocalLoginStillRequired(current, account.localReferenceId, verified.reason))
      await publisherApi.accountState(account.platform, account.localReferenceId, account.maskedName, 'verification_required', workspaceId).catch(() => undefined)
      return { connected: false, state: next }
    }
    try {
      await publisherApi.accountState(account.platform, account.localReferenceId, account.maskedName, 'connected', workspaceId)
      await workspaceStates.mutate(workspaceId, (current) => recordLocalAccountConnected(current, account.localReferenceId))
      const bootstrap = await publisherApi.bootstrap(workspaceId)
      const remoteAccount = bootstrap.accounts.find((item) => item.localReferenceId === account.localReferenceId && item.platform === account.platform)
      if (!remoteAccount?.id) {
        const next = await workspaceStates.mutate(workspaceId, (current) => recordMediaSessionBackup(current, account.localReferenceId, { available: false, reason: '平台登录已验证，但任务服务未返回媒体账号标识，无法生成云端会话备份' }))
        return { connected: true, state: next }
      }
      let next: Awaited<ReturnType<LocalStateStore['load']>>
      try {
        next = await refreshPortableSessionBackup(workspaceId, account, remoteAccount.id)
      } catch (error) {
        next = await workspaceStates.mutate(workspaceId, (current) => recordMediaSessionBackupRefreshFailure(current, account.localReferenceId, error instanceof Error ? `平台登录已验证，但云端会话备份失败：${error.message}` : '平台登录已验证，但云端会话备份失败'))
      }
      await automaticallyResumeVerifiedAccountTasks(workspaceId, account).catch(() => undefined)
      return { connected: true, state: next }
    } catch {
      const next = await workspaceStates.mutate(workspaceId, (current) => recordLocalLoginStillRequired(current, account.localReferenceId, '平台发布页已识别，但账号状态未同步到任务服务，请检查网络后重试'))
      return { connected: false, state: next }
    }
  } finally {
    mediaConnectionFinalizations.delete(key)
  }
}

function startMediaConnectionMonitor(workspaceId: string, localReferenceId: string): void {
  stopMediaConnectionMonitor(workspaceId, localReferenceId)
  const key = mediaConnectionKey(workspaceId, localReferenceId)
  let monitorState = { probeCount: 0, candidateCount: 0 }
  const probe = async (): Promise<void> => {
    if (!mediaConnectionMonitors.has(key)) return
    const state = await workspaceStates.load(workspaceId)
    const account = state.accounts.find((item) => item.localReferenceId === localReferenceId)
    if (!account || account.status === 'connected') {
      stopMediaConnectionMonitor(workspaceId, localReferenceId)
      return
    }
    const progress = await mediaSessions.inspectLoginProgress(workspaceId, account.platform, localReferenceId).catch(() => 'not_open' as const)
    const decision = decideMediaConnectionProbe(monitorState, progress)
    monitorState = decision
    if (decision.action === 'stop_closed') {
      stopMediaConnectionMonitor(workspaceId, localReferenceId)
      return
    }
    if (decision.action === 'stop_timeout') {
      monitorState = { probeCount: 0, candidateCount: 0 }
      await workspaceStates.mutate(workspaceId, (current) => recordLocalLoginStillRequired(current, localReferenceId, '等待扫码验证超过 10 分钟，仍在后台监测；完成登录后将自动恢复排队任务')).catch(() => undefined)
      return
    }
    if (decision.action !== 'verify') return
    const result = await finalizeMediaConnection(workspaceId, localReferenceId)
    if (result.connected) stopMediaConnectionMonitor(workspaceId, localReferenceId)
  }
  const monitor = setInterval(() => { void probe() }, 5_000)
  mediaConnectionMonitors.set(key, monitor)
  void probe()
}

async function reportAutomaticAttention(workspaceId: string, taskId: string, reason: PublisherAttentionReason): Promise<void> {
  await publisherApi.attention(taskId, reason, workspaceId).catch(() => undefined)
  stopTaskHeartbeat(workspaceId, taskId)
  if (reason !== 'login_required' && reason !== 'captcha_required') return
  const state = await workspaceStates.load(workspaceId)
  const task = state.tasks.find((item) => item.id === taskId)
  const account = state.accounts.find((item) => item.localReferenceId === task?.mediaAccountLocalReferenceId && item.platform === task?.platform)
  if (!account) return
  await workspaceStates.mutate(workspaceId, (current) => recordLocalLoginStillRequired(current, account.localReferenceId, reason === 'captcha_required' ? '请在已打开的平台窗口完成安全验证；验证通过后助手会自动继续当前任务' : '请在已打开的平台窗口完成登录；验证通过后助手会自动继续当前任务')).catch(() => undefined)
  await publisherApi.accountState(account.platform, account.localReferenceId, account.maskedName, 'verification_required', workspaceId).catch(() => undefined)
  startMediaConnectionMonitor(workspaceId, account.localReferenceId)
}

async function executeNextWorkspaceTask(workspaceId: string): Promise<void> {
  if (workspaceExecutions.has(workspaceId)) return
  const initial = await workspaceStates.load(workspaceId)
  const pendingResult = initial.tasks.find((task) => task.status === 'running' && task.pendingResultUrl)
  if (pendingResult?.pendingResultUrl) {
    workspaceExecutions.add(workspaceId)
    startTaskHeartbeat(workspaceId, pendingResult.id)
    try { await publisherApi.complete(pendingResult.id, pendingResult.pendingResultUrl, workspaceId) }
    catch { return }
    finally {
      stopTaskHeartbeat(workspaceId, pendingResult.id)
      workspaceExecutions.delete(workspaceId)
      await syncWorkspace(workspaceId).catch(() => undefined)
    }
    void executeNextWorkspaceTask(workspaceId)
    return
  }
  if (initial.queuePaused || initial.tasks.some((task) => task.status === 'running' || task.status === 'attention')) return
  const selection = selectNextExecutableTask(initial.tasks, initial.accounts)
  if (!selection) return
  const { task: next, account } = selection

  workspaceExecutions.add(workspaceId)
  let claimedTaskId: string | null = null
  let submissionStarted = false
  let resultPersisted = false
  let bundle: Awaited<ReturnType<typeof downloadPublisherImages>> | null = null
  try {
    const task = await publisherApi.claim(next.id, workspaceId)
    claimedTaskId = task.id
    startTaskHeartbeat(workspaceId, task.id)
    if (!task.targetAccount.localReferenceId || task.targetAccount.localReferenceId !== account.localReferenceId) { await reportAutomaticAttention(workspaceId, task.id, 'platform_changed'); return }
    const validation = validateLocalArticleDraft(task.article.title, task.article.content)
    if (!validation.ok) { await reportAutomaticAttention(workspaceId, task.id, 'content_invalid'); return }
    const manifest = await publisherApi.taskImages(task.id, workspaceId)
    const requiresImages = task.platform === 'douyin' || manifest.requiredCount > 0
    if (requiresImages && (manifest.availability !== 'ready' || manifest.requiredCount < 1 || manifest.requiredCount > 3 || manifest.images.length !== manifest.requiredCount)) { await reportAutomaticAttention(workspaceId, task.id, 'assets_missing'); return }
    if (requiresImages) bundle = await downloadPublisherImages(app.getPath('temp'), manifest.images)
    try { await restoreCloudSessionWhenNeeded(workspaceId, account) }
    catch { await reportAutomaticAttention(workspaceId, task.id, 'login_required'); return }

    const fillDraft = () => task.platform === 'toutiao'
      ? bundle
        ? mediaSessions.fillToutiaoArticleDraftWithImages(workspaceId, validation.draft, bundle.files, account.localReferenceId)
        : mediaSessions.fillToutiaoArticleDraft(workspaceId, validation.draft, account.localReferenceId)
      : mediaSessions.fillDouyinImageDraft(workspaceId, validation.draft, bundle!.files, account.localReferenceId)
    let filled = await fillDraft()
    if (!filled.ok && filled.reason === 'login_required' && account.remoteAccountId && account.backupAvailable) {
      try { await restoreCloudSessionWhenNeeded(workspaceId, account, true) }
      catch { await reportAutomaticAttention(workspaceId, task.id, 'login_required'); return }
      filled = await fillDraft()
    }
    if (!filled.ok) {
      const reason: PublisherAttentionReason = ['login_required', 'captcha_required', 'platform_changed'].includes(filled.reason) ? filled.reason as PublisherAttentionReason : 'fill_failed'
      await reportAutomaticAttention(workspaceId, task.id, reason)
      return
    }

    const published = await mediaSessions.submitPreparedDraft(workspaceId, task.platform, validation.draft.title, account.localReferenceId)
    submissionStarted = published.ok || published.submissionStarted
    if (!published.ok) { await reportAutomaticAttention(workspaceId, task.id, safeAttentionReasonForSubmissionFailure(published)); return }
    if (account.remoteAccountId) {
      try { await refreshPortableSessionBackup(workspaceId, account) }
      catch { await workspaceStates.mutate(workspaceId, (state) => recordMediaSessionBackupRefreshFailure(state, account.localReferenceId)).catch(() => undefined) }
    }
    await workspaceStates.mutate(workspaceId, (state) => recordPendingPublicationResult(state, task.id, published.resultUrl))
    resultPersisted = true
    await publisherApi.complete(task.id, published.resultUrl, workspaceId)
  } catch {
    if (claimedTaskId && !resultPersisted) await reportAutomaticAttention(workspaceId, claimedTaskId, submissionStarted ? 'submission_unknown' : 'platform_changed')
  } finally {
    if (bundle) await cleanupPublisherAssets(app.getPath('temp'), bundle).catch(() => undefined)
    if (claimedTaskId) stopTaskHeartbeat(workspaceId, claimedTaskId)
    workspaceExecutions.delete(workspaceId)
    await syncWorkspace(workspaceId).catch(() => undefined)
    void executeNextWorkspaceTask(workspaceId)
  }
}

const workspacePoller = new WorkspaceTaskPoller(
  () => publisherSessions.list(),
  async (workspaceId) => {
    const state = await syncWorkspace(workspaceId)
    for (const account of state.accounts) {
      if (account.status === 'connected') await automaticallyResumeVerifiedAccountTasks(workspaceId, account).catch(() => undefined)
    }
    void executeNextWorkspaceTask(workspaceId)
  },
  sendSessionStatus,
)

function flushPendingPage(): void {
  if (!pendingPage || !rendererReady || !mainWindow || mainWindow.webContents.isLoading()) return
  mainWindow.webContents.send('desktop:open-page', pendingPage)
  pendingPage = null
}

function showPage(target: PublisherLinkTarget): void {
  pendingPage = target
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  flushPendingPage()
}

function handleProtocolArgs(args: readonly string[]): void {
  const target = publisherLinkTarget(args)
  if (target) showPage(target)
}

function trustedSender(event: Electron.IpcMainInvokeEvent): boolean { return event.sender === mainWindow?.webContents }
function createWindow(): void {
  rendererReady = false
  mainWindow = new BrowserWindow({ width: 1440, height: 920, minWidth: 1120, minHeight: 720, show: false, autoHideMenuBar: true, webPreferences: { preload: join(__dirname, '../preload/index.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { void shell.openExternal(url); return { action: 'deny' } })
  if (process.env.ELECTRON_RENDERER_URL) void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => handleProtocolArgs(commandLine))
  handleProtocolArgs(process.argv)
  app.whenReady().then(() => {
  const developmentEntry = process.argv[1]
  if (process.defaultApp && developmentEntry) app.setAsDefaultProtocolClient(publisherProtocol, process.execPath, [developmentEntry])
  else app.setAsDefaultProtocolClient(publisherProtocol)
  ipcMain.handle('desktop:status', async (event) => trustedSender(event) ? ({ version: app.getVersion(), platform: process.platform, deviceProtection: await deviceIdentity.ensure(), publisherSession: await publisherSessions.status() }) : null)
  ipcMain.handle('desktop:update-status', async (event) => trustedSender(event) ? updates.status() : null)
  ipcMain.handle('desktop:update-check', async (event) => {
    if (!trustedSender(event)) return null
    try { return await updates.check(await publisherApi.updatePolicy()) } catch (error) { return { phase: 'failed', version: null, message: error instanceof Error ? error.message : '读取更新策略失败', releaseNotes: '' } }
  })
  ipcMain.handle('desktop:update-download', async (event) => trustedSender(event) ? updates.download() : null)
  ipcMain.handle('desktop:update-install', async (event) => {
    if (!trustedSender(event)) return null
    const sessions = await publisherSessions.list()
    const states = await Promise.all(sessions.map((session) => workspaceStates.load(session.workspaceId)))
    const canInstall = !mediaSessions.hasOpenSessions() && taskHeartbeats.size === 0 && workspaceExecutions.size === 0 && states.every((state) => state.tasks.every((task) => !['running', 'attention'].includes(task.status)))
    return updates.install(canInstall)
  })
  ipcMain.handle('desktop:renderer-ready', async (event) => {
    if (!trustedSender(event)) return false
    rendererReady = true
    flushPendingPage()
    return true
  })
  ipcMain.handle('desktop:state', async (event) => {
    if (!trustedSender(event)) return null
    const workspaceId = await publisherSessions.activeWorkspaceId()
    return workspaceId ? workspaceStates.load(workspaceId) : null
  })
  ipcMain.handle('desktop:publisher-login', async (event, input: unknown) => {
    if (!trustedSender(event) || !input || typeof input !== 'object') return { ok: false, message: '登录参数无效' }
    const { username, password } = input as { username?: unknown; password?: unknown }
    if (typeof username !== 'string' || typeof password !== 'string' || !/^[a-zA-Z0-9]{6,12}$/.test(username) || !/^[a-zA-Z0-9]{6,12}$/.test(password)) return { ok: false, message: '账号和密码需为 6-12 位英文或数字' }
    const deviceRef = await deviceIdentity.getIdentity()
    if (!deviceRef) return { ok: false, message: '当前 Windows 用户环境不支持安全设备存储，不能登录发布助手' }
    try {
      await publisherApi.login(username, password, deviceRef)
      const workspaceId = await requireActiveWorkspaceId()
      void workspacePoller.runOnce()
      return { ok: true, session: await publisherSessions.status(), state: await workspaceStates.load(workspaceId) }
    } catch (error) { return { ok: false, message: error instanceof Error ? error.message : '发布助手登录失败' } }
  })
  ipcMain.handle('desktop:publisher-workspace-select', async (event, workspaceId: unknown) => {
    if (!trustedSender(event) || typeof workspaceId !== 'string') return null
    try {
      await publisherSessions.activate(workspaceId)
      return { session: await publisherSessions.status(), state: await workspaceStates.load(workspaceId) }
    } catch { return null }
  })
  ipcMain.handle('desktop:publisher-workspace-chooser', async (event) => {
    if (!trustedSender(event)) return null
    publisherSessions.deactivate()
    return publisherSessions.status()
  })
  ipcMain.handle('desktop:publisher-logout', async (event) => {
    if (!trustedSender(event)) return null
    const workspaceId = await publisherSessions.activeWorkspaceId()
    if (workspaceId) {
      stopTaskHeartbeat(workspaceId)
      stopWorkspaceMediaConnectionMonitors(workspaceId)
      await mediaSessions.closeWorkspace(workspaceId)
      await publisherApi.logout(workspaceId)
    }
    return publisherSessions.status()
  })
  ipcMain.handle('desktop:publisher-sync', async (event) => {
    if (!trustedSender(event)) return null
    try { return await syncWorkspace(await requireActiveWorkspaceId()) } catch { return null }
  })
  ipcMain.handle('desktop:toggle-pause', async (event) => trustedSender(event) ? workspaceStates.mutate(await requireActiveWorkspaceId(), toggleQueuePause) : null)
  ipcMain.handle('desktop:request-connect', async (event, input: unknown) => {
    if (!trustedSender(event) || !input || typeof input !== 'object') return null
    const { platform, label } = input as { platform?: unknown; label?: unknown }
    if (!['toutiao', 'douyin'].includes(String(platform)) || typeof label !== 'string' || label.trim().length < 1 || label.trim().length > 50) return null
    const normalizedPlatform = platform as MediaPlatform
    const workspaceId = await requireActiveWorkspaceId()
    const localReferenceId = randomUUID()
    const normalizedLabel = label.trim()
    const next = await workspaceStates.mutate(workspaceId, (state) => requestLocalAccountConnect(state, normalizedPlatform, localReferenceId, normalizedLabel))
    try {
      await mediaSessions.open(workspaceId, normalizedPlatform, 'login', localReferenceId)
    } catch {
      return workspaceStates.mutate(workspaceId, (state) => recordLocalBrowserStartFailure(state, localReferenceId))
    }
    await publisherApi.accountState(normalizedPlatform, localReferenceId, normalizedLabel, 'connection_requested', workspaceId).catch(() => undefined)
    startMediaConnectionMonitor(workspaceId, localReferenceId)
    return next
  })
  ipcMain.handle('desktop:confirm-connect', async (event, localReferenceId: unknown) => {
    if (!trustedSender(event) || typeof localReferenceId !== 'string') return null
    const workspaceId = await requireActiveWorkspaceId()
    stopMediaConnectionMonitor(workspaceId, localReferenceId)
    const result = await finalizeMediaConnection(workspaceId, localReferenceId)
    if (!result.connected) startMediaConnectionMonitor(workspaceId, localReferenceId)
    return result.state
  })
  ipcMain.handle('desktop:open-publisher', async (event, localReferenceId: unknown) => {
    if (!trustedSender(event) || typeof localReferenceId !== 'string') return null
    const workspaceId = await requireActiveWorkspaceId()
    const state = await workspaceStates.load(workspaceId)
    const account = state.accounts.find((item) => item.localReferenceId === localReferenceId)
    if (!account || account.status !== 'connected') return null
    try {
      await restoreCloudSessionWhenNeeded(workspaceId, account)
      const verified = await finalizeMediaConnection(workspaceId, account.localReferenceId)
      if (!verified.connected) return verified.state
      await mediaSessions.open(workspaceId, account.platform, 'publisher', account.localReferenceId)
      return workspaceStates.mutate(workspaceId, (current) => recordLocalPublisherOpen(current, account.localReferenceId))
    } catch {
      return workspaceStates.mutate(workspaceId, (current) => recordLocalBrowserStartFailure(current, account.localReferenceId))
    }
  })
  ipcMain.handle('desktop:task-preview', async (event, taskId: unknown) => {
    if (!trustedSender(event) || typeof taskId !== 'string') return null
    try {
      const workspaceId = await requireActiveWorkspaceId()
      const task = (await publisherApi.tasks(workspaceId)).find((item) => item.id === taskId)
      if (!task) return null
      const manifest = await publisherApi.taskImages(taskId, workspaceId)
      return {
        id: task.id,
        platform: task.platform,
        article: {
          version: task.article.version,
          title: task.article.title,
          content: task.article.content,
          imageCount: task.article.imageCount,
          galleryImageIds: task.article.galleryImageIds,
        },
        images: {
          requiredCount: manifest.requiredCount,
          availability: manifest.availability,
          images: manifest.images.map(({ id, fileName, mimeType }) => ({ id, fileName, mimeType })),
          missingImageIds: manifest.missingImageIds,
        },
      }
    } catch { return null }
  })
  ipcMain.handle('desktop:publisher-resolve-published', async (event, input: unknown) => {
    if (!trustedSender(event) || !input || typeof input !== 'object') return null
    const { taskId, resultUrl } = input as { taskId?: unknown; resultUrl?: unknown }
    if (typeof taskId !== 'string' || typeof resultUrl !== 'string') return null
    try {
      const workspaceId = await requireActiveWorkspaceId()
      await publisherApi.resolvePublished(taskId, resultUrl, workspaceId)
      stopTaskHeartbeat(workspaceId, taskId)
      return { state: await syncWorkspace(workspaceId), message: null }
    } catch (error) { return { state: null, message: error instanceof Error ? error.message : '人工核验结果提交失败' } }
  })
  createWindow()
  workspacePoller.start(30_000)
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  })
}
app.on('before-quit', (event) => {
  if (closingMediaSessions) return
  stopTaskHeartbeat()
  stopWorkspaceMediaConnectionMonitors()
  workspacePoller.stop()
  event.preventDefault()
  closingMediaSessions = true
  void mediaSessions.closeAll().finally(() => app.quit())
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
