import { describe, expect, it } from 'vitest'
import { classifyLocalLoginPage, classifyLocalLoginProgress, isAllowedMediaNavigation, mediaProfileDirectoryName } from './media-platform'

describe('media platform boundaries', () => {
  it('uses isolated persistent local profiles per platform', () => {
    expect(mediaProfileDirectoryName('toutiao')).toBe('playwright-profile-toutiao')
    expect(mediaProfileDirectoryName('douyin')).toBe('playwright-profile-douyin')
  })

  it('allows only declared HTTPS login and publisher hosts', () => {
    expect(isAllowedMediaNavigation('toutiao', 'https://mp.toutiao.com/profile_v4/')).toBe(true)
    expect(isAllowedMediaNavigation('douyin', 'https://creator.douyin.com/creator-micro/content/upload')).toBe(true)
    expect(isAllowedMediaNavigation('douyin', 'http://creator.douyin.com/')).toBe(false)
    expect(isAllowedMediaNavigation('toutiao', 'https://example.com/redirect')).toBe(false)
  })

  it('只识别已知登录界面，不把未知页面当成登录成功', () => {
    expect(classifyLocalLoginPage('toutiao', { url: 'https://mp.toutiao.com/auth/page/login?redirect_url=x', hasLoginForm: true })).toBe('login_required')
    expect(classifyLocalLoginPage('douyin', { url: 'https://creator.douyin.com/', hasLoginForm: true })).toBe('login_required')
    expect(classifyLocalLoginPage('douyin', { url: 'https://creator.douyin.com/creator-micro/content/upload', hasLoginForm: false })).toBe('awaiting_manual_verification')
    expect(classifyLocalLoginPage('toutiao', { url: 'not a url', hasLoginForm: false })).toBe('login_required')
  })

  it('扫码页只观察，不提前跳转发布页', () => {
    expect(classifyLocalLoginProgress('douyin', { open: true, url: 'https://creator.douyin.com/', hasLoginForm: false, bodyText: '扫码登录 使用抖音 App 扫码' })).toBe('awaiting_scan')
    expect(classifyLocalLoginProgress('toutiao', { open: true, url: 'https://mp.toutiao.com/auth/page/login', hasLoginForm: false, bodyText: '' })).toBe('awaiting_scan')
    expect(classifyLocalLoginProgress('toutiao', { open: true, url: 'https://mp.toutiao.com/profile_v4/', hasLoginForm: false, bodyText: '创作中心 数据概览' })).toBe('candidate_authenticated')
    expect(classifyLocalLoginProgress('douyin', { open: false, url: '', hasLoginForm: false, bodyText: '' })).toBe('not_open')
  })
})
