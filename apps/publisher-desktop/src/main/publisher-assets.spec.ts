import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { cleanupPublisherAssets, downloadPublisherImages } from './publisher-assets'

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }]

describe('publisher assets', () => {
  it('下载 1-3 张 HTTPS 图片并使用安全文件名', async () => {
    const root = await mkdtemp(join(tmpdir(), 'publisher-assets-test-'))
    try {
      const bundle = await downloadPublisherImages(root, [{ id: '../image-1', mimeType: 'image/png', url: 'https://cdn.example/image.png' }], {
        lookup: publicLookup,
        fetch: async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png', 'content-length': '3' } }),
      })
      expect(bundle.files[0]).toMatch(/01-image-1\.png$/)
      await expect(readFile(bundle.files[0]!)).resolves.toEqual(Buffer.from([1, 2, 3]))
      await cleanupPublisherAssets(root, bundle)
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('拒绝本机、内网、非 HTTPS 和图片格式不一致', async () => {
    const root = await mkdtemp(join(tmpdir(), 'publisher-assets-test-'))
    const fetchImage = async () => new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/jpeg' } })
    try {
      await expect(downloadPublisherImages(root, [{ id: 'one', mimeType: 'image/png', url: 'http://cdn.example/image.png' }], { lookup: publicLookup, fetch: fetchImage })).rejects.toThrow('HTTPS')
      await expect(downloadPublisherImages(root, [{ id: 'one', mimeType: 'image/png', url: 'https://127.0.0.1/image.png' }], { lookup: publicLookup, fetch: fetchImage })).rejects.toThrow('本机或内网')
      await expect(downloadPublisherImages(root, [{ id: 'one', mimeType: 'image/png', url: 'https://cdn.example/image.png' }], { lookup: publicLookup, fetch: fetchImage })).rejects.toThrow('格式与快照不一致')
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('拒绝清理临时根目录之外的路径', async () => {
    await expect(cleanupPublisherAssets(tmpdir(), { directory: join(tmpdir(), 'not-owned'), files: [] })).rejects.toThrow('拒绝清理')
  })
})
