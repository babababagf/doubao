<script setup lang="ts">
import type { WritingInstruction, WritingInstructionInput } from '@doubaohk/api-contract'
import { Collection, Delete, EditPen, InfoFilled, Plus, RefreshRight, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'

import { ApiError } from '@/services/http'
import {
  createWritingInstruction,
  deleteWritingInstruction,
  listWritingInstructions,
  updateWritingInstruction,
} from '@/services/merchant.service'
import { formatDateTime } from '@/utils/format'

const instructions = ref<WritingInstruction[]>([])
const query = ref('')
const loading = ref(true)
const saving = ref(false)
const deletingId = ref<string | null>(null)
const errorMessage = ref('')
const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const form = reactive<WritingInstructionInput>({ name: '', content: '' })

const editingInstruction = computed(
  () => instructions.value.find((instruction) => instruction.id === editingId.value) ?? null,
)
const isSystem = computed(() => editingInstruction.value?.isSystem ?? false)
const filteredInstructions = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN')
  if (!value) return instructions.value
  return instructions.value.filter((instruction) =>
    [instruction.name, instruction.content].some((text) => text.toLocaleLowerCase('zh-CN').includes(value)),
  )
})

function resetForm(): void {
  editingId.value = null
  form.name = ''
  form.content = ''
}

function openCreate(): void {
  resetForm()
  dialogVisible.value = true
}

function openInstruction(instruction: WritingInstruction): void {
  editingId.value = instruction.id
  form.name = instruction.name
  form.content = instruction.content
  dialogVisible.value = true
}

async function loadInstructions(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    instructions.value = await listWritingInstructions()
    if (editingId.value && !instructions.value.some((instruction) => instruction.id === editingId.value)) {
      dialogVisible.value = false
      resetForm()
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '创作指令加载失败'
  } finally {
    loading.value = false
  }
}

async function saveInstruction(): Promise<void> {
  if (form.name.trim().length < 2) return void ElMessage.warning('指令名称至少输入 2 个字符')
  if (form.content.trim().length < 20) return void ElMessage.warning('创作指令至少输入 20 个字符')

  saving.value = true
  const instructionId = editingId.value
  try {
    const input = { name: form.name.trim(), content: form.content.trim() }
    if (instructionId) await updateWritingInstruction(instructionId, input)
    else await createWritingInstruction(input)
    dialogVisible.value = false
    resetForm()
    await loadInstructions()
    ElMessage.success(instructionId ? '创作指令已更新' : '创作指令已创建')
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '创作指令保存失败')
  } finally {
    saving.value = false
  }
}

async function removeInstruction(instruction: WritingInstruction): Promise<void> {
  if (instruction.isSystem) return void ElMessage.warning('系统默认指令不可删除')
  try {
    await ElMessageBox.confirm(`确认删除创作指令“${instruction.name}”吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  deletingId.value = instruction.id
  try {
    await deleteWritingInstruction(instruction.id)
    if (editingId.value === instruction.id) {
      dialogVisible.value = false
      resetForm()
    }
    await loadInstructions()
    ElMessage.success('创作指令已删除')
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '创作指令删除失败')
  } finally {
    deletingId.value = null
  }
}

onMounted(() => void loadInstructions())
</script>

<template>
  <div class="instructions-page">
    <header class="page-intro">
      <div>
        <h2>创作指令</h2>
        <p>设置文章的写作风格、表达要求和禁用内容，创建文章时可直接选择使用。</p>
      </div>
    </header>

    <section class="notice-panel surface-panel">
      <el-icon><InfoFilled /></el-icon>
      <p><strong>创作指令会随真实 AI 任务提交。</strong>写作仅注入所选企业信息库、关键词与所选指令；未选信息库时，仅使用商户名、关键词和问题词。</p>
    </section>

    <section v-if="errorMessage" class="error-panel surface-panel" role="alert">
      <strong>指令暂时无法加载</strong>
      <p>{{ errorMessage }}</p>
      <button class="secondary-button" type="button" @click="loadInstructions">重新加载</button>
    </section>

    <section v-else class="list-panel surface-panel">
      <div class="toolbar">
        <div class="toolbar-actions">
          <button class="primary-button" type="button" @click="openCreate"><el-icon><Plus /></el-icon>添加指令</button>
          <button class="icon-button" type="button" :disabled="loading" aria-label="刷新指令列表" @click="loadInstructions"><el-icon><RefreshRight /></el-icon></button>
        </div>
        <label class="search-field"><el-icon><Search /></el-icon><input v-model="query" placeholder="搜索指令名称或内容" /></label>
      </div>

      <div class="table-scroll">
        <table class="instruction-table">
          <thead><tr><th class="index-cell">序号</th><th>指令名称</th><th>内容摘要</th><th>类型</th><th>更新时间</th><th class="operation-cell">操作</th></tr></thead>
          <tbody v-if="!loading && filteredInstructions.length">
            <tr v-for="(instruction, index) in filteredInstructions" :key="instruction.id">
              <td class="index-cell">{{ index + 1 }}</td>
              <td><strong class="instruction-name">{{ instruction.name }}</strong></td>
              <td><p class="content-preview">{{ instruction.content }}</p></td>
              <td><span class="type-tag" :class="{ system: instruction.isSystem }">{{ instruction.isSystem ? '系统默认' : '自定义' }}</span></td>
              <td>{{ formatDateTime(instruction.updatedAt) }}</td>
              <td class="operation-cell">
                <button class="row-action edit" type="button" :aria-label="`编辑 ${instruction.name}`" @click="openInstruction(instruction)"><el-icon><EditPen /></el-icon></button>
                <template v-if="!instruction.isSystem">
                  <button class="row-action delete" type="button" :disabled="deletingId === instruction.id" :aria-label="`删除 ${instruction.name}`" @click="removeInstruction(instruction)"><el-icon><Delete /></el-icon></button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="loading" class="loading-rows"><span v-for="index in 4" :key="index" /></div>
        <div v-else-if="!filteredInstructions.length" class="empty-state">
          <el-icon><Collection /></el-icon>
          <strong>{{ query ? '没有匹配的创作指令' : '还没有创作指令' }}</strong>
          <p>{{ query ? '请调整搜索内容' : '点击左上角“添加指令”创建第一条规则' }}</p>
        </div>
      </div>
      <footer class="table-footer">显示 {{ filteredInstructions.length }} 条记录，共 {{ instructions.length }} 条</footer>
    </section>

    <el-dialog v-model="dialogVisible" class="instruction-dialog" :title="isSystem ? '编辑系统默认指令' : editingId ? '编辑创作指令' : '添加创作指令'" width="min(860px, 92vw)" destroy-on-close>
      <form id="instruction-form" class="instruction-form" @submit.prevent="saveInstruction">
        <div v-if="isSystem" class="system-lock"><el-icon><InfoFilled /></el-icon><div><strong>系统默认指令可编辑</strong><p>未选择其他指令时，AI 写作会自动使用这里保存的内容；默认指令不能删除。</p></div></div>
        <label class="field"><span>指令名称 <i>*</i></span><input v-model="form.name" :disabled="isSystem" maxlength="100" placeholder="例如：专业解答型文章" /></label>
        <label class="field content-field"><span>创作要求 <i>*</i></span><textarea v-model="form.content" maxlength="8000" rows="16" placeholder="说明文章语气、结构、需要强调或避免的表达…" /><small>{{ form.content.length }} / 8000</small></label>
        <div class="guidance"><div><span>建议写入</span><p>目标读者、表达语气、文章结构、需要强调的业务方向。</p></div><div><span>避免写入</span><p>互相冲突的要求、无关内容和无法执行的模糊描述。</p></div></div>
      </form>
      <template #footer>
        <div class="dialog-footer">
          <button class="secondary-button" type="button" @click="dialogVisible = false">取消</button>
          <button v-if="editingInstruction && !isSystem" class="danger-button" type="button" :disabled="deletingId === editingInstruction.id" @click="removeInstruction(editingInstruction)"><el-icon><Delete /></el-icon>删除</button>
          <button class="primary-button" form="instruction-form" type="submit" :disabled="saving">{{ saving ? '保存中…' : editingId ? '保存修改' : '添加指令' }}</button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.instructions-page { display: grid; max-width: 1500px; margin: 0 auto; gap: 16px; }
.page-intro { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
.eyebrow { display: block; margin-bottom: 5px; color: var(--color-text-muted); font-family: var(--font-mono); font-size: 10px; letter-spacing: .13em; }
h2, p { margin: 0; } h2 { color: var(--color-text); font-size: 26px; font-weight: 670; letter-spacing: -.035em; } .page-intro p { margin-top: 5px; color: var(--color-text-secondary); }
.notice-panel { display: flex; align-items: flex-start; padding: 13px 16px; border-color: #dfe4f5; color: var(--color-text-secondary); gap: 10px; }.notice-panel > .el-icon { margin-top: 1px; color: var(--color-primary); font-size: 18px; }.notice-panel p { font-size: 12px; line-height: 1.65; }
.list-panel { min-width: 0; overflow: hidden; }.toolbar { display: flex; min-height: 66px; align-items: center; justify-content: space-between; padding: 13px 16px; border-bottom: 1px solid var(--color-border); gap: 16px; }.toolbar-actions,.dialog-footer { display: flex; align-items: center; gap: 7px; }
.primary-button,.secondary-button,.danger-button,.icon-button,.row-action { display: inline-flex; min-height: 36px; align-items: center; justify-content: center; border: 1px solid var(--color-border-strong); border-radius: 7px; cursor: pointer; gap: 6px; transition: .16s ease; }.primary-button,.secondary-button,.danger-button { padding: 0 13px; }.primary-button { border-color: transparent; color: #fff; background: var(--gradient-primary); box-shadow: 0 7px 18px rgba(80,88,210,.16); }.secondary-button,.icon-button { color: var(--color-text-secondary); background: #fff; }.danger-button { border-color: #f0b4bc; color: #d84e60; background: #fff3f4; }.icon-button { width: 36px; padding: 0; color: var(--color-primary); }.primary-button:hover,.icon-button:hover { filter: brightness(.98); transform: translateY(-1px); }.primary-button:disabled,.secondary-button:disabled,.danger-button:disabled,.icon-button:disabled,.row-action:disabled { cursor: not-allowed; opacity: .48; transform: none; }
.search-field { display: flex; width: min(350px,42vw); min-height: 38px; align-items: center; padding: 0 11px; border: 1px solid var(--color-border-strong); border-radius: 8px; color: var(--color-text-muted); background: #fff; gap: 7px; }.search-field input { width: 100%; min-height: 34px; border: 0; outline: none; color: var(--color-text); background: transparent; font: inherit; }
.table-scroll { min-height: 360px; overflow-x: auto; }.instruction-table { width: 100%; min-width: 1040px; border-collapse: collapse; table-layout: fixed; }.instruction-table th,.instruction-table td { height: 58px; padding: 0 16px; border-bottom: 1px solid var(--color-border); color: var(--color-text-secondary); text-align: center; vertical-align: middle; }.instruction-table th { height: 46px; color: var(--color-text); background: #fbfcff; font-size: 12px; font-weight: 650; }.instruction-table tbody tr { transition: background .14s ease; }.instruction-table tbody tr:hover { background: #f8faff; }.instruction-table th:nth-child(2),.instruction-table td:nth-child(2),.instruction-table th:nth-child(3),.instruction-table td:nth-child(3) { text-align: left; }.index-cell { width: 74px; }.instruction-table th:nth-child(2) { width: 20%; }.instruction-table th:nth-child(3) { width: 42%; }.instruction-table th:nth-child(4) { width: 120px; }.instruction-table th:nth-child(5) { width: 180px; }.operation-cell { width: 120px; white-space: nowrap; }.instruction-name { color: var(--color-text); font-size: 13px; font-weight: 600; }.content-preview { display: -webkit-box; overflow: hidden; color: var(--color-text-secondary); font-size: 12px; line-height: 1.5; white-space: pre-line; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }.type-tag { display: inline-flex; padding: 3px 9px; border-radius: 999px; color: #596579; background: #f0f2f6; font-size: 11px; }.type-tag.system { color: #5d55cc; background: #f0efff; }.row-action { width: 30px; min-height: 30px; margin: 0 3px; padding: 0; color: #fff; }.row-action.view,.row-action.edit { border-color: #678cff; background: #678cff; }.row-action.delete { border-color: #e75d6c; background: #e75d6c; }
.table-footer { padding: 12px 16px; color: var(--color-text-muted); font-size: 12px; }.loading-rows { display: grid; padding: 12px 16px; gap: 8px; }.loading-rows span { height: 46px; border-radius: 7px; background: linear-gradient(90deg,#f5f7fb,#eef1f8,#f5f7fb); background-size: 220% 100%; animation: shimmer 1.4s ease-in-out infinite; }.empty-state { display: grid; min-height: 330px; place-items: center; align-content: center; color: var(--color-text-muted); text-align: center; gap: 6px; }.empty-state .el-icon { margin-bottom: 4px; color: #838af2; font-size: 32px; }.empty-state strong { color: var(--color-text-secondary); }.error-panel { display: grid; min-height: 260px; place-items: center; align-content: center; padding: 30px; text-align: center; gap: 8px; }.error-panel p { color: var(--color-text-muted); }
.instruction-form { display: grid; gap: 18px; }.field { position: relative; display: grid; gap: 7px; }.field > span { color: var(--color-text-secondary); font-size: 12px; }.field i { color: var(--color-danger); font-style: normal; }.field input,.field textarea { width: 100%; border: 1px solid var(--color-border-strong); border-radius: 8px; outline: none; color: var(--color-text); background: #fff; font: inherit; transition: border-color var(--transition-fast),box-shadow var(--transition-fast); }.field input { min-height: 42px; padding: 0 12px; }.field textarea { min-height: 310px; padding: 11px 12px 28px; line-height: 1.65; resize: vertical; }.field input:focus,.field textarea:focus { border-color: rgba(91,99,235,.7); box-shadow: var(--shadow-focus); }.field input:disabled,.field textarea:disabled { cursor: not-allowed; color: var(--color-text-secondary); background: #f4f5f8; }.content-field small { position: absolute; right: 10px; bottom: 8px; color: var(--color-text-muted); font-family: var(--font-mono); font-size: 10px; }.system-lock { display: flex; align-items: flex-start; padding: 12px 14px; border: 1px solid #dddff7; border-radius: 8px; color: var(--color-text-secondary); background: #f7f7ff; gap: 10px; }.system-lock > .el-icon { margin-top: 1px; color: var(--color-primary); font-size: 18px; }.system-lock strong { color: var(--color-text); font-size: 12px; }.system-lock p { margin-top: 3px; font-size: 11px; }.guidance { display: grid; grid-template-columns: 1fr 1fr; padding-top: 15px; border-top: 1px solid var(--color-border); gap: 18px; }.guidance span { color: var(--color-primary); font-size: 11px; }.guidance p { margin-top: 4px; color: var(--color-text-muted); font-size: 11px; line-height: 1.6; }.dialog-footer { justify-content: flex-end; }
:deep(.instruction-dialog) { display: flex; max-height: 92vh; flex-direction: column; margin-top: 4vh; }:deep(.instruction-dialog .el-dialog__header) { min-height: 58px; margin: 0; padding: 0 22px; border-bottom: 1px solid var(--color-border); color: var(--color-text); font-weight: 650; }:deep(.instruction-dialog .el-dialog__body) { min-height: 0; overflow-y: auto; padding: 22px; background: #f8f9fc; }:deep(.instruction-dialog .el-dialog__footer) { padding: 12px 22px; border-top: 1px solid var(--color-border); background: #fff; }
@keyframes shimmer { to { background-position: -220% 0; } }
</style>
