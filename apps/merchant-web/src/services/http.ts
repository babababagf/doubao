const API_PREFIX = '/api'
const MOCK_SESSION_KEY = 'doubao.mock.session'
const AUTH_MARKER_KEY = 'doubao.authenticated'
// 真实 API 是默认且唯一的日常运行路径；Mock 仅供显式的 UI 测试命令使用。
const isRealApiMode = import.meta.env.MODE !== 'mock'

interface ApiErrorPayload {
  code?: string
  message?: string
  requestId?: string
}

export class ApiError extends Error {
  readonly code: string
  readonly requestId: string | undefined
  readonly status: number

  constructor(message: string, status: number, code = 'UNKNOWN_ERROR', requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

function buildHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers)
  const sessionId = sessionStorage.getItem(MOCK_SESSION_KEY)

  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (!isRealApiMode && sessionId) {
    headers.set('X-Mock-Session', sessionId)
  }

  return headers
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    credentials: 'include',
    headers: buildHeaders(init),
  })

  if (!response.ok) {
    let payload: ApiErrorPayload = {}

    try {
      payload = (await response.json()) as ApiErrorPayload
    } catch {
      // 非 JSON 网关错误仍转换为统一、可行动的前端错误。
    }

    throw new ApiError(
      payload.message ?? '请求失败，请稍后重试',
      response.status,
      payload.code,
      payload.requestId,
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export { AUTH_MARKER_KEY, MOCK_SESSION_KEY, isRealApiMode }
