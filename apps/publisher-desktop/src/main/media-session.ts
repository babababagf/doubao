import { app } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'playwright-core'
import { classifyLocalLoginPage, classifyLocalLoginProgress, isAllowedMediaNavigation, isAllowedMediaSessionHost, mediaPlatforms, mediaProfileDirectoryName, type LocalLoginProbe, type LocalLoginProgress, type MediaPlatform } from '../shared/media-platform'
import type { LocalArticleDraft } from '../shared/publish-draft'
import { isWorkspaceId } from '../shared/workspace-session-model'
import type { RemoteMediaSessionBundle } from './publisher-api'

type SessionMode = 'login' | 'publisher'

export type LocalDraftFillResult =
  | { ok: true; message: string; titleLength: number; bodyLength: number }
  | { ok: false; reason: 'login_required' | 'captcha_required' | 'platform_changed' | 'fill_failed'; message: string }
export type PublisherAccessVerification = { ok: true } | { ok: false; reason: string }
export type AutomaticPublishResult =
  | { ok: true; resultUrl: string; message: string }
  | { ok: false; reason: 'login_required' | 'captcha_required' | 'platform_changed' | 'submission_unknown' | 'submission_rejected'; message: string; submissionStarted: boolean }

const chromiumCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]

export function findLocalChromiumExecutable(exists: (path: string) => boolean = existsSync): string | null {
  return chromiumCandidates.find(exists) ?? null
}

export class MediaSessionManager {
  private readonly contexts = new Map<string, BrowserContext>()

  async open(workspaceId: string, platform: MediaPlatform, mode: SessionMode, localReferenceId: string): Promise<void> {
    const page = await this.getOrCreatePage(workspaceId, platform, localReferenceId)
    const config = mediaPlatforms[platform]
    await page.goto(mode === 'login' ? config.loginUrl : config.publisherUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    if (mode === 'publisher') await this.dismissKnownInformationalOverlays(page)
    await page.bringToFront()
  }

  async closeAll(): Promise<void> {
    const contexts = [...this.contexts.values()]
    this.contexts.clear()
    await Promise.allSettled(contexts.map((context) => context.close()))
  }

  async closeWorkspace(workspaceId: string): Promise<void> {
    if (!isWorkspaceId(workspaceId)) return
    const entries = [...this.contexts.entries()].filter(([key]) => key.startsWith(`${workspaceId}:`))
    for (const [key] of entries) this.contexts.delete(key)
    await Promise.allSettled(entries.map(([, context]) => context.close()))
  }

  hasOpenSessions(): boolean { return this.contexts.size > 0 }

  hasLocalProfile(workspaceId: string, platform: MediaPlatform, localReferenceId: string): boolean {
    this.requireWorkspaceId(workspaceId)
    if (!isWorkspaceId(localReferenceId)) return false
    return existsSync(this.profileDirectory(workspaceId, platform, localReferenceId))
  }

  async exportPortableSession(workspaceId: string, platform: MediaPlatform, localReferenceId: string): Promise<RemoteMediaSessionBundle> {
    const page = await this.getOrCreatePage(workspaceId, platform, localReferenceId)
    const context = page.context()
    const state = await context.storageState({ indexedDB: true })
    const partitionKeys = await this.partitionKeysByCookie(context, page)
    const sessionStorage = new Map<string, Array<{ name: string; value: string }>>()
    for (const candidate of context.pages()) {
      let origin: string
      try {
        const url = new URL(candidate.url())
        if (url.protocol !== 'https:' || !isAllowedMediaSessionHost(platform, url.hostname)) continue
        origin = url.origin
      } catch { continue }
      const items = await candidate.evaluate(() => {
        const browser = globalThis as unknown as { sessionStorage: { length: number; key(index: number): string | null; getItem(name: string): string | null } }
        const result: Array<{ name: string; value: string }> = []
        for (let index = 0; index < browser.sessionStorage.length; index += 1) {
          const name = browser.sessionStorage.key(index)
          if (name !== null) result.push({ name, value: browser.sessionStorage.getItem(name) ?? '' })
        }
        return result
      }).catch((): Array<{ name: string; value: string }> => [])
      sessionStorage.set(origin, items)
    }
    const origins = state.origins.flatMap((origin) => {
      let url: URL
      try { url = new URL(origin.origin) } catch { return [] }
      if (url.protocol !== 'https:' || !isAllowedMediaSessionHost(platform, url.hostname)) return []
      const indexedDB = 'indexedDB' in origin && Array.isArray(origin.indexedDB) ? origin.indexedDB : undefined
      return [{ origin: url.origin, localStorage: origin.localStorage.map((item) => ({ name: item.name, value: item.value })), sessionStorage: sessionStorage.get(url.origin) ?? [], ...(indexedDB ? { indexedDB } : {}) }]
    })
    for (const [origin, items] of sessionStorage) if (!origins.some((item) => item.origin === origin)) origins.push({ origin, localStorage: [], sessionStorage: items })
    const cookies = state.cookies.flatMap((cookie) => {
      if (!isAllowedMediaSessionHost(platform, cookie.domain)) return []
      const partitionKey = partitionKeys.get(this.cookieKey(cookie))
      return [{ name: cookie.name, value: cookie.value, domain: cookie.domain, hostOnly: !cookie.domain.startsWith('.'), path: cookie.path, secure: cookie.secure, httpOnly: cookie.httpOnly, session: cookie.expires < 0, sameSite: cookie.sameSite, ...(partitionKey ? { partitionKey } : {}), ...(cookie.expires >= 0 ? { expirationDate: cookie.expires } : {}), expires: cookie.expires }]
    })
    return { schemaVersion: 1, platform, localReferenceId, capturedAt: new Date().toISOString(), cookies, origins }
  }

  async restorePortableSession(workspaceId: string, bundle: RemoteMediaSessionBundle): Promise<void> {
    this.requireWorkspaceId(workspaceId)
    if (!isWorkspaceId(bundle.localReferenceId) || bundle.schemaVersion !== 1) throw new Error('云端媒体账号会话包无效')
    const page = await this.getOrCreatePage(workspaceId, bundle.platform, bundle.localReferenceId)
    const context = page.context()
    const cookies = bundle.cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires ?? cookie.expirationDate ?? -1,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: this.playwrightSameSite(cookie.sameSite),
      ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {}),
    }))
    const origins = bundle.origins.map((origin) => ({ origin: origin.origin, localStorage: origin.localStorage, ...(origin.indexedDB ? { indexedDB: origin.indexedDB } : {}) }))
    await context.setStorageState({ cookies, origins })
    const byOrigin = Object.fromEntries(bundle.origins.map((origin) => [origin.origin, origin.sessionStorage]))
    await context.addInitScript((entries: Record<string, Array<{ name: string; value: string }>>) => {
      const browser = globalThis as unknown as { location: { origin: string }; sessionStorage: { clear(): void; setItem(name: string, value: string): void } }
      const values = entries[browser.location.origin]
      if (!values) return
      browser.sessionStorage.clear()
      for (const item of values) browser.sessionStorage.setItem(item.name, item.value)
    }, byOrigin)
    for (const candidate of context.pages()) {
      let origin: string
      try { origin = new URL(candidate.url()).origin } catch { continue }
      const values = byOrigin[origin]
      if (values) await candidate.evaluate((items) => {
        const browser = globalThis as unknown as { sessionStorage: { clear(): void; setItem(name: string, value: string): void } }
        browser.sessionStorage.clear()
        for (const item of items) browser.sessionStorage.setItem(item.name, item.value)
      }, values).catch(() => undefined)
    }
  }

  async inspectLogin(workspaceId: string, platform: MediaPlatform, localReferenceId: string): Promise<LocalLoginProbe | 'not_open'> {
    this.requireWorkspaceId(workspaceId)
    const context = this.contexts.get(this.contextKey(workspaceId, platform, localReferenceId))
    const page = context?.pages()[0]
    if (!page) return 'not_open'
    const hasLoginForm = await page.locator('input[placeholder*="手机号"], input[placeholder*="验证码"], input[type="password"]').count() > 0
    return classifyLocalLoginPage(platform, { url: page.url(), hasLoginForm })
  }

  async inspectLoginProgress(workspaceId: string, platform: MediaPlatform, localReferenceId: string): Promise<LocalLoginProgress> {
    this.requireWorkspaceId(workspaceId)
    const context = this.contexts.get(this.contextKey(workspaceId, platform, localReferenceId))
    const page = context?.pages()[0]
    if (!page) return 'not_open'
    const [hasLoginForm, bodyText] = await Promise.all([
      page.locator('input[placeholder*="手机号"], input[placeholder*="验证码"], input[type="password"]').count().then((count) => count > 0),
      page.locator('body').innerText({ timeout: 5_000 }).catch(() => ''),
    ])
    return classifyLocalLoginProgress(platform, { open: true, url: page.url(), hasLoginForm, bodyText })
  }

  /** 该步骤只负责可靠填写今日头条标题和正文；全自动执行器在校验完成后调用独立的最终提交步骤。 */
  async fillToutiaoArticleDraft(workspaceId: string, draft: LocalArticleDraft, localReferenceId: string): Promise<LocalDraftFillResult> {
    const page = await this.getOrCreatePage(workspaceId, 'toutiao', localReferenceId)
    await page.goto(mediaPlatforms.toutiao.publisherUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.bringToFront()
    await this.dismissKnownInformationalOverlays(page)

    const loginState = await this.probePageLogin('toutiao', page)
    if (loginState === 'login_required') return { ok: false, reason: 'login_required', message: '本机发布助手的今日头条资料尚未登录，请在助手打开的浏览器中扫码后重试' }
    if (await this.hasCaptchaPrompt(page)) return { ok: false, reason: 'captcha_required', message: '今日头条要求验证码或安全验证，已停止自动填写，请在本机浏览器中人工完成验证' }

    try {
      const title = await this.firstVisible(page, 'textarea[placeholder*="文章标题"]')
      const body = await this.firstVisible(page, 'div[contenteditable="true"]')
      if (!title || !body) return { ok: false, reason: 'platform_changed', message: '未找到今日头条文章编辑器字段，平台页面可能已改版，未填写任何内容' }

      await title.fill(draft.title)
      await body.fill(draft.body)
      const storedTitle = await title.inputValue()
      const storedBody = (await body.innerText()).trim()
      if (storedTitle.trim() !== draft.title || !storedBody) return { ok: false, reason: 'fill_failed', message: '平台编辑器未确认保存完整草稿，已停止，请人工核对页面' }
      return { ok: true, message: '标题和正文已可靠写入今日头条编辑器，等待全自动执行器继续上传配图并提交。', titleLength: Array.from(draft.title).length, bodyLength: storedBody.length }
    } catch (error) {
      return { ok: false, reason: 'fill_failed', message: error instanceof Error ? `填写草稿失败：${error.message}` : '填写草稿失败，请人工核对平台页面' }
    }
  }

  async fillToutiaoArticleDraftWithImages(workspaceId: string, draft: LocalArticleDraft, imagePaths: readonly string[], localReferenceId: string): Promise<LocalDraftFillResult> {
    const filled = await this.fillToutiaoArticleDraft(workspaceId, draft, localReferenceId)
    if (!filled.ok || !imagePaths.length) return filled
    if (imagePaths.length > 3) return { ok: false, reason: 'fill_failed', message: '今日头条文章配图不能超过 3 张' }
    const page = await this.getOrCreatePage(workspaceId, 'toutiao', localReferenceId)
    const body = await this.firstVisible(page, 'div.ProseMirror[contenteditable="true"]')
    if (!body) return { ok: false, reason: 'platform_changed', message: '未识别到今日头条正文编辑器，无法插入配图' }
    const beforeImages = await page.locator('div.ProseMirror img').count()
    try {
      await body.click()
      await body.press('Control+End')
      const imageButton = page.locator('button.syl-toolbar-button:has(svg rect[width="16"][height="14"])')
      if (await imageButton.count() !== 1 || !await imageButton.isVisible()) return { ok: false, reason: 'platform_changed', message: '未唯一识别到今日头条正文图片按钮，已停止' }
      await imageButton.click()
      const imageInput = page.locator('input[type="file"][accept="image/*"]:visible')
      if (await imageInput.count() !== 1) return { ok: false, reason: 'platform_changed', message: '未唯一识别到今日头条本地图片上传控件，已停止' }
      await imageInput.setInputFiles([...imagePaths])
      for (let attempt = 0; attempt < 30; attempt += 1) {
        if (await this.hasCaptchaPrompt(page)) return { ok: false, reason: 'captcha_required', message: '图片上传后今日头条要求安全验证，已停止' }
        if (await page.locator('div.ProseMirror img').count() >= beforeImages + imagePaths.length) return { ...filled, message: `标题、正文和 ${imagePaths.length} 张配图已写入今日头条编辑器，等待最终提交。` }
        await page.waitForTimeout(1_000)
      }
      return { ok: false, reason: 'fill_failed', message: '今日头条图片上传后未确认全部插入正文，已停止' }
    } catch (error) {
      return { ok: false, reason: 'fill_failed', message: error instanceof Error ? `今日头条配图插入失败：${error.message}` : '今日头条配图插入失败' }
    }
  }

  /** 上传 1-3 张抖音图文配图并填写标题、描述；最终提交由全自动执行器的下一步骤负责。 */
  async fillDouyinImageDraft(workspaceId: string, draft: LocalArticleDraft, imagePaths: readonly string[], localReferenceId: string): Promise<LocalDraftFillResult> {
    if (!imagePaths.length || imagePaths.length > 3) return { ok: false, reason: 'fill_failed', message: '抖音图文任务必须包含 1-3 张可用配图' }
    const page = await this.getOrCreatePage(workspaceId, 'douyin', localReferenceId)
    await page.goto(mediaPlatforms.douyin.publisherUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.bringToFront()
    await this.dismissKnownInformationalOverlays(page)

    const loginState = await this.probePageLogin('douyin', page)
    if (loginState === 'login_required') return { ok: false, reason: 'login_required', message: '本机发布助手的抖音资料尚未登录，请在助手打开的浏览器中扫码后重试' }
    if (await this.hasCaptchaPrompt(page)) return { ok: false, reason: 'captcha_required', message: '抖音要求验证码或安全验证，已停止上传，请在本机浏览器中人工完成验证' }

    const imageInputs = page.locator('input[type="file"][accept*="image/"]')
    if (await imageInputs.count() !== 1) return { ok: false, reason: 'platform_changed', message: '未唯一识别到抖音图文图片上传控件，平台页面可能已改版' }
    try {
      await imageInputs.first().setInputFiles([...imagePaths])
      let title = null
      let body = null
      for (let attempt = 0; attempt < 30; attempt += 1) {
        if (await this.hasCaptchaPrompt(page)) return { ok: false, reason: 'captcha_required', message: '图片上传后抖音要求安全验证，已停止填写' }
        title = await this.firstVisible(page, 'input[placeholder*="标题"], textarea[placeholder*="标题"]')
        body = await this.firstVisible(page, 'textarea[placeholder*="描述"], textarea[placeholder*="内容"], textarea[placeholder*="作品"], [contenteditable="true"]')
        if (title && body) break
        await page.waitForTimeout(1_000)
      }
      if (!title || !body) return { ok: false, reason: 'platform_changed', message: '图片已上传，但未识别到抖音标题和作品描述字段；已停止，未点击发布' }
      await title.fill(draft.title)
      await body.fill(draft.body)
      const storedTitle = await title.inputValue()
      const storedBody = await body.evaluate((element) => 'value' in element && typeof element.value === 'string' ? element.value.trim() : (element.textContent ?? '').trim())
      if (storedTitle.trim() !== draft.title || !storedBody) return { ok: false, reason: 'fill_failed', message: '抖音编辑器未确认保存完整标题或描述，已停止，请人工核对页面' }
      return { ok: true, message: `已上传 ${imagePaths.length} 张配图并写入抖音标题、描述，等待最终提交。`, titleLength: Array.from(draft.title).length, bodyLength: storedBody.length }
    } catch (error) {
      return { ok: false, reason: 'fill_failed', message: error instanceof Error ? `抖音图文填写失败：${error.message}` : '抖音图文填写失败，请人工核对平台页面' }
    }
  }

  async submitPreparedDraft(workspaceId: string, platform: MediaPlatform, title: string, localReferenceId: string): Promise<AutomaticPublishResult> {
    const page = await this.getOrCreatePage(workspaceId, platform, localReferenceId)
    await this.dismissKnownInformationalOverlays(page)
    if (await this.probePageLogin(platform, page) === 'login_required') return { ok: false, reason: 'login_required', message: '平台登录已失效，未触发最终发布', submissionStarted: false }
    if (await this.hasCaptchaPrompt(page)) return { ok: false, reason: 'captcha_required', message: '平台要求安全验证，未触发最终发布', submissionStarted: false }

    const initialButton = platform === 'toutiao'
      ? page.getByRole('button', { name: '预览并发布', exact: true })
      : page.getByRole('button', { name: '发布', exact: true })
    if (await initialButton.count() !== 1 || !await initialButton.isVisible() || !await initialButton.isEnabled()) return { ok: false, reason: 'platform_changed', message: `未唯一识别到${platform === 'toutiao' ? '今日头条“预览并发布”' : '抖音“发布”'}按钮，未触发最终发布`, submissionStarted: false }

    try {
      await initialButton.click()
      if (platform === 'toutiao') {
        for (let attempt = 0; attempt < 20; attempt += 1) {
          await this.dismissKnownInformationalOverlays(page)
          if (await this.hasCaptchaPrompt(page)) return { ok: false, reason: 'captcha_required', message: '预览后平台要求安全验证，尚未点击最终确认', submissionStarted: false }
          const confirm = page.getByRole('button', { name: /^(确认发布|发布)$/, exact: true })
          if (await confirm.count() === 1 && await confirm.isVisible() && await confirm.isEnabled()) { await confirm.click(); return this.waitForSubmissionOutcome(page, platform, title) }
          const earlyOutcome = await this.submissionOutcome(page, platform, title)
          if (earlyOutcome) return earlyOutcome
          await page.waitForTimeout(500)
        }
        return { ok: false, reason: 'platform_changed', message: '今日头条预览后未识别到唯一的最终发布按钮，未触发最终提交', submissionStarted: false }
      }
      return this.waitForSubmissionOutcome(page, platform, title)
    } catch (error) {
      return { ok: false, reason: 'submission_unknown', message: error instanceof Error ? `平台提交过程中发生异常：${error.message}` : '平台提交过程中发生未知异常', submissionStarted: true }
    }
  }

  async verifyPublisherAccess(workspaceId: string, platform: MediaPlatform, localReferenceId: string): Promise<PublisherAccessVerification> {
    const page = await this.getOrCreatePage(workspaceId, platform, localReferenceId)
    await page.goto(mediaPlatforms[platform].publisherUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.bringToFront()
    await this.dismissKnownInformationalOverlays(page)
    if (await this.probePageLogin(platform, page) === 'login_required') return { ok: false, reason: '当前独立资料仍显示平台登录界面，请完成扫码后重试' }
    if (await this.hasCaptchaPrompt(page)) return { ok: false, reason: '平台要求验证码或安全验证，请在本机浏览器中完成后重试' }
    if (platform === 'toutiao') {
      const title = await this.firstVisible(page, 'textarea[placeholder*="文章标题"]')
      const body = await this.firstVisible(page, 'div[contenteditable="true"]')
      return title && body ? { ok: true } : { ok: false, reason: '未识别到今日头条标题和正文编辑器，不能确认该资料具备发布权限' }
    }
    const bodyText = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '')
    const fileInputs = await page.locator('input[type="file"]').count()
    return fileInputs > 0 && /发布图文|上传图文|选择图片|上传图片/.test(bodyText)
      ? { ok: true }
      : { ok: false, reason: '未识别到抖音图文入口和图片上传控件，不能确认该资料具备发布权限' }
  }

  private async getOrCreatePage(workspaceId: string, platform: MediaPlatform, localReferenceId: string): Promise<Page> {
    this.requireWorkspaceId(workspaceId)
    if (!isWorkspaceId(localReferenceId)) throw new Error('媒体账号引用无效')
    const contextKey = this.contextKey(workspaceId, platform, localReferenceId)
    const active = this.contexts.get(contextKey)
    if (active) {
      const existingPage = active.pages()[0]
      if (existingPage) return existingPage
      return active.newPage()
    }

    const executablePath = findLocalChromiumExecutable()
    if (!executablePath) throw new Error('未找到本机 Chrome 或 Edge，请安装受支持浏览器后重试')
    const profileDir = this.profileDirectory(workspaceId, platform, localReferenceId)
    await mkdir(profileDir, { recursive: true })
    const context = await chromium.launchPersistentContext(profileDir, {
      executablePath,
      headless: false,
      args: ['--no-first-run', '--no-default-browser-check'],
    })
    await context.route('**/*', async (route) => {
      const request = route.request()
      if (request.isNavigationRequest() && request.resourceType() === 'document' && !isAllowedMediaNavigation(platform, request.url())) await route.abort()
      else await route.continue()
    })
    context.on('close', () => this.contexts.delete(contextKey))
    this.contexts.set(contextKey, context)
    const page = context.pages()[0] ?? await context.newPage()
    await page.setViewportSize({ width: 1180, height: 820 })
    return page
  }

  /** storageState 不返回 CHIPS 分区键；从同一隔离浏览器上下文读取并与 Cookie 三元组关联。 */
  private async partitionKeysByCookie(context: BrowserContext, page: Page): Promise<Map<string, string>> {
    const values = new Map<string, string>()
    const session = await context.newCDPSession(page).catch(() => null)
    if (!session) return values
    try {
      const result = await session.send('Network.getAllCookies') as { cookies?: Array<{ name?: unknown; domain?: unknown; path?: unknown; partitionKey?: unknown }> }
      for (const cookie of result.cookies ?? []) {
        const { name, domain, path } = cookie
        if (typeof name !== 'string' || typeof domain !== 'string' || typeof path !== 'string') continue
        const partitionKey = typeof cookie.partitionKey === 'string'
          ? cookie.partitionKey
          : cookie.partitionKey && typeof cookie.partitionKey === 'object' && 'topLevelSite' in cookie.partitionKey && typeof cookie.partitionKey.topLevelSite === 'string'
            ? cookie.partitionKey.topLevelSite
            : null
        if (partitionKey) values.set(this.cookieKey({ name, domain, path }), partitionKey)
      }
    } catch { /* CHIPS 元数据不可用时退化为标准会话备份。 */ } finally { await session.detach().catch(() => undefined) }
    return values
  }

  private cookieKey(cookie: { name: string; domain: string; path: string }): string {
    return `${cookie.name}\u0000${cookie.domain.replace(/^\./, '')}\u0000${cookie.path}`
  }

  private async probePageLogin(platform: MediaPlatform, page: Page): Promise<LocalLoginProbe> {
    const hasLoginForm = await page.locator('input[placeholder*="手机号"], input[placeholder*="验证码"], input[type="password"]').count() > 0
    return classifyLocalLoginPage(platform, { url: page.url(), hasLoginForm })
  }

  private async hasCaptchaPrompt(page: Page): Promise<boolean> {
    const content = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '')
    return /请完成(?:安全)?验证|验证码验证|安全验证/.test(content)
  }

  private async waitForSubmissionOutcome(page: Page, platform: MediaPlatform, title: string): Promise<AutomaticPublishResult> {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const outcome = await this.submissionOutcome(page, platform, title)
      if (outcome) return outcome
      await page.waitForTimeout(1_000)
    }
    return { ok: false, reason: 'submission_unknown', message: '已触发平台最终提交，但 90 秒内未取得明确成功链接或失败结果；禁止自动重试', submissionStarted: true }
  }

  private async submissionOutcome(page: Page, platform: MediaPlatform, title: string): Promise<AutomaticPublishResult | null> {
    if (await this.hasCaptchaPrompt(page)) return { ok: false, reason: 'captcha_required', message: '最终提交后平台要求安全验证，禁止自动重试，请人工核验', submissionStarted: true }
    const content = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '')
    if (/发布失败|提交失败|发布被拒绝|内容不符合发布要求/.test(content)) return { ok: false, reason: 'submission_rejected', message: '平台明确返回发布失败或内容拒绝', submissionStarted: true }
    const resultUrl = await this.findOfficialResultUrl(page, platform, title)
    if (resultUrl) return { ok: true, resultUrl, message: '平台已返回发布成功信号和官方公开内容链接' }
    return null
  }

  private async findOfficialResultUrl(page: Page, platform: MediaPlatform, title: string): Promise<string | null> {
    const current = this.normalizeOfficialResultUrl(page.url(), platform)
    if (current) return current
    const selectors = platform === 'toutiao'
      ? 'a[href*="toutiao.com/article/"], a[href*="www.toutiao.com/i"]'
      : 'a[href*="douyin.com/video/"], a[href*="douyin.com/note/"], a[href*="douyin.com/jingxuan/"]'
    const links = page.locator(selectors)
    const count = await links.count()
    let fallback: string | null = null
    for (let index = 0; index < count; index += 1) {
      const link = links.nth(index)
      const href = await link.getAttribute('href')
      if (!href) continue
      const normalized = this.normalizeOfficialResultUrl(new URL(href, page.url()).toString(), platform)
      if (!normalized) continue
      const text = (await link.innerText().catch(() => '')).trim()
      if (text && (text.includes(title) || title.includes(text))) return normalized
      fallback ??= normalized
    }
    return count === 1 ? fallback : null
  }

  private normalizeOfficialResultUrl(input: string, platform: MediaPlatform): string | null {
    try {
      const url = new URL(input)
      const hostname = url.hostname.toLowerCase()
      const valid = platform === 'toutiao'
        ? (hostname === 'toutiao.com' || hostname.endsWith('.toutiao.com')) && (/\/article\//.test(url.pathname) || /^\/i\d+/.test(url.pathname))
        : (hostname === 'douyin.com' || hostname.endsWith('.douyin.com')) && /\/(video|note|jingxuan)\//.test(url.pathname)
      if (!valid || url.protocol !== 'https:' || url.username || url.password) return null
      url.search = ''
      url.hash = ''
      return url.toString()
    } catch { return null }
  }

  private async dismissKnownInformationalOverlays(page: Page): Promise<void> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let dismissed = false
      const firstReleaseDialog = page.locator('[role="dialog"]').filter({ hasText: '首发激励升级为单篇内容补贴' })
      if (await firstReleaseDialog.count() === 1 && await firstReleaseDialog.isVisible()) {
        const close = firstReleaseDialog.locator('button.byte-modal-close-icon, button[aria-label="关闭"]')
        if (await close.count() === 1) { await close.click(); dismissed = true }
      }
      const assistantMoveTip = page.getByText('纠正错别字等原创作助手的功能移到这啦', { exact: false })
      if (!dismissed && await assistantMoveTip.count() > 0 && await assistantMoveTip.first().isVisible()) {
        const understood = page.getByText('我知道了', { exact: true })
        if (await understood.count() === 1 && await understood.isVisible()) { await understood.click(); dismissed = true }
      }
      if (!dismissed) return
      await page.waitForTimeout(250)
    }
  }

  private async firstVisible(page: Page, selector: string) {
    const candidates = page.locator(selector)
    const count = await candidates.count()
    for (let index = 0; index < count; index += 1) {
      const candidate = candidates.nth(index)
      if (await candidate.isVisible()) return candidate
    }
    return null
  }

  private requireWorkspaceId(workspaceId: string): void { if (!isWorkspaceId(workspaceId)) throw new Error('请先选择商户工作区') }

  private profileDirectory(workspaceId: string, platform: MediaPlatform, localReferenceId: string): string { return join(app.getPath('userData'), 'playwright-profiles', workspaceId, platform, localReferenceId, mediaProfileDirectoryName(platform)) }

  private playwrightSameSite(value: string | undefined): 'Strict' | 'Lax' | 'None' {
    if (value === 'Strict' || value === 'strict') return 'Strict'
    if (value === 'None' || value === 'no_restriction') return 'None'
    return 'Lax'
  }

  private contextKey(workspaceId: string, platform: MediaPlatform, localReferenceId: string): string { return `${workspaceId}:${platform}:${localReferenceId}` }
}
