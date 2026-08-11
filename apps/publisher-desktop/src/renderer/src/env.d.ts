/// <reference types="vite/client" />

import type { DesktopState } from '../../shared/task-machine'
import type { DesktopUpdateStatus } from '../../shared/update-policy'

type PublisherSession = {
  connected: boolean
  activeWorkspaceId: string | null
  username: string | null
  expiresAt: string | null
  protectionAvailable: boolean
  requiresWorkspaceSelection: boolean
  workspaces: Array<{ workspaceId: string; username: string; expiresAt: string }>
}

type TaskPreview = {
  id: string
  platform: 'toutiao' | 'douyin'
  article: { version: number; title: string; content: string; imageCount: number; galleryImageIds: string[] }
  images: {
    requiredCount: number
    availability: 'not_required' | 'legacy_snapshot_missing' | 'source_missing' | 'ready'
    images: Array<{ id: string; fileName: string; mimeType: string }>
    missingImageIds: string[]
  }
}

declare global {
  interface Window {
    publisherDesktop: {
      getStatus(): Promise<{
        version: string
        platform: string
        deviceProtection: { available: boolean; initialized: boolean }
        publisherSession: PublisherSession
      } | null>
      getUpdateStatus(): Promise<DesktopUpdateStatus | null>
      checkUpdate(): Promise<DesktopUpdateStatus | null>
      downloadUpdate(): Promise<DesktopUpdateStatus | null>
      installUpdate(): Promise<DesktopUpdateStatus | null>
      rendererReady(): Promise<boolean>
      getState(): Promise<DesktopState | null>
      publisherLogin(username: string, password: string): Promise<{ ok: boolean; message?: string; session?: PublisherSession; state?: DesktopState }>
      publisherLogout(): Promise<PublisherSession | null>
      selectWorkspace(workspaceId: string): Promise<{ session: PublisherSession; state: DesktopState } | null>
      showWorkspaceChooser(): Promise<PublisherSession | null>
      publisherSync(): Promise<DesktopState | null>
      togglePause(): Promise<DesktopState | null>
      requestConnect(platform: 'toutiao' | 'douyin', label: string): Promise<DesktopState | null>
      confirmConnect(localReferenceId: string): Promise<DesktopState | null>
      openPublisher(localReferenceId: string): Promise<DesktopState | null>
      taskPreview(taskId: string): Promise<TaskPreview | null>
      publisherResolvePublished(taskId: string, resultUrl: string): Promise<{ state: DesktopState | null; message: string | null } | null>
      onStateUpdated(callback: (state: DesktopState) => void): () => void
      onSessionUpdated(callback: (session: PublisherSession) => void): () => void
      onOpenPage(callback: (target: 'media' | 'tasks') => void): () => void
    }
  }
}
