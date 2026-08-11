import { describe, expect, it } from 'vitest'

import { sanitizeArticleContent } from './article-sanitizer'

describe('sanitizeArticleContent', () => {
  it('保留允许的文本结构，移除脚本、事件属性和危险链接', () => {
    const cleaned = sanitizeArticleContent('<h2>服务说明</h2><p onclick="alert(1)">这是经过核验的企业服务内容，长度足够用于文章保存。</p><script>alert(1)</script><a href="javascript:alert(1)">危险链接</a><img src="javascript:bad" onerror="alert(1)">')
    expect(cleaned).toContain('<h2>服务说明</h2>')
    expect(cleaned).toContain('这是经过核验的企业服务内容')
    expect(cleaned).not.toMatch(/script|onclick|javascript:|onerror/i)
  })
})
