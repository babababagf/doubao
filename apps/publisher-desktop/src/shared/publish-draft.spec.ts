import { describe, expect, it } from 'vitest'
import { articleHtmlToPlainText, validateLocalArticleDraft } from './publish-draft'

describe('publish draft clipboard text', () => {
  it('保留文章段落并去除 HTML 标记', () => {
    expect(articleHtmlToPlainText('<h2>服务方案</h2><p>第一段&nbsp;内容<br>继续说明。</p><p>第二段 &amp; 补充。</p>'))
      .toBe('服务方案\n第一段 内容\n继续说明。\n第二段 & 补充。')
  })

  it('不复制内部链接或图片信息，只处理传入正文', () => {
    expect(articleHtmlToPlainText('<p>请联系企业顾问</p><img src="https://private.example/image.png">')).toBe('请联系企业顾问')
  })

  it('仅允许符合头条标题长度且有正文的本地草稿', () => {
    expect(validateLocalArticleDraft('西安 GEO 服务指南', '<p>这是可填写的正文。</p>')).toEqual({ ok: true, draft: { title: '西安 GEO 服务指南', body: '这是可填写的正文。' } })
    expect(validateLocalArticleDraft('短', '<p>正文</p>')).toEqual({ ok: false, message: '今日头条标题需为 2-30 个字符，请先在文章列表修改后再执行' })
    expect(validateLocalArticleDraft('正常标题', '<p> </p>')).toEqual({ ok: false, message: '文章正文为空，不能填写到平台编辑器' })
  })
})
