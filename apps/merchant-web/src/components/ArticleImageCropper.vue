<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import {
  ARTICLE_IMAGE_HEIGHT,
  ARTICLE_IMAGE_MAX_ZOOM,
  ARTICLE_IMAGE_PREVIEW_HEIGHT,
  ARTICLE_IMAGE_PREVIEW_WIDTH,
  ARTICLE_IMAGE_WIDTH,
  calculateArticleCropGeometry,
  type ArticleCropSelection,
  type ImageDimensions,
} from '@/utils/article-image'

const props = defineProps<{
  file: File
  dimensions: ImageDimensions
}>()

const emit = defineEmits<{
  confirm: [selection: ArticleCropSelection]
  cancel: []
}>()

const frame = ref<HTMLElement | null>(null)
const dialog = ref<HTMLElement | null>(null)
const zoom = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const sourceUrl = URL.createObjectURL(props.file)
let pointerId: number | null = null
let dragStartX = 0
let dragStartY = 0
let dragOriginX = 0
let dragOriginY = 0

const geometry = computed(() => calculateArticleCropGeometry(props.dimensions, {
  zoom: zoom.value,
  offsetX: offsetX.value,
  offsetY: offsetY.value,
}))
const imageStyle = computed(() => ({
  left: `${50 + geometry.value.offsetX / ARTICLE_IMAGE_PREVIEW_WIDTH * 100}%`,
  top: `${50 + geometry.value.offsetY / ARTICLE_IMAGE_PREVIEW_HEIGHT * 100}%`,
  width: `${geometry.value.renderedWidth / ARTICLE_IMAGE_PREVIEW_WIDTH * 100}%`,
  aspectRatio: `${props.dimensions.width} / ${props.dimensions.height}`,
}))
const needsUpscale = computed(() => props.dimensions.width < ARTICLE_IMAGE_WIDTH || props.dimensions.height < ARTICLE_IMAGE_HEIGHT)

function applyClampedOffsets(): void {
  offsetX.value = geometry.value.offsetX
  offsetY.value = geometry.value.offsetY
}

function resetCrop(): void {
  zoom.value = 1
  offsetX.value = 0
  offsetY.value = 0
}

function handlePointerDown(event: PointerEvent): void {
  if (event.button !== 0) return
  pointerId = event.pointerId
  dragStartX = event.clientX
  dragStartY = event.clientY
  dragOriginX = offsetX.value
  dragOriginY = offsetY.value
  frame.value?.setPointerCapture(event.pointerId)
}

function handlePointerMove(event: PointerEvent): void {
  if (pointerId !== event.pointerId || !frame.value) return
  const bounds = frame.value.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return
  offsetX.value = dragOriginX + (event.clientX - dragStartX) * ARTICLE_IMAGE_PREVIEW_WIDTH / bounds.width
  offsetY.value = dragOriginY + (event.clientY - dragStartY) * ARTICLE_IMAGE_PREVIEW_HEIGHT / bounds.height
  applyClampedOffsets()
}

function handlePointerUp(event: PointerEvent): void {
  if (pointerId !== event.pointerId) return
  if (frame.value?.hasPointerCapture(event.pointerId)) frame.value.releasePointerCapture(event.pointerId)
  pointerId = null
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('cancel')
}

watch(zoom, applyClampedOffsets)

onMounted(() => {
  void nextTick(() => dialog.value?.focus())
})

onBeforeUnmount(() => URL.revokeObjectURL(sourceUrl))
</script>

<template>
  <Teleport to="body">
    <div class="crop-overlay" @keydown="handleKeydown">
      <section ref="dialog" class="crop-dialog" role="dialog" aria-modal="true" aria-labelledby="article-crop-title" tabindex="-1">
        <header class="crop-heading">
          <div>
            <span>文章发布图片</span>
            <h3 id="article-crop-title">裁剪为 4:3 横图</h3>
            <p>拖动图片调整位置，使用滑块缩放；确认后统一生成 {{ ARTICLE_IMAGE_WIDTH }}×{{ ARTICLE_IMAGE_HEIGHT }} px。</p>
          </div>
          <button type="button" aria-label="关闭图片裁剪" @click="emit('cancel')">×</button>
        </header>

        <div
          ref="frame"
          class="crop-frame"
          data-crop-ratio="4:3"
          @pointerdown="handlePointerDown"
          @pointermove="handlePointerMove"
          @pointerup="handlePointerUp"
          @pointercancel="handlePointerUp"
        >
          <img :src="sourceUrl" :alt="file.name" :style="imageStyle" draggable="false" />
          <span class="crop-ratio-badge">固定 4:3</span>
          <span class="grid-line vertical first" />
          <span class="grid-line vertical second" />
          <span class="grid-line horizontal first" />
          <span class="grid-line horizontal second" />
          <span class="crop-hint">拖动图片选择保留区域</span>
        </div>

        <div class="crop-controls">
          <label>
            <span>缩放</span>
            <input v-model.number="zoom" type="range" min="1" :max="ARTICLE_IMAGE_MAX_ZOOM" step="0.01" aria-label="图片缩放" />
            <strong>{{ zoom.toFixed(2) }}×</strong>
          </label>
          <button type="button" @click="resetCrop">恢复居中</button>
        </div>

        <div class="crop-meta">
          <span>原图 {{ dimensions.width }}×{{ dimensions.height }} px</span>
          <span>输出 {{ ARTICLE_IMAGE_WIDTH }}×{{ ARTICLE_IMAGE_HEIGHT }} px · JPG</span>
          <em v-if="needsUpscale">原图较小，放大会略微降低清晰度</em>
        </div>

        <footer class="crop-actions">
          <button class="secondary-button" type="button" @click="emit('cancel')">取消</button>
          <button class="primary-button" type="button" @click="emit('confirm', { zoom: geometry.zoom, offsetX: geometry.offsetX, offsetY: geometry.offsetY })">确认裁剪</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.crop-overlay{position:fixed;z-index:5000;inset:0;display:grid;place-items:center;padding:24px;background:rgba(12,19,34,.72);backdrop-filter:blur(4px)}
.crop-dialog{width:min(760px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;border:1px solid #dfe4ef;border-radius:14px;outline:0;background:#fff;box-shadow:0 28px 90px rgba(6,15,34,.32)}
.crop-heading{display:flex;align-items:flex-start;justify-content:space-between;padding:20px 22px 16px;border-bottom:1px solid #e8ebf2;gap:18px}.crop-heading span{color:#6870dc;font-size:10px;font-weight:700;letter-spacing:.1em}.crop-heading h3{margin:5px 0 4px;color:#1d293b;font-size:21px}.crop-heading p{margin:0;color:#748096;font-size:12px;line-height:1.6}.crop-heading>button{width:34px;height:34px;flex:0 0 auto;border:1px solid #dce1eb;border-radius:8px;color:#667085;background:#fff;cursor:pointer;font-size:20px}
.crop-frame{position:relative;width:calc(100% - 44px);aspect-ratio:4/3;margin:20px 22px 16px;overflow:hidden;border:2px solid #6975ed;border-radius:10px;background:#202838;cursor:grab;touch-action:none;user-select:none}.crop-frame:active{cursor:grabbing}.crop-frame img{position:absolute;display:block;max-width:none;height:auto;transform:translate(-50%,-50%);pointer-events:none}.grid-line{position:absolute;background:rgba(255,255,255,.48);pointer-events:none}.grid-line.vertical{top:0;bottom:0;width:1px}.grid-line.horizontal{right:0;left:0;height:1px}.grid-line.vertical.first{left:33.333%}.grid-line.vertical.second{left:66.666%}.grid-line.horizontal.first{top:33.333%}.grid-line.horizontal.second{top:66.666%}.crop-ratio-badge,.crop-hint{position:absolute;padding:5px 9px;border-radius:999px;color:#fff;background:rgba(16,24,40,.68);font-size:10px;pointer-events:none;backdrop-filter:blur(4px)}.crop-ratio-badge{top:12px;left:12px;font-weight:700;letter-spacing:.04em}.crop-hint{right:12px;bottom:12px}
.crop-controls{display:flex;align-items:center;justify-content:space-between;padding:0 22px;gap:18px}.crop-controls label{display:grid;grid-template-columns:auto minmax(180px,1fr) 46px;flex:1;align-items:center;color:#566176;font-size:12px;gap:10px}.crop-controls input{width:100%;accent-color:#6672e8}.crop-controls strong{color:#4f5ac7;font-family:monospace;text-align:right}.crop-controls button{padding:7px 10px;border:1px solid #dbe0eb;border-radius:7px;color:#5f6b7f;background:#fff;cursor:pointer;font-size:11px}
.crop-meta{display:flex;align-items:center;padding:13px 22px 0;color:#7b8699;font-size:10px;gap:14px;flex-wrap:wrap}.crop-meta em{color:#c27720;font-style:normal}
.crop-actions{display:flex;justify-content:flex-end;padding:18px 22px 20px;gap:9px}.primary-button,.secondary-button{min-height:38px;padding:0 17px;border:1px solid #d8deea;border-radius:8px;cursor:pointer;font:inherit}.secondary-button{color:#5f6b7f;background:#fff}.primary-button{border-color:#6672e8;color:#fff;background:linear-gradient(135deg,#6773ea,#5963d8);box-shadow:0 8px 18px rgba(89,99,216,.2)}
@media(max-width:680px){.crop-overlay{padding:12px}.crop-dialog{width:100%;max-height:calc(100vh - 24px)}.crop-heading{padding:16px}.crop-frame{width:calc(100% - 32px);margin:16px}.crop-controls{align-items:stretch;padding:0 16px;flex-direction:column}.crop-controls label{width:100%}.crop-meta{padding:12px 16px 0}.crop-actions{padding:16px}}
</style>

<style scoped>
/* 裁剪器包含关键尺寸与清晰度信息，不能使用微型字号。 */
.crop-heading span,
.crop-ratio-badge,
.crop-hint {
  font-size: 12px;
}

.crop-heading p,
.crop-controls label,
.crop-controls button {
  font-size: 14px;
}

.crop-meta {
  font-size: 13px;
}

.crop-actions button {
  min-height: 42px;
  font-size: 15px;
}
</style>
