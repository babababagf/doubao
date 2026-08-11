import type { PublisherAttentionReason } from './publisher-api'
import type { DesktopTask, LocalMediaAccount } from '../shared/task-machine'

export function safeAttentionReasonForSubmissionFailure(input: { reason: PublisherAttentionReason; submissionStarted: boolean }): PublisherAttentionReason {
  return input.submissionStarted ? 'submission_unknown' : input.reason
}

export function selectNextExecutableTask(
  tasks: readonly DesktopTask[],
  accounts: readonly LocalMediaAccount[],
): { task: DesktopTask; account: LocalMediaAccount } | null {
  for (const task of tasks) {
    if (task.status !== 'queued' || !task.mediaAccountLocalReferenceId) continue
    const account = accounts.find((item) => item.localReferenceId === task.mediaAccountLocalReferenceId && item.platform === task.platform && item.status === 'connected')
    if (account) return { task, account }
  }
  return null
}
