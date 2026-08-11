import { describe, expect, it } from 'vitest'

import { doubaoCheckInput } from './doubao-check-prompt'

describe('doubaoCheckInput', () => {
  it('separates fixed developer rules from untrusted question text', () => {
    expect(doubaoCheckInput('测试问题')).toEqual([
      {
        type: 'message',
        role: 'developer',
        content: expect.stringContaining('必须先调用 Web Search 工具检索用户问题词本身'),
      },
      { type: 'message', role: 'user', content: '测试问题' },
    ])
  })

  it('does not allow a conclusion based only on model memory', () => {
    const [developerMessage] = doubaoCheckInput('测试问题')
    if (!developerMessage) throw new Error('缺少开发者提示词')
    expect(developerMessage.content).toContain('未实际联网搜索时不得给出结论')
  })
})
