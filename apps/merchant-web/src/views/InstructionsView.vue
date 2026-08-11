<script setup lang="ts">
import type { WritingInstruction, WritingInstructionInput } from '@doubaohk/api-contract'
import { CircleCheck, Delete, EditPen, InfoFilled, Plus, RefreshRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
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
const selectedId = ref<string | null>(null)
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const form = reactive<WritingInstructionInput>({ name: '', content: '' })

const selectedInstruction = computed(
  () => instructions.value.find((instruction) => instruction.id === selectedId.value) ?? null,
)
const isEditing = computed(() => selectedId.value !== null)
const isSystem = computed(() => selectedInstruction.value?.isSystem ?? false)

function clearForm(): void {
  selectedId.value = null
  form.name = ''
  form.content = ''
}

function selectInstruction(instruction: WritingInstruction): void {
  selectedId.value = instruction.id
  form.name = instruction.name
  form.content = instruction.content
}

async function loadInstructions(preferredId?: string): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await listWritingInstructions()
    instructions.value = result
    const target = result.find((item) => item.id === (preferredId ?? selectedId.value)) ?? result[0]
    if (target) selectInstruction(target)
    else clearForm()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '创作指令加载失败'
  } finally {
    loading.value = false
  }
}

async function saveInstruction(): Promise<void> {
  if (isSystem.value) {
    ElMessage.warning('系统默认指令不可修改')
    return
  }
  if (form.name.trim().length < 2) {
    ElMessage.warning('指令名称至少输入 2 个字符')
    return
  }
  if (form.content.trim().length < 20) {
    ElMessage.warning('创作指令至少输入 20 个字符')
    return
  }

  saving.value = true
  const instructionId = selectedId.value
  try {
    const input = { name: form.name.trim(), content: form.content.trim() }
    const result = instructionId
      ? await updateWritingInstruction(instructionId, input)
      : await createWritingInstruction(input)
    await loadInstructions(result.id)
    ElMessage.success(instructionId ? '创作指令已更新' : '创作指令已创建')
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '创作指令保存失败')
  } finally {
    saving.value = false
  }
}

async function removeInstruction(): Promise<void> {
  const instruction = selectedInstruction.value
  if (!instruction || instruction.isSystem) {
    ElMessage.warning('系统默认指令不可删除')
    return
  }
  if (!window.confirm(`确认删除创作指令“${instruction.name}”吗？`)) return

  saving.value = true
  try {
    await deleteWritingInstruction(instruction.id)
    await loadInstructions()
    ElMessage.success('创作指令已删除')
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '创作指令删除失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void loadInstructions()
})
</script>

<template>
  <div class="instructions-page">
    <header class="page-intro">
      <div><span class="eyebrow">CONTENT GOVERNANCE</span><h2>创作指令</h2><p>把文风、事实边界和表达要求沉淀成可复用规则，文章创作时可按需选择。</p></div>
      <div class="intro-actions"><button class="secondary-button" type="button" :disabled="loading" @click="() => loadInstructions()"><el-icon><RefreshRight /></el-icon>刷新</button><button class="primary-button" type="button" @click="clearForm"><el-icon><Plus /></el-icon>新建指令</button></div>
    </header>

    <section class="notice-panel surface-panel"><el-icon><InfoFilled /></el-icon><p><strong>创作指令会随真实 AI 任务提交。</strong>写作仅注入所选企业信息库、关键词与所选指令；未选信息库时，仅使用商户名、关键词和问题词。</p></section>

    <section v-if="errorMessage" class="error-panel surface-panel" role="alert"><strong>指令暂时无法加载</strong><p>{{ errorMessage }}</p><button class="secondary-button" type="button" @click="() => loadInstructions()">重新加载</button></section>

    <section v-else class="workspace">
      <aside class="instruction-list surface-panel">
        <header class="panel-heading"><div><span class="panel-kicker">INSTRUCTIONS</span><h3>可用指令</h3></div><span class="count-badge">{{ instructions.length }}</span></header>
        <div v-if="loading" class="skeleton-list"><span v-for="index in 3" :key="index" /></div>
        <div v-else class="instruction-items">
          <button v-for="instruction in instructions" :key="instruction.id" class="instruction-item" :class="{ 'is-selected': instruction.id === selectedId }" type="button" @click="selectInstruction(instruction)"><span class="instruction-mark"><el-icon><CircleCheck v-if="instruction.isSystem" /><EditPen v-else /></el-icon></span><div><strong>{{ instruction.name }}</strong><p>{{ instruction.content }}</p><small>{{ instruction.isSystem ? '系统默认 · 不可修改' : `更新于 ${formatDateTime(instruction.updatedAt)}` }}</small></div></button>
        </div>
      </aside>

      <section class="editor surface-panel">
        <header class="editor-heading"><div><span class="panel-kicker">{{ isEditing ? (isSystem ? 'SYSTEM BASELINE' : 'EDIT INSTRUCTION') : 'NEW INSTRUCTION' }}</span><h3>{{ isEditing ? (isSystem ? '系统默认指令' : '编辑创作指令') : '新建创作指令' }}</h3></div><div class="editor-actions"><button v-if="selectedInstruction && !isSystem" class="compact-button danger" type="button" :disabled="saving" aria-label="删除当前创作指令" @click="removeInstruction"><el-icon><Delete /></el-icon></button><button v-if="!isSystem" class="primary-button" type="button" :disabled="saving" @click="saveInstruction">{{ saving ? '保存中…' : '保存指令' }}</button></div></header>
        <div v-if="isSystem" class="system-lock"><el-icon><CircleCheck /></el-icon><div><strong>系统基线已锁定</strong><p>它保证公开内容不会虚构事实或把未经核验信息当作结论；如需更具体的风格，请新建一条自定义指令。</p></div></div>
        <div class="editor-form"><label class="field"><span>指令名称 <i>*</i></span><input v-model="form.name" :disabled="isSystem" maxlength="100" placeholder="例如：专业解答型官网文章" /></label><label class="field"><span>创作要求 <i>*</i></span><textarea v-model="form.content" :disabled="isSystem" maxlength="3000" placeholder="说明文章语气、结构、需要强调或避免的表达…" /><small>{{ form.content.length }} / 3000</small></label></div>
        <footer class="guidance"><div><span>建议写入</span><p>目标读者、表达语气、文章结构、必须引用的已核验事实。</p></div><div><span>避免写入</span><p>绝对化承诺、未授权客户信息、虚构排名与不可证明的数据。</p></div></footer>
      </section>
    </section>
  </div>
</template>

<style scoped>
.instructions-page{display:grid;max-width:1500px;margin:0 auto;gap:16px}.page-intro,.intro-actions,.notice-panel,.panel-heading,.editor-heading,.editor-actions,.instruction-item,.system-lock{display:flex;align-items:center}.page-intro{justify-content:space-between;gap:24px}.eyebrow,.panel-kicker{display:block;color:var(--color-champagne);font-family:var(--font-mono);font-size:10px;letter-spacing:.13em}.eyebrow{margin-bottom:5px}h2,h3,p{margin:0}h2{font-size:26px;font-weight:670;letter-spacing:-.035em}.page-intro p{margin-top:5px;color:var(--color-text-secondary)}.intro-actions{gap:9px}.secondary-button,.primary-button,.compact-button{display:inline-flex;min-height:38px;align-items:center;justify-content:center;padding:0 14px;border:1px solid var(--color-border-strong);border-radius:8px;color:var(--color-text-secondary);background:rgba(13,28,52,.68);cursor:pointer;gap:7px;transition:.16s ease}.primary-button{border-color:rgba(113,111,255,.62);color:#fff;background:var(--gradient-primary);box-shadow:0 8px 22px rgba(72,73,194,.18)}.compact-button{width:38px;padding:0}.danger{color:#e77d8e;border-color:rgba(251,113,133,.22);background:rgba(251,113,133,.05)}.secondary-button:hover,.primary-button:hover,.compact-button:hover{border-color:rgba(126,137,255,.7);color:#fff}.secondary-button:disabled,.primary-button:disabled,.compact-button:disabled{cursor:not-allowed;opacity:.5}.notice-panel{padding:13px 16px;border-color:rgba(102,203,221,.24);color:var(--color-text-secondary);gap:10px}.notice-panel>.el-icon{align-self:flex-start;margin-top:1px;color:#61d2e8;font-size:18px}.notice-panel p{font-size:12px;line-height:1.65}.workspace{display:grid;grid-template-columns:minmax(320px,.7fr) minmax(0,1.7fr);align-items:start;gap:16px}.instruction-list,.editor{min-width:0;padding:22px}.panel-heading,.editor-heading{justify-content:space-between;padding-bottom:16px;border-bottom:1px solid var(--color-border);gap:16px}.panel-kicker{margin-bottom:4px;color:var(--color-text-muted)}h3{font-size:17px;font-weight:650}.count-badge{display:grid;width:28px;height:28px;place-items:center;border:1px solid rgba(111,121,255,.38);border-radius:50%;color:#bbc3ff;background:rgba(91,99,255,.13);font-family:var(--font-mono);font-size:11px}.instruction-items{display:grid;margin-top:14px;gap:8px}.instruction-item{width:100%;align-items:flex-start;padding:13px 12px;border:1px solid rgba(145,168,205,.14);border-radius:9px;color:inherit;background:rgba(9,22,42,.34);cursor:pointer;text-align:left;gap:10px;transition:.16s ease}.instruction-item:hover,.instruction-item.is-selected{border-color:rgba(112,124,255,.5);background:rgba(70,83,174,.13)}.instruction-mark{display:grid;width:36px;height:36px;flex:0 0 auto;place-items:center;border-radius:9px;color:#9b9eff;background:rgba(95,85,222,.12)}.instruction-item>div{min-width:0}.instruction-item strong,.instruction-item p,.instruction-item small{display:block}.instruction-item strong{overflow:hidden;font-size:13px;font-weight:570;text-overflow:ellipsis;white-space:nowrap}.instruction-item p{display:-webkit-box;overflow:hidden;margin-top:3px;color:var(--color-text-muted);font-size:11px;line-height:1.45;-webkit-box-orient:vertical;-webkit-line-clamp:2}.instruction-item small{margin-top:7px;color:#718097;font-family:var(--font-mono);font-size:10px}.system-lock{margin-top:18px;padding:13px 14px;border:1px solid rgba(212,168,83,.28);border-radius:9px;color:var(--color-text-secondary);background:rgba(197,143,51,.07);align-items:flex-start;gap:10px}.system-lock>.el-icon{margin-top:1px;color:var(--color-champagne);font-size:19px}.system-lock strong{font-size:12px}.system-lock p{margin-top:3px;font-size:11px;line-height:1.55}.editor-form{display:grid;padding-top:19px;gap:16px}.field{display:grid;gap:7px}.field>span{color:var(--color-text-secondary);font-size:12px}.field i{color:var(--color-danger);font-style:normal}input,textarea{width:100%;border:1px solid rgba(145,168,205,.25);border-radius:8px;outline:none;color:var(--color-text);background:rgba(4,15,31,.48);font:inherit}input{min-height:40px;padding:0 12px}textarea{min-height:268px;padding:11px 12px;line-height:1.65;resize:vertical}input:focus,textarea:focus{border-color:rgba(115,125,255,.76);box-shadow:var(--shadow-focus)}input:disabled,textarea:disabled{cursor:not-allowed;color:#b9c2d4;border-color:rgba(212,168,83,.18);background:rgba(179,132,49,.05)}.field small{justify-self:end;color:var(--color-text-muted);font-family:var(--font-mono);font-size:10px}.guidance{display:grid;grid-template-columns:1fr 1fr;margin-top:20px;padding-top:15px;border-top:1px solid var(--color-border);gap:18px}.guidance span{color:#aeb8ff;font-size:11px}.guidance p{margin-top:4px;color:var(--color-text-muted);font-size:11px;line-height:1.6}.skeleton-list{display:grid;margin-top:15px;gap:9px}.skeleton-list span{display:block;height:88px;border-radius:9px;background:linear-gradient(90deg,rgba(120,143,182,.08),rgba(120,143,182,.18),rgba(120,143,182,.08));background-size:220% 100%;animation:shimmer 1.4s ease-in-out infinite}.error-panel{display:grid;min-height:230px;place-items:center;align-content:center;padding:30px;text-align:center;gap:8px}.error-panel p{color:var(--color-text-muted)}@keyframes shimmer{to{background-position:-220% 0}}@media(max-width:1050px){.workspace{grid-template-columns:1fr}.instruction-items{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:680px){.page-intro{align-items:flex-start;flex-direction:column}.intro-actions{width:100%}.intro-actions button{flex:1}.instruction-items,.guidance{grid-template-columns:1fr}.instruction-item{min-height:102px}}
</style>
