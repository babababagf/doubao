export type DoubaoSourceRef = { title: string; url: string }

type ResponseOutput = { type?: unknown; content?: Array<{ text?: unknown; annotations?: unknown }> }
type ResponsePayload = { output_text?: unknown; output?: ResponseOutput[] }

export function hasWebSearchCall(payload: ResponsePayload): boolean {
  return Boolean(payload.output?.some((item) => item.type === 'web_search_call'))
}

export function responseText(payload: ResponsePayload): string | null {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim()
  const nested = payload.output?.flatMap((item) => item.type === 'message' ? item.content ?? [] : [])
    .map((item) => item.text).find((item): item is string => typeof item === 'string' && Boolean(item.trim()))
  return nested?.trim() ?? null
}

export function responseSources(payload: ResponsePayload): DoubaoSourceRef[] {
  const output = payload.output ?? []
  const candidates = output.flatMap((item) => [item, ...(item.type === 'message' ? item.content ?? [] : [])])
  const found = candidates.flatMap((item) => collect(item, 0))
  const unique = new Map<string, DoubaoSourceRef>()
  for (const source of found) if (!unique.has(source.url)) unique.set(source.url, source)
  return [...unique.values()].slice(0, 12)
}

function collect(value: unknown, depth: number): DoubaoSourceRef[] {
  if (depth > 5) return []
  if (Array.isArray(value)) return value.flatMap((item) => collect(item, depth + 1))
  if (!value || typeof value !== 'object') return []
  const row = value as Record<string, unknown>
  const own = sourceFrom(row)
  return [...(own ? [own] : []), ...Object.values(row).flatMap((item) => collect(item, depth + 1))]
}

function sourceFrom(row: Record<string, unknown>): DoubaoSourceRef | null {
  const rawUrl = ['url', 'source_url', 'sourceUrl', 'href'].map((key) => row[key]).find((item): item is string => typeof item === 'string' && Boolean(item.trim()))
  if (!rawUrl) return null
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hostname === 'localhost') return null
    // 方舟联网搜索可能返回内部跳转/签名资源。它们不是商户可核验的内容页面，不能混入来源展示或渠道判断。
    if (/(^|\.)[^.]*volcsearch-sign\.byteimg\.com$/i.test(parsed.hostname)) return null
    parsed.search = ''
    parsed.hash = ''
    const rawTitle = ['title', 'source_title', 'sourceTitle', 'name'].map((key) => row[key]).find((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    return { title: (rawTitle ?? parsed.hostname).trim().slice(0, 200), url: parsed.toString() }
  } catch { return null }
}
