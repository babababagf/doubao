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

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'image-paste-blocked': []
  'paste-images': [files: File[]]
  'select-images': [files: File[]]
}>()
const editor = ref<HTMLElement | null>(null)
const imageInput = ref<HTMLInputElement | null>(null)
let pendingImageRange: Range | null = null

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

function chooseImages(): void {
  if (props.disabled) return
  pendingImageRange = currentEditorRange()
  imageInput.value?.click()
}

function handleImageSelection(event: Event): void {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length) {
    pendingImageRange = null
    return
  }
  emit('select-images', files)
}

function clipboardImageFiles(data: DataTransfer): File[] {
  const itemFiles = Array.from(data.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
  if (itemFiles.length) return itemFiles
  return Array.from(data.files ?? []).filter((file) => file.type.startsWith('image/'))
}

function currentEditorRange(): Range | null {
  const root = editor.value
  const selection = window.getSelection()
  if (!root || !selection?.rangeCount) return null
  const range = selection.getRangeAt(0)
  return root.contains(range.commonAncestorContainer) ? range.cloneRange() : null
}

function editorRangeFromPoint(clientX: number, clientY: number): Range | null {
  const root = editor.value
  if (!root) return null
  const caretDocument = document as unknown as {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  const directRange = caretDocument.caretRangeFromPoint?.(clientX, clientY) ?? null
  if (directRange && root.contains(directRange.commonAncestorContainer)) return directRange.cloneRange()
  const position = caretDocument.caretPositionFromPoint?.(clientX, clientY) ?? null
  if (!position || !root.contains(position.offsetNode)) return currentEditorRange()
  const range = document.createRange()
  range.setStart(position.offsetNode, position.offset)
  range.collapse(true)
  return range
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function insertUploadedImages(images: Array<{ url: string; alt: string }>): void {
  // 上传期间父级会临时锁定编辑器，可信的异步上传回调仍需完成图片回插。
  if (!editor.value || !images.length) return
  const safeImages = images.filter((image) => /^https:\/\//i.test(image.url))
  if (!safeImages.length) {
    pendingImageRange = null
    return
  }
  editor.value.focus()
  const selection = window.getSelection()
  const range = pendingImageRange ?? currentEditorRange()
  if (selection && range) {
    selection.removeAllRanges()
    selection.addRange(range)
  }
  const html = safeImages.map((image) => `<p><img src="${escapeAttribute(image.url)}" alt="${escapeAttribute(image.alt)}"></p>`).join('')
  const inserted = typeof document.execCommand === 'function' && document.execCommand('insertHTML', false, html)
  if (!inserted) {
    const fallbackRange = currentEditorRange()
    if (fallbackRange) {
      fallbackRange.deleteContents()
      fallbackRange.insertNode(fallbackRange.createContextualFragment(html))
    } else {
      editor.value.insertAdjacentHTML('beforeend', html)
    }
  }
  pendingImageRange = null
  emitContent()
}

function cancelPendingImagePaste(): void {
  pendingImageRange = null
}

function htmlToPlainText(html: string): string {
  if (!html) return ''
  const node = document.createElement('div')
  node.innerHTML = html
  node.querySelectorAll('img,script,style,iframe,object,embed').forEach((element) => element.remove())
  return (node.innerText || node.textContent || '').trim()
}

function handlePaste(event: ClipboardEvent): void {
  if (props.disabled) {
    event.preventDefault()
    return
  }

  const data = event.clipboardData
  if (!data) return
  event.preventDefault()

  const imageFiles = clipboardImageFiles(data)
  if (imageFiles.length) {
    pendingImageRange = currentEditorRange()
    emit('paste-images', imageFiles)
    return
  }

  const clipboardHtml = data.getData('text/html')
  const text = data.getData('text/plain') || htmlToPlainText(clipboardHtml)
  if (/<img\b/i.test(clipboardHtml)) emit('image-paste-blocked')
  if (!text) return

  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  const html = escaped.split(/\r?\n/).map((line) => line || '<br>').join('<br>')
  command('insertHTML', html)
}

function handleDragOver(event: DragEvent): void {
  if (props.disabled) return
  const hasFiles = Array.from(event.dataTransfer?.types ?? []).includes('Files')
  if (hasFiles) event.preventDefault()
}

function handleDrop(event: DragEvent): void {
  if (props.disabled) {
    event.preventDefault()
    return
  }
  const data = event.dataTransfer
  if (!data) return
  const imageFiles = clipboardImageFiles(data)
  if (!imageFiles.length) return
  event.preventDefault()
  pendingImageRange = editorRangeFromPoint(event.clientX, event.clientY)
  emit('select-images', imageFiles)
}

watch(() => props.modelValue, (value) => {
  void nextTick(() => syncEditor(value))
})

onMounted(() => syncEditor(props.modelValue))

defineExpose({ cancelPendingImagePaste, insertUploadedImages })
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
      <span class="toolbar-divider" />
      <div class="toolbar-group" aria-label="文章图片">
        <button type="button" title="插入图片" :disabled="disabled" @mousedown.prevent="chooseImages">图片</button>
        <input ref="imageInput" class="editor-file-input" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" multiple @change="handleImageSelection" />
      </div>
    </div>
    <div
      ref="editor"
      class="editor-canvas"
      :contenteditable="disabled ? 'false' : 'true'"
      :data-placeholder="placeholder"
      :aria-disabled="disabled"
      role="textbox"
      aria-multiline="true"
      tabindex="0"
      @input="emitContent"
      @blur="emitContent"
      @paste="handlePaste"
      @dragover="handleDragOver"
      @drop="handleDrop"
    />
    <footer class="editor-footnote">
      <span>支持标题、段落、列表、引用和 HTTPS 链接；上传或粘贴的图片将统一处理为 1600×1200。</span>
      <span :class="{ danger: htmlLength > maxLength }">正文 {{ textLength }} 字 · HTML {{ htmlLength }} / {{ maxLength }}</span>
    </footer>
  </div>
</template>

<style scoped>
.rich-editor{overflow:hidden;border:1px solid rgba(145,168,205,.25);border-radius:10px;background:rgba(4,15,31,.48);transition:border-color .16s ease,box-shadow .16s ease}.rich-editor:focus-within{border-color:rgba(115,125,255,.76);box-shadow:var(--shadow-focus)}.rich-editor.is-over-limit{border-color:rgba(251,113,133,.62)}.editor-toolbar,.toolbar-group,.editor-footnote{display:flex;align-items:center}.editor-toolbar{min-height:44px;padding:6px 8px;border-bottom:1px solid rgba(145,168,205,.16);background:linear-gradient(180deg,rgba(18,35,64,.92),rgba(10,25,48,.74));gap:7px;flex-wrap:wrap}.toolbar-group{gap:4px}.editor-toolbar button{min-height:30px;padding:0 9px;border:1px solid transparent;border-radius:6px;color:var(--color-text-muted);background:transparent;cursor:pointer;font:inherit;font-size:11px;transition:.15s ease}.editor-toolbar button:hover,.editor-toolbar button:focus-visible{border-color:rgba(120,130,255,.38);outline:0;color:#eef0ff;background:rgba(91,91,219,.16)}.editor-toolbar button:disabled{cursor:not-allowed;opacity:.45}.type-bold{font-weight:800}.type-italic{font-style:italic}.toolbar-divider{width:1px;height:20px;background:rgba(145,168,205,.16)}.editor-canvas{min-height:390px;padding:20px 22px;outline:0;color:var(--color-text);font-size:14px;line-height:1.85;cursor:text;user-select:text;-webkit-user-select:text}.editor-canvas[contenteditable="false"]{cursor:not-allowed}.editor-canvas:empty::before{color:var(--color-text-muted);content:attr(data-placeholder);pointer-events:none}.editor-canvas :deep(h2){margin:25px 0 10px;color:#f5f6ff;font-size:21px;line-height:1.35}.editor-canvas :deep(h3){margin:20px 0 8px;color:#e8ebfb;font-size:17px;line-height:1.4}.editor-canvas :deep(p){margin:0 0 12px}.editor-canvas :deep(ul),.editor-canvas :deep(ol){margin:8px 0 15px;padding-left:24px}.editor-canvas :deep(blockquote){margin:14px 0;padding:11px 14px;border-left:3px solid #7d7bff;color:#b9c4db;background:rgba(91,91,219,.1)}.editor-canvas :deep(a){color:#8bdcf0;text-underline-offset:3px}.editor-footnote{justify-content:space-between;padding:9px 12px;border-top:1px solid rgba(145,168,205,.13);color:var(--color-text-muted);font-family:var(--font-mono);font-size:9px;gap:12px}.editor-footnote .danger{color:#fb879b}.is-disabled{opacity:.72}@media(max-width:680px){.editor-toolbar{align-items:flex-start}.toolbar-divider{display:none}.editor-canvas{min-height:320px;padding:16px}.editor-footnote{align-items:flex-start;flex-direction:column}}
.editor-canvas :deep(img){display:block;max-width:100%;height:auto;margin:16px auto;border-radius:8px;box-shadow:0 8px 24px rgba(8,18,38,.16)}
.editor-file-input{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);clip-path:inset(50%);white-space:nowrap}

html.light-admin .rich-editor{border-color:#dfe3ec;background:#fff}html.light-admin .editor-toolbar{border-bottom-color:#e5e8ef;background:#f7f8fb}html.light-admin .editor-toolbar button:hover,html.light-admin .editor-toolbar button:focus-visible{border-color:#cfd4fb;color:#5863d8;background:#edf0ff}html.light-admin .toolbar-divider{background:#dfe3ea}html.light-admin .editor-canvas :deep(h2),html.light-admin .editor-canvas :deep(h3){color:#202a3a}html.light-admin .editor-canvas :deep(blockquote){color:#606b7c;background:#f3f4ff}html.light-admin .editor-canvas :deep(a){color:#4a70dc}html.light-admin .editor-footnote{border-top-color:#e5e8ef}
</style>
