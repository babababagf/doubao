import { describe, expect, it } from 'vitest'

import { normalizeWebsiteList, truncateWebsiteText } from './website-profile'

describe('网站资料版面限制', () => {
  it('按中文字符数截断单行字段', () => {
    expect(truncateWebsiteText('  面向企业提供专业内容服务  ', 8)).toBe('面向企业提供专业')
  })

  it('拆分模型混合分隔符、去重并限制条数与单项长度', () => {
    expect(normalizeWebsiteList([
      '优势一，优势二；优势三\n优势四',
      '优势一',
      `超长${'内容'.repeat(40)}`,
    ], 4, 10)).toEqual(['优势一', '优势二', '优势三', '优势四'])
  })

  it('旧资料超过版面条数时只加载允许的项目', () => {
    expect(normalizeWebsiteList(['一', '二', '三', '四', '五', '六'], 4, 60)).toEqual(['一', '二', '三', '四'])
  })
})
