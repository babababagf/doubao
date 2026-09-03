<script setup lang="ts">
import type { ArticleGroup, MediaAccount, PublishTask } from '@doubaohk/api-contract'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { platformLogos } from '@/assets/platform-logos'
import { createPublishTasks, listArticleGroups, listMediaAccounts, listPublishTasks } from '@/services/merchant.service'
import { formatDateTime } from '@/utils/format'

type Platform = 'toutiao' | 'douyin' | 'smzdm'
type DeduplicationMode = 'none' | 'per_platform' | 'all_platforms'

const platformOrder: Platform[] = ['toutiao', 'douyin', 'smzdm']
const route = useRoute()
const router = useRouter()
const articleGroups = ref<ArticleGroup[]>([])
const accounts = ref<MediaAccount[]>([])
const tasks = ref<PublishTask[]>([])
const loading = ref(true)
const refreshing = ref(false)
const creating = ref(false)
const creatorOpen = ref(false)
const expandedBatchId = ref<string | null>(null)
const taskName = ref('')
const selectedGroupId = ref('')
const selectedPlatforms = ref<Platform[]>([...platformOrder])
const selectedAccountIds = ref<string[]>([])
const publishCounts = ref<Record<Platform, number>>({ toutiao: 3, douyin: 3, smzdm: 3 })
const dailyLimits = ref<Record<Platform, number>>({ toutiao: 3, douyin: 3, smzdm: 3 })
const deduplicationMode = ref<DeduplicationMode>('per_platform')
const idempotencyKey = ref(crypto.randomUUID())
let refreshTimer: number | null = null

const realArticleGroups = computed(() => articleGroups.value.filter((group) => !group.isUngrouped))
const selectedGroup = computed(() => realArticleGroups.value.find((group) => group.id === selectedGroupId.value) ?? null)
const connectedAccounts = computed(() => accounts.value.filter((account): account is MediaAccount & { id: string } => Boolean(account.id) && account.status === 'connected'))
const selectableAccounts = computed(() => connectedAccounts.value.filter((account) => selectedPlatforms.value.includes(account.platform)))
const requestedExecutionCount = computed(() => selectedPlatforms.value.reduce((total, platform) => total + publishCounts.value[platform], 0))

const batches = computed(() => {
  const grouped = new Map<string, PublishTask[]>()
  for (const task of tasks.value) {
    const key = task.batchId ?? task.id
    grouped.set(key, [...(grouped.get(key) ?? []), task])
  }
  return [...grouped.entries()].map(([id, batchTasks]) => {
    const ordered = [...batchTasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const completed = ordered.filter((task) => task.status === 'succeeded').length
    const progress = ordered.length ? Math.round(ordered.reduce((sum, task) => sum + task.progress, 0) / ordered.length) : 0
    return { id, name: ordered[0]?.taskName ?? '发布任务', groupName: ordered[0]?.articleGroupName ?? '文章库', tasks: ordered, completed, progress, status: batchStatus(ordered), createdAt: ordered[0]?.createdAt ?? '' }
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
})

const platformLabel = (platform: string) => platform === 'toutiao' ? '今日头条' : platform === 'douyin' ? '抖音' : '什么值得买'
const platformShortLabel = (platform: string) => platform === 'toutiao' ? '头条' : platform === 'douyin' ? '抖音' : '值得买'
const stateLabel = (status: string) => ({
  scheduled: '待排期', queued: '排队中', running: '执行中', paused: '已暂停', attention: '需处理', succeeded: '已成功', failed: '失败', stopped: '已停止',
})[status] || status
const accountStateLabel = (status: string) => ({
  connected: '已授权', expired: '已过期', verification_required: '需验证', unbound: '未授权', connection_requested: '等待授权',
})[status] || '状态未知'
const stepLabel = (step: string) => ({
  waiting: '等待领取', scheduled: '等待排期', claimed: '已领取', preparing: '执行前检查', assets: '准备配图', session: '恢复账号', filling: '填写内容', submitting: '提交平台', verifying: '核验结果', paused: '已暂停', attention: '等待处理', resumed: '已恢复', completed: '发布完成',
})[step] || step

function batchStatus(rows: PublishTask[]): PublishTask['status'] {
  const priority: PublishTask['status'][] = ['attention', 'running', 'paused', 'queued', 'scheduled', 'failed', 'stopped', 'succeeded']
  return priority.find((status) => rows.some((task) => task.status === status)) ?? 'scheduled'
}

function platformAccountSummary(platform: Platform): { total: number; connected: number } {
  const rows = accounts.value.filter((account) => account.platform === platform)
  return { total: rows.length, connected: rows.filter((account) => account.status === 'connected').length }
}

function resetForm(): void {
  taskName.value = `发布任务 ${new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
  selectedGroupId.value = realArticleGroups.value.find((group) => group.completedCount > 0)?.id ?? realArticleGroups.value[0]?.id ?? ''
  selectedPlatforms.value = [...platformOrder]
  selectedAccountIds.value = []
  publishCounts.value = { toutiao: 3, douyin: 3, smzdm: 3 }
  dailyLimits.value = { toutiao: 3, douyin: 3, smzdm: 3 }
  deduplicationMode.value = 'per_platform'
  idempotencyKey.value = crypto.randomUUID()
  normalizeAccountSelection()
}

function openCreator(): void {
  resetForm()
  creatorOpen.value = true
}

function closeCreator(): void {
  creatorOpen.value = false
  if (route.query.create === '1') void router.replace({ name: 'publish-tasks' })
}

function normalizeAccountSelection(): void {
  const allowedIds = new Set(selectableAccounts.value.map((account) => account.id))
  selectedAccountIds.value = selectedAccountIds.value.filter((id) => allowedIds.has(id))
  for (const platform of selectedPlatforms.value) {
    const selected = selectableAccounts.value.some((account) => account.platform === platform && selectedAccountIds.value.includes(account.id))
    if (!selected) {
      const first = selectableAccounts.value.find((account) => account.platform === platform)
      if (first) selectedAccountIds.value.push(first.id)
    }
  }
}

async function loadTasks(silent = false): Promise<void> {
  if (!silent) refreshing.value = true
  try {
    tasks.value = await listPublishTasks()
  } catch (error) {
    if (!silent) ElMessage.error(error instanceof Error ? error.message : '任务列表加载失败')
  } finally {
    refreshing.value = false
  }
}

async function load(): Promise<void> {
  loading.value = true
  const results = await Promise.allSettled([listArticleGroups(), listMediaAccounts(), listPublishTasks()])
  if (results[0].status === 'fulfilled') articleGroups.value = results[0].value
  if (results[1].status === 'fulfilled') accounts.value = results[1].value
  if (results[2].status === 'fulfilled') tasks.value = results[2].value
  const failed = results.filter((result) => result.status === 'rejected')
  if (failed.length) ElMessage.warning(`有 ${failed.length} 项发布数据暂时未能加载，可稍后刷新`)
  loading.value = false
  resetForm()
  if (route.query.create === '1') creatorOpen.value = true
}

function validateForm(): string | null {
  if (taskName.value.trim().length < 2 || taskName.value.trim().length > 80) return '任务名称需为 2—80 个字符'
  if (!selectedGroupId.value) return '请选择文章分组'
  if (!selectedPlatforms.value.length) return '请至少选择一个发布平台'
  for (const platform of selectedPlatforms.value) {
    const count = publishCounts.value[platform]
    const daily = dailyLimits.value[platform]
    if (!Number.isInteger(count) || count < 1 || count > 100) return `${platformLabel(platform)}发布数量需为 1—100 的整数`
    if (!Number.isInteger(daily) || daily < 1 || daily > 100) return `${platformLabel(platform)}每日上限需为 1—100 的整数`
    if (!selectableAccounts.value.some((account) => account.platform === platform && selectedAccountIds.value.includes(account.id))) return `${platformLabel(platform)}至少选择一个已授权账号`
  }
  return null
}

async function create(): Promise<void> {
  const invalid = validateForm()
  if (invalid) return void ElMessage.warning(invalid)
  try {
    await ElMessageBox.confirm(
      `将创建 1 个发布任务，包含预计 ${requestedExecutionCount.value} 次发布动作。验证码、风控或结果不明时会停止当前商户队列，等待人工处理。`,
      '确认创建发布任务',
      { confirmButtonText: '确认创建', cancelButtonText: '返回修改', type: 'warning' },
    )
  } catch {
    return
  }
  creating.value = true
  try {
    const result = await createPublishTasks({
      taskName: taskName.value.trim(),
      articleGroupId: selectedGroupId.value,
      platforms: selectedPlatforms.value,
      mediaAccountIds: selectedAccountIds.value,
      publishCounts: publishCounts.value,
      deduplicationMode: deduplicationMode.value,
      dailyLimits: dailyLimits.value,
    }, idempotencyKey.value)
    await loadTasks(true)
    closeCreator()
    ElMessage.success(`“${result.taskName}”已创建，包含 ${result.createdExecutionCount} 次发布动作，跳过 ${result.skippedDuplicateCount} 个重复项`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '创建发布任务失败')
  } finally {
    creating.value = false
  }
}

function toggleBatch(batchId: string): void {
  expandedBatchId.value = expandedBatchId.value === batchId ? null : batchId
}

watch(selectedPlatforms, () => {
  normalizeAccountSelection()
}, { deep: true })
watch(() => route.query.create, (value) => { if (value === '1' && !creatorOpen.value) openCreator() })

onMounted(() => {
  void load()
  refreshTimer = window.setInterval(() => { void loadTasks(true) }, 5_000)
})
onBeforeUnmount(() => {
  if (refreshTimer !== null) window.clearInterval(refreshTimer)
})
</script>

<template>
  <div class="tasks-page">
    <header class="page-header">
      <div class="page-header-main">
        <button class="primary-button" @click="openCreator">＋ 添加任务</button>
        <div>
          <h2>发布任务</h2>
          <p>选择文章和媒体账号发布到各平台，并查看每次发布的进度和结果。</p>
        </div>
      </div>
      <div class="header-actions">
        <button class="secondary-button" :disabled="refreshing" @click="loadTasks()">{{ refreshing ? '刷新中…' : '刷新' }}</button>
      </div>
    </header>

    <section class="authorization-rail" aria-label="媒体账号授权状态">
      <article v-for="platform in platformOrder" :key="platform">
        <span class="platform-brand"><img :src="platformLogos[platform]" alt="" aria-hidden="true"></span>
        <div><strong>{{ platformLabel(platform) }}</strong><small>{{ platformAccountSummary(platform).connected }} 个账号可发布</small></div>
        <b :class="{ ready: platformAccountSummary(platform).connected > 0 }">{{ platformAccountSummary(platform).connected > 0 ? '已就绪' : '待授权' }}</b>
      </article>
    </section>

    <section class="task-list surface-panel">
      <header>
        <div><strong>已创建任务</strong><span>{{ batches.length }} 个发布任务 · {{ tasks.length }} 次发布动作</span></div>
        <small>状态与发布结果自动同步</small>
      </header>

      <div v-if="loading" class="empty-state">正在读取发布任务…</div>
      <div v-else-if="!batches.length" class="empty-state">
        <strong>还没有发布任务</strong>
        <span>点击左上角“添加任务”，选择文章分组、平台和账号。</span>
      </div>
      <article v-for="batch in batches" v-else :key="batch.id" class="batch-card">
        <button class="batch-summary" type="button" @click="toggleBatch(batch.id)">
          <div class="batch-title">
            <strong>{{ batch.name }}</strong>
            <small>{{ batch.groupName }} · 创建于 {{ formatDateTime(batch.createdAt) }}</small>
          </div>
          <div class="platform-stack">
            <span v-for="platform in [...new Set(batch.tasks.map((task) => task.platform))]" :key="platform">{{ platformShortLabel(platform) }}</span>
          </div>
          <div class="progress-cell">
            <div><span :style="{ width: `${batch.progress}%` }" /></div>
            <small>{{ batch.completed }}/{{ batch.tasks.length }} 次发布完成 · {{ batch.progress }}%</small>
          </div>
          <b :class="['status-pill', batch.status]">{{ stateLabel(batch.status) }}</b>
          <i class="chevron" :class="{ open: expandedBatchId === batch.id }">⌄</i>
        </button>

        <div v-if="expandedBatchId === batch.id" class="batch-detail">
          <p class="execution-caption">发布明细：系统按媒体账号逐条串行执行，只有取得平台明确成功信号或官方作品链接才计为成功。</p>
          <article v-for="task in batch.tasks" :key="task.id" class="task-row">
            <div class="task-identity"><b>{{ platformLabel(task.platform) }}</b><strong>{{ task.articleTitle }}</strong><small>V{{ task.articleVersion || '历史' }} · {{ task.mediaAccountName || '未指定账号' }}</small></div>
            <div class="task-progress"><span>{{ stepLabel(task.currentStep) }}</span><strong>{{ task.progress }}%</strong></div>
            <div class="task-time"><small>计划 {{ formatDateTime(task.scheduledAt) }}</small><small>发布 {{ task.publishedAt ? formatDateTime(task.publishedAt) : '—' }}</small></div>
            <b :class="['status-pill', task.status]">{{ stateLabel(task.status) }}</b>
            <p v-if="task.failureReason" class="failure-copy">{{ task.failureReason }}</p>
            <a v-if="task.resultUrl" class="result-link" :href="task.resultUrl" target="_blank" rel="noopener noreferrer">查看平台作品 ↗</a>
            <details v-if="task.logs.length" class="task-logs">
              <summary>执行记录（{{ task.logs.length }}）</summary>
              <ol><li v-for="log in task.logs" :key="log.id"><time>{{ formatDateTime(log.createdAt) }}</time><span>{{ log.message }}</span><b v-if="log.progress !== null">{{ log.progress }}%</b></li></ol>
            </details>
          </article>
        </div>
      </article>
    </section>

    <div v-if="creatorOpen" class="drawer-backdrop" @click.self="closeCreator">
      <aside class="creator-drawer" role="dialog" aria-modal="true" aria-labelledby="creator-title">
        <header><div><h2 id="creator-title">添加发布任务</h2><p>选择文章分组、发布平台和账号，创建一次完整的发布任务。</p></div><button type="button" aria-label="关闭" @click="closeCreator">×</button></header>
        <div class="creator-body">
          <section class="form-section">
            <div class="section-title"><b>1</b><div><strong>任务与文章分组</strong><small>只需选择文章分组，系统会自动安排组内可发布文章。</small></div></div>
            <label class="field-label">任务名称<input v-model="taskName" maxlength="80" placeholder="例如：8 月品牌内容发布"></label>
            <label class="field-label">文章分组
              <select v-model="selectedGroupId"><option value="" disabled>请选择文章分组</option><option v-for="group in realArticleGroups" :key="group.id" :value="group.id">{{ group.name }}（{{ group.completedCount }} 篇）</option></select>
            </label>
            <div class="group-selection-note">
              <strong>{{ selectedGroup ? `已选择“${selectedGroup.name}”` : '尚未选择文章分组' }}</strong>
              <p>创建后将按去重方式自动选择组内可发布文章，并使用文章写作时已保存的正文与图片。</p>
            </div>
          </section>

          <section class="form-section">
            <div class="section-title"><b>2</b><div><strong>平台、数量与账号</strong><small>三个平台默认均发布 3 篇，可分别调整。</small></div></div>
            <article v-for="platform in platformOrder" :key="platform" class="platform-config" :class="{ disabled: !selectedPlatforms.includes(platform) }">
              <label class="platform-choice"><input v-model="selectedPlatforms" type="checkbox" :value="platform"><strong>{{ platformLabel(platform) }}</strong></label>
              <label>发布数量<input v-model.number="publishCounts[platform]" type="number" min="1" max="100" :disabled="!selectedPlatforms.includes(platform)"></label>
              <label>每日上限<input v-model.number="dailyLimits[platform]" type="number" min="1" max="100" :disabled="!selectedPlatforms.includes(platform)"></label>
              <div class="account-choices">
                <label v-for="account in accounts.filter((item) => item.platform === platform)" :key="account.id || account.localReferenceId || account.maskedName || account.status" :class="{ unavailable: account.status !== 'connected' }">
                  <input v-if="account.id" v-model="selectedAccountIds" type="checkbox" :value="account.id" :disabled="account.status !== 'connected'">
                  <span>{{ account.maskedName || '未命名账号' }}</span><b :class="account.status">{{ accountStateLabel(account.status) }}</b>
                </label>
                <p v-if="!accounts.some((item) => item.platform === platform)">暂无账号，请先前往“媒体账号”完成授权。</p>
              </div>
            </article>
          </section>

          <section class="form-section">
            <div class="section-title"><b>3</b><div><strong>去重方式</strong><small>控制历史发布记录是否影响本次任务。</small></div></div>
            <div class="dedup-grid">
              <label :class="{ selected: deduplicationMode === 'none' }"><input v-model="deduplicationMode" type="radio" value="none"><strong>不去重</strong><small>允许文章再次发布到同一平台</small></label>
              <label :class="{ selected: deduplicationMode === 'per_platform' }"><input v-model="deduplicationMode" type="radio" value="per_platform"><strong>单平台去重</strong><small>同篇文章可在不同平台各发布一次</small></label>
              <label :class="{ selected: deduplicationMode === 'all_platforms' }"><input v-model="deduplicationMode" type="radio" value="all_platforms"><strong>全平台去重</strong><small>任一平台发布过后不再创建发布动作</small></label>
            </div>
          </section>
        </div>
        <footer><div><small>创建</small><strong>1</strong><span>个任务 · 预计执行 {{ requestedExecutionCount }} 次发布</span></div><button class="secondary-button" @click="closeCreator">取消</button><button class="primary-button" :disabled="creating" @click="create">{{ creating ? '正在创建…' : '创建任务' }}</button></footer>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.execution-caption{margin:10px 0 2px;padding:9px 12px;border-radius:7px;color:var(--color-text-muted);background:rgba(101,99,255,.06);font-size:11px;line-height:1.55}
.tasks-page{display:grid;max-width:1500px;margin:0 auto;gap:16px}.page-header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px}.page-header-main{display:flex;align-items:center;gap:14px}.page-header-main>.primary-button{flex:0 0 auto}.page-header h2,.creator-drawer h2{margin:0;font-size:26px}.page-header p,.creator-drawer p{margin:5px 0 0;color:var(--color-text-secondary)}.header-actions{display:flex;gap:9px}.primary-button,.secondary-button{min-height:40px;padding:0 17px;border-radius:8px;cursor:pointer}.primary-button{border:1px solid rgba(113,111,255,.65);color:#fff;background:var(--gradient-primary)}.secondary-button{border:1px solid var(--color-border);color:var(--color-text-secondary);background:rgba(7,20,40,.72)}button:disabled{opacity:.48;cursor:not-allowed}.authorization-rail{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.authorization-rail article{display:grid;grid-template-columns:38px 1fr auto;align-items:center;padding:14px 16px;border:1px solid var(--color-border);border-radius:11px;background:rgba(8,24,47,.58);gap:11px}.authorization-rail i{display:grid;width:34px;height:34px;border-radius:9px;place-items:center;color:#fff;font-style:normal;font-weight:700}.platform-toutiao{background:#e34b4d}.platform-douyin{background:linear-gradient(135deg,#18d5d0,#111 45%,#f33671)}.platform-smzdm{background:#d9232e}.authorization-rail div{display:grid;gap:3px}.authorization-rail small{color:var(--color-text-muted)}.authorization-rail article>b{padding:4px 7px;border-radius:5px;color:#e6bd7b;background:rgba(230,189,123,.1);font-size:10px}.authorization-rail article>b.ready{color:#70d6aa;background:rgba(72,198,137,.1)}.task-list{padding:18px}.task-list>header{display:flex;align-items:center;justify-content:space-between;padding-bottom:13px;border-bottom:1px solid var(--color-border)}.task-list>header div{display:flex;align-items:baseline;gap:12px}.task-list>header span,.task-list>header small{color:var(--color-text-muted);font-size:10px}.empty-state{display:grid;min-height:220px;place-content:center;text-align:center;color:var(--color-text-muted);gap:7px}.empty-state strong{color:var(--color-text);font-size:15px}.batch-card{border-bottom:1px solid var(--color-border)}.batch-summary{display:grid;width:100%;grid-template-columns:minmax(260px,1.4fr) minmax(140px,.7fr) minmax(180px,.8fr) auto 22px;align-items:center;padding:16px 4px;border:0;color:var(--color-text);background:transparent;text-align:left;cursor:pointer;gap:15px}.batch-summary:hover{background:rgba(101,99,255,.04)}.batch-title{display:grid;gap:4px}.batch-title strong{font-size:14px}.batch-title small{color:var(--color-text-muted)}.platform-stack{display:flex;gap:5px}.platform-stack span{padding:4px 7px;border:1px solid var(--color-border);border-radius:5px;color:#b8bdff;font-size:10px}.progress-cell{display:grid;gap:5px}.progress-cell>div{height:5px;border-radius:4px;background:rgba(120,130,160,.16);overflow:hidden}.progress-cell>div span{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#6866ff,#54cdb2)}.progress-cell small{color:var(--color-text-muted)}.status-pill{justify-self:start;padding:4px 8px;border-radius:5px;font-size:10px}.scheduled,.queued,.running{color:#aeb7ff;background:rgba(99,90,255,.13)}.paused,.attention{color:#e6bd7b;background:rgba(230,189,123,.1)}.succeeded{color:#70d6aa;background:rgba(72,198,137,.1)}.failed,.stopped{color:#e98b98;background:rgba(243,111,128,.1)}.chevron{color:var(--color-text-muted);font-style:normal;transition:transform .18s}.chevron.open{transform:rotate(180deg)}.batch-detail{padding:0 4px 14px}.task-row{display:grid;grid-template-columns:minmax(280px,1.3fr) 130px 210px auto;align-items:center;margin-top:7px;padding:13px 14px;border:1px solid var(--color-border);border-radius:9px;background:rgba(4,15,31,.35);gap:12px}.task-identity{display:grid;grid-template-columns:75px minmax(160px,1fr);align-items:center;gap:4px 8px}.task-identity>b{color:#b8bdff;font-size:10px}.task-identity>strong{font-size:12px}.task-identity>small{grid-column:2;color:var(--color-text-muted)}.task-progress,.task-time{display:grid;gap:3px}.task-progress span,.task-time small{color:var(--color-text-muted);font-size:10px}.failure-copy,.result-link,.task-logs{grid-column:1/5}.failure-copy{margin:0;color:#e6bd7b;font-size:11px}.result-link{color:#7ddbc0;font-size:11px;text-decoration:none}.task-logs{color:var(--color-text-secondary);font-size:11px}.task-logs summary{cursor:pointer}.task-logs ol{display:grid;margin:9px 0 0;padding:0;list-style:none;gap:6px}.task-logs li{display:grid;grid-template-columns:135px 1fr auto;gap:10px}.task-logs time{color:var(--color-text-muted)}.drawer-backdrop{position:fixed;z-index:1200;inset:0;background:rgba(0,7,18,.72);backdrop-filter:blur(5px)}.creator-drawer{position:absolute;top:0;right:0;display:grid;width:min(880px,94vw);height:100%;grid-template-rows:auto 1fr auto;border-left:1px solid var(--color-border);color:var(--color-text);background:#07172d;box-shadow:-24px 0 70px rgba(0,0,0,.34)}.creator-drawer>header{display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid var(--color-border)}.creator-drawer>header button{width:34px;height:34px;border:1px solid var(--color-border);border-radius:8px;color:var(--color-text-secondary);background:transparent;cursor:pointer;font-size:20px}.creator-body{padding:4px 24px 30px;overflow:auto}.form-section{padding:22px 0;border-bottom:1px solid var(--color-border)}.section-title{display:flex;align-items:center;margin-bottom:16px;gap:10px}.section-title>b{display:grid;width:26px;height:26px;border-radius:8px;color:#c5c8ff;background:rgba(101,99,255,.18);place-items:center}.section-title div{display:grid;gap:2px}.section-title small{color:var(--color-text-muted)}.field-label{display:grid;margin-top:12px;color:var(--color-text-secondary);font-size:11px;gap:6px}.field-label input,.field-label select{height:39px;padding:0 11px;border:1px solid var(--color-border);border-radius:7px;color:var(--color-text);background:rgba(4,15,31,.65)}.group-selection-note{display:grid;margin-top:14px;padding:13px 14px;border:1px solid var(--color-border);border-radius:8px;background:rgba(4,15,31,.42);gap:5px}.group-selection-note strong{font-size:12px}.group-selection-note p,.account-choices p{margin:0;color:var(--color-text-muted);font-size:11px}.platform-config{display:grid;grid-template-columns:160px 120px 120px 1fr;align-items:start;margin-top:9px;padding:13px;border:1px solid var(--color-border);border-radius:9px;gap:10px}.platform-config.disabled{opacity:.58}.platform-choice{display:flex!important;align-items:center!important;gap:8px!important}.platform-config>label{display:grid;color:var(--color-text-secondary);font-size:10px;gap:5px}.platform-config input[type=number]{width:82px;height:31px;padding:0 8px;border:1px solid var(--color-border);border-radius:6px;color:var(--color-text);background:rgba(4,15,31,.6)}.account-choices{display:flex;flex-wrap:wrap;gap:6px}.account-choices label{display:flex;align-items:center;padding:5px 7px;border:1px solid var(--color-border);border-radius:6px;gap:5px;font-size:10px}.account-choices label.unavailable{opacity:.62}.account-choices b.connected{color:#70d6aa}.account-choices b:not(.connected){color:#e6bd7b}.dedup-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.dedup-grid label{display:grid;grid-template-columns:18px 1fr;padding:13px;border:1px solid var(--color-border);border-radius:8px;cursor:pointer;gap:4px}.dedup-grid label.selected{border-color:rgba(105,103,255,.68);background:rgba(93,91,225,.1)}.dedup-grid input{grid-row:1/3}.dedup-grid small{grid-column:2;color:var(--color-text-muted);font-size:10px}.creator-drawer>footer{display:grid;grid-template-columns:1fr auto auto;align-items:center;padding:16px 24px;border-top:1px solid var(--color-border);background:rgba(4,15,31,.78);gap:9px}.creator-drawer>footer>div{display:flex;align-items:baseline;gap:8px}.creator-drawer>footer small,.creator-drawer>footer span{color:var(--color-text-muted)}.creator-drawer>footer strong{font-size:24px}@media(max-width:980px){.batch-summary{grid-template-columns:1fr auto auto}.platform-stack,.progress-cell{display:none}.task-row{grid-template-columns:1fr auto}.task-progress,.task-time{display:none}.failure-copy,.result-link,.task-logs{grid-column:1/3}.platform-config{grid-template-columns:1fr 1fr}.account-choices{grid-column:1/3}.authorization-rail{grid-template-columns:1fr}}@media(max-width:680px){.page-header{align-items:stretch;flex-direction:column}.page-header-main{align-items:flex-start;flex-direction:column}.header-actions button{width:100%}.task-list{padding:14px}.task-list>header small{display:none}.batch-summary{grid-template-columns:1fr auto 18px}.batch-summary>.status-pill{display:none}.task-row{grid-template-columns:1fr}.failure-copy,.result-link,.task-logs{grid-column:1}.dedup-grid{grid-template-columns:1fr}.platform-config{grid-template-columns:1fr}.account-choices{grid-column:1}.creator-drawer>footer{grid-template-columns:1fr 1fr}.creator-drawer>footer>div{grid-column:1/3}.creator-body{padding:4px 16px 24px}.creator-drawer>header,.creator-drawer>footer{padding-left:16px;padding-right:16px}}
.secondary-button,
.authorization-rail article,
.task-row,
.field-label input,
.field-label select,
.group-selection-note,
.platform-config input[type=number],
.account-choices label,
.dedup-grid label {
  background: #fff;
}

.authorization-rail article,
.task-row {
  box-shadow: 0 1px 3px rgba(31, 42, 68, .035);
}

.authorization-rail article > b,
.account-choices b:not(.connected),
.paused,
.attention,
.failure-copy {
  color: #9a6517;
  background: #fff8e9;
}

.authorization-rail article > b.ready,
.account-choices b.connected,
.succeeded {
  color: #168c70;
  background: #eaf8f3;
}

.scheduled,
.queued,
.running {
  color: #5662d8;
  background: #eef0ff;
}

.failed,
.stopped {
  color: #c44f63;
  background: #fff1f3;
}

.platform-stack span,
.task-identity > b {
  color: #5e68d8;
}

.result-link {
  color: #168c70;
}

.drawer-backdrop {
  background: rgba(15, 23, 42, .38);
}

.creator-drawer {
  color: var(--color-text);
  background: #fff;
  box-shadow: -24px 0 70px rgba(31, 42, 68, .18);
}

.creator-drawer > header,
.creator-drawer > footer {
  background: #fff;
}

.section-title > b {
  color: #5c67db;
  background: #eef0ff;
}

.dedup-grid label.selected {
  border-color: #9aa3f4;
  background: #f1f3ff;
}

.platform-config.disabled {
  background: var(--color-surface-soft);
}

.platform-config input:disabled {
  color: #8d96a6;
  background: #eef1f5;
}
/* 发布工作区可读性校准 */
.execution-caption,.task-list>header span,.task-list>header small,.platform-stack span,.status-pill,.task-identity>b,.task-progress span,.task-time small,.failure-copy,.result-link,.task-logs,.field-label,.group-selection-note p,.account-choices p,.platform-config>label,.account-choices label,.dedup-grid small{font-size:13px}
.authorization-rail article>b{font-size:12px}
.task-identity>strong,.group-selection-note strong{font-size:14px}
.field-label input,.field-label select{min-height:44px;font-size:14px}
</style>

<style scoped>
/* 平台授权状态不得依赖微型字号辨认 */
.authorization-rail article > b {
  font-size: 14px;
}
</style>

<style scoped>
.tasks-page {
  max-width: 1560px;
  gap: 18px;
}

.page-header {
  min-height: 64px;
  align-items: center;
}

.page-header-main {
  gap: 16px;
}

.page-header h2,
.creator-drawer h2 {
  color: #142540;
  font-size: 27px;
  font-weight: 730;
  letter-spacing: -0.035em;
}

.page-header p,
.creator-drawer p {
  color: #718096;
  font-size: 14px;
}

.primary-button,
.secondary-button {
  min-height: 40px;
  border-radius: 9px;
}

.authorization-rail {
  gap: 11px;
}

.authorization-rail article {
  grid-template-columns: 44px 1fr auto;
  min-height: 76px;
  padding: 14px 16px;
  border-color: #e1e8f2;
  border-radius: 13px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(18, 38, 68, 0.035), 0 10px 24px rgba(35, 63, 104, 0.045);
}

.platform-brand {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 1px solid #e0e7f1;
  border-radius: 11px;
  background: #f8fafc;
}

.platform-brand img {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  object-fit: cover;
}

.authorization-rail article > b {
  padding: 5px 8px;
  border-radius: 7px;
  font-size: 14px;
}

.task-list {
  padding: 18px 20px;
  border-radius: 16px;
}

.task-list > header {
  min-height: 44px;
  padding-bottom: 12px;
  border-bottom-color: #e7ecf3;
}

.task-list > header strong {
  color: #1a2b44;
  font-size: 14px;
}

.empty-state {
  min-height: 260px;
  color: #8a97aa;
}

.empty-state strong {
  color: #1a2b44;
  font-size: 16px;
}

.batch-card {
  border-bottom-color: #e7ecf3;
}

.batch-summary {
  border-radius: 10px;
}

.batch-summary:hover {
  background: #f7f9fc;
}

.platform-stack span {
  border-color: #dce5f2;
  border-radius: 7px;
  color: #346bc1;
  background: #f4f8fe;
}

.progress-cell > div {
  background: #e8edf4;
}

.progress-cell > div span {
  background: linear-gradient(90deg, #2166ff, #2d8fff 60%, #14b7d7);
}

.task-row {
  border-color: #e0e7f1;
  border-radius: 11px;
  background: #f9fbfd;
  box-shadow: none;
}

.execution-caption {
  border-radius: 9px;
  color: #65758b;
  background: #f5f8fc;
}

.drawer-backdrop {
  background: rgba(8, 18, 35, 0.46);
  backdrop-filter: blur(8px);
}

.creator-drawer {
  border-left-color: #dce5f1;
  background: #f7f9fc;
  box-shadow: -28px 0 80px rgba(16, 35, 66, 0.22);
}

.creator-drawer > header,
.creator-drawer > footer {
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(18px);
}

.form-section {
  border-bottom-color: #e2e8f1;
}

.section-title > b {
  border-radius: 8px;
  color: #1f63ff;
  background: #eaf1ff;
}

.group-selection-note,
.platform-config,
.dedup-grid label {
  border-color: #dfe7f2;
  border-radius: 10px;
  background: #ffffff;
}

.dedup-grid label.selected {
  border-color: #8bb2ff;
  background: #edf3ff;
  box-shadow: 0 0 0 3px rgba(31, 99, 255, 0.07);
}

@media (max-width: 680px) {
  .page-header {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: stretch;
    gap: 10px;
  }

  .page-header-main {
    display: contents;
  }

  .page-header-main > div {
    grid-column: 1 / -1;
    grid-row: 1;
  }

  .page-header-main > .primary-button {
    grid-column: 1;
    grid-row: 2;
    width: 100%;
  }

  .header-actions {
    display: contents;
  }

  .header-actions > .secondary-button {
    grid-column: 2;
    grid-row: 2;
    width: 100%;
  }

  .authorization-rail article {
    min-height: 70px;
  }

  .task-list {
    padding: 14px;
  }
}
</style>
