import { describe, expect, it } from 'vitest'

import { isValidAccountText, normalizeUsername } from './password-policy'

describe('账户与密码格式', () => {
  it('仅接受6至12位英文字母或数字', () => {
    expect(isValidAccountText('demo001')).toBe(true)
    expect(isValidAccountText('a1b2c3d4e5f6')).toBe(true)
    expect(isValidAccountText('short')).toBe(false)
    expect(isValidAccountText('with-hyphen')).toBe(false)
    expect(isValidAccountText('中文账号123')).toBe(false)
  })

  it('用户名按不区分大小写规范化', () => {
    expect(normalizeUsername('Demo001')).toBe('demo001')
  })
})
