<script setup lang="ts">
import type { AiGenerationTask, DashboardResponse, MerchantKeyword, MerchantQuestion } from '@doubaohk/api-contract'
import { Collection, Delete, EditPen, MagicStick, Plus, RefreshRight, Search, Tickets, View } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'

import { ApiError, isRealApiMode } from '@/services/http'
import {
  createKeyword,
  createQuestionExpansionTask,
  createQuestionsBatch,
  deleteKeyword,
  deleteQuestion,
  expandQuestionsMock,
  getDashboard,
  listKeywords,
  listQuestions,
  updateKeyword,
  updateQuestion,
} from '@/services/merchant.service'
import { formatDateTime, formatNumber } from '@/utils/format'

type CreationMode = 'ai' | 'manual'

const keywords = ref<MerchantKeyword[]>([])
const questions = ref<MerchantQuestion[]>([])
const dashboard = ref<DashboardResponse | null>(null)
const checkedIds = ref<string[]>([])
const query = ref('')
const loading = ref(true)
const loadingQuestions = ref(false)
const saving = ref(false)
const deleting = ref(false)
const working = ref(false)
const updatingId = ref<string | null>(null)
const errorMessage = ref('')
const keywordDialogVisible = ref(false)
const questionDrawerVisible = ref(false)
const editingId = ref<string | null>(null)
const managingKeywordId = ref<string | null>(null)
const latestExpansionTask = ref<AiGenerationTask | null>(null)
const manageMode = ref<CreationMode>('ai')
const manageAiCount = ref(10)

const editor = reactive({
  name: '',
  brandText: '',
  mode: 'ai' as CreationMode,
  aiCount: 10,
  prefixes: '',
  suffixes: '',
})
const manual = reactive({ prefixes: '', suffixes: '' })

const filteredKeywords = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN')
  if (!value) return keywords.value
  return keywords.value.filter((keyword) => [keyword.name, ...keyword.brandTerms].some((text) => text.toLocaleLowerCase('zh-CN').includes(value)))
})
const allVisibleChecked = computed(() => filteredKeywords.value.length > 0 && filteredKeywords.value.every((keyword) => checkedIds.value.includes(keyword.id)))
const editingKeyword = computed(() => keywords.value.find((keyword) => keyword.id === editingId.value) ?? null)
const managingKeyword = computed(() => keywords.value.find((keyword) => keyword.id === managingKeywordId.value) ?? null)
const editorCombinations = computed(() => buildCombinations(editor.name, editor.prefixes, editor.suffixes))
const manualCombinations = computed(() => buildCombinations(managingKeyword.value?.name ?? '', manual.prefixes, manual.suffixes))
const enabledQuestionCount = computed(() => questions.value.filter((question) => question.status === 'enabled').length)

function uniqueLines(value: string): string[] {
  return [...new Map(value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).map((item) => [item.normalize('NFKC').toLocaleLowerCase('zh-CN'), item])).values()]
}

function brandTerms(value: string): string[] {
  return [...new Map(value.split(/[,，\r\n]+/).map((item) => item.trim()).filter(Boolean).map((item) => [item.normalize('NFKC').toLocaleLowerCase('zh-CN'), item])).values()]
}

function buildCombinations(keyword: string, prefixText: string, suffixText: string): string[] {
  const core = keyword.trim()
  if (!core) return []
  const prefixItems = uniqueLines(prefixText)
  const suffixItems = uniqueLines(suffixText)
  const prefixes = prefixItems.length ? prefixItems : ['']
  const suffixes = suffixItems.length ? suffixItems : ['']
  const result = new Map<string, string>()
  for (const prefix of prefixes) {
    for (const suffix of suffixes) {
      const text = `${prefix}${core}${suffix}`.replace(/\s+/g, ' ').trim()
      const normalized = text.normalize('NFKC').toLocaleLowerCase('zh-CN')
      if (!result.has(normalized)) result.set(normalized, text)
    }
  }
  return [...result.values()]
}

function validCombinations(values: string[]): string[] {
  return values.filter((value) => value.length >= 6 && value.length <= 180)
}

function statusLabel(status: MerchantKeyword['status'] | MerchantQuestion['status']): string {
  return status === 'enabled' ? '正常' : '停用'
}

function resetEditor(): void {
  Object.assign(editor, { name: '', brandText: '', mode: 'ai', aiCount: 10, prefixes: '', suffixes: '' })
  editingId.value = null
}

function openCreate(): void {
  resetEditor()
  keywordDialogVisible.value = true
}

function openEdit(keyword: MerchantKeyword): void {
  editingId.value = keyword.id
  Object.assign(editor, { name: keyword.name, brandText: keyword.brandTerms.join('，'), mode: 'ai', aiCount: 10, prefixes: '', suffixes: '' })
  keywordDialogVisible.value = true
}

function toggleAllVisible(): void {
  const visibleIds = filteredKeywords.value.map((keyword) => keyword.id)
  checkedIds.value = allVisibleChecked.value
    ? checkedIds.value.filter((id) => !visibleIds.includes(id))
    : Array.from(new Set([...checkedIds.value, ...visibleIds]))
}

function toggleChecked(id: string): void {
  checkedIds.value = checkedIds.value.includes(id) ? checkedIds.value.filter((item) => item !== id) : [...checkedIds.value, id]
}

function validateKeywordForm(): { name: string; brandTerms: string[] } | null {
  const name = editor.name.trim()
  const terms = brandTerms(editor.brandText)
  if (name.length < 2 || name.length > 80) { ElMessage.warning('主关键词需为2至80个字符'); return null }
  if (!terms.length) { ElMessage.warning('请至少填写1个公司或品牌名'); return null }
  if (terms.length > 20 || terms.some((term) => term.length > 120)) { ElMessage.warning('公司或品牌名最多20个，每个不超过120字'); return null }
  if (editingKeyword.value?.questionTotal && editingKeyword.value.name !== name) { ElMessage.warning('该关键词已有问题词，为保证上下层一致，不允许修改主关键词'); return null }
  return { name, brandTerms: terms }
}

function validateManual(keyword: string, prefixes: string, suffixes: string): string[] | null {
  const prefixItems = uniqueLines(prefixes)
  const suffixItems = uniqueLines(suffixes)
  if (prefixItems.length > 20 || suffixItems.length > 20) { ElMessage.warning('前缀和后缀分别最多填写20条'); return null }
  const combinations = buildCombinations(keyword, prefixes, suffixes)
  if (combinations.length > 500) { ElMessage.warning('本次组合超过500条，请缩小前缀或后缀范围'); return null }
  const valid = validCombinations(combinations)
  if (!valid.length) { ElMessage.warning('组合结果需为6至180个字符'); return null }
  if (valid.length !== combinations.length) { ElMessage.warning('部分组合结果不足6字或超过180字，请调整前后缀'); return null }
  return valid
}

async function loadKeywords(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const [keywordResult, dashboardResult] = await Promise.all([listKeywords(), getDashboard()])
    keywords.value = keywordResult
    dashboard.value = dashboardResult
    const liveIds = new Set(keywordResult.map((keyword) => keyword.id))
    checkedIds.value = checkedIds.value.filter((id) => liveIds.has(id))
    if (managingKeywordId.value && !liveIds.has(managingKeywordId.value)) questionDrawerVisible.value = false
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '关键词加载失败'
  } finally {
    loading.value = false
  }
}

async function loadQuestions(keywordId: string): Promise<void> {
  loadingQuestions.value = true
  try {
    questions.value = await listQuestions(keywordId)
  } catch (error) {
    questions.value = []
    ElMessage.error(error instanceof ApiError ? error.message : '问题词加载失败')
  } finally {
    loadingQuestions.value = false
  }
}

async function openQuestionManager(keyword: MerchantKeyword): Promise<void> {
  managingKeywordId.value = keyword.id
  manageMode.value = 'ai'
  manageAiCount.value = 10
  Object.assign(manual, { prefixes: '', suffixes: '' })
  latestExpansionTask.value = null
  questionDrawerVisible.value = true
  await loadQuestions(keyword.id)
}

async function saveKeywordOnly(): Promise<void> {
  const payload = validateKeywordForm()
  if (!payload) return
  saving.value = true
  try {
    if (editingId.value) {
      await updateKeyword(editingId.value, payload)
      ElMessage.success('关键词项目已更新')
    } else {
      await createKeyword(payload)
      ElMessage.success('关键词项目已添加')
    }
    keywordDialogVisible.value = false
    await loadKeywords()
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '关键词保存失败')
  } finally {
    saving.value = false
  }
}

async function launchAi(keyword: MerchantKeyword, count: number): Promise<void> {
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error('AI蒸馏数量需为1至20条')
  if (isRealApiMode) {
    latestExpansionTask.value = await createQuestionExpansionTask(keyword.id, { count })
  } else {
    await expandQuestionsMock(keyword.id, { count })
  }
}

async function createWithQuestions(): Promise<void> {
  const payload = validateKeywordForm()
  if (!payload) return
  const combinations = editor.mode === 'manual' ? validateManual(payload.name, editor.prefixes, editor.suffixes) : null
  if (editor.mode === 'manual' && !combinations) return
  if (editor.mode === 'ai' && (!Number.isInteger(editor.aiCount) || editor.aiCount < 1 || editor.aiCount > 20)) return void ElMessage.warning('AI蒸馏数量需为1至20条')
  saving.value = true
  let created: MerchantKeyword | null = null
  try {
    created = await createKeyword(payload)
    if (editor.mode === 'ai') {
      await launchAi(created, editor.aiCount)
      ElMessage.success(isRealApiMode ? '关键词已添加，AI蒸馏任务已进入队列' : '关键词与本地模拟问题词已添加')
    } else {
      const result = await createQuestionsBatch(created.id, { texts: combinations! })
      ElMessage.success(`关键词已添加，新增 ${result.createdCount} 条组合问题词`)
    }
    keywordDialogVisible.value = false
  } catch (error) {
    if (created) ElMessage.error(`关键词已创建，但问题词处理失败：${error instanceof Error ? error.message : '未知错误'}`)
    else ElMessage.error(error instanceof ApiError ? error.message : '关键词创建失败')
  } finally {
    await loadKeywords()
    saving.value = false
  }
}

async function toggleKeyword(keyword: MerchantKeyword): Promise<void> {
  updatingId.value = keyword.id
  try {
    await updateKeyword(keyword.id, { status: keyword.status === 'enabled' ? 'disabled' : 'enabled' })
    await loadKeywords()
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '关键词状态更新失败')
  } finally {
    updatingId.value = null
  }
}

async function removeKeywords(ids: string[]): Promise<void> {
  const targets = Array.from(new Set(ids))
  if (!targets.length) return
  try {
    await ElMessageBox.confirm(targets.length === 1 ? '删除关键词会同时停用其问题词，确认继续吗？' : `确认删除选中的 ${targets.length} 个关键词项目吗？`, '删除确认', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' })
  } catch { return }
  deleting.value = true
  try {
    for (const id of targets) await deleteKeyword(id)
    checkedIds.value = checkedIds.value.filter((id) => !targets.includes(id))
    await loadKeywords()
    ElMessage.success(`已删除 ${targets.length} 个关键词项目`)
  } catch (error) {
    await loadKeywords()
    ElMessage.error(error instanceof ApiError ? error.message : '关键词删除失败')
  } finally { deleting.value = false }
}

async function distillForCurrent(): Promise<void> {
  const keyword = managingKeyword.value
  if (!keyword) return
  if (keyword.status === 'disabled') return void ElMessage.warning('请先启用该关键词')
  working.value = true
  try {
    await launchAi(keyword, Number(manageAiCount.value))
    if (!isRealApiMode) await Promise.all([loadQuestions(keyword.id), loadKeywords()])
    ElMessage.success(isRealApiMode ? 'AI蒸馏任务已进入队列，成功入库的问题词按1点/词扣减' : '本地模拟问题词已添加')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'AI蒸馏任务创建失败')
  } finally { working.value = false }
}

async function saveManualCombinations(): Promise<void> {
  const keyword = managingKeyword.value
  if (!keyword) return
  const combinations = validateManual(keyword.name, manual.prefixes, manual.suffixes)
  if (!combinations) return
  working.value = true
  try {
    const result = await createQuestionsBatch(keyword.id, { texts: combinations })
    await Promise.all([loadQuestions(keyword.id), loadKeywords()])
    ElMessage.success(`新增 ${result.createdCount} 条，跳过 ${result.skippedDuplicateCount} 条重复问题词`)
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '组合问题词保存失败')
  } finally { working.value = false }
}

async function toggleQuestion(question: MerchantQuestion): Promise<void> {
  updatingId.value = question.id
  try {
    await updateQuestion(question.id, { status: question.status === 'enabled' ? 'disabled' : 'enabled' })
    if (managingKeywordId.value) await loadQuestions(managingKeywordId.value)
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '问题词状态更新失败')
  } finally { updatingId.value = null }
}

async function removeQuestion(question: MerchantQuestion): Promise<void> {
  try { await ElMessageBox.confirm(`确认删除“${question.text}”吗？`, '删除问题词', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }) } catch { return }
  updatingId.value = question.id
  try {
    await deleteQuestion(question.id)
    if (managingKeywordId.value) await Promise.all([loadQuestions(managingKeywordId.value), loadKeywords()])
    ElMessage.success('问题词已删除')
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '问题词删除失败')
  } finally { updatingId.value = null }
}

onMounted(() => void loadKeywords())
</script>

<template>
  <div class="keywords-page">
    <header class="page-intro">
      <div><span class="eyebrow">KEYWORD INVENTORY</span><h2>关键词与问题</h2><p>按主关键词管理问题词，通过 AI 蒸馏或前后缀组合构建后续创作问题库。</p></div>
      <div class="quota-note"><span>关键词</span><strong>{{ formatNumber(keywords.length) }} / {{ dashboard?.resources.keywords.limit ?? '—' }}</strong><i>算力 {{ formatNumber(dashboard?.resources.computePoints.available ?? 0) }} 点</i></div>
    </header>

    <section v-if="errorMessage" class="error-panel surface-panel" role="alert"><strong>关键词暂时无法加载</strong><p>{{ errorMessage }}</p><button class="secondary-button" type="button" @click="loadKeywords">重新加载</button></section>

    <section v-else class="list-panel surface-panel">
      <div class="toolbar">
        <div class="toolbar-actions"><button class="primary-button" type="button" @click="openCreate"><el-icon><Plus /></el-icon>添加关键词</button><button class="icon-button" type="button" :disabled="loading" aria-label="刷新列表" @click="loadKeywords"><el-icon><RefreshRight /></el-icon></button><button class="danger-button" type="button" :disabled="!checkedIds.length || deleting" @click="removeKeywords(checkedIds)"><el-icon><Delete /></el-icon>删除</button></div>
        <label class="search-field"><el-icon><Search /></el-icon><input v-model="query" placeholder="搜索主关键词、公司或品牌名" /></label>
      </div>

      <div class="table-scroll">
        <table class="keyword-table">
          <thead><tr><th class="check-cell"><input type="checkbox" :checked="allVisibleChecked" aria-label="全选当前列表" @change="toggleAllVisible" /></th><th class="index-cell">序号</th><th>主关键词</th><th>公司 / 品牌</th><th>问题数量</th><th>优化状态</th><th>创建时间</th><th class="operation-cell">操作</th></tr></thead>
          <tbody v-if="!loading && filteredKeywords.length"><tr v-for="(keyword, index) in filteredKeywords" :key="keyword.id"><td class="check-cell"><input type="checkbox" :checked="checkedIds.includes(keyword.id)" :aria-label="`选择 ${keyword.name}`" @change="toggleChecked(keyword.id)" /></td><td class="index-cell">{{ index + 1 }}</td><td><strong class="keyword-name">{{ keyword.name }}</strong></td><td><div class="brand-tags"><span v-for="term in keyword.brandTerms.slice(0, 2)" :key="term">{{ term }}</span><i v-if="keyword.brandTerms.length > 2">+{{ keyword.brandTerms.length - 2 }}</i><em v-if="!keyword.brandTerms.length">未设置</em></div></td><td><button class="question-count" type="button" @click="openQuestionManager(keyword)">{{ keyword.questionTotal }} <small>条</small></button></td><td><button class="status-switch" :class="{ active: keyword.status === 'enabled' }" type="button" :disabled="updatingId === keyword.id" :aria-label="`${keyword.name}${statusLabel(keyword.status)}`" @click="toggleKeyword(keyword)"><span /><i>{{ statusLabel(keyword.status) }}</i></button></td><td>{{ formatDateTime(keyword.createdAt) }}</td><td class="operation-cell"><button class="row-action view" type="button" :aria-label="`管理 ${keyword.name} 的问题词`" @click="openQuestionManager(keyword)"><el-icon><View /></el-icon></button><button class="row-action edit" type="button" :aria-label="`编辑 ${keyword.name}`" @click="openEdit(keyword)"><el-icon><EditPen /></el-icon></button><button class="row-action delete" type="button" :aria-label="`删除 ${keyword.name}`" @click="removeKeywords([keyword.id])"><el-icon><Delete /></el-icon></button></td></tr></tbody>
        </table>
        <div v-if="loading" class="loading-rows"><span v-for="index in 5" :key="index" /></div>
        <div v-else-if="!filteredKeywords.length" class="empty-state"><el-icon><Collection /></el-icon><strong>{{ query ? '没有匹配的关键词' : '还没有关键词' }}</strong><p>{{ query ? '请调整搜索内容' : '点击左上角“添加关键词”创建第一条关键词项目' }}</p></div>
      </div>
      <footer class="table-footer">显示 {{ filteredKeywords.length }} 条记录，共 {{ keywords.length }} 条</footer>
    </section>

    <el-dialog v-model="keywordDialogVisible" class="keyword-dialog" :title="editingId ? '编辑关键词' : '添加关键词'" width="min(900px, 94vw)" destroy-on-close>
      <form id="keyword-form" class="keyword-form" @submit.prevent="saveKeywordOnly">
        <div class="base-fields"><label class="field"><span>主关键词 <i>*</i></span><input v-model="editor.name" maxlength="80" :disabled="Boolean(editingKeyword?.questionTotal)" placeholder="例如：西安铜锅涮肉" /><small v-if="editingKeyword?.questionTotal">已有问题词，主关键词已锁定</small></label><label class="field"><span>公司 / 品牌名 <i>*</i></span><input v-model="editor.brandText" maxlength="800" placeholder="多个名称用逗号分隔，例如：星术涮肉，星术" /><small>用于 AI 理解企业实体和无信息库文章写作</small></label></div>

        <template v-if="!editingId">
          <div class="mode-tabs"><button type="button" :class="{ active: editor.mode === 'ai' }" @click="editor.mode = 'ai'"><el-icon><MagicStick /></el-icon><span>AI 蒸馏问题词<small>提炼真实问答意图</small></span></button><button type="button" :class="{ active: editor.mode === 'manual' }" @click="editor.mode = 'manual'"><el-icon><Tickets /></el-icon><span>手动组合<small>前缀 × 固定主关键词 × 后缀</small></span></button></div>
          <section v-if="editor.mode === 'ai'" class="ai-panel"><div><strong>AI 问题词蒸馏</strong><p>围绕推荐选择、怎么选、哪家好、场景、成本、流程和常见误区生成去重问题词。</p><small>{{ isRealApiMode ? '成功新增1个问题词扣1点；失败、重复不扣点。' : '当前 Mock 模式不调用模型、不扣点。' }}</small></div><label><span>生成数量</span><input v-model.number="editor.aiCount" type="number" min="1" max="20" /></label></section>
          <section v-else class="manual-panel"><label class="field"><span>前缀 <i>0–20条，每行一个</i></span><textarea v-model="editor.prefixes" rows="7" :placeholder="'推荐\n求推荐\n靠谱的\n专业的'" /></label><div class="core-word"><span>固定主关键词</span><strong>{{ editor.name.trim() || '请先填写上方主关键词' }}</strong><small>只能使用上方设置的1个主关键词</small></div><label class="field"><span>后缀 <i>0–20条，每行一个</i></span><textarea v-model="editor.suffixes" rows="7" :placeholder="'哪家好\n公司\n服务商\n怎么选'" /></label><div class="combination-summary"><span>预计生成 <strong>{{ editorCombinations.length }}</strong> 条</span><i>自动去重，保存时校验6–180字</i></div></section>
        </template>
      </form>
      <template #footer><div class="dialog-footer"><button class="secondary-button" type="button" @click="keywordDialogVisible = false">取消</button><button class="secondary-button" type="button" :disabled="saving" @click="saveKeywordOnly">{{ editingId ? '保存修改' : '仅保存关键词' }}</button><button v-if="!editingId" class="primary-button" type="button" :disabled="saving" @click="createWithQuestions">{{ saving ? '处理中…' : editor.mode === 'ai' ? '创建并开始AI蒸馏' : '创建并保存组合词' }}</button></div></template>
    </el-dialog>

    <el-drawer v-model="questionDrawerVisible" class="question-drawer" :title="managingKeyword ? `${managingKeyword.name} · 问题词管理` : '问题词管理'" size="min(1080px, 96vw)" destroy-on-close>
      <template v-if="managingKeyword">
        <div class="drawer-overview"><div><span>主关键词</span><strong>{{ managingKeyword.name }}</strong></div><div><span>公司 / 品牌</span><strong>{{ managingKeyword.brandTerms.join('、') || '未设置' }}</strong></div><div><span>问题词</span><strong>{{ questions.length }} 条 / {{ enabledQuestionCount }} 条启用</strong></div></div>
        <div class="mode-tabs manage-tabs"><button type="button" :class="{ active: manageMode === 'ai' }" @click="manageMode = 'ai'"><el-icon><MagicStick /></el-icon><span>AI 蒸馏问题词<small>调用贴牌 AI 模型</small></span></button><button type="button" :class="{ active: manageMode === 'manual' }" @click="manageMode = 'manual'"><el-icon><Tickets /></el-icon><span>手动组合<small>主关键词固定且只读</small></span></button></div>
        <section v-if="manageMode === 'ai'" class="ai-panel manage-panel"><div><strong>从“{{ managingKeyword.name }}”蒸馏真实问题</strong><p>内置提示词会过滤机械近义词和关键词堆砌，优先生成适合 GEO 文章回答的搜索问题。</p><small v-if="latestExpansionTask">最近任务：{{ latestExpansionTask.status }} · {{ latestExpansionTask.completedCount }}/{{ latestExpansionTask.totalCount }}</small><small v-else>{{ isRealApiMode ? '成功入库按1点/词扣减算力。' : 'Mock 模式不调用模型。' }}</small></div><label><span>生成数量</span><input v-model.number="manageAiCount" type="number" min="1" max="20" /></label><button class="primary-button" type="button" :disabled="working || managingKeyword.status === 'disabled'" @click="distillForCurrent">{{ working ? '创建中…' : managingKeyword.status === 'disabled' ? '关键词已停用' : '开始AI蒸馏' }}</button></section>
        <section v-else class="manual-panel manage-panel"><label class="field"><span>前缀 <i>0–20条，每行一个</i></span><textarea v-model="manual.prefixes" rows="6" :placeholder="'推荐\n求推荐\n靠谱的\n专业的'" /></label><div class="core-word"><span>固定主关键词</span><strong>{{ managingKeyword.name }}</strong><small>与列表设置完全一致，不可修改</small></div><label class="field"><span>后缀 <i>0–20条，每行一个</i></span><textarea v-model="manual.suffixes" rows="6" :placeholder="'哪家好\n公司\n服务商\n怎么选'" /></label><div class="combination-summary"><span>预计生成 <strong>{{ manualCombinations.length }}</strong> 条</span><i>前缀 × 1个主关键词 × 后缀</i><button class="primary-button" type="button" :disabled="working" @click="saveManualCombinations">{{ working ? '保存中…' : '保存组合问题词' }}</button></div></section>

        <section class="question-list-panel"><header><div><span>QUESTION INVENTORY</span><h3>问题词列表</h3></div><button class="icon-button" type="button" :disabled="loadingQuestions" aria-label="刷新问题词" @click="loadQuestions(managingKeyword.id)"><el-icon><RefreshRight /></el-icon></button></header><div class="question-table-wrap"><table class="question-table"><thead><tr><th>问题词</th><th>创作状态</th><th>检测状态</th><th>状态</th><th>操作</th></tr></thead><tbody v-if="!loadingQuestions && questions.length"><tr v-for="question in questions" :key="question.id"><td><strong>{{ question.text }}</strong></td><td>{{ question.articleCreated ? '已创作' : '未创作' }}</td><td>{{ question.checkedAt ? formatDateTime(question.checkedAt) : '未检测' }}</td><td><button class="text-status" :class="{ active: question.status === 'enabled' }" type="button" :disabled="updatingId === question.id" @click="toggleQuestion(question)">{{ statusLabel(question.status) }}</button></td><td><button class="row-action delete" type="button" :disabled="updatingId === question.id" aria-label="删除问题词" @click="removeQuestion(question)"><el-icon><Delete /></el-icon></button></td></tr></tbody></table><div v-if="loadingQuestions" class="loading-rows"><span v-for="index in 4" :key="index" /></div><div v-else-if="!questions.length" class="question-empty"><el-icon><Tickets /></el-icon><strong>还没有问题词</strong><p>使用上方 AI 蒸馏或手动组合添加。</p></div></div></section>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.keywords-page { display: grid; max-width: 1500px; margin: 0 auto; gap: 16px; }.page-intro { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }.eyebrow { display: block; margin-bottom: 5px; color: var(--color-text-muted); font-family: var(--font-mono); font-size: 10px; letter-spacing: .13em; }h2,h3,p { margin: 0; }h2 { color: var(--color-text); font-size: 26px; font-weight: 670; letter-spacing: -.035em; }.page-intro p { margin-top: 5px; color: var(--color-text-secondary); }.quota-note { display: grid; grid-template-columns: auto auto; align-items: baseline; padding: 10px 14px; border: 1px solid var(--color-border); border-radius: 9px; background: #fff; gap: 2px 12px; }.quota-note span,.quota-note i { color: var(--color-text-muted); font-size: 11px; font-style: normal; }.quota-note strong { color: var(--color-primary); font-family: var(--font-mono); }.quota-note i { grid-column: 1/-1; }
.list-panel { min-width: 0; overflow: hidden; }.toolbar { display: flex; min-height: 66px; align-items: center; justify-content: space-between; padding: 13px 16px; border-bottom: 1px solid var(--color-border); gap: 16px; }.toolbar-actions,.dialog-footer { display: flex; align-items: center; gap: 7px; }.primary-button,.secondary-button,.danger-button,.icon-button,.row-action { display: inline-flex; min-height: 36px; align-items: center; justify-content: center; border: 1px solid var(--color-border-strong); border-radius: 7px; cursor: pointer; gap: 6px; transition: .16s ease; }.primary-button,.secondary-button,.danger-button { padding: 0 13px; }.primary-button { border-color: transparent; color: #fff; background: var(--gradient-primary); box-shadow: 0 7px 18px rgba(80,88,210,.16); }.secondary-button,.icon-button { color: var(--color-text-secondary); background: #fff; }.danger-button { border-color: #f0b4bc; color: #d84e60; background: #fff3f4; }.icon-button { width: 36px; padding: 0; color: var(--color-primary); }.primary-button:hover,.icon-button:hover { filter: brightness(.98); transform: translateY(-1px); }.primary-button:disabled,.secondary-button:disabled,.danger-button:disabled,.icon-button:disabled,.row-action:disabled { cursor: not-allowed; opacity: .48; transform: none; }.search-field { display: flex; width: min(350px,42vw); min-height: 38px; align-items: center; padding: 0 11px; border: 1px solid var(--color-border-strong); border-radius: 8px; color: var(--color-text-muted); background: #fff; gap: 7px; }.search-field input { width: 100%; min-height: 34px; border: 0; outline: none; color: var(--color-text); background: transparent; font: inherit; }
.table-scroll { min-height: 320px; overflow-x: auto; }.keyword-table { width: 100%; min-width: 1120px; border-collapse: collapse; table-layout: fixed; }.keyword-table th,.keyword-table td { height: 56px; padding: 0 14px; border-bottom: 1px solid var(--color-border); color: var(--color-text-secondary); text-align: center; vertical-align: middle; }.keyword-table th { height: 46px; color: var(--color-text); background: #fbfcff; font-size: 12px; font-weight: 650; }.keyword-table tbody tr { transition: background .14s ease; }.keyword-table tbody tr:hover { background: #f8faff; }.keyword-table th:nth-child(3),.keyword-table td:nth-child(3),.keyword-table th:nth-child(4),.keyword-table td:nth-child(4) { text-align: left; }.check-cell { width: 48px; padding: 0 10px !important; }.index-cell { width: 68px; }.operation-cell { width: 132px; white-space: nowrap; }.keyword-table th:nth-child(3) { width: 20%; }.keyword-table th:nth-child(4) { width: 24%; }.keyword-table th:nth-child(5) { width: 105px; }.keyword-table th:nth-child(6) { width: 120px; }.keyword-table th:nth-child(7) { width: 180px; }.keyword-table input[type='checkbox'] { width: 15px; height: 15px; accent-color: var(--color-primary); }.keyword-name { color: var(--color-text); font-size: 13px; font-weight: 600; }.brand-tags { display: flex; min-width: 0; align-items: center; gap: 5px; }.brand-tags span { max-width: 120px; overflow: hidden; padding: 3px 8px; border-radius: 999px; color: #5d55cc; background: #f0efff; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.brand-tags i,.brand-tags em { color: var(--color-text-muted); font-size: 11px; font-style: normal; }.question-count { border: 0; color: var(--color-primary); background: transparent; cursor: pointer; font: inherit; font-size: 15px; font-weight: 650; }.question-count small { font-size: 10px; font-weight: 400; }.status-switch { display: inline-flex; align-items: center; border: 0; color: var(--color-text-muted); background: transparent; cursor: pointer; gap: 7px; }.status-switch span { position: relative; width: 32px; height: 18px; border-radius: 999px; background: #c9ceda; transition: .18s ease; }.status-switch span::after { position: absolute; top: 3px; left: 3px; width: 12px; height: 12px; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(24,35,64,.25); content: ''; transition: .18s ease; }.status-switch.active { color: #139b75; }.status-switch.active span { background: #18b98d; }.status-switch.active span::after { transform: translateX(14px); }.status-switch i { font-size: 11px; font-style: normal; }.row-action { width: 30px; min-height: 30px; margin: 0 2px; padding: 0; color: #fff; }.row-action.view { border-color: #7c6cf2; background: #7c6cf2; }.row-action.edit { border-color: #678cff; background: #678cff; }.row-action.delete { border-color: #e75d6c; background: #e75d6c; }.table-footer { padding: 12px 16px; color: var(--color-text-muted); font-size: 12px; }.loading-rows { display: grid; padding: 12px 16px; gap: 8px; }.loading-rows span { height: 42px; border-radius: 7px; background: linear-gradient(90deg,#f5f7fb,#eef1f8,#f5f7fb); background-size: 220% 100%; animation: shimmer 1.4s ease-in-out infinite; }.empty-state,.question-empty,.error-panel { display: grid; min-height: 290px; place-items: center; align-content: center; color: var(--color-text-muted); text-align: center; gap: 6px; }.empty-state .el-icon,.question-empty .el-icon { margin-bottom: 4px; color: #838af2; font-size: 32px; }.empty-state strong,.question-empty strong,.error-panel strong { color: var(--color-text-secondary); }.error-panel { padding: 30px; }
.keyword-form { display: grid; gap: 22px; }.base-fields { display: grid; grid-template-columns: 1fr 1.35fr; padding-bottom: 22px; border-bottom: 1px solid var(--color-border); gap: 18px; }.field { display: grid; align-content: start; gap: 7px; }.field > span { color: var(--color-text-secondary); font-size: 12px; }.field > span i { color: var(--color-text-muted); font-style: normal; font-weight: 400; }.field > span i:first-child:last-child { color: var(--color-danger); }.field input,.field textarea,.ai-panel input { width: 100%; border: 1px solid var(--color-border-strong); border-radius: 8px; outline: none; color: var(--color-text); background: #fff; font: inherit; }.field input { min-height: 40px; padding: 0 12px; }.field textarea { min-height: 150px; padding: 10px 12px; line-height: 1.7; resize: vertical; }.field input:focus,.field textarea:focus,.ai-panel input:focus { border-color: rgba(91,99,235,.7); box-shadow: var(--shadow-focus); }.field input:disabled { color: var(--color-text-muted); background: #f4f6fa; }.field small { color: var(--color-text-muted); font-size: 10px; }.mode-tabs { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }.mode-tabs button { display: flex; min-height: 68px; align-items: center; padding: 12px 15px; border: 1px solid var(--color-border-strong); border-radius: 10px; color: var(--color-text-secondary); background: #fff; cursor: pointer; text-align: left; gap: 11px; }.mode-tabs button.active { border-color: rgba(91,99,235,.58); color: var(--color-primary); background: #f5f5ff; box-shadow: 0 0 0 2px rgba(91,99,235,.07); }.mode-tabs .el-icon { font-size: 21px; }.mode-tabs button span { display: grid; font-weight: 600; gap: 3px; }.mode-tabs button small { color: var(--color-text-muted); font-size: 10px; font-weight: 400; }.ai-panel { display: grid; grid-template-columns: minmax(0,1fr) 130px; align-items: center; padding: 18px; border: 1px solid #e2e3ff; border-radius: 10px; background: linear-gradient(135deg,#fafaff,#f3f6ff); gap: 18px; }.ai-panel div { display: grid; gap: 5px; }.ai-panel strong { color: var(--color-text); }.ai-panel p { color: var(--color-text-secondary); font-size: 12px; line-height: 1.65; }.ai-panel small { color: var(--color-text-muted); font-size: 10px; }.ai-panel label { display: grid; gap: 6px; }.ai-panel label span { color: var(--color-text-muted); font-size: 11px; }.ai-panel input { min-height: 40px; padding: 0 10px; }.manual-panel { display: grid; grid-template-columns: minmax(0,1fr) minmax(180px,.62fr) minmax(0,1fr); align-items: stretch; gap: 16px; }.core-word { display: grid; min-height: 150px; place-items: center; align-content: center; padding: 18px; border: 1px dashed #aeb4ee; border-radius: 10px; text-align: center; background: #f8f8ff; gap: 8px; }.core-word span,.core-word small { color: var(--color-text-muted); font-size: 10px; }.core-word strong { max-width: 100%; overflow-wrap: anywhere; color: var(--color-primary); font-size: 17px; }.combination-summary { display: flex; grid-column: 1/-1; align-items: center; justify-content: space-between; min-height: 48px; padding: 8px 12px; border-radius: 8px; color: var(--color-text-secondary); background: #f7f8fb; gap: 12px; }.combination-summary strong { color: var(--color-primary); font-family: var(--font-mono); }.combination-summary i { margin-right: auto; color: var(--color-text-muted); font-size: 10px; font-style: normal; }
.drawer-overview { display: grid; grid-template-columns: 1fr 1.5fr 1fr; margin-bottom: 16px; border: 1px solid var(--color-border); border-radius: 9px; background: #fff; }.drawer-overview div { display: grid; min-width: 0; padding: 13px 16px; gap: 4px; }.drawer-overview div+div { border-left: 1px solid var(--color-border); }.drawer-overview span { color: var(--color-text-muted); font-size: 10px; }.drawer-overview strong { overflow: hidden; color: var(--color-text); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.manage-tabs { margin-bottom: 14px; }.manage-panel { margin-bottom: 18px; padding: 16px; background: #fff; }.ai-panel.manage-panel { grid-template-columns: minmax(0,1fr) 120px auto; }.question-list-panel { overflow: hidden; border: 1px solid var(--color-border); border-radius: 10px; background: #fff; }.question-list-panel > header { display: flex; min-height: 60px; align-items: center; justify-content: space-between; padding: 0 16px; border-bottom: 1px solid var(--color-border); }.question-list-panel header span { color: var(--color-text-muted); font-family: var(--font-mono); font-size: 9px; letter-spacing: .12em; }.question-list-panel h3 { margin-top: 3px; color: var(--color-text); font-size: 15px; }.question-table-wrap { min-height: 260px; overflow-x: auto; }.question-table { width: 100%; min-width: 820px; border-collapse: collapse; }.question-table th,.question-table td { height: 48px; padding: 0 12px; border-bottom: 1px solid var(--color-border); color: var(--color-text-secondary); text-align: center; font-size: 11px; }.question-table th { color: var(--color-text); background: #fbfcff; font-weight: 650; }.question-table th:first-child,.question-table td:first-child { width: 50%; text-align: left; }.question-table td strong { color: var(--color-text); font-size: 12px; font-weight: 500; }.text-status { padding: 3px 9px; border: 0; border-radius: 999px; color: #9a6d36; background: #fff3df; cursor: pointer; }.text-status.active { color: #168863; background: #e8f8f2; }.question-empty { min-height: 260px; }.dialog-footer { justify-content: flex-end; }
:deep(.keyword-dialog .el-dialog__header),:deep(.question-drawer .el-drawer__header) { min-height: 58px; margin: 0; padding: 0 22px; border-bottom: 1px solid var(--color-border); color: var(--color-text); font-weight: 650; }:deep(.keyword-dialog .el-dialog__body) { padding: 22px; background: #f8f9fc; }:deep(.keyword-dialog .el-dialog__footer),:deep(.question-drawer .el-drawer__footer) { padding: 12px 22px; border-top: 1px solid var(--color-border); background: #fff; }:deep(.question-drawer .el-drawer__body) { padding: 18px; background: #f7f8fb; }
@keyframes shimmer { to { background-position: -220% 0; } }
@media (max-width: 760px) { .page-intro { align-items: flex-start; flex-direction: column; }.quota-note { width: 100%; }.toolbar { align-items: stretch; flex-direction: column; }.search-field { width: 100%; }.base-fields,.mode-tabs,.manual-panel,.drawer-overview { grid-template-columns: 1fr; }.drawer-overview div+div { border-top: 1px solid var(--color-border); border-left: 0; }.ai-panel,.ai-panel.manage-panel { grid-template-columns: 1fr; }.combination-summary { align-items: flex-start; flex-direction: column; }.combination-summary i { margin: 0; }.dialog-footer { flex-wrap: wrap; }.dialog-footer .primary-button { width: 100%; order: -1; }:deep(.keyword-dialog .el-dialog__body),:deep(.question-drawer .el-drawer__body) { padding: 14px; } }
</style>
