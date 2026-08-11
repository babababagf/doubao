import { describe, expect, it } from 'vitest'
import { publisherLinkTarget, publisherMediaLink, publisherTasksLink } from './publisher-deep-link'

describe('发布助手网页唤起链接', () => {
  it('只接受精确的媒体账号和任务入口', () => {
    expect(publisherMediaLink).toBe('doubaohk-publisher://open/media')
    expect(publisherTasksLink).toBe('doubaohk-publisher://open/tasks')
    expect(publisherLinkTarget(['electron.exe', publisherMediaLink])).toBe('media')
    expect(publisherLinkTarget([publisherTasksLink])).toBe('tasks')
    expect(publisherLinkTarget(['doubaohk-publisher://open/tasks?token=secret'])).toBe(null)
    expect(publisherLinkTarget(['doubaohk-publisher://open/unknown'])).toBe(null)
    expect(publisherLinkTarget(['https://example.com/open/media'])).toBe(null)
    expect(publisherLinkTarget(['not a url'])).toBe(null)
  })
})
