<script setup lang="ts">
import type { MediaAccount, MerchantArticle, PublishTask } from '@doubaohk/api-contract'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, ref, watch } from 'vue'

import { createPublishTasks, listArticles, listMediaAccounts, listPublishTasks } from '@/services/merchant.service'
import { formatDateTime } from '@/utils/format'

type Platform = 'toutiao' | 'douyin'

const articles = ref<MerchantArticle[]>([])
const accounts = ref<MediaAccount[]>([])
const tasks = ref<PublishTask[]>([])
const selectedArticleIds = ref<string[]>([])
const selectedPlatforms = ref<Platform[]>(['toutiao', 'douyin'])
const selectedAccountIds = ref<string[]>([])
const publishCount = ref(3)
const deduplicationMode = ref<'per_platform' | 'all_platforms'>('per_platform')
const dailyLimits = ref<Record<Platform, number>>({ toutiao: 3, douyin: 3 })
const loading = ref(true)
const creating = ref(false)

const publishableArticles = computed(() => articles.value.filter((article) => article.status === 'publishable'))
const connectedAccounts = computed(() => accounts.value.filter((account): account is MediaAccount & { id: string } => Boolean(account.id) && account.status === 'connected'))
const visibleAccounts = computed(() => connectedAccounts.value.filter((account) => selectedPlatforms.value.includes(account.platform)))
const estimatedTaskCount = computed(() => {
  const count = Math.min(publishCount.value, selectedArticleIds.value.length)
  return deduplicationMode.value === 'per_platform' ? count * selectedPlatforms.value.length : count
})

const platformLabel = (platform: string) => platform === 'toutiao' ? '今日头条' : '抖音'
const stateLabel = (status: string) => ({
  scheduled: '待排期', queued: '排队中', running: '执行中', attention: '需处理', succeeded: '已成功', failed: '失败', stopped: '已停止',
})[status] || status

function toggleArticle(articleId: string): void {
  selectedArticleIds.value = selectedArticleIds.value.includes(articleId)
    ? selectedArticleIds.value.filter((id) => id !== articleId)
    : [...selectedArticleIds.value, articleId]
}

function normalizeAccountSelection(): void {
  const visibleIds = new Set(visibleAccounts.value.map((account) => account.id))
  selectedAccountIds.value = selectedAccountIds.value.filter((id) => visibleIds.has(id))
  for (const platform of selectedPlatforms.value) {
    const hasSelected = visibleAccounts.value.some((account) => account.platform === platform && selectedAccountIds.value.includes(account.id))
    if (!hasSelected) {
      const first = visibleAccounts.value.find((account) => account.platform === platform)
      if (first) selectedAccountIds.value.push(first.id)
    }
  }
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const [articleRows, taskRows, accountRows] = await Promise.all([listArticles(), listPublishTasks(), listMediaAccounts()])
    articles.value = articleRows
    tasks.value = taskRows
    accounts.value = accountRows
    if (!selectedArticleIds.value.length) selectedArticleIds.value = publishableArticles.value.slice(0, 3).map((article) => article.id)
    normalizeAccountSelection()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '发布任务数据加载失败')
  } finally {
    loading.value = false
  }
}

async function create(): Promise<void> {
  if (!selectedArticleIds.value.length || !selectedPlatforms.value.length) return void ElMessage.warning('请选择文章和至少一个发布平台')
  if (publishCount.value > selectedArticleIds.value.length) return void ElMessage.warning('发布数量不能大于已选文章数')
  const missingPlatform = selectedPlatforms.value.find((platform) => !visibleAccounts.value.some((account) => account.platform === platform && selectedAccountIds.value.includes(account.id)))
  if (missingPlatform) return void ElMessage.warning(`${platformLabel(missingPlatform)}至少选择一个已连接账号`)

  await ElMessageBox.confirm(
    `预计创建 ${estimatedTaskCount.value} 个任务。任务会由本地助手自动执行；遇到验证码、风控或结果不确定时自动暂停。`,
    '确认开始发布任务',
    { confirmButtonText: '创建并唤起助手', cancelButtonText: '取消', type: 'warning' },
  )
  creating.value = true
  try {
    const result = await createPublishTasks({
      articleIds: selectedArticleIds.value,
      platforms: selectedPlatforms.value,
      mediaAccountIds: selectedAccountIds.value,
      publishCount: publishCount.value,
      deduplicationMode: deduplicationMode.value,
      dailyLimits: dailyLimits.value,
    })
    await load()
    ElMessage.success(`已创建 ${result.createdTaskCount} 个任务，去重跳过 ${result.skippedDuplicateCount} 个`)
    window.location.href = 'doubaohk-publisher://open/tasks'
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '创建发布任务失败')
  } finally {
    creating.value = false
  }
}

watch(selectedPlatforms, normalizeAccountSelection, { deep: true })
onMounted(() => void load())
</script>

<template>
  <div class="tasks-page">
    <header class="page-heading">
      <div><span>PUBLISH ORCHESTRATION</span><h2>发布任务</h2><p>选择文章库、平台与发布账号，系统按账号轮询分配并自动唤起本地助手。</p></div>
      <div class="heading-stat"><small>当前任务</small><strong>{{ tasks.length }}</strong></div>
    </header>

    <section class="builder surface-panel">
      <div class="builder-head">
        <div><span>01 / CONTENT</span><h3>选择发布文章库</h3><p>仅展示状态为“可发布”的文章；DeepSeek 成功生成的文章会直接进入该列表。同一篇文章按去重规则只进入一次任务，编辑原文不会重置该规则。</p></div>
        <strong>{{ selectedArticleIds.length }} 篇已选</strong>
      </div>
      <div v-if="publishableArticles.length" class="article-grid">
        <button v-for="article in publishableArticles" :key="article.id" type="button" class="article-card" :class="{ selected: selectedArticleIds.includes(article.id) }" @click="toggleArticle(article.id)">
          <i>{{ selectedArticleIds.includes(article.id) ? '✓' : '' }}</i>
          <span>V{{ article.currentVersion }} · {{ article.imageCount }} 张配图</span>
          <strong>{{ article.title }}</strong>
        </button>
      </div>
      <p v-else class="empty-copy">暂无可发布文章，请先在文章列表完成审核。</p>

      <div class="configuration-grid">
        <div class="config-block">
          <span>02 / PLATFORM</span><h3>发布平台</h3>
          <label class="choice"><input v-model="selectedPlatforms" type="checkbox" value="toutiao"><b>今日头条图文</b></label>
          <label class="choice"><input v-model="selectedPlatforms" type="checkbox" value="douyin"><b>抖音图文</b></label>
        </div>
        <div class="config-block account-block">
          <span>03 / ACCOUNT</span><h3>发布账号</h3>
          <label v-for="account in visibleAccounts" :key="account.id" class="choice">
            <input v-model="selectedAccountIds" type="checkbox" :value="account.id"><b>{{ platformLabel(account.platform) }} · {{ account.maskedName || '未命名账号' }}</b>
          </label>
          <p v-if="!visibleAccounts.length">暂无已连接账号，请先在媒体账号页通过本地助手登录。</p>
        </div>
        <div class="config-block">
          <span>04 / DEDUPLICATION</span><h3>去重方式</h3>
          <label class="choice"><input v-model="deduplicationMode" type="radio" value="per_platform"><b>单平台去重</b><small>同篇文章可在头条、抖音各发一次</small></label>
          <label class="choice"><input v-model="deduplicationMode" type="radio" value="all_platforms"><b>全平台去重</b><small>任一平台已有任务后不再创建</small></label>
        </div>
        <div class="config-block limits">
          <span>05 / QUANTITY</span><h3>数量与每日节奏</h3>
          <label>发布文章数<input v-model.number="publishCount" type="number" min="1" max="100"></label>
          <label>头条每日<input v-model.number="dailyLimits.toutiao" type="number" min="1" max="100"></label>
          <label>抖音每日<input v-model.number="dailyLimits.douyin" type="number" min="1" max="100"></label>
        </div>
      </div>

      <footer class="builder-footer">
        <div><span>预计任务</span><strong>{{ estimatedTaskCount }}</strong><small>多账号按平台轮询分配，同一商户串行执行</small></div>
        <button :disabled="creating || !publishableArticles.length" @click="create">{{ creating ? '正在创建…' : '开始任务并唤起助手' }}</button>
      </footer>
    </section>

    <section class="notice surface-panel"><b>自动化边界</b><span>正常页面自动填写并提交；验证码、短信验证、设备风控、页面结构变化或提交结果不确定时暂停等待人工处理，禁止盲目重试。</span></section>

    <section class="list surface-panel">
      <header><strong>任务记录</strong><span>{{ tasks.length }} 条</span></header>
      <article v-for="task in tasks" :key="task.id">
        <div class="task-main"><b>{{ platformLabel(task.platform) }}</b><strong>V{{ task.articleVersion || '历史' }} · {{ task.articleTitle }}</strong><small>{{ task.mediaAccountName || '未指定账号' }}</small></div>
        <div class="task-time"><small>计划 {{ formatDateTime(task.scheduledAt) }}</small><small>创建 {{ formatDateTime(task.createdAt) }}</small></div>
        <span :class="task.status">{{ stateLabel(task.status) }}</span>
        <p v-if="task.failureReason">{{ task.failureReason }}</p>
        <small v-if="task.status === 'attention' && task.canResume" class="resume-hint">请在本地发布助手已打开的平台窗口完成登录或安全验证；验证通过后将自动继续，无需二次点击。</small>
        <small v-else-if="task.status === 'attention'" class="resume-hint blocked">该任务禁止自动续发，请先核验平台作品；原文编辑不会重置去重，如需新内容请手动新建独立文章。</small>
      </article>
      <div v-if="loading" class="empty">正在加载任务…</div>
    </section>
  </div>
</template>

<style scoped>
.resume-hint{grid-column:1/4;color:#e6bd7b;font-size:10px}.resume-hint.blocked{color:#e98b98}
.tasks-page{display:grid;max-width:1500px;margin:0 auto;gap:16px}.page-heading{display:flex;align-items:end;justify-content:space-between}.page-heading span,.builder span{color:var(--color-champagne);font:10px var(--font-mono);letter-spacing:.13em}h2,h3,p{margin:0}h2{margin-top:5px;font-size:26px}.page-heading p,.builder-head p{margin-top:5px;color:var(--color-text-secondary)}.heading-stat{display:grid;min-width:120px;padding:12px 16px;border:1px solid var(--color-border);border-radius:10px;background:rgba(8,24,47,.48)}.heading-stat small{color:var(--color-text-muted)}.heading-stat strong{font-size:24px}.builder{padding:20px}.builder-head{display:flex;justify-content:space-between;padding-bottom:16px;border-bottom:1px solid var(--color-border)}.builder-head h3,.config-block h3{margin-top:5px;font-size:16px}.builder-head>strong{color:#b8bdff}.article-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));margin-top:16px;gap:10px}.article-card{position:relative;display:grid;min-height:96px;padding:15px;border:1px solid var(--color-border);border-radius:10px;text-align:left;color:var(--color-text);background:rgba(4,15,31,.38);cursor:pointer;gap:7px}.article-card:hover,.article-card.selected{border-color:rgba(113,111,255,.72);background:rgba(76,76,194,.12)}.article-card i{position:absolute;top:11px;right:11px;width:18px;height:18px;border:1px solid var(--color-border);border-radius:5px;color:#7df0c6;text-align:center;font-style:normal}.article-card span{padding-right:28px;color:var(--color-text-muted);letter-spacing:0}.article-card strong{font-size:13px;line-height:1.45}.configuration-grid{display:grid;grid-template-columns:repeat(4,1fr);margin-top:18px;border:1px solid var(--color-border);border-radius:10px;overflow:hidden}.config-block{min-height:190px;padding:17px;border-right:1px solid var(--color-border)}.config-block:last-child{border-right:0}.choice{display:grid;grid-template-columns:18px 1fr;margin-top:14px;color:var(--color-text-secondary);font-size:12px;gap:7px}.choice input{grid-row:1/3;accent-color:#706fff}.choice b{color:var(--color-text);font-weight:600}.choice small,.config-block p{color:var(--color-text-muted);font-size:10px}.limits label{display:flex;align-items:center;justify-content:space-between;margin-top:10px;color:var(--color-text-secondary);font-size:11px}.limits input{width:76px;height:31px;padding:0 8px;border:1px solid var(--color-border);border-radius:6px;color:var(--color-text);background:rgba(4,15,31,.55)}.builder-footer{display:flex;align-items:center;justify-content:space-between;margin-top:18px;padding-top:17px;border-top:1px solid var(--color-border)}.builder-footer>div{display:grid;grid-template-columns:auto auto;align-items:center;gap:0 12px}.builder-footer strong{font-size:28px}.builder-footer small{grid-column:1/3;color:var(--color-text-muted)}.builder-footer button{min-height:42px;padding:0 20px;border:1px solid rgba(113,111,255,.62);border-radius:8px;color:#fff;background:var(--gradient-primary);cursor:pointer}.builder-footer button:disabled{opacity:.45;cursor:not-allowed}.notice{display:flex;padding:13px 16px;color:var(--color-text-secondary);font-size:12px;line-height:1.6;gap:12px}.notice b{color:#e6bd7b;white-space:nowrap}.list{padding:18px}.list>header{display:flex;justify-content:space-between;padding-bottom:12px;border-bottom:1px solid var(--color-border)}.list>header span{color:var(--color-text-muted);font:10px var(--font-mono)}.list article{display:grid;grid-template-columns:minmax(360px,1fr) 210px auto;padding:14px 2px;border-bottom:1px solid var(--color-border);gap:12px}.task-main{display:grid;grid-template-columns:80px minmax(200px,1fr) 130px;align-items:center;gap:10px}.task-main b{color:#b8bdff;font-size:11px}.task-main strong{font-size:13px}.task-main small,.task-time small,.list article p{color:var(--color-text-muted);font-size:10px}.task-time{display:grid;align-content:center}.list article>span{align-self:center;padding:4px 7px;border-radius:5px;font-size:10px}.scheduled,.queued,.running{color:#aeb7ff;background:rgba(99,90,255,.13)}.succeeded{color:#70d6aa;background:rgba(72,198,137,.1)}.attention{color:#e6bd7b;background:rgba(230,189,123,.1)}.failed,.stopped{color:#e98b98;background:rgba(243,111,128,.1)}.list article p{grid-column:1/4}.empty,.empty-copy{padding:30px;color:var(--color-text-muted);text-align:center}@media(max-width:1100px){.configuration-grid{grid-template-columns:1fr 1fr}.config-block{border-bottom:1px solid var(--color-border)}.list article{grid-template-columns:1fr auto}.task-time{display:none}}@media(max-width:720px){.configuration-grid{grid-template-columns:1fr}.builder-head,.builder-footer,.page-heading{align-items:stretch;flex-direction:column;gap:12px}.article-grid{grid-template-columns:1fr}.task-main{grid-template-columns:70px 1fr}.task-main small{grid-column:2}.list article{grid-template-columns:1fr}.list article>span{justify-self:start}}
</style>
