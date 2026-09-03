<script setup lang="ts">
import type { AiGenerationTask, AiTaskRetryableQuestion, ArticleContentDirection, KnowledgeLibrary, MerchantGallery, MerchantKeyword, WritingInstruction } from '@doubaohk/api-contract'
import { ArrowRight, DocumentAdd, InfoFilled, Picture, SetUp } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
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
const taskDialogVisible = ref(false)
const taskDetailVisible = ref(false)
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
const form = reactive({ groupName: '', keywordId: '', knowledgeLibraryId: null as string | null, galleryId: null as string | null, imageCount: 0, instructionId: null as string | null, contentDirection: 'mixed' as ArticleContentDirection, count: 1, customTitlesText: '' })
let taskPollingTimer: ReturnType<typeof setInterval> | null = null

const enabledKeywords = computed(() => keywords.value.filter((keyword) => keyword.status === 'enabled'))
const selectedGallery = computed(() => galleries.value.find((gallery) => gallery.id === form.galleryId) ?? null)
const selectedInstruction = computed(() => instructions.value.find((instruction) => instruction.id === form.instructionId) ?? null)
const customInstructions = computed(() => instructions.value.filter((instruction) => !instruction.isSystem))
const defaultInstruction = computed(() => instructions.value.find((instruction) => instruction.isSystem) ?? null)
const selectedDirection = computed(() => directionOptions.find((direction) => direction.value === form.contentDirection) ?? directionOptions[0]!)
const selectedKeyword = computed(() => enabledKeywords.value.find((keyword) => keyword.id === form.keywordId) ?? null)
const articleLimit = 100
const customTitles = computed(() => form.customTitlesText.split(/\r?\n/).map((title) => title.trim()).filter(Boolean))
const realCost = computed(() => form.count * 30)
const canRetryLatestTask = computed(() => Boolean(latestTask.value && ['failed', 'partially_failed', 'stopped'].includes(latestTask.value.status)))
const canStopLatestTask = computed(() => Boolean(latestTask.value && ['queued', 'running'].includes(latestTask.value.status)))
const hasActiveArticleTask = computed(() => articleTasks.value.some((task) => ['queued', 'running'].includes(task.status)))
const taskStatusMeta: Record<AiGenerationTask['status'], { label: string; tone: string }> = {
  queued: { label: '等待创作', tone: 'pending' },
  running: { label: '创作中', tone: 'running' },
  succeeded: { label: '已完成', tone: 'success' },
  partially_failed: { label: '部分失败', tone: 'warning' },
  failed: { label: '失败', tone: 'danger' },
  stopped: { label: '已停止', tone: 'muted' },
}

function generatedGroupName(keywordName: string): string {
  if (!keywordName) return ''
  const date = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replaceAll('/', '-')
  return `${date} ${keywordName}`
}

watch(() => form.keywordId, () => {
  form.groupName = generatedGroupName(selectedKeyword.value?.name ?? '')
})

watch(() => form.galleryId, (galleryId) => {
  form.imageCount = galleryId ? Math.max(form.imageCount, 1) : 0
})

function formatTaskDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value)).replaceAll('/', '-')
}

function taskProgress(task: AiGenerationTask): number {
  return task.totalCount > 0 ? Math.min(100, Math.round(((task.completedCount + task.failedCount) / task.totalCount) * 100)) : 0
}

function openTaskCreator(): void {
  taskDialogVisible.value = true
}

function closeTaskCreator(): void {
  if (!creating.value) taskDialogVisible.value = false
}

async function openTaskDetail(taskId: string): Promise<void> {
  await selectArticleTask(taskId)
  taskDetailVisible.value = true
}

async function stopTask(taskId: string): Promise<void> {
  await selectArticleTask(taskId)
  await stopLatestTask()
}

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
    form.groupName = generatedGroupName(enabledKeywords.value.find((keyword) => keyword.id === form.keywordId)?.name ?? '')
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
  const target = questionId ? retryableQuestions.value.find((question) => question.referenceId === questionId) : null
  const description = target ? `确认只重试参考“${target.text}”的文章吗？` : `确认重试全部 ${retryableQuestions.value.length} 篇未完成文章吗？`
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
  if (!form.groupName.trim() || form.groupName.trim().length > 100) {
    ElMessage.warning('请填写 1 到 100 个字符的文章分组名')
    return
  }
  if (!form.keywordId) {
    ElMessage.warning('请先选择一个启用的优化关键词')
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
  if (customTitles.value.length > form.count) {
    ElMessage.warning('自定义标题数量不能超过创作篇数')
    return
  }
  if (customTitles.value.some((title) => Array.from(title).length > 30)) {
    ElMessage.warning('每个自定义标题不能超过 30 个字')
    return
  }

  creating.value = true
  try {
    if (isRealApiMode) {
      const task = await createArticleAiTask({
        groupName: form.groupName.trim(), keywordId: form.keywordId, knowledgeLibraryId: form.knowledgeLibraryId,
        galleryId: form.galleryId, imageCount: form.imageCount, instructionId: form.instructionId,
        contentDirection: form.contentDirection, count: form.count, customTitles: customTitles.value,
      })
      await loadArticleTasks(task.id)
      taskDialogVisible.value = false
      ElMessage.success(`创作任务已入队：${task.totalCount} 篇待处理；仅成功入库才会扣除额度`)
      return
    }
    const result = await createArticlesMock({
      groupName: form.groupName.trim(), keywordId: form.keywordId, knowledgeLibraryIds: form.knowledgeLibraryId ? [form.knowledgeLibraryId] : [],
      galleryId: form.galleryId, imageCount: form.imageCount, instructionId: form.instructionId,
      contentDirection: form.contentDirection, count: form.count, customTitles: customTitles.value,
    })
    ElMessage.success(`已创建 ${result.createdCount} 篇文章草稿`)
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
    <header class="page-intro">
      <div><h2>AI 写作任务</h2><p>创建批量写作任务，并查看文章生成进度和失败原因。</p></div>
    </header>
    <section class="mock-notice surface-panel"><el-icon><InfoFilled /></el-icon><p>创作任务提交后将在后台处理，生成进度与失败原因可在任务列表查看。<strong>仅成功生成并入库的文章计入用量。</strong></p></section>
    <section v-if="errorMessage" class="error-panel surface-panel"><strong>创作配置加载失败</strong><p>{{ errorMessage }}</p><button class="secondary-button" type="button" @click="loadOptions">重新加载</button></section>
    <section v-else class="task-ledger surface-panel">
      <header class="ledger-toolbar">
        <div class="toolbar-actions">
          <button class="primary-button" type="button" :disabled="loading" @click="openTaskCreator"><span>＋</span>添加任务</button>
          <button class="icon-button" type="button" :disabled="loading" title="刷新任务" @click="loadOptions"><el-icon><SetUp /></el-icon></button>
        </div>
        <p>共 {{ articleTasks.length }} 个任务<span v-if="hasActiveArticleTask"> · 后台正在创作</span></p>
      </header>
      <div v-if="loading" class="task-table-skeleton"><span v-for="index in 4" :key="index" /></div>
      <div v-else-if="articleTasks.length" class="task-table-wrap">
        <table class="task-table">
          <thead><tr><th>任务名称</th><th>创作进度</th><th>状态</th><th>失败文章</th><th>创建时间</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="task in articleTasks" :key="task.id">
              <td><div class="task-name"><strong>{{ task.groupName || '未命名写作任务' }}</strong><small>{{ task.retryOfTaskId ? '失败重试任务' : `任务编号 ${task.id.slice(0, 8)}` }}</small></div></td>
              <td><div class="task-progress"><div><span>{{ task.completedCount }} / {{ task.totalCount }} 已完成</span><b>{{ taskProgress(task) }}%</b></div><i><em :style="{ width: `${taskProgress(task)}%` }" /></i></div></td>
              <td><span class="status-badge" :class="`is-${taskStatusMeta[task.status].tone}`"><i />{{ taskStatusMeta[task.status].label }}</span></td>
              <td><span :class="{ 'failure-count': task.failedCount > 0 }">{{ task.failedCount }} 篇</span></td>
              <td>{{ formatTaskDate(task.createdAt) }}</td>
              <td><div class="row-actions"><button type="button" @click="openTaskDetail(task.id)">查看详情</button><button v-if="['queued','running'].includes(task.status)" class="danger-link" type="button" :disabled="stoppingTaskId !== null" @click="stopTask(task.id)">{{ stoppingTaskId === task.id ? '停止中…' : '停止' }}</button></div></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="task-empty"><span>✦</span><strong>还没有写作任务</strong><p>点击左上角“添加任务”，选择关键词并创建第一批文章。</p><button class="primary-button" type="button" @click="openTaskCreator">添加任务</button></div>
    </section>

    <div v-if="taskDialogVisible" class="dialog-backdrop" @click.self="closeTaskCreator">
      <section class="task-dialog" role="dialog" aria-modal="true" aria-label="添加 AI 写作任务">
        <header class="dialog-heading"><div><h3>添加 AI 写作任务</h3><p>选择关键词、企业资料和写作要求，系统会按设置批量生成文章。</p></div><button class="dialog-close" type="button" :disabled="creating" @click="closeTaskCreator">×</button></header>
        <div class="dialog-content creation-grid">
          <main class="form-panel">
            <header class="panel-heading"><div><h3>创作配置</h3></div><span>最多 100 篇</span></header>
            <div class="form-body">
              <label class="field"><span>文章分组名 <em>自动生成</em></span><input v-model="form.groupName" maxlength="100" readonly placeholder="选择优化关键词后自动生成" /><small>选择或切换优化关键词后，系统按“日期 + 关键词”自动生成；本次文章和后续失败重试归入此分组。</small></label>
              <label class="field"><span>优化关键词 <i>*</i></span><select v-model="form.keywordId"><option value="">请选择关键词</option><option v-for="keyword in enabledKeywords" :key="keyword.id" :value="keyword.id">{{ keyword.name }} · {{ keyword.questionTotal }} 个参考问题词</option></select><small v-if="selectedKeyword">每篇写作都会从当前关键词的启用问题词中随机选择一个作为参考；问题词可重复使用，不再限制创作篇数。</small><small v-else-if="!enabledKeywords.length" class="warning">没有启用关键词，请先到“关键词与问题”创建。</small></label>
              <label class="field"><span>自定义标题 <em>可选，每行一个</em></span><textarea v-model="form.customTitlesText" rows="4" placeholder="例如：西安哪家火锅好吃？&#10;西安哪个火锅性价比高？" /><small>建议填写正向、自然的用户提问。按顺序用于前 {{ customTitles.length }} 篇；其余标题由 AI 生成，并结合随机参考问题词和优化关键词做必要调整，每条不超过 30 字。</small></label>
              <div class="field"><span>企业信息库 <em>可选，单选</em></span><div class="library-picks"><label class="pick"><input v-model="form.knowledgeLibraryId" :value="null" type="radio" /><span><strong>基础写作模式</strong><small>仅使用公司名、关键词与问题词，自动补充场景和行业常识</small></span></label><label v-for="library in libraries" :key="library.id" class="pick"><input v-model="form.knowledgeLibraryId" :value="library.id" type="radio" /><span><strong>{{ library.name }}</strong><small>{{ library.companyName }} · {{ library.brandAlias }}</small></span></label><p v-if="!libraries.length" class="empty-copy">当前没有信息库，仍可正常生成软文；补充资料后可写入更多企业细节。</p></div></div>
              <label class="field"><span>企业图库与配图数量 <em>可选</em></span><select v-model="form.galleryId"><option :value="null">暂不使用图库</option><option v-for="gallery in galleries" :key="gallery.id" :value="gallery.id">{{ gallery.name }} · {{ gallery.imageCount }} 张</option></select><div class="image-count"><button v-for="count in [0,1,2,3]" :key="count" type="button" :class="{ active: form.imageCount === count }" :disabled="Boolean(form.galleryId) && count === 0" @click="form.imageCount=count"><el-icon><Picture /></el-icon>{{ count === 0 ? '无配图' : `${count} 张配图` }}</button></div><small v-if="form.galleryId">已自动选择至少 1 张配图；写作完成后插入文章正文，发布任务继续使用同一张图片。</small><small v-else>不使用图库时生成无图文章；抖音和什么值得买发布前必须补充图片。</small></label>
              <label class="field"><span>文章方向 <i>*</i></span><select v-model="form.contentDirection"><option v-for="direction in directionOptions" :key="direction.value" :value="direction.value">{{ direction.label }}</option></select><small>{{ selectedDirection.description }}</small></label>
              <label class="field"><span>创作指令</span><select v-model="form.instructionId"><option :value="null">{{ defaultInstruction?.name || '系统默认内容指令' }}</option><option v-for="instruction in customInstructions" :key="instruction.id" :value="instruction.id">{{ instruction.name }}</option></select><small v-if="selectedInstruction">已选择自定义表达规则；仍受标题、结构和合规质量门约束</small><small v-else>使用“创作指令”页面中当前保存的系统默认指令。</small></label>
              <label class="field count-field"><span>创作篇数 <i>*</i></span><input v-model.number="form.count" min="1" :max="articleLimit" type="number" /><small>单次最多 {{ articleLimit }} 篇，不受问题词数量限制；正式环境预计消耗 {{ realCost }} 算力点。</small></label>
            </div>
          </main>
          <aside class="summary-panel">
            <h3>本次任务摘要</h3>
            <dl><div><dt>分组</dt><dd>{{ form.groupName || '未填写' }}</dd></div><div><dt>关键词</dt><dd>{{ selectedKeyword?.name || '未选择' }}</dd></div><div><dt>问题词</dt><dd>每篇随机参考</dd></div><div><dt>自定义标题</dt><dd>{{ customTitles.length }} 条</dd></div><div><dt>写作模式</dt><dd>{{ form.knowledgeLibraryId ? '事实增强模式' : '基础写作模式' }}</dd></div><div><dt>信息库</dt><dd>{{ libraries.find((item) => item.id === form.knowledgeLibraryId)?.name || '不使用' }}</dd></div><div><dt>图库</dt><dd>{{ selectedGallery?.name || '不使用' }}</dd></div><div><dt>配图</dt><dd>{{ form.imageCount }} 张 / 篇</dd></div><div><dt>文章方向</dt><dd>{{ selectedDirection.label }}</dd></div><div><dt>创作篇数</dt><dd>{{ form.count }} 篇</dd></div></dl>
            <div class="cost-box"><span>预计用量</span><strong>{{ isRealApiMode ? `${realCost} 算力点` : '创建后统计' }}</strong><p>{{ isRealApiMode ? '任务失败或停止会退回未使用预占；成功文章按 30 点 / 篇确认扣除。' : '仅成功生成并进入文章库的内容计入用量。' }}</p></div>
            <button class="create-button" type="button" :disabled="creating || loading" @click="createDrafts"><el-icon><DocumentAdd /></el-icon>{{ creating ? '正在创建任务…' : '创建 AI 创作任务' }}<el-icon><ArrowRight /></el-icon></button>
          </aside>
        </div>
      </section>
    </div>

    <div v-if="taskDetailVisible && latestTask" class="dialog-backdrop" @click.self="taskDetailVisible=false">
      <section class="detail-dialog" role="dialog" aria-modal="true" aria-label="写作任务详情">
        <header class="dialog-heading"><div><h3>{{ latestTask.groupName || '写作任务详情' }}</h3><p>{{ formatTaskDate(latestTask.createdAt) }} 创建</p></div><button class="dialog-close" type="button" @click="taskDetailVisible=false">×</button></header>
        <div class="detail-content">
          <div class="detail-overview"><span class="status-badge" :class="`is-${taskStatusMeta[latestTask.status].tone}`"><i />{{ taskStatusMeta[latestTask.status].label }}</span><strong>{{ latestTask.completedCount }} / {{ latestTask.totalCount }} 已完成</strong><div class="detail-progress"><i><em :style="{ width: `${taskProgress(latestTask)}%` }" /></i><b>{{ taskProgress(latestTask) }}%</b></div></div>
          <dl class="detail-grid"><div><dt>成功文章</dt><dd>{{ latestTask.completedCount }} 篇</dd></div><div><dt>失败文章</dt><dd>{{ latestTask.failedCount }} 篇</dd></div><div><dt>预占算力</dt><dd>{{ latestTask.computePointsReserved }} 点</dd></div><div><dt>预占篇数</dt><dd>{{ latestTask.writingReserved }} 篇</dd></div></dl>
          <p v-if="latestTask.failureReason" class="failure-reason"><strong>失败原因</strong>{{ latestTask.failureReason }}</p>
          <button v-if="canStopLatestTask" class="secondary-button stop-task" type="button" :disabled="stoppingTaskId !== null" @click="stopLatestTask">{{ stoppingTaskId === latestTask.id ? '停止中…' : '停止此任务' }}</button>
          <div v-if="canRetryLatestTask && retryableQuestions.length" class="retry-panel"><p>有 {{ retryableQuestions.length }} 篇未完成文章可重试；只成功扣费。</p><button class="secondary-button" type="button" :disabled="retryingQuestionId !== null" @click="retryLatestTask()">{{ retryingQuestionId === 'all' ? '创建中…' : '重试全部未完成文章' }}</button><button v-for="question in retryableQuestions" :key="question.referenceId" class="retry-question" type="button" :disabled="retryingQuestionId !== null" @click="retryLatestTask(question.referenceId)"><span>{{ question.customTitle || question.text }}</span><b>{{ retryingQuestionId === question.referenceId ? '创建中…' : '单篇重试' }}</b></button></div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.create-page { display: grid; max-width: 1500px; margin: 0 auto; gap: 16px; }
.page-intro,.mock-notice,.panel-heading,.image-count,.create-button,.ledger-toolbar,.toolbar-actions,.row-actions { display: flex; align-items: center; }
.page-intro { justify-content: space-between; gap: 24px; }
.eyebrow,.panel-kicker { display: block; color: var(--color-champagne); font-family: var(--font-mono); font-size: 12px; letter-spacing: .13em; }
.eyebrow { margin-bottom: 5px; }
h2,h3,p { margin: 0; }
h2 { font-size: 30px; font-weight: 700; letter-spacing: -.035em; }
h3 { font-size: 19px; font-weight: 680; }
.page-intro p { margin-top: 5px; color: var(--color-text-secondary); }
.primary-button,.secondary-button,.icon-button,.create-button { border-radius: 8px; cursor: pointer; font: inherit; }
.primary-button { display: inline-flex; min-height: 40px; align-items: center; justify-content: center; padding: 0 16px; border: 0; color: #fff; background: var(--gradient-primary); box-shadow: 0 8px 20px rgba(37,99,235,.2); gap: 7px; font-weight: 600; }
.secondary-button { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; padding: 0 14px; border: 1px solid var(--color-border-strong); color: var(--color-text-secondary); background: #fff; gap: 7px; }
.icon-button { display: grid; width: 40px; height: 40px; border: 1px solid var(--color-border-strong); color: var(--color-primary); background: #fff; place-items: center; }
.primary-button:disabled,.secondary-button:disabled,.icon-button:disabled,.create-button:disabled { cursor: not-allowed; opacity: .5; }
.mock-notice { padding: 13px 16px; border-color: #dfe4fb; color: var(--color-text-secondary); align-items: flex-start; gap: 10px; }
.mock-notice>.el-icon { margin-top: 1px; color: #4daecb; font-size: 18px; }
.mock-notice p { font-size: 14px; line-height: 1.7; }
.error-panel { display: grid; min-height: 230px; padding: 30px; text-align: center; place-items: center; align-content: center; gap: 8px; }
.error-panel p { color: var(--color-text-muted); }
.task-ledger { min-height: 520px; overflow: hidden; }
.ledger-toolbar { justify-content: space-between; min-height: 70px; padding: 0 16px; border-bottom: 1px solid var(--color-border); }
.toolbar-actions { gap: 8px; }
.ledger-toolbar>p { color: var(--color-text-muted); font-size: 14px; }
.ledger-toolbar>p span { color: var(--color-primary); }
.task-table-wrap { overflow-x: auto; }
.task-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.task-table th { height: 50px; padding: 0 16px; color: #53647b; background: #f7f9fc; font-size: 14px; font-weight: 650; text-align: left; }
.task-table th:nth-child(1) { width: 25%; }.task-table th:nth-child(2) { width: 24%; }.task-table th:nth-child(3) { width: 12%; }.task-table th:nth-child(4) { width: 10%; }.task-table th:nth-child(5) { width: 14%; }.task-table th:nth-child(6) { width: 15%; }
.task-table td { height: 82px; padding: 12px 16px; border-top: 1px solid var(--color-border); color: var(--color-text-secondary); font-size: 14px; vertical-align: middle; }
.task-table tbody tr { transition: background-color .16s ease; }.task-table tbody tr:hover { background: #fafbff; }
.task-name { display: grid; min-width: 0; gap: 6px; }.task-name strong,.task-name small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.task-name strong { color: var(--color-text); font-size: 15px; }.task-name small { color: var(--color-text-muted); font-family: var(--font-mono); font-size: 12px; }
.task-progress { display: grid; gap: 9px; }.task-progress>div { display: flex; justify-content: space-between; color: var(--color-text-secondary); }.task-progress b { color: var(--color-primary); font-family: var(--font-mono); font-size: 12px; }.task-progress>i,.detail-progress>i { display: block; height: 6px; overflow: hidden; border-radius: 99px; background: #e9eef7; }.task-progress em,.detail-progress em { display: block; height: 100%; border-radius: inherit; background: var(--gradient-primary); transition: width .25s ease; }
.status-badge { display: inline-flex; min-height: 30px; align-items: center; padding: 0 10px; border-radius: 99px; gap: 6px; font-size: 13px; font-weight: 600; }.status-badge i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }.status-badge.is-pending { color: #a36a13; background: #fff4df; }.status-badge.is-running { color: #2563eb; background: #eaf1fe; }.status-badge.is-success { color: #138868; background: #e9f8f3; }.status-badge.is-warning { color: #b67513; background: #fff5df; }.status-badge.is-danger { color: #d64e62; background: #ffedf0; }.status-badge.is-muted { color: #7c8594; background: #f0f2f5; }
.failure-count { color: var(--color-danger); font-weight: 600; }
.row-actions { gap: 14px; }.row-actions button { padding: 0; border: 0; color: var(--color-primary); background: transparent; cursor: pointer; font: inherit; font-size: 14px; }.row-actions button:hover { text-decoration: underline; }.row-actions button.danger-link { color: var(--color-danger); }.row-actions button:disabled { cursor: not-allowed; opacity: .5; }
.task-empty { display: grid; min-height: 390px; color: var(--color-text-muted); text-align: center; place-items: center; align-content: center; gap: 10px; }.task-empty>span { display: grid; width: 52px; height: 52px; border-radius: 14px; color: var(--color-primary); background: var(--color-primary-soft); font-size: 24px; place-items: center; }.task-empty strong { color: var(--color-text); font-size: 16px; }.task-empty p { font-size: 14px; }.task-empty .primary-button { margin-top: 6px; }
.task-table-skeleton { display: grid; padding: 18px; gap: 10px; }.task-table-skeleton span { height: 58px; border-radius: 8px; background: linear-gradient(90deg,#f3f5f9,#e9edf5,#f3f5f9); background-size: 220% 100%; animation: shimmer 1.4s ease-in-out infinite; }
.dialog-backdrop { position: fixed; z-index: 3000; display: grid; padding: 28px; background: rgba(24,32,53,.58); inset: 0; place-items: center; }
.task-dialog,.detail-dialog { width: min(1220px,100%); overflow: hidden; border: 1px solid #dfe3ec; border-radius: 16px; background: #f7f9fc; box-shadow: 0 28px 70px rgba(16,25,48,.28); }
.task-dialog { max-height: calc(100vh - 88px); }.detail-dialog { width: min(680px,100%); }
.dialog-heading { display: flex; min-height: 88px; align-items: center; justify-content: space-between; padding: 17px 24px; color: #fff; background: var(--gradient-primary); }.dialog-heading .panel-kicker { color: rgba(255,255,255,.76); }.dialog-heading h3 { font-size: 22px; }.dialog-heading p { margin-top: 5px; color: rgba(255,255,255,.84); font-size: 14px; }.dialog-close { display: grid; width: 38px; height: 38px; border: 0; border-radius: 10px; color: #fff; background: rgba(255,255,255,.12); cursor: pointer; font-size: 24px; line-height: 1; place-items: center; }.dialog-close:hover { background: rgba(255,255,255,.2); }
.dialog-content { max-height: calc(100vh - 180px); overflow-y: auto; padding: 20px; }.creation-grid { display: grid; grid-template-columns: minmax(0,1fr) 320px; align-items: start; gap: 18px; }
.form-panel,.summary-panel { min-width: 0; padding: 24px; border: 1px solid var(--color-border); border-radius: 12px; background: #fff; }.panel-heading { justify-content: space-between; padding-bottom: 18px; border-bottom: 1px solid var(--color-border); }.panel-heading span:last-child { color: var(--color-text-muted); font-family: var(--font-mono); font-size: 14px; }.panel-kicker { margin-bottom: 5px; }.form-body { display: grid; padding-top: 21px; gap: 21px; }
.field { display: grid; gap: 9px; }.field>span { color: var(--color-text-secondary); font-size: 14px; font-weight: 600; }.field i { color: var(--color-danger); font-style: normal; }.field em { color: var(--color-text-muted); font-style: normal; font-size: 14px; font-weight: 400; }.field select,.field input,.field textarea { box-sizing: border-box; width: 100%; min-height: 46px; padding: 0 13px; border: 1px solid var(--color-border-strong); border-radius: 9px; outline: none; color: var(--color-text); background: #fff; font: inherit; font-size: 15px; }.field textarea { min-height: 108px; padding-block: 12px; line-height: 1.65; resize: vertical; }.field select:focus,.field input:focus,.field textarea:focus { border-color: var(--color-primary); box-shadow: var(--shadow-focus); }.field small { color: var(--color-text-muted); font-size: 14px; line-height: 1.6; }.field small.warning { color: var(--color-warning); }
.library-picks { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }.pick { display: flex; min-height: 68px; align-items: center; padding: 11px 12px; border: 1px solid var(--color-border); border-radius: 9px; cursor: pointer; gap: 10px; }.pick:has(input:checked) { border-color: #a9c6f4; background: var(--color-primary-soft); }.pick input { width: 16px; min-height: auto; padding: 0; accent-color: var(--color-primary); }.pick span { min-width: 0; }.pick strong,.pick small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.pick strong { font-size: 14px; }.pick small { margin-top: 4px; font-size: 12px; }.empty-copy { color: var(--color-text-muted); font-size: 13px; }
.image-count { flex-wrap: wrap; gap: 8px; }.image-count button { display: inline-flex; min-height: 38px; align-items: center; padding: 0 12px; border: 1px solid var(--color-border); border-radius: 8px; color: var(--color-text-secondary); background: #fff; cursor: pointer; gap: 6px; font-size: 13px; }.image-count button.active { border-color: #a9c6f4; color: var(--color-primary); background: var(--color-primary-soft); }.count-field { max-width: 280px; }
.summary-panel { position: sticky; top: 0; }.summary-panel>h3 { padding-bottom: 17px; border-bottom: 1px solid var(--color-border); }.summary-panel dl,.detail-grid { display: grid; margin: 18px 0; gap: 14px; }.summary-panel dl div { display: flex; justify-content: space-between; gap: 12px; }dt { color: var(--color-text-muted); font-size: 13px; }dd { margin: 0; max-width: 66%; overflow: hidden; color: var(--color-text-secondary); font-size: 13px; font-weight: 600; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.cost-box { padding: 15px; border: 1px solid #d8e4f8; border-radius: 10px; background: linear-gradient(120deg,#eff5fe,#f8fbff); }.cost-box span,.cost-box strong,.cost-box p { display: block; }.cost-box span { color: #3f6fce; font-size: 14px; }.cost-box strong { margin-top: 4px; color: var(--color-primary); font-family: var(--font-mono); font-size: 23px; }.cost-box p { margin-top: 7px; color: var(--color-text-muted); font-size: 14px; line-height: 1.6; }.create-button { justify-content: center; width: 100%; min-height: 46px; margin-top: 16px; border: 0; color: #fff; background: var(--gradient-primary); box-shadow: 0 10px 24px rgba(37,99,235,.18); gap: 9px; font-size: 15px; font-weight: 650; }
.detail-content { padding: 22px; background: #fff; }.detail-overview { display: grid; padding-bottom: 18px; border-bottom: 1px solid var(--color-border); gap: 12px; }.detail-overview>strong { font-size: 24px; }.detail-progress { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 12px; }.detail-progress b { color: var(--color-primary); font-family: var(--font-mono); font-size: 11px; }.detail-grid { grid-template-columns: repeat(4,1fr); }.detail-grid div { padding: 12px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-surface-soft); }.detail-grid dd { max-width: none; margin-top: 7px; color: var(--color-text); text-align: left; }.failure-reason { display: grid; padding: 12px; border: 1px solid #ffd8de; border-radius: 8px; color: #bd4b5d; background: #fff5f6; gap: 5px; font-size: 11px; line-height: 1.6; }
.retry-panel { display: grid; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--color-border); gap: 7px; }.retry-panel p { color: #9b6b1c; font-size: 11px; line-height: 1.5; }.retry-panel .secondary-button,.stop-task { width: 100%; }.retry-question { display: flex; min-width: 0; align-items: center; justify-content: space-between; padding: 9px 10px; border: 1px solid #f0dfbd; border-radius: 7px; color: var(--color-text-secondary); background: #fffaf0; cursor: pointer; gap: 8px; font: inherit; font-size: 11px; text-align: left; }.retry-question span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.retry-question b { flex: 0 0 auto; color: #a26d13; font-size: 10px; }.retry-question:disabled { cursor: not-allowed; opacity: .55; }.stop-task { margin-top: 12px; border-color: #f2c9d0; color: var(--color-danger); }
@keyframes shimmer { to { background-position: -220% 0; } }
@media (max-width: 900px) {
  .dialog-backdrop { padding: 12px; }
  .task-dialog { max-height: calc(100vh - 76px); }
  .creation-grid { grid-template-columns: minmax(0,1fr); }
  .summary-panel { position: static; }
  .dialog-content { max-height: calc(100vh - 168px); }
  .library-picks { grid-template-columns: minmax(0,1fr); }
  .detail-grid { grid-template-columns: repeat(2,1fr); }
}
</style>
