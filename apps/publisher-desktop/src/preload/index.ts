import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopState } from '../shared/task-machine'
import type { DesktopUpdateStatus } from '../shared/update-policy'
import type { PublisherSessionStatus } from '../main/publisher-session'
contextBridge.exposeInMainWorld('publisherDesktop', {
  getStatus: () => ipcRenderer.invoke('desktop:status'),
  getUpdateStatus: (): Promise<DesktopUpdateStatus | null> => ipcRenderer.invoke('desktop:update-status'),
  checkUpdate: (): Promise<DesktopUpdateStatus | null> => ipcRenderer.invoke('desktop:update-check'),
  downloadUpdate: (): Promise<DesktopUpdateStatus | null> => ipcRenderer.invoke('desktop:update-download'),
  installUpdate: (): Promise<DesktopUpdateStatus | null> => ipcRenderer.invoke('desktop:update-install'),
  rendererReady: (): Promise<boolean> => ipcRenderer.invoke('desktop:renderer-ready'),
  getState: (): Promise<DesktopState | null> => ipcRenderer.invoke('desktop:state'),
  publisherLogin: (username: string, password: string): Promise<{ ok: boolean; message?: string; session?: PublisherSessionStatus; state?: DesktopState }> => ipcRenderer.invoke('desktop:publisher-login', { username, password }),
  publisherLogout: (): Promise<PublisherSessionStatus | null> => ipcRenderer.invoke('desktop:publisher-logout'),
  selectWorkspace: (workspaceId: string): Promise<{ session: PublisherSessionStatus; state: DesktopState } | null> => ipcRenderer.invoke('desktop:publisher-workspace-select', workspaceId),
  showWorkspaceChooser: (): Promise<PublisherSessionStatus | null> => ipcRenderer.invoke('desktop:publisher-workspace-chooser'),
  publisherSync: (): Promise<DesktopState | null> => ipcRenderer.invoke('desktop:publisher-sync'),
  togglePause: (): Promise<DesktopState | null> => ipcRenderer.invoke('desktop:toggle-pause'),
  requestConnect: (platform: 'toutiao' | 'douyin', label: string): Promise<DesktopState | null> => ipcRenderer.invoke('desktop:request-connect', { platform, label }),
  confirmConnect: (localReferenceId: string): Promise<DesktopState | null> => ipcRenderer.invoke('desktop:confirm-connect', localReferenceId),
  openPublisher: (localReferenceId: string): Promise<DesktopState | null> => ipcRenderer.invoke('desktop:open-publisher', localReferenceId),
  taskPreview: (taskId: string) => ipcRenderer.invoke('desktop:task-preview', taskId),
  publisherResolvePublished: (taskId: string, resultUrl: string): Promise<{ state: DesktopState | null; message: string | null } | null> => ipcRenderer.invoke('desktop:publisher-resolve-published', { taskId, resultUrl }),
  onStateUpdated: (callback: (state: DesktopState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: DesktopState) => callback(state)
    ipcRenderer.on('desktop:state-updated', listener)
    return () => ipcRenderer.removeListener('desktop:state-updated', listener)
  },
  onSessionUpdated: (callback: (session: PublisherSessionStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, session: PublisherSessionStatus) => callback(session)
    ipcRenderer.on('desktop:session-updated', listener)
    return () => ipcRenderer.removeListener('desktop:session-updated', listener)
  },
  onOpenPage: (callback: (target: 'media' | 'tasks') => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, target: 'media' | 'tasks') => callback(target)
    ipcRenderer.on('desktop:open-page', listener)
    return () => ipcRenderer.removeListener('desktop:open-page', listener)
  },
})
