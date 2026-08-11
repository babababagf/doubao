import { describe, expect, it, vi } from 'vitest'

import { StorageTestStatus } from '../generated/prisma/client'
import { ObjectStorageConfigService, uploadOssSiteVersion, verifyOssProbe } from './object-storage-config.service'

describe('对象存储隔离探针', () => {
  it('验证写入、读取并删除随机探针对象', async () => {
    let objectKey = ''
    const deleted: string[] = []
    const client = {
      getBucketInfo: async () => undefined,
      put: async (name: string, content: Buffer) => { objectKey = name; stored = content },
      head: async () => ({ res: { headers: { 'content-length': String(stored.length) } } }),
      get: async () => ({ content: Buffer.from(stored) }),
      delete: async (name: string) => { deleted.push(name) },
      signatureUrl: () => '',
    }
    let stored: Uint8Array = new Uint8Array()

    await expect(verifyOssProbe(client, {
      publicUrlForKey: (name) => `https://cdn.example.com/${name}`,
      fetcher: async () => ({ ok: true, arrayBuffer: async () => Uint8Array.from(stored).buffer }),
    })).resolves.toBeUndefined()
    expect(objectKey).toMatch(/^__doubaohk_storage_probe__\/[0-9a-f-]+\.txt$/)
    expect(deleted).toEqual([objectKey])
  })

  it('读取校验失败时仍会清理探针对象', async () => {
    let deleted = ''
    const client = {
      getBucketInfo: async () => undefined,
      put: async () => undefined,
      head: async () => ({ res: { headers: { 'content-length': '1' } } }),
      get: async () => ({ content: Buffer.from('x') }),
      delete: async (name: string) => { deleted = name },
      signatureUrl: () => '',
    }

    await expect(verifyOssProbe(client)).rejects.toThrow('STORAGE_PROBE_SIZE_MISMATCH')
    expect(deleted).toMatch(/^__doubaohk_storage_probe__\/[0-9a-f-]+\.txt$/)
  })

  it.each([
    { enabled: true, lastTestStatus: StorageTestStatus.SUCCEEDED, expected: true },
    { enabled: false, lastTestStatus: StorageTestStatus.SUCCEEDED, expected: false },
    { enabled: true, lastTestStatus: StorageTestStatus.FAILED, expected: false },
  ])('商户只在所属贴牌配置已启用且测试成功时显示存储可用：$expected', async ({ enabled, lastTestStatus, expected }) => {
    const prisma = {
      tenant: { findUnique: async () => ({ whiteLabelId: 'white-label-1' }) },
      objectStorageConfig: { findUnique: async () => ({ enabled, lastTestStatus }) },
    }
    const service = new ObjectStorageConfigService(prisma as never, null as never, null as never)

    await expect(service.merchantStorageAvailable('merchant-1')).resolves.toBe(expected)
  })

  it('商户没有所属贴牌时存储不可用且不查询配置', async () => {
    const findConfig = vi.fn()
    const prisma = {
      tenant: { findUnique: async () => ({ whiteLabelId: null }) },
      objectStorageConfig: { findUnique: findConfig },
    }
    const service = new ObjectStorageConfigService(prisma as never, null as never, null as never)

    await expect(service.merchantStorageAvailable('merchant-1')).resolves.toBe(false)
    expect(findConfig).not.toHaveBeenCalled()
  })
})

describe('静态站不可变版本上传', () => {
  it('先写完整文件并校验大小，最后写版本清单', async () => {
    const stored = new Map<string, Buffer>()
    const calls: string[] = []
    const client = {
      getBucketInfo: async () => undefined,
      put: async (name: string, content: Buffer) => { calls.push(`put:${name}`); stored.set(name, Buffer.from(content)) },
      head: async (name: string) => ({ res: { headers: { 'content-length': String(stored.get(name)?.length ?? -1) } } }),
      get: async (name: string) => ({ content: stored.get(name) ?? Buffer.alloc(0) }),
      delete: async (name: string) => { calls.push(`delete:${name}`); stored.delete(name) },
      signatureUrl: () => '',
    }

    const result = await uploadOssSiteVersion(client, {
      merchantTenantId: 'merchant-1',
      version: 7,
      files: [
        { path: 'index.html', content: Buffer.from('<h1>首页</h1>'), contentType: 'text/html; charset=utf-8' },
        { path: 'articles/a-1.html', content: Buffer.from('<p>文章</p>'), contentType: 'text/html; charset=utf-8' },
      ],
    })

    expect(result).toEqual({ objectPrefix: 'sites/merchant-1/versions/v7', manifestKey: 'sites/merchant-1/versions/v7/manifest.json' })
    expect(calls.at(-1)).toBe('put:sites/merchant-1/versions/v7/manifest.json')
    const manifest = JSON.parse(stored.get(result.manifestKey)!.toString('utf8')) as { files: Array<{ path: string; sha256: string }> }
    expect(manifest.files.map((file) => file.path)).toEqual(['articles/a-1.html', 'index.html'])
    expect(manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true)
  })

  it('中途失败时只清理本次新版本，绝不删除上一版', async () => {
    const stored = new Map<string, Buffer>()
    const deleted: string[] = []
    let putCount = 0
    const client = {
      getBucketInfo: async () => undefined,
      put: async (name: string, content: Buffer) => {
        putCount += 1
        if (putCount === 2) throw new Error('network failed')
        stored.set(name, Buffer.from(content))
      },
      head: async (name: string) => ({ res: { headers: { 'content-length': String(stored.get(name)?.length ?? -1) } } }),
      get: async () => ({ content: Buffer.alloc(0) }),
      delete: async (name: string) => { deleted.push(name); stored.delete(name) },
      signatureUrl: () => '',
    }

    await expect(uploadOssSiteVersion(client, {
      merchantTenantId: 'merchant-1',
      version: 8,
      files: [
        { path: 'index.html', content: Buffer.from('new'), contentType: 'text/html' },
        { path: 'robots.txt', content: Buffer.from('robots'), contentType: 'text/plain' },
      ],
    })).rejects.toThrow('network failed')
    expect(deleted).toEqual(['sites/merchant-1/versions/v8/index.html'])
    expect(deleted.some((key) => key.includes('/v7/'))).toBe(false)
  })

  it.each(['../index.html', '/index.html', 'articles/../../secret'])('拒绝越界对象路径：%s', async (path) => {
    await expect(uploadOssSiteVersion({} as never, {
      merchantTenantId: 'merchant-1', version: 1, files: [{ path, content: Buffer.from('x'), contentType: 'text/plain' }],
    })).rejects.toThrow('SITE_UPLOAD_FILE_INVALID')
  })
})
