import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

import { isAllowedUpdateFeed, isValidUpdateVersion, isVersionBelow, resolveUpdateReleaseNotes, type DesktopUpdateStatus, type RemoteUpdatePolicy } from '../shared/update-policy'

export class UpdateManager {
  private current: DesktopUpdateStatus = { phase: 'not_configured', version: null, message: '总后台尚未配置发布助手更新策略', releaseNotes: '' }
  private minimumVersion: string | null = null
  private configuredReleaseNotes = ''

  constructor() {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.on('checking-for-update', () => this.set({ phase: 'checking', version: null, message: '正在检查可信更新清单', releaseNotes: '' }))
    autoUpdater.on('update-available', (info) => {
      if (this.minimumVersion && isVersionBelow(info.version, this.minimumVersion)) return this.set({ phase: 'blocked', version: info.version, message: `更新包低于平台最低版本 ${this.minimumVersion}，已阻断安装`, releaseNotes: '' })
      this.set({ phase: 'available', version: info.version, message: '发现可用更新，需由用户确认下载', releaseNotes: resolveUpdateReleaseNotes(info.releaseNotes, this.configuredReleaseNotes) })
    })
    autoUpdater.on('update-not-available', () => {
      if (this.minimumVersion && isVersionBelow(app.getVersion(), this.minimumVersion)) return this.set({ phase: 'blocked', version: app.getVersion(), message: `当前版本低于平台要求的 ${this.minimumVersion}，但未发现合规更新包`, releaseNotes: '' })
      this.set({ phase: 'up_to_date', version: app.getVersion(), message: '当前已是最新版本', releaseNotes: '' })
    })
    autoUpdater.on('download-progress', (progress) => this.set({ phase: 'downloading', version: this.current.version, message: `正在下载更新：${Math.round(progress.percent)}%`, releaseNotes: this.current.releaseNotes }))
    autoUpdater.on('update-downloaded', (info) => this.set({ phase: 'ready_to_install', version: info.version, message: '更新已下载，需由用户确认重启安装', releaseNotes: resolveUpdateReleaseNotes(info.releaseNotes, this.current.releaseNotes || this.configuredReleaseNotes) }))
    autoUpdater.on('error', (error) => this.set({ phase: 'failed', version: null, message: safeErrorMessage(error), releaseNotes: '' }))
  }

  status(): DesktopUpdateStatus { return this.current }

  async check(policy: RemoteUpdatePolicy): Promise<DesktopUpdateStatus> {
    if (!app.isPackaged) return this.set({ phase: 'blocked', version: null, message: '本地开发包不检查在线更新', releaseNotes: '' })
    if (!policy.enabled || !isAllowedUpdateFeed(policy.feedUrl)) return this.set({ phase: 'not_configured', version: null, message: '总后台尚未启用可信更新源', releaseNotes: '' })
    if (policy.minimumVersion && !isValidUpdateVersion(policy.minimumVersion)) return this.set({ phase: 'blocked', version: null, message: '总后台最低版本格式无效，已阻断更新', releaseNotes: '' })
    this.minimumVersion = policy.minimumVersion
    this.configuredReleaseNotes = policy.releaseNotes.trim().slice(0, 2_000)
    try {
      autoUpdater.setFeedURL({ provider: 'generic', url: policy.feedUrl })
      this.set({ phase: 'checking', version: null, message: '正在检查可信更新清单', releaseNotes: '' })
      await autoUpdater.checkForUpdates()
      return this.current
    } catch (error) {
      return this.set({ phase: 'failed', version: null, message: safeErrorMessage(error), releaseNotes: '' })
    }
  }

  async download(): Promise<DesktopUpdateStatus> {
    if (this.current.phase !== 'available') return this.current
    try {
      this.set({ ...this.current, phase: 'downloading', message: '正在下载更新' })
      await autoUpdater.downloadUpdate()
      return this.current
    } catch (error) {
      return this.set({ phase: 'failed', version: null, message: safeErrorMessage(error), releaseNotes: '' })
    }
  }

  install(canInstall: boolean): DesktopUpdateStatus {
    if (this.current.phase !== 'ready_to_install') return this.current
    if (!canInstall) return this.set({ ...this.current, phase: 'blocked', message: '存在本地浏览器会话、执行中任务或待人工处理任务，不能安装更新' })
    autoUpdater.quitAndInstall(false, true)
    return this.current
  }

  private set(next: DesktopUpdateStatus): DesktopUpdateStatus {
    this.current = next
    return next
  }
}

function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : '更新检查失败'
  return raw.replace(/https?:\/\/\S+/gi, '更新源').slice(0, 180)
}
