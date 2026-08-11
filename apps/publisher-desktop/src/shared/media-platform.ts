export type MediaPlatform = 'toutiao' | 'douyin'

export interface MediaPlatformConfig {
  id: MediaPlatform
  displayName: string
  loginUrl: string
  publisherUrl: string
  allowedHosts: readonly string[]
}

export const mediaPlatforms: Record<MediaPlatform, MediaPlatformConfig> = {
  toutiao: {
    id: 'toutiao',
    displayName: '今日头条',
    loginUrl: 'https://mp.toutiao.com/profile_v4/',
    publisherUrl: 'https://mp.toutiao.com/profile_v4/graphic/publish',
    allowedHosts: ['mp.toutiao.com', 'sso.toutiao.com'],
  },
  douyin: {
    id: 'douyin',
    displayName: '抖音',
    loginUrl: 'https://creator.douyin.com/',
    publisherUrl: 'https://creator.douyin.com/creator-micro/content/upload',
    allowedHosts: ['creator.douyin.com', 'www.douyin.com', 'sso.douyin.com', 'passport.douyin.com'],
  },
}

const mediaSessionDomainSuffixes: Record<MediaPlatform, readonly string[]> = {
  toutiao: ['toutiao.com', 'toutiaocdn.com', 'byteimg.com', 'snssdk.com', 'bytedance.com', 'bytegoofy.com', 'zijieapi.com'],
  douyin: ['douyin.com', 'iesdouyin.com', 'douyinvod.com', 'douyinpic.com', 'douyincdn.com', 'byteimg.com', 'snssdk.com', 'bytedance.com', 'bytegoofy.com', 'zijieapi.com'],
}

export function isAllowedMediaSessionHost(platform: MediaPlatform, rawHost: string): boolean {
  const hostname = rawHost.toLowerCase().replace(/^\.+/, '').replace(/\.+$/, '')
  return mediaSessionDomainSuffixes[platform].some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))
}

export function mediaProfileDirectoryName(platform: MediaPlatform): string {
  return `playwright-profile-${platform}`
}

export function isAllowedMediaNavigation(platform: MediaPlatform, rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'https:' && mediaPlatforms[platform].allowedHosts.includes(url.hostname)
  } catch {
    return false
  }
}

export interface LocalLoginPageSignal {
  url: string
  hasLoginForm: boolean
}

export type LocalLoginProbe = 'login_required' | 'awaiting_manual_verification'
export type LocalLoginProgress = 'awaiting_scan' | 'candidate_authenticated' | 'not_open'

export function classifyLocalLoginPage(platform: MediaPlatform, signal: LocalLoginPageSignal): LocalLoginProbe {
  try {
    const url = new URL(signal.url)
    const knownToutiaoLogin = platform === 'toutiao' && url.hostname === 'mp.toutiao.com' && url.pathname.startsWith('/auth/page/login')
    if (knownToutiaoLogin || signal.hasLoginForm) return 'login_required'
  } catch {
    return 'login_required'
  }
  return 'awaiting_manual_verification'
}

export function classifyLocalLoginProgress(platform: MediaPlatform, signal: LocalLoginPageSignal & { bodyText: string; open: boolean }): LocalLoginProgress {
  if (!signal.open) return 'not_open'
  if (classifyLocalLoginPage(platform, signal) === 'login_required') return 'awaiting_scan'
  const text = signal.bodyText.replace(/\s+/g, '')
  if (/扫码登录|手机登录|验证码登录|请登录|登录后/.test(text)) return 'awaiting_scan'
  return 'candidate_authenticated'
}
