<script setup lang="ts">
import type { KnowledgeLibrary, KnowledgeLibraryInput } from '@doubaohk/api-contract'
import { Collection, Delete, EditPen, Plus, RefreshRight, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'

import { ApiError } from '@/services/http'
import {
  createKnowledgeLibrary,
  deleteKnowledgeLibrary,
  listKnowledgeLibraries,
  updateKnowledgeLibrary,
} from '@/services/merchant.service'
import { formatDateTime } from '@/utils/format'

type ContentField = Exclude<keyof KnowledgeLibraryInput, 'name' | 'companyName' | 'brandAlias'>

const contentFields: Array<{ key: ContentField; label: string; placeholder: string }> = [
  { key: 'productServices', label: '产品服务', placeholder: '填写主营产品、服务范围、交付内容与适用场景' },
  { key: 'productFeatures', label: '产品特点', placeholder: '填写产品优势、服务特点、技术能力或差异点' },
  { key: 'brandStory', label: '品牌故事', placeholder: '填写品牌背景、发展过程与品牌理念' },
  { key: 'userPainPoints', label: '用户痛点', placeholder: '填写目标客户常见问题、需求和使用场景' },
  { key: 'trustProof', label: '信任背书', placeholder: '填写资质、荣誉、团队、工艺、服务流程等材料' },
  { key: 'customerCases', label: '客户案例', placeholder: '填写案例背景、解决方案、实施过程与结果' },
  { key: 'otherInfo', label: '其他信息', placeholder: '填写以上栏目未覆盖、但写作时需要使用的信息' },
]

const emptyForm = (): KnowledgeLibraryInput => ({
  name: '',
  companyName: '',
  brandAlias: '',
  productServices: '',
  productFeatures: '',
  brandStory: '',
  userPainPoints: '',
  trustProof: '',
  customerCases: '',
  otherInfo: '',
})

const libraries = ref<KnowledgeLibrary[]>([])
const checkedIds = ref<string[]>([])
const query = ref('')
const loading = ref(true)
const saving = ref(false)
const deleting = ref(false)
const errorMessage = ref('')
const drawerVisible = ref(false)
const editingId = ref<string | null>(null)
const form = reactive<KnowledgeLibraryInput>(emptyForm())

const filteredLibraries = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN')
  if (!value) return libraries.value
  return libraries.value.filter((library) =>
    [library.name, library.companyName, library.brandAlias, ...contentFields.map(({ key }) => library[key])]
      .some((text) => text.toLocaleLowerCase('zh-CN').includes(value)),
  )
})
const allVisibleChecked = computed(() => filteredLibraries.value.length > 0 && filteredLibraries.value.every((library) => checkedIds.value.includes(library.id)))
const hasContent = computed(() => contentFields.some(({ key }) => form[key].trim().length > 0))

function resetForm(): void {
  Object.assign(form, emptyForm())
  editingId.value = null
}

function openCreate(): void {
  resetForm()
  drawerVisible.value = true
}

function openEdit(library: KnowledgeLibrary): void {
  editingId.value = library.id
  Object.assign(form, {
    name: library.name,
    companyName: library.companyName,
    brandAlias: library.brandAlias,
    ...Object.fromEntries(contentFields.map(({ key }) => [key, library[key]])),
  })
  drawerVisible.value = true
}

function toggleAllVisible(): void {
  const visibleIds = filteredLibraries.value.map((library) => library.id)
  checkedIds.value = allVisibleChecked.value
    ? checkedIds.value.filter((id) => !visibleIds.includes(id))
    : Array.from(new Set([...checkedIds.value, ...visibleIds]))
}

function toggleChecked(id: string): void {
  checkedIds.value = checkedIds.value.includes(id)
    ? checkedIds.value.filter((item) => item !== id)
    : [...checkedIds.value, id]
}

async function loadLibraries(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    libraries.value = await listKnowledgeLibraries()
    const liveIds = new Set(libraries.value.map((library) => library.id))
    checkedIds.value = checkedIds.value.filter((id) => liveIds.has(id))
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '企业信息库加载失败'
  } finally {
    loading.value = false
  }
}

async function saveLibrary(): Promise<void> {
  if (form.name.trim().length < 2) return void ElMessage.warning('知识库名称至少输入 2 个字符')
  if (form.companyName.trim().length < 2) return void ElMessage.warning('请填写完整公司名称')
  if (!form.brandAlias.trim()) return void ElMessage.warning('请填写品牌简称')
  if (!hasContent.value) return void ElMessage.warning('企业资料内容至少填写一项')

  saving.value = true
  try {
    const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()])) as KnowledgeLibraryInput
    const isEditing = editingId.value !== null
    if (editingId.value) await updateKnowledgeLibrary(editingId.value, payload)
    else await createKnowledgeLibrary(payload)
    drawerVisible.value = false
    await loadLibraries()
    ElMessage.success(isEditing ? '企业信息库已更新' : '企业信息库已添加')
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '企业信息库保存失败')
  } finally {
    saving.value = false
  }
}

async function removeLibraries(ids: string[]): Promise<void> {
  const targets = Array.from(new Set(ids))
  if (!targets.length) return
  const names = libraries.value.filter((library) => targets.includes(library.id)).map((library) => library.name)
  try {
    await ElMessageBox.confirm(
      targets.length === 1 ? `确认删除“${names[0]}”吗？` : `确认删除选中的 ${targets.length} 个企业信息库吗？`,
      '删除确认',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }

  deleting.value = true
  try {
    for (const id of targets) await deleteKnowledgeLibrary(id)
    checkedIds.value = checkedIds.value.filter((id) => !targets.includes(id))
    await loadLibraries()
    ElMessage.success(`已删除 ${targets.length} 个企业信息库`)
  } catch (error) {
    await loadLibraries()
    ElMessage.error(error instanceof ApiError ? error.message : '企业信息库删除失败')
  } finally {
    deleting.value = false
  }
}

onMounted(() => void loadLibraries())
</script>

<template>
  <div class="knowledge-page">
    <header class="page-intro">
      <div>
        <span class="eyebrow">ENTERPRISE KNOWLEDGE</span>
        <h2>企业信息库</h2>
        <p>按企业或品牌维护多套资料，AI 创作时可选择其中一套作为内容依据。</p>
      </div>
    </header>

    <section v-if="errorMessage" class="error-panel surface-panel" role="alert">
      <strong>企业信息库暂时无法加载</strong>
      <p>{{ errorMessage }}</p>
      <button class="secondary-button" type="button" @click="loadLibraries">重新加载</button>
    </section>

    <section v-else class="list-panel surface-panel">
      <div class="toolbar">
        <div class="toolbar-actions">
          <button class="primary-button" type="button" @click="openCreate"><el-icon><Plus /></el-icon>新建知识库</button>
          <button class="icon-button" type="button" :disabled="loading" aria-label="刷新列表" @click="loadLibraries"><el-icon><RefreshRight /></el-icon></button>
          <button class="danger-button" type="button" :disabled="!checkedIds.length || deleting" @click="removeLibraries(checkedIds)"><el-icon><Delete /></el-icon>删除</button>
        </div>
        <label class="search-field"><el-icon><Search /></el-icon><input v-model="query" placeholder="搜索知识库、公司名或品牌简称" /></label>
      </div>

      <div class="table-scroll">
        <table class="knowledge-table">
          <thead><tr><th class="check-cell"><input type="checkbox" :checked="allVisibleChecked" aria-label="全选当前列表" @change="toggleAllVisible" /></th><th class="index-cell">序号</th><th>名称</th><th>公司名称</th><th>品牌简称</th><th>创建时间</th><th class="operation-cell">操作</th></tr></thead>
          <tbody v-if="!loading && filteredLibraries.length">
            <tr v-for="(library, index) in filteredLibraries" :key="library.id">
              <td class="check-cell"><input type="checkbox" :checked="checkedIds.includes(library.id)" :aria-label="`选择 ${library.name}`" @change="toggleChecked(library.id)" /></td>
              <td class="index-cell">{{ index + 1 }}</td>
              <td><strong class="library-name">{{ library.name }}</strong></td>
              <td>{{ library.companyName }}</td>
              <td><span class="alias-tag">{{ library.brandAlias }}</span></td>
              <td>{{ formatDateTime(library.createdAt) }}</td>
              <td class="operation-cell"><button class="row-action edit" type="button" :aria-label="`编辑 ${library.name}`" @click="openEdit(library)"><el-icon><EditPen /></el-icon></button><button class="row-action delete" type="button" :aria-label="`删除 ${library.name}`" @click="removeLibraries([library.id])"><el-icon><Delete /></el-icon></button></td>
            </tr>
          </tbody>
        </table>
        <div v-if="loading" class="loading-rows"><span v-for="index in 4" :key="index" /></div>
        <div v-else-if="!filteredLibraries.length" class="empty-state"><el-icon><Collection /></el-icon><strong>{{ query ? '没有匹配的信息库' : '还没有企业信息库' }}</strong><p>{{ query ? '请调整搜索关键词' : '点击“新建知识库”创建第一套企业资料' }}</p></div>
      </div>
      <footer class="table-footer">显示 {{ filteredLibraries.length }} 条记录，共 {{ libraries.length }} 条</footer>
    </section>

    <el-drawer v-model="drawerVisible" class="knowledge-drawer" :title="editingId ? '编辑知识库' : '新建知识库'" size="min(920px, 94vw)" destroy-on-close>
      <form id="knowledge-form" class="knowledge-form" @submit.prevent="saveLibrary">
        <div class="form-section basic-section">
          <label class="field field-wide"><span>知识库名称 <i>*</i></span><input v-model="form.name" maxlength="100" placeholder="例如：西安星术涮肉品牌资料" /></label>
          <label class="field"><span>公司名称 <i>*</i></span><input v-model="form.companyName" maxlength="120" placeholder="填写企业或门店完整名称" /></label>
          <label class="field"><span>品牌简称 <i>*</i></span><input v-model="form.brandAlias" maxlength="80" placeholder="填写文章中使用的品牌简称" /></label>
        </div>
        <div class="form-section content-section">
          <label v-for="field in contentFields" :key="field.key" class="field content-field" :class="{ 'field-wide': field.key === 'otherInfo' }"><span>{{ field.label }}</span><textarea v-model="form[field.key]" rows="5" maxlength="1000" :placeholder="field.placeholder" /><small>{{ form[field.key].length }} / 1000</small></label>
        </div>
      </form>
      <template #footer><div class="drawer-footer"><button class="secondary-button" type="button" @click="drawerVisible = false">取消</button><button class="primary-button" form="knowledge-form" type="submit" :disabled="saving">{{ saving ? '保存中…' : '保存信息库' }}</button></div></template>
    </el-drawer>
  </div>
</template>

<style scoped>
.knowledge-page { display: grid; max-width: 1500px; margin: 0 auto; gap: 16px; }
.page-intro { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
.eyebrow { display: block; margin-bottom: 5px; color: var(--color-text-muted); font-family: var(--font-mono); font-size: 10px; letter-spacing: .13em; }
h2, p { margin: 0; } h2 { color: var(--color-text); font-size: 26px; font-weight: 670; letter-spacing: -.035em; } .page-intro p { margin-top: 5px; color: var(--color-text-secondary); }
.list-panel { min-width: 0; overflow: hidden; }
.toolbar { display: flex; min-height: 66px; align-items: center; justify-content: space-between; padding: 13px 16px; border-bottom: 1px solid var(--color-border); gap: 16px; }
.toolbar-actions { display: flex; align-items: center; gap: 7px; }
.primary-button, .secondary-button, .danger-button, .icon-button, .row-action { display: inline-flex; min-height: 36px; align-items: center; justify-content: center; border: 1px solid var(--color-border-strong); border-radius: 7px; cursor: pointer; gap: 6px; transition: .16s ease; }
.primary-button, .secondary-button, .danger-button { padding: 0 13px; }.primary-button { border-color: transparent; color: #fff; background: var(--gradient-primary); box-shadow: 0 7px 18px rgba(80,88,210,.16); }.secondary-button, .icon-button { color: var(--color-text-secondary); background: #fff; }.danger-button { border-color: #f0b4bc; color: #d84e60; background: #fff3f4; }.icon-button { width: 36px; padding: 0; color: var(--color-primary); }.primary-button:hover, .icon-button:hover { filter: brightness(.98); transform: translateY(-1px); }.danger-button:disabled, .icon-button:disabled, .primary-button:disabled { cursor: not-allowed; opacity: .48; transform: none; }
.search-field { display: flex; width: min(340px, 42vw); min-height: 38px; align-items: center; padding: 0 11px; border: 1px solid var(--color-border-strong); border-radius: 8px; color: var(--color-text-muted); background: #fff; gap: 7px; }.search-field input { width: 100%; min-height: 34px; border: 0; outline: none; color: var(--color-text); background: transparent; font: inherit; }
.table-scroll { min-height: 300px; overflow-x: auto; }.knowledge-table { width: 100%; min-width: 980px; border-collapse: collapse; table-layout: fixed; }.knowledge-table th, .knowledge-table td { height: 54px; padding: 0 16px; border-bottom: 1px solid var(--color-border); color: var(--color-text-secondary); text-align: center; vertical-align: middle; }.knowledge-table th { height: 46px; color: var(--color-text); background: #fbfcff; font-size: 12px; font-weight: 650; }.knowledge-table tbody tr { transition: background .14s ease; }.knowledge-table tbody tr:hover { background: #f8faff; }.knowledge-table th:nth-child(3), .knowledge-table td:nth-child(3), .knowledge-table th:nth-child(4), .knowledge-table td:nth-child(4) { text-align: left; }.check-cell { width: 48px; padding: 0 10px !important; }.index-cell { width: 70px; }.operation-cell { width: 116px; white-space: nowrap; }.knowledge-table th:nth-child(3) { width: 22%; }.knowledge-table th:nth-child(4) { width: 25%; }.knowledge-table th:nth-child(5) { width: 14%; }.knowledge-table th:nth-child(6) { width: 190px; }.knowledge-table input[type='checkbox'] { width: 15px; height: 15px; accent-color: var(--color-primary); }.library-name { color: var(--color-text); font-size: 13px; font-weight: 600; }.alias-tag { display: inline-flex; max-width: 120px; overflow: hidden; padding: 3px 8px; border-radius: 999px; color: #5d55cc; background: #f0efff; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.row-action { width: 30px; min-height: 30px; margin: 0 3px; padding: 0; color: #fff; }.row-action.edit { border-color: #678cff; background: #678cff; }.row-action.delete { border-color: #e75d6c; background: #e75d6c; }.table-footer { padding: 12px 16px; color: var(--color-text-muted); font-size: 12px; }.loading-rows { display: grid; padding: 12px 16px; gap: 8px; }.loading-rows span { height: 42px; border-radius: 7px; background: linear-gradient(90deg,#f5f7fb,#eef1f8,#f5f7fb); background-size: 220% 100%; animation: shimmer 1.4s ease-in-out infinite; }.empty-state { display: grid; min-height: 290px; place-items: center; align-content: center; color: var(--color-text-muted); text-align: center; gap: 6px; }.empty-state .el-icon { margin-bottom: 4px; color: #838af2; font-size: 32px; }.empty-state strong { color: var(--color-text-secondary); }.error-panel { display: grid; min-height: 260px; place-items: center; align-content: center; padding: 30px; text-align: center; gap: 8px; }.error-panel p { color: var(--color-text-muted); }
.knowledge-form { display: grid; gap: 24px; }.form-section { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px 20px; }.basic-section { padding-bottom: 23px; border-bottom: 1px solid var(--color-border); }.field { position: relative; display: grid; gap: 7px; }.field-wide { grid-column: 1 / -1; }.field > span { color: var(--color-text-secondary); font-size: 12px; }.field i { color: var(--color-danger); font-style: normal; }.field input, .field textarea { width: 100%; border: 1px solid var(--color-border-strong); border-radius: 8px; outline: none; color: var(--color-text); background: #fff; font: inherit; transition: border-color var(--transition-fast), box-shadow var(--transition-fast); }.field input { min-height: 40px; padding: 0 12px; }.field textarea { min-height: 116px; padding: 10px 12px 25px; line-height: 1.65; resize: vertical; }.field input:focus, .field textarea:focus { border-color: rgba(91,99,235,.7); box-shadow: var(--shadow-focus); }.content-field small { position: absolute; right: 10px; bottom: 8px; color: var(--color-text-muted); font-family: var(--font-mono); font-size: 10px; }.drawer-footer { display: flex; justify-content: flex-end; gap: 9px; }
:deep(.knowledge-drawer .el-drawer__header) { min-height: 58px; margin: 0; padding: 0 22px; border-bottom: 1px solid var(--color-border); color: var(--color-text); font-weight: 650; }
:deep(.knowledge-drawer .el-drawer__body) { padding: 22px; background: #f8f9fc; }
:deep(.knowledge-drawer .el-drawer__footer) { padding: 12px 22px; border-top: 1px solid var(--color-border); background: #fff; }
@keyframes shimmer { to { background-position: -220% 0; } }
@media (max-width: 760px) { .page-intro { align-items: flex-start; flex-direction: column; }.toolbar { align-items: stretch; flex-direction: column; }.search-field { width: 100%; }.form-section { grid-template-columns: 1fr; }.field-wide { grid-column: auto; }:deep(.knowledge-drawer .el-drawer__body) { padding: 16px; } }
</style>
