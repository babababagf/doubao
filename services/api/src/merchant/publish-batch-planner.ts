export type PublishPlatform = 'toutiao' | 'douyin'
export type PublishDeduplication = 'per_platform' | 'all_platforms'

export interface ExistingPublishAssignment {
  articleId: string
  platform: PublishPlatform
  deduplicationMode: PublishDeduplication
}

export interface PlannedPublishAssignment {
  articleId: string
  platform: PublishPlatform
  mediaAccountId: string
  scheduledAt: Date
}

interface PlanInput {
  articleIds: string[]
  platforms: PublishPlatform[]
  accountsByPlatform: Record<PublishPlatform, string[]>
  publishCount: number
  deduplicationMode: PublishDeduplication
  dailyLimits: Record<PublishPlatform, number>
  existing: ExistingPublishAssignment[]
  startsAt: Date
}

const dayMs = 24 * 60 * 60 * 1000

export function planPublishAssignments(input: PlanInput): { assignments: PlannedPublishAssignment[]; skippedDuplicateCount: number; estimatedTaskCount: number } {
  if (!input.platforms.length) throw new Error('至少需要一个发布平台')
  for (const platform of input.platforms) {
    if (!input.accountsByPlatform[platform].length) throw new Error(`平台 ${platform} 至少需要一个发布账号`)
  }
  const existingByArticle = new Map<string, ExistingPublishAssignment[]>()
  for (const item of input.existing) existingByArticle.set(item.articleId, [...(existingByArticle.get(item.articleId) ?? []), item])
  const assignments: PlannedPublishAssignment[] = []
  let skippedDuplicateCount = 0

  if (input.deduplicationMode === 'all_platforms') {
    const eligible = input.articleIds.filter((articleId) => {
      const duplicate = (existingByArticle.get(articleId)?.length ?? 0) > 0
      if (duplicate) skippedDuplicateCount += 1
      return !duplicate
    }).slice(0, input.publishCount)
    const platformIndexes: Record<PublishPlatform, number> = { toutiao: 0, douyin: 0 }
    eligible.forEach((articleId, index) => {
      const platform = input.platforms[index % input.platforms.length]!
      const accounts = input.accountsByPlatform[platform]
      const platformIndex = platformIndexes[platform]++
      assignments.push({
        articleId,
        platform,
        mediaAccountId: accounts[platformIndex % accounts.length]!,
        scheduledAt: new Date(input.startsAt.getTime() + Math.floor(platformIndex / input.dailyLimits[platform]) * dayMs),
      })
    })
    return { assignments, skippedDuplicateCount, estimatedTaskCount: Math.min(input.publishCount, eligible.length) }
  }

  for (const platform of input.platforms) {
    const accounts = input.accountsByPlatform[platform]
    const eligible = input.articleIds.filter((articleId) => {
      const existing = existingByArticle.get(articleId) ?? []
      const duplicate = existing.some((item) => item.platform === platform || item.deduplicationMode === 'all_platforms')
      if (duplicate) skippedDuplicateCount += 1
      return !duplicate
    }).slice(0, input.publishCount)
    eligible.forEach((articleId, index) => assignments.push({
      articleId,
      platform,
      mediaAccountId: accounts[index % accounts.length]!,
      scheduledAt: new Date(input.startsAt.getTime() + Math.floor(index / input.dailyLimits[platform]) * dayMs),
    }))
  }
  return { assignments, skippedDuplicateCount, estimatedTaskCount: input.publishCount * input.platforms.length }
}
