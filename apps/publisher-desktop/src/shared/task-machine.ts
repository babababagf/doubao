export type DesktopTaskStatus = 'queued' | 'running' | 'paused' | 'succeeded' | 'failed' | 'stopped' | 'attention'
export type MediaPlatformName = 'toutiao' | 'douyin'
export type PublisherAttentionReason = 'login_required' | 'captcha_required' | 'manual_confirmation' | 'platform_changed' | 'assets_missing' | 'content_invalid' | 'fill_failed' | 'submission_unknown' | 'submission_rejected' | 'lease_expired'

export interface DesktopTask {
  id: string
  platform: MediaPlatformName
  mediaAccountLocalReferenceId: string | null
  mediaAccountName: string | null
  title: string
  status: DesktopTaskStatus
  createdAt: string
  updatedAt: string
  attemptCount: number
  failureReason: string | null
  attentionReason: PublisherAttentionReason | null
  canResume: boolean
  canResolvePublished: boolean
  pendingResultUrl: string | null
}

export interface DesktopState {
  version: 8
  queuePaused: boolean
  tasks: DesktopTask[]
  logs: string[]
  accounts: LocalMediaAccount[]
  settings: DesktopSettings
}
export interface LocalMediaAccount { remoteAccountId: string | null; localReferenceId: string; platform: MediaPlatformName; status: 'connected' | 'verification_required' | 'connection_requested'; maskedName: string; checkedAt: string | null; reason: string | null; backupAvailable: boolean; backupCapturedAt: string | null }
export interface DesktopSettings { pollIntervalSeconds: 30; finalConfirmationRequired: false; automaticSubmissionEnabled: true; localLogRetentionDays: 14 }
export interface SyncedPublisherTask { id: string; platform: MediaPlatformName; status: 'queued' | 'running' | 'attention'; createdAt: string; failureReason: string | null; attentionReason: PublisherAttentionReason | null; canResume: boolean; canResolvePublished: boolean; attemptCount: number; targetAccount: { localReferenceId: string | null; maskedName: string | null }; article: { version: number; title: string } }
export interface SyncedPublisherAccount { id: string | null; platform: MediaPlatformName; status: string; maskedName: string | null; localReferenceId: string | null; lastVerifiedAt: string | null; failureReason: string | null; backupAvailable: boolean; backupCapturedAt: string | null }

export function createInitialState(): DesktopState {
  return {
    version: 8,
    queuePaused: false,
    tasks: [],
    logs: ['尚未连接任务服务，不展示演示发布数据'],
    accounts: [],
    settings: { pollIntervalSeconds: 30, finalConfirmationRequired: false, automaticSubmissionEnabled: true, localLogRetentionDays: 14 },
  }
}

export function transitionTask(state: DesktopState, taskId: string, next: DesktopTaskStatus): DesktopState {
  void state; void taskId; void next
  throw new Error('发布任务状态只能由任务服务确认，本机不能伪造重试、失败或成功')
}

export function toggleQueuePause(state: DesktopState): DesktopState {
  const queuePaused = !state.queuePaused
  return { ...state, queuePaused, logs: [queuePaused ? '已开启人工暂停，未领取新任务' : '已恢复本地任务轮询', ...state.logs].slice(0, 100) }
}

export function syncPublisherTasks(state: DesktopState, remote: SyncedPublisherTask[]): DesktopState {
  const existing = new Map(state.tasks.map((task) => [task.id, task]))
  const tasks = remote.map((task) => ({ id: task.id, platform: task.platform, mediaAccountLocalReferenceId: task.targetAccount.localReferenceId, mediaAccountName: task.targetAccount.maskedName, title: `V${task.article.version} · ${task.article.title}`, status: task.status, createdAt: task.createdAt, updatedAt: new Date().toISOString(), attemptCount: task.attemptCount, failureReason: task.failureReason, attentionReason: task.attentionReason, canResume: task.canResume, canResolvePublished: task.canResolvePublished, pendingResultUrl: existing.get(task.id)?.pendingResultUrl ?? null }))
  return { ...state, tasks, logs: [`已同步 ${tasks.length} 个云端待处理任务；按任务指定媒体账号执行`, ...state.logs].slice(0, 100) }
}

export function syncPublisherAccounts(state: DesktopState, remote: SyncedPublisherAccount[]): DesktopState {
  const existing = new Map(state.accounts.map((account) => [account.localReferenceId, account]))
  const remoteAccounts = remote.flatMap((item): LocalMediaAccount[] => {
    if (!item.id || !item.localReferenceId || !item.maskedName || !['connected', 'verification_required', 'connection_requested'].includes(item.status)) return []
    const local = existing.get(item.localReferenceId)
    return [{
      remoteAccountId: item.id,
      localReferenceId: item.localReferenceId,
      platform: item.platform,
      status: item.status as LocalMediaAccount['status'],
      maskedName: item.maskedName,
      checkedAt: item.lastVerifiedAt,
      reason: item.failureReason ?? (item.backupAvailable ? '云端存在可恢复的加密会话备份' : local?.reason ?? null),
      backupAvailable: item.backupAvailable,
      backupCapturedAt: item.backupCapturedAt,
    }]
  })
  const remoteReferences = new Set(remoteAccounts.map((account) => account.localReferenceId))
  const pendingLocalAccounts = state.accounts.filter((account) => !remoteReferences.has(account.localReferenceId) && account.remoteAccountId === null && account.status === 'connection_requested')
  const accounts = [...remoteAccounts, ...pendingLocalAccounts]
  return { ...state, accounts, logs: [`已同步 ${accounts.length} 个媒体账号；云端会话只在目标账号需要时恢复`, ...state.logs].slice(0, 100) }
}

export function reconcileLocalAccountAvailability(
  state: DesktopState,
  hasLocalProfile: (account: LocalMediaAccount) => boolean,
): DesktopState {
  const unavailable = state.accounts.filter((account) => account.status === 'connected' && !account.backupAvailable && !hasLocalProfile(account))
  if (!unavailable.length) return state
  const unavailableReferences = new Set(unavailable.map((account) => account.localReferenceId))
  const accounts = state.accounts.map((account): LocalMediaAccount => unavailableReferences.has(account.localReferenceId)
    ? { ...account, status: 'verification_required', reason: '当前电脑没有该账号的独立浏览器资料，云端也没有可恢复的加密会话；请重新扫码验证' }
    : account)
  return { ...state, accounts, logs: [`${unavailable.length} 个云端已连接账号在当前电脑缺少本地资料和可恢复备份，已要求重新验证`, ...state.logs].slice(0, 100) }
}

export function requestLocalAccountConnect(state: DesktopState, platform: MediaPlatformName, localReferenceId: string, label: string): DesktopState {
  if (state.accounts.some((account) => account.localReferenceId === localReferenceId)) throw new Error('媒体账号引用已存在')
  const account: LocalMediaAccount = { remoteAccountId: null, localReferenceId, platform, status: 'connection_requested', maskedName: label, checkedAt: null, reason: '已打开该账号独立的本机扫码窗口，等待完成平台登录', backupAvailable: false, backupCapturedAt: null }
  return { ...state, accounts: [...state.accounts, account], logs: [`${label} 已请求本地扫码连接`, ...state.logs].slice(0, 100) }
}

export function recordLocalAccountConnected(state: DesktopState, localReferenceId: string): DesktopState {
  const account = requireAccount(state, localReferenceId)
  const next: LocalMediaAccount = { ...account, status: 'connected', checkedAt: new Date().toISOString(), reason: '已验证该独立资料可以进入平台发布页；正在生成加密可移植会话备份' }
  return updateAccount(state, next, `${account.maskedName} 已通过平台发布页能力验证`)
}

export function recordMediaSessionBackup(state: DesktopState, localReferenceId: string, result: { available: boolean; capturedAt?: string; reason?: string }): DesktopState {
  const account = requireAccount(state, localReferenceId)
  const next: LocalMediaAccount = {
    ...account,
    backupAvailable: result.available,
    backupCapturedAt: result.available ? result.capturedAt ?? new Date().toISOString() : account.backupCapturedAt,
    reason: result.available ? '平台登录已验证，云端加密会话备份已更新' : result.reason ?? '平台登录已验证，但云端会话备份失败',
  }
  return updateAccount(state, next, result.available ? `${account.maskedName} 已更新云端加密会话备份` : `${account.maskedName} 云端会话备份失败；当前电脑仍可继续使用`)
}

export function recordMediaSessionBackupRefreshFailure(state: DesktopState, localReferenceId: string, reason?: string): DesktopState {
  const account = requireAccount(state, localReferenceId)
  const message = account.backupAvailable
    ? `本次云端会话备份刷新失败，仍保留 ${account.backupCapturedAt ? '上次' : '已有'} 加密备份；当前电脑可继续使用`
    : reason ?? '平台登录已验证，但首次云端会话备份失败'
  const next: LocalMediaAccount = { ...account, reason: message }
  return updateAccount(state, next, `${account.maskedName} 云端会话备份刷新失败；${account.backupAvailable ? '未删除已有备份' : '尚无可恢复备份'}`)
}

export function recordLocalLoginStillRequired(state: DesktopState, localReferenceId: string, reason = '当前资料仍需登录或未识别到平台发布控件，请完成验证后重试'): DesktopState {
  const account = requireAccount(state, localReferenceId)
  const next: LocalMediaAccount = { ...account, status: 'verification_required', checkedAt: new Date().toISOString(), reason }
  return updateAccount(state, next, `${account.maskedName} 未通过平台发布页能力验证`)
}

export function recordLocalPublisherOpen(state: DesktopState, localReferenceId: string): DesktopState {
  const account = requireAccount(state, localReferenceId)
  return { ...state, logs: [`${account.maskedName} 已打开本地发布页，尚未提交内容`, ...state.logs].slice(0, 100) }
}

export function recordLocalBrowserStartFailure(state: DesktopState, localReferenceId: string): DesktopState {
  const account = requireAccount(state, localReferenceId)
  const next: LocalMediaAccount = { ...account, status: 'verification_required', checkedAt: new Date().toISOString(), reason: '本机浏览器无法启动，请确认 Chrome 或 Edge 可用后重试' }
  return updateAccount(state, next, `${account.maskedName} 本机浏览器启动失败，未读取或上传任何凭据`)
}

export function recordPendingPublicationResult(state: DesktopState, taskId: string, resultUrl: string): DesktopState {
  const task = state.tasks.find((item) => item.id === taskId)
  if (!task || task.status !== 'running') throw new Error('只有执行中的任务可以保存待回传发布结果')
  return { ...state, tasks: state.tasks.map((item) => item.id === taskId ? { ...item, pendingResultUrl: resultUrl, updatedAt: new Date().toISOString() } : item), logs: [`${task.title} 已取得平台公开链接，等待回传任务服务；不会再次发布`, ...state.logs].slice(0, 100) }
}

function requireAccount(state: DesktopState, localReferenceId: string): LocalMediaAccount {
  const account = state.accounts.find((item) => item.localReferenceId === localReferenceId)
  if (!account) throw new Error('媒体账号不存在')
  return account
}

function updateAccount(state: DesktopState, next: LocalMediaAccount, log: string): DesktopState {
  return { ...state, accounts: state.accounts.map((account) => account.localReferenceId === next.localReferenceId ? next : account), logs: [log, ...state.logs].slice(0, 100) }
}
