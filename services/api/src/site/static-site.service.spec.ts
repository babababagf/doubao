import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StaticSiteObject } from '../tenancy/object-storage-config.service'
import { stageStaticSiteArtifact, staticSiteContentType } from './static-site.service'

const temporaryDirectories: string[] = []

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    const resolved = resolve(directory)
    if (dirname(resolved) !== resolve(tmpdir()) || !basename(resolved).startsWith('doubaohk-site-artifact-')) throw new Error('拒绝清理非测试临时目录')
    await rm(resolved, { recursive: true, force: true })
  }
})

describe('静态站对象存储制品编排', () => {
  it('对象存储不可用时只保留本地制品，不调用上传', async () => {
    const upload = vi.fn()
    const result = await stageStaticSiteArtifact({
      merchantStorageAvailable: async () => false,
      uploadMerchantSiteVersion: upload,
    }, { tenantId: 'merchant-1', version: 2, directory: 'unused', paths: ['index.html'] })

    expect(result).toBeNull()
    expect(upload).not.toHaveBeenCalled()
  })

  it('读取完整站点文件并按类型上传到当前版本', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'doubaohk-site-artifact-'))
    temporaryDirectories.push(directory)
    await mkdir(join(directory, 'articles'))
    await writeFile(join(directory, 'index.html'), '<h1>首页</h1>', 'utf8')
    await writeFile(join(directory, 'articles', 'a-1.html'), '<p>文章</p>', 'utf8')
    await writeFile(join(directory, 'sitemap.xml'), '<urlset/>', 'utf8')
    await writeFile(join(directory, 'robots.txt'), 'User-agent: *', 'utf8')
    const upload = vi.fn(async (tenantId: string, version: number, files: StaticSiteObject[]) => {
      expect(tenantId).toBe('merchant-1')
      expect(version).toBe(3)
      expect(files).toHaveLength(4)
      return { objectPrefix: 'sites/merchant-1/versions/v3', manifestUrl: 'https://cdn.example.com/manifest.json' }
    })

    const result = await stageStaticSiteArtifact({
      merchantStorageAvailable: async () => true,
      uploadMerchantSiteVersion: upload,
    }, {
      tenantId: 'merchant-1',
      version: 3,
      directory,
      paths: ['index.html', 'articles/a-1.html', 'sitemap.xml', 'robots.txt'],
    })

    expect(result?.objectPrefix).toBe('sites/merchant-1/versions/v3')
    expect(result?.uploadedAt).toBeInstanceOf(Date)
    expect(upload).toHaveBeenCalledOnce()
    const files = upload.mock.calls[0]![2]
    expect(files.map((file) => [file.path, file.contentType, file.content.toString('utf8')])).toEqual([
      ['index.html', 'text/html; charset=utf-8', '<h1>首页</h1>'],
      ['articles/a-1.html', 'text/html; charset=utf-8', '<p>文章</p>'],
      ['sitemap.xml', 'application/xml; charset=utf-8', '<urlset/>'],
      ['robots.txt', 'text/plain; charset=utf-8', 'User-agent: *'],
    ])
  })

  it.each([
    ['index.html', 'text/html; charset=utf-8'],
    ['sitemap.xml', 'application/xml; charset=utf-8'],
    ['manifest.json', 'application/json; charset=utf-8'],
    ['robots.txt', 'text/plain; charset=utf-8'],
  ])('识别站点 MIME 类型：%s', (path, expected) => {
    expect(staticSiteContentType(path)).toBe(expected)
  })
})
