import { afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'

const baseUrl = process.env.LOCAL_API_URL ?? 'http://127.0.0.1:3010/api'
let cookie = ''
const describeLocalWriteIntegration = process.env.LOCAL_API_INTEGRATION_WRITE === 'true' ? describe : describe.skip

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), ...(cookie ? { cookie } : {}) },
  })
}

async function connectPublisherTestAccount(platform: 'toutiao' | 'douyin'): Promise<{ id: string; authorization: { authorization: string } }> {
  const login = await request('/publisher/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'demo001', password: 'demo123', deviceRef: randomUUID() }),
  })
  expect(login.status).toBe(201)
  const session = await login.json() as { accessToken: string }
  const authorization = { authorization: `Bearer ${session.accessToken}` }
  const account = await request(`/publisher/media-accounts/${platform}/state`, {
    method: 'POST', headers: { ...authorization, 'content-type': 'application/json' }, body: JSON.stringify({ state: 'connected', localReferenceId: randomUUID(), label: `${platform}集成测试号${Date.now()}` }),
  })
  expect(account.status).toBe(201)
  return { id: (await account.json() as { id: string }).id, authorization }
}

describeLocalWriteIntegration('本地真实商户 API', () => {
  it('拒绝错误密码', async () => {
    const response = await request('/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'demo001', password: 'wrong1' }),
    })
    expect(response.status).toBe(401)
  })

  it('以 HttpOnly 会话登录并读取真实商户数据', async () => {
    const response = await request('/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'demo001', password: 'demo123' }),
    })
    expect(response.status).toBe(201)
    const setCookie = response.headers.getSetCookie()[0]
    if (!setCookie) throw new Error('登录响应未返回会话 Cookie')
    expect(setCookie).toContain('HttpOnly')
    const cookieValue = setCookie.split(';')[0]
    if (!cookieValue) throw new Error('登录响应 Cookie 格式无效')
    cookie = cookieValue

    const [bootstrap, dashboard, media] = await Promise.all([
      request('/merchant/bootstrap'), request('/merchant/dashboard'), request('/merchant/media-accounts'),
    ])
    expect(bootstrap.status).toBe(200)
    expect(dashboard.status).toBe(200)
    expect(media.status).toBe(200)
    expect((await bootstrap.json()).brand.nickname).toBe('豆包获客')
    const mediaRows = await media.json() as Array<{ platform: string; status: string; backupAvailable: boolean; backupCapturedAt: string | null; sessionBackup?: unknown }>
    expect(new Set(mediaRows.map((item) => item.platform))).toEqual(new Set(['toutiao', 'douyin']))
    expect(mediaRows.every((item) => ['unbound', 'connection_requested', 'verification_required', 'connected', 'expired'].includes(item.status))).toBe(true)
    expect(mediaRows.every((item) => typeof item.backupAvailable === 'boolean' && (item.backupCapturedAt === null || typeof item.backupCapturedAt === 'string') && !('sessionBackup' in item))).toBe(true)
  })

  it('生成可抓取的本地静态站并记录电话统计', async () => {
    const superLogin = await fetch(`${baseUrl}/super/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin001', password: 'admin123' }) })
    expect(superLogin.status).toBe(201)
    const superCookie = superLogin.headers.getSetCookie()[0]?.split(';')[0]
    if (!superCookie) throw new Error('总后台登录未返回会话 Cookie')
    const platformRoot = `content-${Date.now()}.example.com`
    const savedPlatformDomains = await fetch(`${baseUrl}/super/platform-domains`, { method: 'PUT', headers: { 'content-type': 'application/json', cookie: superCookie }, body: JSON.stringify({ superAdminHostname: '', tenantAdminHostname: '', merchantWebHostname: '', contentRootHostname: platformRoot }) })
    expect(savedPlatformDomains.status).toBe(200)
    const profileResponse = await request('/merchant/profile')
    expect(profileResponse.status).toBe(200)
    const profile = await profileResponse.json() as Record<string, unknown>
    const profileInput = Object.fromEntries(Object.entries(profile).filter(([key]) => key !== 'version' && key !== 'updatedAt'))
    const savedProfile = await request('/merchant/profile', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...profileInput, phone: profileInput.phone || '010-00000000', products: ['本地真实联调服务项目'] }),
    })
    expect(savedProfile.status).toBe(200)
    const keywordResponse = await request('/merchant/keywords')
    expect(keywordResponse.status).toBe(200)
    const keywords = await keywordResponse.json() as Array<{ id: string }>
    const keyword = keywords[0] ?? await (async () => {
      const created = await request('/merchant/keywords', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: '本地联调关键词', brandTerms: ['示例科技有限公司'] }),
      })
      expect(created.status).toBe(201)
      return created.json() as Promise<{ id: string }>
    })()
    const createdQuestion = await request(`/merchant/keywords/${keyword.id}/questions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `本地联调如何确认服务信息${Date.now()}？` }),
    })
    expect(createdQuestion.status).toBe(201)
    const generated = await request('/merchant/website/generate', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })
    expect(generated.status).toBe(201)
    const website = await generated.json() as { hostname: string | null; status: string; previewUrl: string | null }
    expect(website.status).toBe('local_ready')
    expect(website.hostname).toMatch(new RegExp(`^site-.+\\.${platformRoot.replace(/\./g, '\\.')}$`))
    expect(website.previewUrl).toMatch(/^\/api\/public\/sites\/[^/]+\/index\.html$/)
    const publicBase = new URL(baseUrl).origin
    const index = await fetch(`${publicBase}${website.previewUrl!}`)
    const siteBase = website.previewUrl!.replace(/\/index\.html$/, '')
    const robots = await fetch(`${publicBase}${siteBase}/robots.txt`)
    expect(index.status).toBe(200)
    const indexHtml = await index.text()
    expect(indexHtml).toContain('示例科技有限公司')
    expect(indexHtml).toContain(`https://${website.hostname}/index.html`)
    expect(indexHtml).toContain('rel="icon"')
    expect(indexHtml).toContain('data:image/svg+xml')
    expect(indexHtml).toContain('href="services.html"')
    expect(indexHtml).toContain('href="questions.html"')
    expect(indexHtml).toContain('href="about.html"')
    expect(await robots.text()).toContain('User-agent: *')
    const [services, questions, about] = await Promise.all([
      fetch(`${publicBase}${siteBase}/services.html`),
      fetch(`${publicBase}${siteBase}/questions.html`),
      fetch(`${publicBase}${siteBase}/about.html`),
    ])
    expect([services.status, questions.status, about.status]).toEqual([200, 200, 200])
    expect(await questions.text()).toContain('FAQPage')
    const templateAssertions = [
      { template: 'local_store', marker: '到店信息' },
      { template: 'brand_content', marker: 'BRAND JOURNAL' },
    ] as const
    for (const item of templateAssertions) {
      const updated = await request('/merchant/website', {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ template: item.template }),
      })
      expect(updated.status).toBe(200)
      const regenerated = await request('/merchant/website/generate', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      })
      expect(regenerated.status).toBe(201)
      const nextWebsite = await regenerated.json() as { previewUrl: string | null }
      expect(nextWebsite.previewUrl).toBeTruthy()
      const nextIndex = await fetch(`${publicBase}${nextWebsite.previewUrl!}`)
      expect(nextIndex.status).toBe(200)
      expect(await nextIndex.text()).toContain(item.marker)
    }
    const dashboardBefore = await request('/merchant/dashboard')
    expect(dashboardBefore.status).toBe(200)
    const initialEffects = (await dashboardBefore.json() as { effects: { phoneExposureCount: number; phoneClickCount: number } }).effects
    const eventInput = { page: website.previewUrl!, visitId: crypto.randomUUID() }
    const events = await Promise.all([
      fetch(`${publicBase}${siteBase}/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...eventInput, type: 'phone_exposure' }) }),
      fetch(`${publicBase}${siteBase}/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...eventInput, type: 'phone_exposure' }) }),
      fetch(`${publicBase}${siteBase}/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...eventInput, type: 'phone_click' }) }),
    ])
    expect(events.map((item) => item.status)).toEqual([204, 204, 204])
    const dashboard = await request('/merchant/dashboard')
    expect(dashboard.status).toBe(200)
    const effects = (await dashboard.json() as { effects: { phoneExposureCount: number; phoneClickCount: number } }).effects
    expect(effects.phoneExposureCount).toBe(initialEffects.phoneExposureCount + 1)
    expect(effects.phoneClickCount).toBe(initialEffects.phoneClickCount + 1)
  })

  it('企业资料仅在实际变化时创建新版本，网站固定引用生成时版本', async () => {
    const original = await request('/merchant/profile')
    expect(original.status).toBe(200)
    const profile = await original.json() as Record<string, unknown>
    const version = profile.version as number
    const profileInput = Object.fromEntries(Object.entries(profile).filter(([key]) => key !== 'version' && key !== 'updatedAt'))
    const unchanged = await request('/merchant/profile', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profileInput),
    })
    expect(unchanged.status).toBe(200)
    expect((await unchanged.json() as { version: number }).version).toBe(version)

    const marker = `企业资料版本验收-${Date.now()}`
    const changed = await request('/merchant/profile', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...profileInput, introduction: `${String(profileInput.introduction)} ${marker}` }),
    })
    expect(changed.status).toBe(200)
    const changedProfile = await changed.json() as { version: number }
    expect(changedProfile.version).toBe(Number(version) + 1)

    const generated = await request('/merchant/website/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    expect(generated.status).toBe(201)
    const website = await generated.json() as { profileVersion: number; previewUrl: string; storageState: string; artifactUploadedAt: string | null }
    expect(website.profileVersion).toBe(changedProfile.version)
    expect(website.storageState).toBe('local_only')
    expect(website.artifactUploadedAt).toBeNull()
    const index = await fetch(`${new URL(baseUrl).origin}${website.previewUrl}`)
    expect(await index.text()).toContain(marker)
  })

  it('文章编辑会生成递增版本，供后续发布任务固定引用', async () => {
    const stamp = String(Date.now())
    const created = await request('/merchant/articles', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: `版本化验收文章${stamp}`, content: '这是一篇用于验证文章版本快照的本地测试内容。编辑后必须保留发布任务创建时的原始内容。', status: 'draft' }),
    })
    expect(created.status).toBe(201)
    const article = await created.json() as { id: string; currentVersion: number }
    expect(article.currentVersion).toBe(1)
    const updated = await request(`/merchant/articles/${article.id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: `版本化验收文章${stamp}（已编辑）`, content: '这是一篇用于验证文章版本快照的本地测试内容。编辑后必须保留发布任务创建时的原始内容，并生成新版本。', status: 'publishable' }),
    })
    expect(updated.status).toBe(200)
    expect((await updated.json() as { currentVersion: number }).currentVersion).toBe(2)
    const articles = await request('/merchant/articles')
    expect(articles.status).toBe(200)
    expect((await articles.json() as Array<{ id: string; currentVersion: number }>).find((item) => item.id === article.id)?.currentVersion).toBe(2)

    const generated = await request('/merchant/website/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    expect(generated.status).toBe(201)
    const website = await generated.json() as { previewUrl: string }
    const siteBase = website.previewUrl.replace(/\/index\.html$/, '')
    const articlePreview = await fetch(`${new URL(baseUrl).origin}${siteBase}/articles/${article.id}.html`)
    expect(articlePreview.status).toBe(200)
    const articleHtml = await articlePreview.text()
    expect(articleHtml).toContain('href="../services.html"')
    expect(articleHtml).toContain('href="../questions.html"')
    expect(articleHtml).toContain('href="../about.html"')
  })

  it('发布助手使用独立令牌受众登录，不复用网页 Cookie', async () => {
    const response = await request('/publisher/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'demo001', password: 'demo123', deviceRef: '4dbb4d72-38e5-47b0-85b5-71539c25c974' }),
    })
    expect(response.status).toBe(201)
    expect(response.headers.getSetCookie()).toEqual([])
    const session = await response.json() as { accessToken: string; expiresAt: string }
    expect(session.accessToken.length).toBeGreaterThan(30)
    const bootstrap = await request('/publisher/bootstrap', { headers: { authorization: `Bearer ${session.accessToken}` } })
    expect(bootstrap.status).toBe(200)
    expect((await bootstrap.json() as { finalPublicationMode: string }).finalPublicationMode).toBe('automatic_submission_with_attention_fallback')
  })

  it('设备 A 可保存加密媒体会话，设备 B 登录后恢复并可撤销', async () => {
    const localReferenceId = randomUUID()
    const marker = `integration-session-${Date.now()}`
    const firstLogin = await request('/publisher/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'demo001', password: 'demo123', deviceRef: randomUUID() }),
    })
    const first = await firstLogin.json() as { accessToken: string }
    const firstAuthorization = { authorization: `Bearer ${first.accessToken}` }
    const accountResponse = await request('/publisher/media-accounts/douyin/state', {
      method: 'POST', headers: { ...firstAuthorization, 'content-type': 'application/json' }, body: JSON.stringify({ state: 'connected', localReferenceId, label: `跨设备验收号${Date.now()}` }),
    })
    expect(accountResponse.status).toBe(201)
    const account = await accountResponse.json() as { id: string }
    const bundle = { schemaVersion: 1, platform: 'douyin', localReferenceId, capturedAt: new Date().toISOString(), cookies: [{ name: 'sessionid', value: marker, domain: '.douyin.com', path: '/', secure: true, httpOnly: true, session: false, sameSite: 'None', expirationDate: Math.floor(Date.now() / 1000) + 3600 }], origins: [{ origin: 'https://creator.douyin.com', localStorage: [{ name: 'account', value: 'test' }], sessionStorage: [{ name: 'csrf', value: 'test' }], indexedDB: [{ name: 'auth', version: 1, stores: [] }] }] }
    const saved = await request(`/publisher/media-accounts/${account.id}/session-backup`, { method: 'PUT', headers: { ...firstAuthorization, 'content-type': 'application/json' }, body: JSON.stringify(bundle) })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject({ available: true, schemaVersion: 1 })

    const secondLogin = await request('/publisher/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'demo001', password: 'demo123', deviceRef: randomUUID() }),
    })
    const second = await secondLogin.json() as { accessToken: string }
    const secondAuthorization = { authorization: `Bearer ${second.accessToken}` }
    const restored = await request(`/publisher/media-accounts/${account.id}/session-backup`, { headers: secondAuthorization })
    expect(restored.status).toBe(200)
    expect(restored.headers.get('cache-control')).toContain('no-store')
    expect(await restored.json()).toMatchObject({ crossDevice: true, bundle: { cookies: [{ value: marker, httpOnly: true }], origins: [{ sessionStorage: [{ name: 'csrf', value: 'test' }] }] } })
    expect((await request(`/publisher/media-accounts/${account.id}/session-backup`, { method: 'DELETE', headers: secondAuthorization })).status).toBe(200)
    expect((await request(`/publisher/media-accounts/${account.id}/session-backup`, { headers: secondAuthorization })).status).toBe(404)
  })

  it('商户显式选择账号创建发布任务，EXE 领取后可在异常时转人工且不能重复领取', async () => {
    const stamp = String(Date.now())
    const articleResponse = await request('/merchant/articles', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: `发布助手验收文章${stamp}`, content: '用于验证网页创建发布任务、EXE领取版本快照与人工处理回传的本地内容。', status: 'publishable' }),
    })
    expect(articleResponse.status).toBe(201)
    const article = await articleResponse.json() as { id: string; currentVersion: number }
    const publisherAccount = await connectPublisherTestAccount('toutiao')
    const created = await request('/merchant/publish-tasks', {
      method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': `publish-${stamp}` }, body: JSON.stringify({ articleIds: [article.id], platforms: ['toutiao'], mediaAccountIds: [publisherAccount.id], publishCount: 1, deduplicationMode: 'per_platform', dailyLimits: { toutiao: 3, douyin: 3 } }),
    })
    expect(created.status).toBe(201)
    const [task] = (await created.json() as { tasks: Array<{ id: string; articleVersion: number; status: string }> }).tasks
    if (!task) throw new Error('创建发布任务后未返回任务')
    expect(task).toMatchObject({ articleVersion: article.currentVersion, status: 'queued' })

    const claimed = await request(`/publisher/tasks/${task.id}/claim`, { method: 'POST', headers: publisherAccount.authorization })
    expect(claimed.status).toBe(201)
    expect(await claimed.json()).toMatchObject({ status: 'running', article: { version: article.currentVersion }, finalPublicationMode: 'automatic_submission_with_attention_fallback' })
    const imageManifest = await request(`/publisher/tasks/${task.id}/images`, { headers: publisherAccount.authorization })
    expect(imageManifest.status).toBe(200)
    expect(await imageManifest.json()).toEqual({ requiredCount: 0, availability: 'not_required', images: [], missingImageIds: [] })
    const heartbeat = await request(`/publisher/tasks/${task.id}/heartbeat`, { method: 'POST', headers: publisherAccount.authorization })
    expect(heartbeat.status).toBe(201)
    expect(await heartbeat.json()).toMatchObject({ status: 'running' })
    const attention = await request(`/publisher/tasks/${task.id}/attention`, { method: 'POST', headers: { ...publisherAccount.authorization, 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'login_required' }) })
    expect(attention.status).toBe(201)
    expect(await attention.json()).toMatchObject({ status: 'attention', failureReason: expect.stringContaining('登录'), attentionReason: 'login_required', canResume: true, attemptCount: 1 })
    const resumed = await request(`/publisher/tasks/${task.id}/resume`, { method: 'POST', headers: publisherAccount.authorization })
    expect(resumed.status).toBe(201)
    expect(await resumed.json()).toMatchObject({ status: 'queued', attentionReason: null, canResume: false, attemptCount: 1 })
    const reclaimed = await request(`/publisher/tasks/${task.id}/claim`, { method: 'POST', headers: publisherAccount.authorization })
    expect(reclaimed.status).toBe(201)
    expect(await reclaimed.json()).toMatchObject({ status: 'running', attemptCount: 2 })
    const unknown = await request(`/publisher/tasks/${task.id}/attention`, { method: 'POST', headers: { ...publisherAccount.authorization, 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'submission_unknown' }) })
    expect(unknown.status).toBe(201)
    expect(await unknown.json()).toMatchObject({ status: 'attention', attentionReason: 'submission_unknown', canResume: false })
    const unsafeResume = await request(`/publisher/tasks/${task.id}/resume`, { method: 'POST', headers: publisherAccount.authorization })
    expect(unsafeResume.status).toBe(409)
  })

  it('仅当前发布助手可用同平台官方公开链接回传自动发布成功', async () => {
    const stamp = String(Date.now())
    const articleResponse = await request('/merchant/articles', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: `发布结果验收文章${stamp}`, content: '用于验证人工发布结果链接和成功统计的本地内容。', status: 'publishable' }),
    })
    expect(articleResponse.status).toBe(201)
    const article = await articleResponse.json() as { id: string }
    const publisherAccount = await connectPublisherTestAccount('toutiao')
    const created = await request('/merchant/publish-tasks', {
      method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': `publish-result-${stamp}` }, body: JSON.stringify({ articleIds: [article.id], platforms: ['toutiao'], mediaAccountIds: [publisherAccount.id], publishCount: 1, deduplicationMode: 'per_platform', dailyLimits: { toutiao: 3, douyin: 3 } }),
    })
    expect(created.status).toBe(201)
    const [task] = (await created.json() as { tasks: Array<{ id: string }> }).tasks
    if (!task) throw new Error('创建发布任务后未返回任务')
    expect((await request(`/publisher/tasks/${task.id}/claim`, { method: 'POST', headers: publisherAccount.authorization })).status).toBe(201)
    const wrongPlatform = await request(`/publisher/tasks/${task.id}/complete`, { method: 'POST', headers: { ...publisherAccount.authorization, 'content-type': 'application/json' }, body: JSON.stringify({ resultUrl: `https://www.douyin.com/video/${stamp}` }) })
    expect(wrongPlatform.status).toBe(409)
    const complete = await request(`/publisher/tasks/${task.id}/complete`, { method: 'POST', headers: { ...publisherAccount.authorization, 'content-type': 'application/json' }, body: JSON.stringify({ resultUrl: `https://www.toutiao.com/article/${stamp}` }) })
    expect(complete.status).toBe(201)
    expect(await complete.json()).toMatchObject({ status: 'succeeded', resultUrl: `https://www.toutiao.com/article/${stamp}`, completedAt: expect.any(String) })
    const merchantTasks = await request('/merchant/publish-tasks')
    expect((await merchantTasks.json() as Array<{ id: string; status: string; resultUrl: string | null }>).find((item) => item.id === task.id)).toMatchObject({ status: 'succeeded', resultUrl: `https://www.toutiao.com/article/${stamp}` })
    const repeated = await request(`/publisher/tasks/${task.id}/complete`, { method: 'POST', headers: { ...publisherAccount.authorization, 'content-type': 'application/json' }, body: JSON.stringify({ resultUrl: `https://www.toutiao.com/article/${stamp}` }) })
    expect(repeated.status).toBe(409)
  })
})

afterAll(async () => {
  if (!cookie) return
  const response = await request('/auth/logout', { method: 'POST' })
  expect(response.status).toBe(204)
  const clearedCookie = response.headers.getSetCookie()[0]
  expect(clearedCookie).toContain('HttpOnly')
  expect(clearedCookie).toContain('Max-Age=0')
  cookie = ''
})
