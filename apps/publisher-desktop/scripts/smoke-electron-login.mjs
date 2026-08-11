import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import process from 'node:process'
import { _electron as electron } from 'playwright-core'

const username = process.env.PUBLISHER_SMOKE_USERNAME?.trim()
const password = process.env.PUBLISHER_SMOKE_PASSWORD
if (!username || !password) {
  process.stderr.write('请通过 PUBLISHER_SMOKE_USERNAME 和 PUBLISHER_SMOKE_PASSWORD 提供本地验收账号\n')
  process.exit(2)
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(scriptDir, '..')
const mainEntry = join(appRoot, 'out', 'main', 'index.mjs')
const require = createRequire(import.meta.url)
const electronPath = require('electron')
const tempPrefix = join(tmpdir(), 'doubaohk-publisher-smoke-')
const tempRoot = await mkdtemp(tempPrefix)
let application

try {
  application = await electron.launch({
    executablePath: electronPath,
    args: [mainEntry, `--user-data-dir=${join(tempRoot, 'user-data')}`],
    cwd: appRoot,
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: '0',
      PUBLISHER_API_BASE_URL: process.env.PUBLISHER_API_BASE_URL ?? 'http://127.0.0.1:3010/api',
    },
    timeout: 30_000,
  })

  const window = await application.firstWindow({ timeout: 30_000 })
  await window.getByRole('heading', { name: '登录发布助手' }).waitFor({ state: 'visible', timeout: 20_000 })
  await window.locator('input[autocomplete="username"]').fill(username)
  await window.locator('input[autocomplete="current-password"]').fill(password)
  await window.getByRole('button', { name: '登录并进入工作区' }).click()

  const merchantReady = window.getByText(`当前商户：${username}`, { exact: true })
  const loginError = window.locator('.login-gate .login-error')
  let loginOutcome = null
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await merchantReady.isVisible()) { loginOutcome = 'ready'; break }
    if (await loginError.isVisible()) { loginOutcome = 'error'; break }
    await window.waitForTimeout(500)
  }
  if (loginOutcome === 'error') throw new Error(`发布助手登录失败：${(await loginError.innerText()).trim() || '未返回原因'}`)
  if (loginOutcome !== 'ready') throw new Error(`发布助手登录20秒后无结果：${(await window.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 500)}`)
  await window.getByRole('button', { name: '媒体账号', exact: true }).click()
  await window.getByText('添加独立发布账号', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
  const platformOptions = await window.locator('.accounts-toolbar select option').allTextContents()
  if (!platformOptions.includes('今日头条') || !platformOptions.includes('抖音')) throw new Error('媒体账号入口缺少头条或抖音平台')

  await window.getByRole('button', { name: '退出此账号', exact: true }).click()
  await window.getByRole('heading', { name: '登录发布助手' }).waitFor({ state: 'visible', timeout: 10_000 })
  process.stdout.write(`${JSON.stringify({ ok: true, login: true, mediaAccountEntry: true, platforms: platformOptions, logout: true })}\n`)
} finally {
  if (application) await application.close().catch(() => undefined)
  const resolvedTempRoot = resolve(tempRoot)
  if (resolvedTempRoot.startsWith(resolve(tempPrefix))) await rm(resolvedTempRoot, { recursive: true, force: true })
}
