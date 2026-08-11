import type { LocalMediaAccount, SyncedPublisherTask } from './task-machine'

const automaticallyRecoverableReasons = new Set(['login_required', 'captcha_required'])

/** 仅在用户已完成同一账号的登录或安全验证后，自动恢复最终提交前中断的任务。 */
export function recoverableTaskIdsForVerifiedAccount(
  tasks: readonly SyncedPublisherTask[],
  account: Pick<LocalMediaAccount, 'localReferenceId' | 'platform'>,
): string[] {
  return tasks
    .filter((task) => (
      task.status === 'attention'
      && task.canResume
      && task.platform === account.platform
      && task.targetAccount.localReferenceId === account.localReferenceId
      && task.attentionReason !== null
      && automaticallyRecoverableReasons.has(task.attentionReason)
    ))
    .map((task) => task.id)
}
