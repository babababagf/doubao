const namedEntities: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

export interface LocalArticleDraft {
  title: string
  body: string
}

export type LocalArticleDraftValidation =
  | { ok: true; draft: LocalArticleDraft }
  | { ok: false; message: string }

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&(nbsp|amp|lt|gt|quot);|&#39;/gi, (entity) => namedEntities[entity.toLowerCase()] ?? entity)
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, rawCodePoint: string) => {
      const codePoint = rawCodePoint.toLowerCase().startsWith('x') ? Number.parseInt(rawCodePoint.slice(1), 16) : Number.parseInt(rawCodePoint, 10)
      return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity
    })
}

/**
 * 将后台已生成文章转为适合自动填写到平台编辑器的纯文本。
 * 不包含任务号、链接或图片地址，避免把内部信息传入第三方平台。
 */
export function articleHtmlToPlainText(content: string): string {
  return decodeHtmlEntities(content)
    .replace(/\r\n?/g, '\n')
    .replace(/<(?:br\s*\/?)\s*>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote|pre)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 第三方平台全自动发布前的最小草稿校验。
 * 通过这里只代表允许进入自动填写阶段；最终提交仍由独立的安全步骤处理验证码、结果不明和幂等回传。
 */
export function validateLocalArticleDraft(title: string, content: string): LocalArticleDraftValidation {
  const normalizedTitle = title.trim()
  const body = articleHtmlToPlainText(content)
  const titleLength = Array.from(normalizedTitle).length
  if (titleLength < 2 || titleLength > 30) return { ok: false, message: '今日头条标题需为 2-30 个字符，请先在文章列表修改后再执行' }
  if (!body) return { ok: false, message: '文章正文为空，不能填写到平台编辑器' }
  if (body.length > 50_000) return { ok: false, message: '文章正文超过本地安全填写上限，请拆分后再执行' }
  return { ok: true, draft: { title: normalizedTitle, body } }
}
