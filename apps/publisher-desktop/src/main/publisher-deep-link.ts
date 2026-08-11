export const publisherProtocol = 'doubaohk-publisher'
export const publisherMediaLink = `${publisherProtocol}://open/media`
export const publisherTasksLink = `${publisherProtocol}://open/tasks`
export type PublisherLinkTarget = 'media' | 'tasks'

export function publisherLinkTarget(args: readonly string[]): PublisherLinkTarget | null {
  for (const value of args) {
    try {
      const url = new URL(value)
      if (url.protocol !== `${publisherProtocol}:` || url.hostname !== 'open' || url.search || url.hash || url.username || url.password) continue
      if (url.pathname === '/media') return 'media'
      if (url.pathname === '/tasks') return 'tasks'
    } catch { /* 不是 URL 的进程参数直接忽略 */ }
  }
  return null
}
