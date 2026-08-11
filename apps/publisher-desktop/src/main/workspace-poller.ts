export type WorkspacePollTarget = { workspaceId: string }

export class WorkspaceTaskPoller {
  private readonly inFlight = new Set<string>()
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly listTargets: () => Promise<readonly WorkspacePollTarget[]>,
    private readonly syncTarget: (workspaceId: string) => Promise<void>,
    private readonly cycleFinished: () => void | Promise<void> = () => undefined,
  ) {}

  start(intervalMs: number): void {
    if (!Number.isInteger(intervalMs) || intervalMs < 5_000) throw new Error('工作区轮询间隔不能低于 5 秒')
    this.stop()
    void this.runOnce()
    this.timer = setInterval(() => { void this.runOnce() }, intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async runOnce(): Promise<void> {
    const targets = await this.listTargets()
    const uniqueWorkspaceIds = [...new Set(targets.map((target) => target.workspaceId))]
    await Promise.allSettled(uniqueWorkspaceIds.map((workspaceId) => this.syncOne(workspaceId)))
    await this.cycleFinished()
  }

  private async syncOne(workspaceId: string): Promise<void> {
    if (this.inFlight.has(workspaceId)) return
    this.inFlight.add(workspaceId)
    try { await this.syncTarget(workspaceId) } finally { this.inFlight.delete(workspaceId) }
  }
}
