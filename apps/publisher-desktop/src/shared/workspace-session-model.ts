export interface WorkspaceSessionRecord {
  workspaceId: string
  accessToken: string
  username: string
  expiresAt: string
}

export interface WorkspaceSessionVault {
  version: 2
  sessions: WorkspaceSessionRecord[]
}

export function emptyWorkspaceSessionVault(): WorkspaceSessionVault {
  return { version: 2, sessions: [] }
}

export function validWorkspaceSessions(value: unknown, now = new Date()): WorkspaceSessionRecord[] {
  if (!value || typeof value !== 'object') return []
  const candidate = value as { sessions?: unknown }
  if (!Array.isArray(candidate.sessions)) return []
  const unique = new Map<string, WorkspaceSessionRecord>()
  for (const item of candidate.sessions) {
    if (!item || typeof item !== 'object') continue
    const row = item as Partial<WorkspaceSessionRecord>
    const expiresAt = typeof row.expiresAt === 'string' ? new Date(row.expiresAt) : null
    if (!isWorkspaceId(row.workspaceId) || typeof row.accessToken !== 'string' || !row.accessToken || typeof row.username !== 'string' || !row.username || !expiresAt || !Number.isFinite(expiresAt.getTime()) || expiresAt <= now) continue
    unique.set(row.workspaceId, { workspaceId: row.workspaceId, accessToken: row.accessToken, username: row.username, expiresAt: expiresAt.toISOString() })
  }
  return [...unique.values()]
}

export function upsertWorkspaceSession(vault: WorkspaceSessionVault, input: Omit<WorkspaceSessionRecord, 'workspaceId'>, createWorkspaceId: () => string): { vault: WorkspaceSessionVault; session: WorkspaceSessionRecord } {
  const canonical = input.username.trim().toLocaleLowerCase('en-US')
  const existing = vault.sessions.find((session) => session.username.trim().toLocaleLowerCase('en-US') === canonical)
  const session = { ...input, username: input.username.trim(), workspaceId: existing?.workspaceId ?? createWorkspaceId() }
  return { vault: { version: 2, sessions: [...vault.sessions.filter((item) => item.workspaceId !== session.workspaceId), session] }, session }
}

export function removeWorkspaceSession(vault: WorkspaceSessionVault, workspaceId: string): WorkspaceSessionVault {
  return { version: 2, sessions: vault.sessions.filter((session) => session.workspaceId !== workspaceId) }
}

export function isWorkspaceId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
