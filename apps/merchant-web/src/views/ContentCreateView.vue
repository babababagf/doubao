<script setup lang="ts">
import type { AiGenerationTask, AiTaskRetryableQuestion, ArticleContentDirection, KnowledgeLibrary, MerchantGallery, MerchantKeyword, WritingInstruction } from '@doubaohk/api-contract'
import { ArrowRight, DocumentAdd, InfoFilled, Picture, SetUp } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { ApiError, isRealApiMode } from '@/services/http'
import { createArticleAiTask, createArticlesMock, listAiTasks, listGalleries, listKeywords, listKnowledgeLibraries, listRetryableAiTaskQuestions, listWritingInstructions, retryArticleAiTask, stopAiTask } from '@/services/merchant.service'

const router = useRouter()
const keywords = ref<MerchantKeyword[]>([])
const libraries = ref<KnowledgeLibrary[]>([])
const galleries = ref<MerchantGallery[]>([])
const instructions = ref<WritingInstruction[]>([])
const loading = ref(true)
const creating = ref(false)
const errorMessage = ref('')
const latestTask = ref<AiGenerationTask | null>(null)
const articleTasks = ref<AiGenerationTask[]>([])
const retryableQuestions = ref<AiTaskRetryableQuestion[]>([])
const retryingQuestionId = ref<string | null>(null)
const stoppingTaskId = ref<string | null>(null)
const pollingTasks = ref(false)
const directionOptions: Array<{ value: ArticleContentDirection; label: string; description: string }> = [
  { value: 'mixed', label: '自动混合', description: '批量任务按问题轮换不同方向，避免文章同质化' },
  { value: 'marketing', label: '营销介绍', description: '说明服务价值、适用客户与真实差异点' },
  { value: 'ranking', label: '榜单推荐', description: '围绕选择标准和对比维度组织内容' },
  { value: 'education', label: '专业科普', description: '解释概念、原理、场景与常见误区' },
  { value: 'qa', label: '问题解答', description: '先给结论，再说明依据和适用边界' },
  { value: 'selection_guide', label: '选择指南', description: '提供筛选步骤、核验清单和风险提示' },
  { value: 'case_study', label: '案例解读', description: '只引用信息库中明确存在的真实案例' },
  { value: 'industry_trend', label: '行业趋势', description: '分析行业变化、用户需求与应对建议' },
  { value: 'local_service', label: '本地服务', description: '结合真实地区、门店或服务范围写作' },
]
const form = reactive({ keywordId: '', knowledgeLibraryId: null as string | null, galleryId: null as string | null, imageCount: 0, instructionId: null as string | null, contentDirection: 'mixed' as ArticleContentDirection, count: 1 })
let taskPollingTimer: ReturnType<typeof setInterval> | null = null

const enabledKeywords = computed(() => keywords.value.filter((keyword) => keyword.status === 'enabled'))
const selectedGallery = computed(() => galleries.value.find((gallery) => gallery.id === form.galleryId) ?? null)
const selectedInstruction = computed(() => instructions.value.find((instruction) => instruction.id === form.instructionId) ?? null)
const selectedDirection = computed(() => directionOptions.find((direction) => direction.value === form.contentDirection) ?? directionOptions[0]!)
const selectedKeyword = computed(() => enabledKeywords.value.find((keyword) => keyword.id === form.keywordId) ?? null)
const articleLimit = computed(() => Math.min(100, selectedKeyword.value?.uncreatedCount ?? 0))
const realCost = computed(() => form.count * 30)
const canRetryLatestTask = computed(() => Boolean(latestTask.value && ['failed', 'partially_failed', 'stopped'].includes(latestTask.value.status)))
const canStopLatestTask = computed(() => Boolean(latestTask.value && ['queued', 'running'].includes(latestTask.value.status)))
const hasActiveArticleTask = computed(() => articleTasks.value.some((task) => ['queued', 'running'].includes(task.status)))

async function loadOptions(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const [keywordResult, libraryResult, galleryResult, instructionResult] = await Promise.all([
      listKeywords(), listKnowledgeLibraries(), listGalleries(), listWritingInstructions(),
    ])
    keywords.value = keywordResult
    libraries.value = libraryResult
    galleries.value = galleryResult
    instructions.value = instructionResult
    form.keywordId ||= enabledKeywords.value[0]?.id ?? ''
    if (isRealApiMode) await loadArticleTasks()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '创作配置加载失败'
  } finally {
    loading.value = false
  }
}

async function loadArticleTasks(preferredId?: string, refreshRetryable = true): Promise<void> {
  if (!isRealApiMode) return
  const previousId = latestTask.value?.id
  const previousStatus = latestTask.value?.status
  const tasks = (await listAiTasks()).filter((task) => task.type === 'article_writing')
  articleTasks.value = tasks
  const selectedId = preferredId ?? latestTask.value?.id
  latestTask.value = tasks.find((task) => task.id === selectedId) ?? tasks[0] ?? null
  const selectedJustFinished = previousId === latestTask.value?.id
    && Boolean(previousStatus && ['queued', 'running'].includes(previousStatus))
    && Boolean(latestTask.value && !['queued', 'running'].includes(latestTask.value.status))
  if (refreshRetryable || selectedJustFinished) await loadRetryableQuestions()
}

async function pollActiveTasks(): Promise<void> {
  if (!isRealApiMode || !hasActiveArticleTask.value || pollingTasks.value || loading.value || creating.value || retryingQuestionId.value || stoppingTaskId.value) return
  pollingTasks.value = true
  try {
    await loadArticleTasks(undefined, false)
  } catch {
    // 后台轮询失败不覆盖当前页面数据；用户主动刷新时仍会收到明确错误。
  } finally {
    pollingTasks.value = false
  }
}

async function selectArticleTask(taskId: string): Promise<void> {
  const task = articleTasks.value.find((item) => item.id === taskId)
  if (!task || latestTask.value?.id === task.id) return
  latestTask.value = task
  await loadRetryableQuestions()
}

async function loadRetryableQuestions(): Promise<void> {
  retryableQuestions.value = []
  if (!isRealApiMode || !latestTask.value || !canRetryLatestTask.value) return
  try { retryableQuestions.value = await listRetryableAiTaskQuestions(latestTask.value.id) } catch (error) { ElMessage.error(error instanceof ApiError ? error.message : '可重试问题词加载失败') }
}

async function retryLatestTask(questionId?: string): Promise<void> {
  if (!latestTask.value || retryingQuestionId.value) return
  const target = questionId ? retryableQuestions.value.find((question) => question.id === questionId) : null
  const description = target ? `确认只重试“${target.text}”吗？` : `确认重试全部 ${retryableQuestions.value.length} 个未生成问题词吗？`
  if (!window.confirm(description)) return
  retryingQuestionId.value = questionId ?? 'all'
  try {
    const task = await retryArticleAiTask(latestTask.value.id, questionId)
    await loadArticleTasks(task.id)
    ElMessage.success(`已创建重试任务：${task.totalCount} 篇；仅成功入库才扣除额度`)
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '创建重试任务失败')
  } finally { retryingQuestionId.value = null }
}

async function stopLatestTask(): Promise<void> {
  if (!latestTask.value || stoppingTaskId.value || !canStopLatestTask.value) return
  if (!window.confirm('确认停止该创作任务吗？未成功生成的部分会退回预占额度。')) return
  stoppingTaskId.value = latestTask.value.id
  try {
    const task = await stopAiTask(latestTask.value.id)
    await loadArticleTasks(task.id)
    ElMessage.success('任务已停止；未使用预占额度已退回')
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '停止创作任务失败')
  } finally { stoppingTaskId.value = null }
}

async function createDrafts(): Promise<void> {
  if (!form.keywordId) {
    ElMessage.warning('请先选择一个启用的优化关键词')
    return
  }
  if (form.count > articleLimit.value) {
    ElMessage.warning(`当前关键词仅剩 ${articleLimit.value} 个可用问题词，无法创建 ${form.count} 篇文章`)
    return
  }
  if (!form.galleryId && form.imageCount !== 0) {
    ElMessage.warning('未选择企业图库时，请将配图数量设为 0')
    return
  }
  if (form.galleryId && !selectedGallery.value) {
    ElMessage.warning('所选企业图库已不可用，请重新选择')
    return
  }
  if (selectedGallery.value && selectedGallery.value.imageCount < form.imageCount) {
    ElMessage.warning(`所选图库只有 ${selectedGallery.value.imageCount} 张图片，无法生成 ${form.imageCount} 张配图`)
    return
  }
  if (!Number.isInteger(form.count) || form.count < 1 || form.count > 100) {
    ElMessage.warning('创作篇数为 1 到 100')
    return
  }

  creating.value = true
  try {
    if (isRealApiMode) {
      const task = await createArticleAiTask({ ...form })
      await loadArticleTasks(task.id)
      ElMessage.success(`创作任务已入队：${task.totalCount} 篇待处理；仅成功入库才会扣除额度`)
      return
    }
    const result = await createArticlesMock({ ...form, knowledgeLibraryIds: form.knowledgeLibraryId ? [form.knowledgeLibraryId] : [] })
    ElMessage.success(`已创建 ${result.createdCount} 篇本地 Mock 草稿；未扣算力`)
    await router.push({ name: 'articles', query: { created: String(result.createdCount) } })
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '创建草稿失败')
  } finally {
    creating.value = false
  }
}

onMounted(() => {
  void loadOptions()
  taskPollingTimer = setInterval(() => { void pollActiveTasks() }, 3_000)
})
onBeforeUnmount(() => {
  if (taskPollingTimer) clearInterval(taskPollingTimer)
  taskPollingTimer = null
})
</script>

<template>
  <div class="create-page">
    <header class="page-intro"><div><span class="eyebrow">ARTICLE ORCHESTRATION</span><h2>AI 文章创作</h2><p>只选关键词即可开始；补充企业信息库和图库后，文章会自动升级为事实增强模式。</p></div><button class="secondary-button" type="button" :disabled="loading" @click="loadOptions"><el-icon><SetUp /></el-icon>刷新配置</button></header>
    <section class="mock-notice surface-panel"><el-icon><InfoFilled /></el-icon><p v-if="isRealApiMode"><strong>真实 API 模式：</strong>提交后创建后台异步任务，调用当前贴牌启用且测试通过的写作模型。成功生成的文章直接进入可发布文章列表；<strong>仅文章成功入库时扣除 30 点算力和 1 篇写作额度。</strong></p><p v-else><strong>本地 Mock 模式：</strong>提交后只创建 Mock 草稿，<strong>不会调用模型，不会扣算力或写作篇数。</strong></p></section>
    <section v-if="errorMessage" class="error-panel surface-panel"><strong>创作配置加载失败</strong><p>{{ errorMessage }}</p><button class="secondary-button" type="button" @click="loadOptions">重新加载</button></section>
    <section v-else class="creation-grid">
      <main class="form-panel surface-panel">
        <header class="panel-heading"><div><span class="panel-kicker">TASK PARAMETERS</span><h3>创作配置</h3></div><span>最多 100 篇</span></header>
        <div v-if="loading" class="skeleton"><span v-for="index in 5" :key="index" /></div>
        <div v-else class="form-body">
          <label class="field"><span>优化关键词 <i>*</i></span><select v-model="form.keywordId"><option value="">请选择关键词</option><option v-for="keyword in enabledKeywords" :key="keyword.id" :value="keyword.id">{{ keyword.name }} · 可创作 {{ keyword.uncreatedCount }} 篇</option></select><small v-if="selectedKeyword">当前关键词最多可创作 {{ articleLimit }} 篇；同时受 100 篇单次上限约束。</small><small v-else-if="!enabledKeywords.length" class="warning">没有启用关键词，请先到“关键词与问题”创建。</small></label>
          <div class="field"><span>企业信息库 <em>可选，单选</em></span><div class="library-picks"><label class="pick"><input v-model="form.knowledgeLibraryId" :value="null" type="radio" /><span><strong>基础写作模式</strong><small>仅使用公司名、关键词与问题词，自动补充场景和行业常识</small></span></label><label v-for="library in libraries" :key="library.id" class="pick"><input v-model="form.knowledgeLibraryId" :value="library.id" type="radio" /><span><strong>{{ library.name }}</strong><small>{{ library.companyName }} · {{ library.brandAlias }}</small></span></label><p v-if="!libraries.length" class="empty-copy">当前没有信息库，仍可正常生成软文；补充资料后可写入更多企业细节。</p></div></div>
          <label class="field"><span>企业图库与配图数量 <em>可选</em></span><select v-model="form.galleryId"><option :value="null">暂不使用图库</option><option v-for="gallery in galleries" :key="gallery.id" :value="gallery.id">{{ gallery.name }} · {{ gallery.imageCount }} 张</option></select><div class="image-count"><button v-for="count in [0,1,2,3]" :key="count" type="button" :class="{ active: form.imageCount === count }" @click="form.imageCount=count"><el-icon><Picture /></el-icon>{{ count === 0 ? '无配图' : `${count} 张配图` }}</button></div><small>无图库可直接生成无图文章；抖音图文发布前仍需补充图片。</small></label>
          <label class="field"><span>文章方向 <i>*</i></span><select v-model="form.contentDirection"><option v-for="direction in directionOptions" :key="direction.value" :value="direction.value">{{ direction.label }}</option></select><small>{{ selectedDirection.description }}</small></label>
          <label class="field"><span>创作指令</span><select v-model="form.instructionId"><option :value="null">系统默认：GEO 深度文章</option><option v-for="instruction in instructions" :key="instruction.id" :value="instruction.id">{{ instruction.name }}</option></select><small v-if="selectedInstruction">{{ selectedInstruction.isSystem ? '系统默认指令 · 1000-1200 字 · 3-4 个小标题' : '已选择自定义表达规则；仍受标题、结构和合规质量门约束' }}</small><small v-else>默认生成 1000-1200 字 HTML 正文，标题包含优化关键词，公司名自然出现 2-3 次。</small></label>
          <label class="field count-field"><span>创作篇数 <i>*</i></span><input v-model.number="form.count" min="1" :max="articleLimit" type="number" /><small>本次最多 {{ articleLimit }} 篇；正式环境预计消耗 {{ realCost }} 算力点。</small></label>
        </div>
      </main>
      <aside class="summary-panel surface-panel">
        <span class="panel-kicker">EXECUTION SUMMARY</span><h3>本次任务摘要</h3>
        <dl><div><dt>关键词</dt><dd>{{ enabledKeywords.find((item) => item.id === form.keywordId)?.name || '未选择' }}</dd></div><div><dt>写作模式</dt><dd>{{ form.knowledgeLibraryId ? '事实增强模式' : '基础写作模式' }}</dd></div><div><dt>信息库</dt><dd>{{ libraries.find((item) => item.id === form.knowledgeLibraryId)?.name || '不使用' }}</dd></div><div><dt>图库</dt><dd>{{ selectedGallery?.name || '不使用' }}</dd></div><div><dt>配图</dt><dd>{{ form.imageCount }} 张 / 篇</dd></div><div><dt>文章方向</dt><dd>{{ selectedDirection.label }}</dd></div><div><dt>创作篇数</dt><dd>{{ form.count }} 篇</dd></div></dl>
        <div class="cost-box"><span>{{ isRealApiMode ? '创建时预占额度' : '本地 Mock 消耗' }}</span><strong>{{ isRealApiMode ? `${realCost} 算力点` : '0 算力点' }}</strong><p>{{ isRealApiMode ? '任务失败或停止会退回未使用预占；成功文章按 30 点 / 篇确认扣除。' : 'Mock 演示不会调用模型，也不会扣减额度。' }}</p></div>
        <div v-if="isRealApiMode && latestTask" class="task-status">
          <span>已选任务 · {{ latestTask.status }}</span><strong>{{ latestTask.completedCount }} / {{ latestTask.totalCount }} 已完成</strong>
          <small v-if="latestTask.retryOfTaskId">重试自任务 {{ latestTask.retryOfTaskId }}</small><small v-if="latestTask.failureReason">{{ latestTask.failureReason }}</small>
          <button v-if="canStopLatestTask" class="secondary-button stop-task" type="button" :disabled="stoppingTaskId !== null" @click="stopLatestTask">{{ stoppingTaskId === latestTask.id ? '停止中…' : '停止此任务' }}</button>
          <div v-if="articleTasks.length > 1" class="task-history"><p>最近文章任务</p><button v-for="task in articleTasks.slice(0, 8)" :key="task.id" class="task-history-item" :class="{ selected: task.id === latestTask.id }" type="button" @click="selectArticleTask(task.id)"><span>{{ task.status }} · {{ task.completedCount }}/{{ task.totalCount }}</span><small>{{ task.failureReason || (task.retryOfTaskId ? '重试任务' : '首次任务') }}</small></button></div>
          <div v-if="canRetryLatestTask && retryableQuestions.length" class="retry-panel"><p>有 {{ retryableQuestions.length }} 个未生成问题词可重试；只成功扣费。</p><button class="secondary-button" type="button" :disabled="retryingQuestionId !== null" @click="retryLatestTask()">{{ retryingQuestionId === 'all' ? '创建中…' : '重试全部未生成问题' }}</button><button v-for="question in retryableQuestions" :key="question.id" class="retry-question" type="button" :disabled="retryingQuestionId !== null" @click="retryLatestTask(question.id)"><span>{{ question.text }}</span><b>{{ retryingQuestionId === question.id ? '创建中…' : '单篇重试' }}</b></button></div>
        </div>
        <button class="create-button" type="button" :disabled="creating || loading" @click="createDrafts"><el-icon><DocumentAdd /></el-icon>{{ creating ? '正在创建任务…' : (isRealApiMode ? '创建 AI 创作任务' : '创建本地 Mock 草稿') }}<el-icon><ArrowRight /></el-icon></button>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.create-page{display:grid;max-width:1500px;margin:0 auto;gap:16px}.page-intro,.mock-notice,.panel-heading,.image-count,.create-button{display:flex;align-items:center}.page-intro{justify-content:space-between;gap:24px}.eyebrow,.panel-kicker{display:block;color:var(--color-champagne);font-family:var(--font-mono);font-size:10px;letter-spacing:.13em}.eyebrow{margin-bottom:5px}h2,h3,p{margin:0}h2{font-size:26px;font-weight:670;letter-spacing:-.035em}.page-intro p{margin-top:5px;color:var(--color-text-secondary)}.secondary-button{display:inline-flex;min-height:38px;align-items:center;justify-content:center;padding:0 14px;border:1px solid var(--color-border-strong);border-radius:8px;color:var(--color-text-secondary);background:rgba(13,28,52,.68);cursor:pointer;gap:7px}.secondary-button:disabled,.create-button:disabled{cursor:not-allowed;opacity:.5}.mock-notice{padding:13px 16px;border-color:rgba(102,203,221,.24);color:var(--color-text-secondary);align-items:flex-start;gap:10px}.mock-notice>.el-icon{margin-top:1px;color:#61d2e8;font-size:18px}.mock-notice p{font-size:12px;line-height:1.65}.creation-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(310px,.7fr);align-items:start;gap:16px}.form-panel,.summary-panel{min-width:0;padding:22px}.panel-heading{justify-content:space-between;padding-bottom:16px;border-bottom:1px solid var(--color-border)}.panel-heading span:last-child{color:var(--color-text-muted);font-family:var(--font-mono);font-size:10px}.panel-kicker{margin-bottom:4px;color:var(--color-text-muted)}h3{font-size:17px;font-weight:650}.form-body{display:grid;padding-top:18px;gap:17px}.field{display:grid;gap:8px}.field>span{color:var(--color-text-secondary);font-size:12px}.field i{color:var(--color-danger);font-style:normal}.field em{color:var(--color-text-muted);font-style:normal;font-size:10px}select,input{width:100%;min-height:41px;padding:0 12px;border:1px solid rgba(145,168,205,.25);border-radius:8px;outline:none;color:var(--color-text);background:rgba(4,15,31,.48);font:inherit}select:focus,input:focus{border-color:rgba(115,125,255,.76);box-shadow:var(--shadow-focus)}.field small{color:var(--color-text-muted);font-size:11px}.field small.warning{color:#e7b569}.library-picks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.pick{display:flex;min-height:56px;align-items:center;padding:9px 10px;border:1px solid rgba(145,168,205,.16);border-radius:8px;cursor:pointer;gap:9px}.pick:has(input:checked){border-color:rgba(113,124,255,.55);background:rgba(83,82,204,.1)}.pick input{width:14px;min-height:auto;padding:0;accent-color:#7776ff}.pick span{min-width:0}.pick strong,.pick small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pick strong{font-size:11px}.pick small{margin-top:3px;font-size:10px}.empty-copy{color:var(--color-text-muted);font-size:11px}.image-count{gap:8px}.image-count button{display:inline-flex;min-height:33px;align-items:center;padding:0 10px;border:1px solid var(--color-border);border-radius:7px;color:var(--color-text-muted);background:rgba(8,22,43,.5);cursor:pointer;gap:6px;font-size:11px}.image-count button.active{border-color:rgba(112,124,255,.62);color:#c4caff;background:rgba(82,81,203,.16)}.count-field{max-width:280px}.summary-panel{position:sticky;top:20px}.summary-panel>h3{padding-bottom:15px;border-bottom:1px solid var(--color-border)}dl{display:grid;margin:16px 0;gap:12px}dl div{display:flex;justify-content:space-between;gap:12px}dt{color:var(--color-text-muted);font-size:12px}dd{margin:0;max-width:65%;overflow:hidden;color:var(--color-text-secondary);font-size:12px;text-align:right;text-overflow:ellipsis;white-space:nowrap}.cost-box{padding:13px;border:1px solid rgba(112,124,255,.26);border-radius:9px;background:linear-gradient(120deg,rgba(84,76,208,.16),rgba(7,25,49,.42))}.cost-box span,.cost-box strong,.cost-box p{display:block}.cost-box span{color:#aeb9ff;font-size:10px}.cost-box strong{margin-top:3px;color:#f4f5ff;font-family:var(--font-mono);font-size:21px}.cost-box p{margin-top:5px;color:var(--color-text-muted);font-size:10px;line-height:1.55}.create-button{justify-content:center;width:100%;min-height:43px;margin-top:15px;border:1px solid rgba(126,123,255,.65);border-radius:8px;color:#fff;background:var(--gradient-primary);box-shadow:0 10px 24px rgba(69,67,197,.22);cursor:pointer;gap:9px;font-weight:560}.skeleton{display:grid;padding-top:18px;gap:12px}.skeleton span{height:58px;border-radius:8px;background:linear-gradient(90deg,rgba(120,143,182,.08),rgba(120,143,182,.18),rgba(120,143,182,.08));background-size:220% 100%;animation:shimmer 1.4s ease-in-out infinite}.error-panel{display:grid;min-height:230px;place-items:center;align-content:center;padding:30px;text-align:center;gap:8px}.error-panel p{color:var(--color-text-muted)}@keyframes shimmer{to{background-position:-220% 0}}@media(max-width:1050px){.creation-grid{grid-template-columns:1fr}.summary-panel{position:static}.library-picks{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:680px){.page-intro{align-items:flex-start;flex-direction:column}.library-picks{grid-template-columns:1fr}.image-count{display:grid;grid-template-columns:repeat(3,1fr)}.image-count button{justify-content:center;padding:0 5px}.summary-panel{padding:18px}.form-panel{padding:18px}}
</style>
<style scoped>
.retry-panel { display: grid; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--color-border); gap: 7px; }
.retry-panel p { margin: 0; color: #e4c589; font-size: 10px; line-height: 1.5; }
.retry-panel .secondary-button { width: 100%; min-height: 32px; font-size: 11px; }
.retry-question { display: flex; min-width: 0; align-items: center; justify-content: space-between; padding: 7px 8px; border: 1px solid rgba(229,184,102,.2); border-radius: 7px; color: var(--color-text-secondary); background: rgba(69,53,25,.18); cursor: pointer; gap: 8px; font: inherit; font-size: 10px; text-align: left; }
.retry-question span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.retry-question b { flex: 0 0 auto; color: #eac27c; font-size: 10px; }
.retry-question:disabled { cursor: not-allowed; opacity: .55; }
.stop-task { width: 100%; margin-top: 10px; border-color: rgba(232,154,103,.35); color: #efbf9b; }
.task-history { display: grid; margin-top: 11px; padding-top: 10px; border-top: 1px solid var(--color-border); gap: 5px; }
.task-history > p { color: var(--color-text-muted); font-family: var(--font-mono); font-size: 10px; letter-spacing: .08em; }
.task-history-item { display: grid; width: 100%; min-width: 0; padding: 7px 8px; border: 1px solid rgba(145,168,205,.14); border-radius: 7px; color: var(--color-text-secondary); background: rgba(4,15,31,.28); cursor: pointer; gap: 2px; text-align: left; }
.task-history-item.selected { border-color: rgba(118,126,255,.58); background: rgba(83,82,204,.13); color: #d9ddff; }
.task-history-item span,.task-history-item small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-history-item span { font-size: 10px; }.task-history-item small { color: var(--color-text-muted); font-size: 9px; }
</style>
