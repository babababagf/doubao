import { describe, expect, it } from 'vitest'

import { isAllowedUpdateFeed, isValidUpdateVersion, isVersionBelow, resolveUpdateReleaseNotes } from './update-policy'

describe('发布助手更新源约束', () => {
  it('只允许公开 HTTPS 地址', () => {
    expect(isAllowedUpdateFeed('https://updates.example.com/publisher/win')).toBe(true)
    expect(isAllowedUpdateFeed('http://updates.example.com')).toBe(false)
    expect(isAllowedUpdateFeed('https://localhost/update')).toBe(false)
    expect(isAllowedUpdateFeed('https://127.0.0.1/update')).toBe(false)
    expect(isAllowedUpdateFeed('https://user:pass@updates.example.com')).toBe(false)
  })

  it('校验并比较最低支持版本', () => {
    expect(isValidUpdateVersion('0.1.5')).toBe(true)
    expect(isValidUpdateVersion('v0.1.5')).toBe(false)
    expect(isValidUpdateVersion('0.1')).toBe(false)
    expect(isVersionBelow('0.1.5', '0.2.0')).toBe(true)
    expect(isVersionBelow('1.10.0', '1.2.0')).toBe(false)
    expect(isVersionBelow('1.1.0', '0.2.10')).toBe(false)
  })

  it('安装包说明优先，总后台说明作为兜底', () => {
    expect(resolveUpdateReleaseNotes(' 安装包说明 ', '总后台说明')).toBe('安装包说明')
    expect(resolveUpdateReleaseNotes('', ' 总后台说明 ')).toBe('总后台说明')
    expect(resolveUpdateReleaseNotes([{ version: '0.1.15', note: '修复 A' }, { version: '0.1.14', note: '修复 B' }], '兜底')).toBe('修复 A\n\n修复 B')
    expect(resolveUpdateReleaseNotes([{ note: null }, null], '兜底')).toBe('兜底')
  })
})
