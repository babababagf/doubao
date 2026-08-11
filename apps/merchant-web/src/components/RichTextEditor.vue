<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  disabled?: boolean
  maxLength?: number
}>(), {
  placeholder: '输入文章正文',
  disabled: false,
  maxLength: 30000,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const editor = ref<HTMLElement | null>(null)

const htmlLength = computed(() => props.modelValue.length)
const textLength = computed(() => {
  if (typeof document === 'undefined') return props.modelValue.replace(/<[^>]+>/g, '').length
  const node = document.createElement('div')
  node.innerHTML = props.modelValue
  return (node.textContent ?? '').trim().length
})

function syncEditor(value: string): void {
  if (editor.value && editor.value.innerHTML !== value) editor.value.innerHTML = value
}

function emitContent(): void {
  emit('update:modelValue', editor.value?.innerHTML.trim() ?? '')
}

function command(name: string, value?: string): void {
  if (props.disabled) return
  editor.value?.focus()
  document.execCommand(name, false, value)
  emitContent()
}

function formatBlock(tag: 'p' | 'h2' | 'h3' | 'blockquote'): void {
  command('formatBlock', `<${tag}>`)
}

function createLink(): void {
  if (props.disabled) return
  const url = window.prompt('输入 HTTPS 链接地址')?.trim()
  if (!url) return
  if (!/^https:\/\//i.test(url)) {
    window.alert('文章链接仅支持 HTTPS 地址')
    return
  }
  command('createLink', url)
}

function handlePaste(event: ClipboardEvent): void {
  const text = event.clipboardData?.getData('text/plain')
  if (!text) return
  event.preventDefault()
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  const html = escaped.split(/\r?\n/).map((line) => line || '<br>').join('<br>')
  command('insertHTML', html)
}

watch(() => props.modelValue, (value) => {
  void nextTick(() => syncEditor(value))
})

onMounted(() => syncEditor(props.modelValue))
</script>

<template>
  <div class="rich-editor" :class="{ 'is-disabled': disabled, 'is-over-limit': htmlLength > maxLength }">
    <div class="editor-toolbar" role="toolbar" aria-label="文章格式工具栏">
      <div class="toolbar-group" aria-label="段落格式">
        <button type="button" title="正文" :disabled="disabled" @mousedown.prevent="formatBlock('p')">正文</button>
        <button type="button" title="二级标题" :disabled="disabled" @mousedown.prevent="formatBlock('h2')">H2</button>
        <button type="button" title="三级标题" :disabled="disabled" @mousedown.prevent="formatBlock('h3')">H3</button>
      </div>
      <span class="toolbar-divider" />
      <div class="toolbar-group" aria-label="文字格式">
        <button class="type-bold" type="button" title="加粗" :disabled="disabled" @mousedown.prevent="command('bold')">B</button>
        <button class="type-italic" type="button" title="斜体" :disabled="disabled" @mousedown.prevent="command('italic')">I</button>
        <button type="button" title="引用" :disabled="disabled" @mousedown.prevent="formatBlock('blockquote')">“ ”</button>
      </div>
      <span class="toolbar-divider" />
      <div class="toolbar-group" aria-label="列表和链接">
        <button type="button" title="无序列表" :disabled="disabled" @mousedown.prevent="command('insertUnorderedList')">• 列表</button>
        <button type="button" title="有序列表" :disabled="disabled" @mousedown.prevent="command('insertOrderedList')">1. 列表</button>
        <button type="button" title="添加链接" :disabled="disabled" @mousedown.prevent="createLink">链接</button>
        <button type="button" title="移除格式" :disabled="disabled" @mousedown.prevent="command('removeFormat')">清除格式</button>
      </div>
    </div>
    <div
      ref="editor"
      class="editor-canvas"
      :contenteditable="disabled ? 'false' : 'true'"
      :data-placeholder="placeholder"
      role="textbox"
      aria-multiline="true"
      @input="emitContent"
      @blur="emitContent"
      @paste="handlePaste"
    />
    <footer class="editor-footnote">
      <span>支持标题、段落、列表、引用和 HTTPS 链接；保存时服务端会执行安全清洗。</span>
      <span :class="{ danger: htmlLength > maxLength }">正文 {{ textLength }} 字 · HTML {{ htmlLength }} / {{ maxLength }}</span>
    </footer>
  </div>
</template>

<style scoped>
.rich-editor{overflow:hidden;border:1px solid rgba(145,168,205,.25);border-radius:10px;background:rgba(4,15,31,.48);transition:border-color .16s ease,box-shadow .16s ease}.rich-editor:focus-within{border-color:rgba(115,125,255,.76);box-shadow:var(--shadow-focus)}.rich-editor.is-over-limit{border-color:rgba(251,113,133,.62)}.editor-toolbar,.toolbar-group,.editor-footnote{display:flex;align-items:center}.editor-toolbar{min-height:44px;padding:6px 8px;border-bottom:1px solid rgba(145,168,205,.16);background:linear-gradient(180deg,rgba(18,35,64,.92),rgba(10,25,48,.74));gap:7px;flex-wrap:wrap}.toolbar-group{gap:4px}.editor-toolbar button{min-height:30px;padding:0 9px;border:1px solid transparent;border-radius:6px;color:var(--color-text-muted);background:transparent;cursor:pointer;font:inherit;font-size:11px;transition:.15s ease}.editor-toolbar button:hover,.editor-toolbar button:focus-visible{border-color:rgba(120,130,255,.38);outline:0;color:#eef0ff;background:rgba(91,91,219,.16)}.editor-toolbar button:disabled{cursor:not-allowed;opacity:.45}.type-bold{font-weight:800}.type-italic{font-style:italic}.toolbar-divider{width:1px;height:20px;background:rgba(145,168,205,.16)}.editor-canvas{min-height:390px;padding:20px 22px;outline:0;color:var(--color-text);font-size:14px;line-height:1.85}.editor-canvas:empty::before{color:var(--color-text-muted);content:attr(data-placeholder);pointer-events:none}.editor-canvas :deep(h2){margin:25px 0 10px;color:#f5f6ff;font-size:21px;line-height:1.35}.editor-canvas :deep(h3){margin:20px 0 8px;color:#e8ebfb;font-size:17px;line-height:1.4}.editor-canvas :deep(p){margin:0 0 12px}.editor-canvas :deep(ul),.editor-canvas :deep(ol){margin:8px 0 15px;padding-left:24px}.editor-canvas :deep(blockquote){margin:14px 0;padding:11px 14px;border-left:3px solid #7d7bff;color:#b9c4db;background:rgba(91,91,219,.1)}.editor-canvas :deep(a){color:#8bdcf0;text-underline-offset:3px}.editor-footnote{justify-content:space-between;padding:9px 12px;border-top:1px solid rgba(145,168,205,.13);color:var(--color-text-muted);font-family:var(--font-mono);font-size:9px;gap:12px}.editor-footnote .danger{color:#fb879b}.is-disabled{opacity:.72}@media(max-width:680px){.editor-toolbar{align-items:flex-start}.toolbar-divider{display:none}.editor-canvas{min-height:320px;padding:16px}.editor-footnote{align-items:flex-start;flex-direction:column}}

html.light-admin .rich-editor{border-color:#dfe3ec;background:#fff}html.light-admin .editor-toolbar{border-bottom-color:#e5e8ef;background:#f7f8fb}html.light-admin .editor-toolbar button:hover,html.light-admin .editor-toolbar button:focus-visible{border-color:#cfd4fb;color:#5863d8;background:#edf0ff}html.light-admin .toolbar-divider{background:#dfe3ea}html.light-admin .editor-canvas :deep(h2),html.light-admin .editor-canvas :deep(h3){color:#202a3a}html.light-admin .editor-canvas :deep(blockquote){color:#606b7c;background:#f3f4ff}html.light-admin .editor-canvas :deep(a){color:#4a70dc}html.light-admin .editor-footnote{border-top-color:#e5e8ef}
</style>
