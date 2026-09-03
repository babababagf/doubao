<script setup lang="ts">
import type { GalleryImage, GalleryInput, MerchantGallery } from '@doubaohk/api-contract'
import { ArrowLeft, Delete, EditPen, FolderOpened, Picture, Plus, RefreshRight, Search, UploadFilled, View } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ArticleImageCropper from '@/components/ArticleImageCropper.vue'
import { ApiError, isRealApiMode } from '@/services/http'
import {
  addGalleryImageMetadata,
  completeGalleryImageUpload,
  createGalleryImageUpload,
  createGallery,
  deleteGallery,
  deleteGalleryImage,
  listGalleries,
  listGalleryImages,
  updateGallery,
} from '@/services/merchant.service'
import { CENTERED_ARTICLE_CROP, inspectArticleImage, isArticleImageAspectRatio, normalizeArticleImage, type ArticleCropSelection, type ImageDimensions } from '@/utils/article-image'
import { formatDateTime } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const galleries = ref<MerchantGallery[]>([])
const images = ref<GalleryImage[]>([])
const selectedGalleryId = ref<string | null>(null)
const loading = ref(true)
const loadingImages = ref(false)
const saving = ref(false)
const uploading = ref(false)
const preparingImage = ref(false)
const errorMessage = ref('')
const search = ref('')
const selectedFile = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const pendingCropFile = ref<File | null>(null)
const pendingCropDimensions = ref<ImageDimensions | null>(null)
const cropRequestId = ref(0)
const editorVisible = ref(false)
const editingGalleryId = ref<string | null>(null)
const form = reactive<GalleryInput>({ name: '', description: '' })
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png'])

const selectedGallery = computed(
  () => galleries.value.find((gallery) => gallery.id === selectedGalleryId.value) ?? null,
)
const filteredGalleries = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return galleries.value
  return galleries.value.filter((gallery) => `${gallery.name} ${gallery.description}`.toLowerCase().includes(keyword))
})
const totalImageBytes = computed(() => images.value.reduce((total, image) => total + image.sizeBytes, 0))

function assignForm(gallery?: MerchantGallery): void {
  form.name = gallery?.name ?? ''
  form.description = gallery?.description ?? ''
}

function formatStorage(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function imageTypeLabel(mimeType: string): string {
  const subtype = mimeType.split('/')[1]?.toUpperCase()
  return subtype === 'JPEG' ? 'JPG' : subtype || '图片'
}

async function loadImages(galleryId: string): Promise<void> {
  loadingImages.value = true
  try {
    images.value = await listGalleryImages(galleryId)
  } catch (error) {
    images.value = []
    ElMessage.error(error instanceof ApiError ? error.message : '图片明细加载失败')
  } finally {
    loadingImages.value = false
  }
}

async function loadGalleries(preferredId: string | null = selectedGalleryId.value, refreshImages = false): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    galleries.value = await listGalleries()
    if (preferredId) {
      const selected = galleries.value.find((gallery) => gallery.id === preferredId)
      if (selected) {
        selectedGalleryId.value = selected.id
        if (refreshImages) await loadImages(selected.id)
      } else {
        await backToGalleries()
      }
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '图库加载失败'
  } finally {
    loading.value = false
  }
}

async function openGallery(gallery: MerchantGallery): Promise<void> {
  selectedGalleryId.value = gallery.id
  selectedFile.value = null
  await router.replace({ query: { ...route.query, galleryId: gallery.id } })
  await loadImages(gallery.id)
}

async function backToGalleries(): Promise<void> {
  selectedGalleryId.value = null
  images.value = []
  selectedFile.value = null
  const query = { ...route.query }
  delete query.galleryId
  await router.replace({ query })
}

function openCreateGallery(): void {
  editingGalleryId.value = null
  assignForm()
  editorVisible.value = true
}

function openEditGallery(gallery: MerchantGallery): void {
  editingGalleryId.value = gallery.id
  assignForm(gallery)
  editorVisible.value = true
}

async function saveGallery(): Promise<void> {
  if (form.name.trim().length < 2) {
    ElMessage.warning('图库名称至少输入 2 个字符')
    return
  }
  saving.value = true
  try {
    const input = { name: form.name.trim(), description: form.description.trim() }
    const result = editingGalleryId.value ? await updateGallery(editingGalleryId.value, input) : await createGallery(input)
    editorVisible.value = false
    await loadGalleries(selectedGalleryId.value, Boolean(selectedGalleryId.value))
    ElMessage.success(editingGalleryId.value ? '图库分组已更新' : `图库分组“${result.name}”已创建`)
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '图库保存失败')
  } finally {
    saving.value = false
  }
}

async function removeGallery(gallery: MerchantGallery): Promise<void> {
  if (!window.confirm(`确认删除图库分组“${gallery.name}”吗？删除后将无法在文章创作中继续选择。`)) return
  saving.value = true
  try {
    await deleteGallery(gallery.id)
    if (selectedGalleryId.value === gallery.id) await backToGalleries()
    await loadGalleries(null)
    ElMessage.success('图库分组已删除')
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '图库删除失败')
  } finally {
    saving.value = false
  }
}

function chooseFile(): void {
  if (preparingImage.value) return
  fileInput.value?.click()
}

async function setPreparedFile(file: File, dimensions: ImageDimensions, selection: ArticleCropSelection): Promise<void> {
  preparingImage.value = true
  try {
    const normalized = await normalizeArticleImage(file, dimensions, selection)
    if (normalized.size > MAX_IMAGE_SIZE_BYTES) throw new Error('裁剪后的图片仍超过 5 MB，请更换图片后重试')
    selectedFile.value = normalized
    ElMessage.info('图片已裁剪并通过规格校验，但尚未上传；请点击右侧“确认上传”')
  } catch (error) {
    selectedFile.value = null
    ElMessage.error(error instanceof Error ? error.message : '图片处理失败')
  } finally {
    preparingImage.value = false
  }
}

function finishGalleryCrop(selection: ArticleCropSelection | null): void {
  const file = pendingCropFile.value
  const dimensions = pendingCropDimensions.value
  pendingCropFile.value = null
  pendingCropDimensions.value = null
  if (!selection || !file || !dimensions) return
  void setPreparedFile(file, dimensions, selection)
}

async function handleFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  input.value = ''
  if (!file) return
  selectedFile.value = null
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    ElMessage.warning('仅支持 JPG、PNG 格式图片')
    return
  }
  if (file.size <= 0) {
    ElMessage.warning('图片文件为空，请重新选择')
    return
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    ElMessage.warning('单张图片大小不能超过 5 MB')
    return
  }
  try {
    const dimensions = await inspectArticleImage(file)
    if (!isArticleImageAspectRatio(dimensions)) {
      pendingCropFile.value = file
      pendingCropDimensions.value = dimensions
      cropRequestId.value += 1
      return
    }
    await setPreparedFile(file, dimensions, CENTERED_ARTICLE_CROP)
  } catch {
    ElMessage.warning('图片文件无法读取，请重新选择有效的 JPG 或 PNG 图片')
  }
}

async function addImage(): Promise<void> {
  const gallery = selectedGallery.value
  const file = selectedFile.value
  if (!gallery || !file) {
    ElMessage.warning('请先选择一张本地图片')
    return
  }
  uploading.value = true
  try {
    if (isRealApiMode) {
      const ticket = await createGalleryImageUpload(gallery.id, { fileName: file.name, mimeType: file.type, sizeBytes: file.size, purpose: 'gallery' })
      const uploaded = await fetch(ticket.uploadUrl, { method: ticket.method, headers: ticket.headers, body: file })
      if (!uploaded.ok) throw new Error(`对象存储直传失败（HTTP ${uploaded.status}），请贴牌检查 OSS CORS 与 Bucket 权限`)
      await completeGalleryImageUpload(gallery.id, ticket.uploadId)
    } else {
      await addGalleryImageMetadata(gallery.id, { fileName: file.name, mimeType: file.type, sizeBytes: file.size, purpose: 'gallery' })
    }
    selectedFile.value = null
    if (fileInput.value) fileInput.value.value = ''
    await loadGalleries(gallery.id, true)
    ElMessage.success(isRealApiMode ? '图片已上传并完成校验' : '图片已加入当前图库')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '图片上传失败')
  } finally {
    uploading.value = false
  }
}

async function removeImage(image: GalleryImage): Promise<void> {
  if (image.usageCount > 0) {
    ElMessage.warning(`该图片正在被 ${image.usageCount} 篇文章使用，请先从文章中移除`)
    return
  }
  if (!window.confirm(`确认删除图片“${image.fileName}”吗？`)) return
  try {
    await deleteGalleryImage(image.id)
    if (selectedGalleryId.value) await loadGalleries(selectedGalleryId.value, true)
    ElMessage.success('图片已删除')
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '图片删除失败')
  }
}

onMounted(async () => {
  const galleryId = typeof route.query.galleryId === 'string' ? route.query.galleryId : null
  selectedGalleryId.value = galleryId
  await loadGalleries(galleryId, Boolean(galleryId))
})
</script>

<template>
  <div class="gallery-page">
    <header class="page-intro">
      <div>
        <h2>{{ selectedGallery?.name || '企业图库' }}</h2>
        <p>{{ selectedGallery ? '查看和管理这个分组中的图片，可继续上传、裁剪或删除。' : '集中上传并分类管理企业图片，AI 写作和文章编辑时可直接使用。' }}</p>
      </div>
      <div class="intro-actions">
        <button v-if="selectedGallery" class="secondary-button" type="button" @click="backToGalleries"><el-icon><ArrowLeft /></el-icon>返回分组</button>
        <button class="secondary-button" type="button" :disabled="loading || loadingImages" @click="selectedGallery ? loadGalleries(selectedGallery.id, true) : loadGalleries(null)"><el-icon><RefreshRight /></el-icon>刷新</button>
        <button v-if="selectedGallery" class="secondary-button" type="button" @click="openEditGallery(selectedGallery)"><el-icon><EditPen /></el-icon>编辑分组</button>
        <button v-if="!selectedGallery" class="primary-button" type="button" @click="openCreateGallery"><el-icon><Plus /></el-icon>新建图库</button>
      </div>
    </header>

    <nav v-if="selectedGallery" class="path-bar" aria-label="图库路径"><button type="button" @click="backToGalleries">图库分组</button><span>/</span><strong>{{ selectedGallery.name }}</strong><em>{{ images.length }} 张图片</em></nav>

    <section v-if="errorMessage" class="error-panel surface-panel" role="alert"><strong>图库暂时无法加载</strong><p>{{ errorMessage }}</p><button class="secondary-button" type="button" @click="loadGalleries()">重新加载</button></section>

    <section v-else-if="!selectedGallery" class="table-panel surface-panel">
      <div class="table-toolbar"><div class="search-box"><el-icon><Search /></el-icon><input v-model="search" placeholder="搜索图库名称或说明" /></div><span>共 {{ filteredGalleries.length }} 个图库分组</span></div>
      <div v-if="loading" class="skeleton"><span v-for="index in 4" :key="index" /></div>
      <div v-else-if="filteredGalleries.length" class="table-scroll">
        <table class="group-table"><thead><tr><th>图库分组名称</th><th>图片数量</th><th>图库说明</th><th>创建时间</th><th>操作</th></tr></thead>
          <tbody><tr v-for="gallery in filteredGalleries" :key="gallery.id"><td><button class="group-name" type="button" @click="openGallery(gallery)"><span class="folder-mark"><el-icon><FolderOpened /></el-icon></span><span><strong>{{ gallery.name }}</strong><small>更新于 {{ formatDateTime(gallery.updatedAt) }}</small></span></button></td><td><b class="metric">{{ gallery.imageCount }}</b> 张</td><td><span class="description">{{ gallery.description || '未填写图库说明' }}</span></td><td>{{ formatDateTime(gallery.createdAt) }}</td><td><div class="row-actions"><button type="button" title="查看图片" @click="openGallery(gallery)"><el-icon><View /></el-icon></button><button type="button" title="编辑分组" @click="openEditGallery(gallery)"><el-icon><EditPen /></el-icon></button><button class="danger" type="button" title="删除分组" @click="removeGallery(gallery)"><el-icon><Delete /></el-icon></button></div></td></tr></tbody>
        </table>
      </div>
      <div v-else class="empty"><el-icon><FolderOpened /></el-icon><strong>{{ search ? '没有匹配的图库分组' : '还没有图库分组' }}</strong><p>{{ search ? '换一个关键词试试。' : '点击右上角“新建图库”建立第一个素材分组。' }}</p></div>
    </section>

    <section v-else class="table-panel surface-panel">
      <div class="detail-summary"><div><span>图片总量</span><strong>{{ images.length }}</strong></div><div><span>已使用图片</span><strong>{{ images.filter((image) => image.usageCount > 0).length }}</strong></div><div><span>分组占用</span><strong>{{ formatStorage(totalImageBytes) }}</strong></div><div><span>存储位置</span><strong>{{ isRealApiMode ? '云端素材库' : '当前素材库' }}</strong></div></div>
      <div class="upload-bar">
        <input ref="fileInput" class="sr-only" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" @change="handleFileChange" />
        <div :class="['upload-copy', { pending: selectedFile }]">
          <span>{{ selectedFile ? '待确认上传' : '上传到当前分组' }}</span>
          <strong>{{ preparingImage ? '正在生成 1600×1200 图片…' : selectedFile ? `待上传：${selectedFile.name}` : '统一为 1600×1200（4:3），非 4:3 图片可拖动缩放裁剪' }}</strong>
          <small v-if="selectedFile">尚未上传 · 已通过规格校验 · {{ imageTypeLabel(selectedFile.type) }} · {{ formatStorage(selectedFile.size) }}</small>
          <small v-else>步骤 1：选择并裁剪图片；步骤 2：点击“确认上传”后才会进入下方列表</small>
        </div>
        <div class="upload-actions"><button class="secondary-button" type="button" :disabled="preparingImage || uploading" @click="chooseFile"><el-icon><UploadFilled /></el-icon>{{ selectedFile ? '重新选择' : '选择图片' }}</button><button class="primary-button" type="button" :disabled="uploading || preparingImage || !selectedFile" @click="addImage">{{ uploading ? '上传中…' : '确认上传' }}</button></div>
      </div>
      <section class="uploaded-images" aria-labelledby="uploaded-images-title">
        <header class="uploaded-images-heading">
          <div>
            <h3 id="uploaded-images-title">已上传图片</h3>
            <p>上传成功并通过尺寸校验的图片会显示在这里，默认按上传时间从新到旧排列。</p>
          </div>
          <strong>{{ images.length }} 张</strong>
        </header>
        <div v-if="loadingImages" class="image-card-skeleton" aria-label="正在加载图片列表"><span v-for="index in 8" :key="index" /></div>
        <div v-else-if="images.length" class="image-grid" data-testid="gallery-image-list">
          <article v-for="image in images" :key="image.id" class="image-card" data-testid="gallery-image-item">
            <div class="image-preview">
              <img v-if="image.url" :src="image.url" :alt="image.fileName" loading="lazy" />
              <div v-else class="image-placeholder"><el-icon><Picture /></el-icon><span>暂无预览</span></div>
              <span class="image-format">{{ imageTypeLabel(image.mimeType) }}</span>
              <a v-if="image.url" :href="image.url" target="_blank" rel="noopener" title="查看原图" aria-label="查看原图"><el-icon><View /></el-icon></a>
            </div>
            <div class="image-card-body">
              <strong :title="image.fileName">{{ image.fileName }}</strong>
              <p>{{ image.formattedSize }} · 上传于 {{ formatDateTime(image.createdAt) }}</p>
              <footer>
                <span :class="{ active: image.usageCount > 0 }">{{ image.usageCount > 0 ? `已用于 ${image.usageCount} 篇文章` : '暂未用于文章' }}</span>
                <button class="delete-image" type="button" :disabled="image.usageCount > 0" :title="image.usageCount > 0 ? '图片正在被文章使用，不能删除' : '删除图片'" @click="removeImage(image)"><el-icon><Delete /></el-icon>删除</button>
              </footer>
            </div>
          </article>
        </div>
        <div v-else class="empty image-list-empty"><el-icon><Picture /></el-icon><strong>当前分组还没有上传图片</strong><p>点击上方“选择图片”，裁剪并上传成功后会立即出现在此列表。</p></div>
      </section>
    </section>

    <el-dialog v-model="editorVisible" :title="editingGalleryId ? '编辑图库分组' : '新建图库分组'" width="560px" :close-on-click-modal="false">
      <div class="editor-form"><label class="field"><span>图库名称 <i>*</i></span><input v-model="form.name" maxlength="100" placeholder="例如：门店环境与产品" /></label><label class="field"><span>图库说明</span><textarea v-model="form.description" maxlength="400" rows="4" placeholder="说明该分组图片的用途，方便创作时选择" /></label></div>
      <template #footer><button class="secondary-button" type="button" @click="editorVisible=false">取消</button><button class="primary-button" type="button" :disabled="saving" @click="saveGallery">{{ saving ? '保存中…' : '保存分组' }}</button></template>
    </el-dialog>

    <ArticleImageCropper
      v-if="pendingCropFile && pendingCropDimensions"
      :key="cropRequestId"
      :file="pendingCropFile"
      :dimensions="pendingCropDimensions"
      @confirm="finishGalleryCrop"
      @cancel="finishGalleryCrop(null)"
    />
  </div>
</template>

<style scoped>
.gallery-page { display: grid; max-width: 1500px; margin: 0 auto; gap: 16px; }
.page-intro,.intro-actions,.table-toolbar,.search-box,.row-actions,.group-name,.upload-bar,.upload-actions,.path-bar { display: flex; align-items: center; }
.page-intro { justify-content: space-between; gap: 24px; }
.eyebrow { display: block; margin-bottom: 5px; color: var(--color-text-muted); font-family: var(--font-mono); font-size: 10px; letter-spacing: .13em; }
h2,p { margin: 0; } h2 { color: var(--color-text); font-size: 26px; font-weight: 670; letter-spacing: -.035em; }
.page-intro p { margin-top: 5px; color: var(--color-text-secondary); font-size: 12px; line-height: 1.6; }
.intro-actions { flex: 0 0 auto; gap: 8px; }
.primary-button,.secondary-button { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; padding: 0 14px; border: 1px solid var(--color-border-strong); border-radius: 8px; cursor: pointer; gap: 7px; font: inherit; transition: .16s ease; }
.primary-button { border-color: transparent; color: #fff; background: var(--gradient-primary); box-shadow: 0 7px 18px rgba(80,88,210,.16); }
.secondary-button { color: var(--color-text-secondary); background: #fff; }
.primary-button:hover,.secondary-button:hover { transform: translateY(-1px); } button:disabled { cursor: not-allowed; opacity: .5; transform: none; }
.path-bar { min-height: 44px; padding: 0 15px; border: 1px solid #e2e6f0; border-radius: 9px; color: var(--color-text-muted); background: linear-gradient(90deg,#fff,#f7f8ff); gap: 9px; }
.path-bar button { padding: 0; border: 0; color: #646bdd; background: transparent; cursor: pointer; font: inherit; }.path-bar strong { color: var(--color-text); font-size: 12px; }.path-bar em { margin-left: auto; color: var(--color-text-muted); font-size: 11px; font-style: normal; }
.table-panel { min-height: 500px; overflow: hidden; background: #fff; }
.table-toolbar { min-height: 66px; justify-content: space-between; padding: 13px 16px; border-bottom: 1px solid var(--color-border); }.table-toolbar > span { color: var(--color-text-muted); font-size: 12px; }
.search-box { width: 330px; min-height: 38px; padding: 0 11px; border: 1px solid var(--color-border-strong); border-radius: 8px; color: var(--color-text-muted); background: #fff; gap: 8px; }.search-box:focus-within { border-color: rgba(91,99,235,.68); box-shadow: var(--shadow-focus); }.search-box input { width: 100%; min-height: 34px; border: 0; outline: 0; color: var(--color-text); background: transparent; font: inherit; }
.table-scroll { overflow-x: auto; } table { width: 100%; min-width: 920px; border-collapse: collapse; table-layout: fixed; }
th,td { height: 64px; padding: 0 16px; border-bottom: 1px solid var(--color-border); color: var(--color-text-secondary); font-size: 12px; text-align: center; vertical-align: middle; } th { height: 46px; color: var(--color-text); background: #fbfcff; font-weight: 650; } tbody tr { transition: background .14s ease; } tbody tr:hover { background: #f8faff; }
.group-table th:first-child,.group-table td:first-child { width: 29%; text-align: left; }.group-table th:nth-child(2) { width: 12%; }.group-table th:nth-child(3) { width: 27%; }.group-table th:last-child { width: 132px; }
.group-name { max-width: 100%; padding: 0; border: 0; color: inherit; background: transparent; cursor: pointer; gap: 11px; text-align: left; }.folder-mark { display: grid; width: 38px; height: 38px; flex: 0 0 auto; place-items: center; border: 1px solid #dde2fb; border-radius: 9px; color: #6878f3; background: #f2f4ff; font-size: 18px; }.group-name > span:last-child { display: grid; min-width: 0; gap: 3px; }.group-name strong,.image-info strong { overflow: hidden; color: var(--color-text); font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }.group-name small,.image-info small { overflow: hidden; color: var(--color-text-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }.metric { color: #5f65db; font-family: var(--font-mono); font-size: 17px; }.description { display: block; overflow: hidden; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.row-actions { justify-content: center; gap: 6px; }.row-actions button,.row-actions a { display: grid; width: 31px; height: 31px; padding: 0; place-items: center; border: 1px solid #6886f5; border-radius: 7px; color: #fff; background: #6886f5; cursor: pointer; text-decoration: none; transition: .15s ease; }.row-actions button:hover,.row-actions a:hover { filter: brightness(.96); transform: translateY(-1px); }.row-actions .danger { border-color: #e75d6c; background: #e75d6c; }
.detail-summary { display: grid; grid-template-columns: repeat(4,1fr); border-bottom: 1px solid var(--color-border); background: #fbfcff; }.detail-summary > div { display: grid; padding: 15px 20px; border-right: 1px solid var(--color-border); gap: 4px; }.detail-summary > div:last-child { border-right: 0; }.detail-summary span { color: var(--color-text-muted); font-size: 11px; }.detail-summary strong { color: var(--color-text); font-family: var(--font-mono); font-size: 18px; }
.upload-bar { justify-content: space-between; min-height: 82px; padding: 14px 18px; border-bottom: 1px solid var(--color-border); background: linear-gradient(90deg,#f8f9ff,#fff); gap: 18px; }.upload-copy { display: grid; min-width: 0; gap: 3px; }.upload-copy.pending { padding-left: 11px; border-left: 3px solid #f0a63a; }.upload-bar span { color: #656ddd; font-size: 10px; font-weight: 650; letter-spacing: .08em; }.upload-copy.pending span,.upload-copy.pending small { color: #bf7220; }.upload-bar strong { overflow: hidden; color: var(--color-text); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.upload-bar small { color: var(--color-text-muted); font-size: 10px; }.upload-actions { flex: 0 0 auto; gap: 8px; }
.uploaded-images { min-height: 350px; background: #fff; }.uploaded-images-heading { display: flex; min-height: 70px; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--color-border); gap: 18px; }.uploaded-images-heading h3 { margin: 0 0 4px; color: var(--color-text); font-size: 15px; }.uploaded-images-heading p { color: var(--color-text-muted); font-size: 10px; line-height: 1.55; }.uploaded-images-heading > strong { display: inline-flex; min-width: 54px; min-height: 30px; align-items: center; justify-content: center; border: 1px solid #dfe3fb; border-radius: 999px; color: #6269d8; background: #f4f5ff; font-family: var(--font-mono); font-size: 11px; }.image-grid { display: grid; padding: 18px; gap: 16px; grid-template-columns: repeat(4,minmax(0,1fr)); }.image-card { min-width: 0; overflow: hidden; border: 1px solid #e1e5ee; border-radius: 10px; background: #fff; box-shadow: 0 5px 18px rgba(20,32,61,.05); transition: border-color .16s ease,box-shadow .16s ease,transform .16s ease; }.image-card:hover { border-color: #cbd1f7; box-shadow: 0 10px 24px rgba(60,69,152,.1); transform: translateY(-2px); }.image-preview { position: relative; overflow: hidden; aspect-ratio: 4/3; background: #f2f4f9; }.image-preview > img { width: 100%; height: 100%; object-fit: cover; }.image-placeholder { display: grid; width: 100%; height: 100%; place-items: center; align-content: center; color: #7a83ec; gap: 7px; }.image-placeholder .el-icon { font-size: 28px; }.image-placeholder span { color: var(--color-text-muted); font-size: 10px; }.image-format { position: absolute; top: 9px; left: 9px; padding: 4px 7px; border-radius: 5px; color: #fff; background: rgba(20,27,50,.72); backdrop-filter: blur(4px); font-family: var(--font-mono); font-size: 9px; }.image-preview > a { position: absolute; right: 9px; bottom: 9px; display: grid; width: 30px; height: 30px; place-items: center; border-radius: 7px; color: #fff; background: rgba(20,27,50,.74); text-decoration: none; backdrop-filter: blur(4px); }.image-card-body { display: grid; padding: 12px 13px 13px; gap: 6px; }.image-card-body > strong { overflow: hidden; color: var(--color-text); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.image-card-body > p { overflow: hidden; color: var(--color-text-muted); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }.image-card-body footer { display: flex; min-height: 30px; align-items: center; justify-content: space-between; padding-top: 5px; border-top: 1px solid #eef0f5; gap: 8px; }.image-card-body footer > span { color: var(--color-text-muted); font-size: 9px; }.image-card-body footer > span.active { color: #139a72; }.delete-image { display: inline-flex; min-height: 28px; align-items: center; padding: 0 8px; border: 1px solid #efc7cd; border-radius: 6px; color: #d54d5c; background: #fff7f8; cursor: pointer; gap: 4px; font: inherit; font-size: 9px; }.delete-image:disabled { border-color: #e2e5ec; color: #a0a8b8; background: #f7f8fa; }.image-card-skeleton { display: grid; padding: 18px; gap: 16px; grid-template-columns: repeat(4,minmax(0,1fr)); }.image-card-skeleton span { aspect-ratio: 4/3; border-radius: 10px; background: linear-gradient(90deg,#f5f7fb,#eef1f8,#f5f7fb); background-size: 220% 100%; animation: shimmer 1.4s infinite; }.image-list-empty { min-height: 270px; }
.empty,.error-panel { display: grid; min-height: 340px; place-items: center; align-content: center; padding: 28px; color: var(--color-text-muted); text-align: center; gap: 8px; }.empty > .el-icon { color: #7a83ec; font-size: 32px; }.empty strong { color: var(--color-text-secondary); }.empty p { font-size: 11px; }.skeleton { display: grid; padding: 16px; gap: 8px; }.skeleton span { height: 50px; border-radius: 7px; background: linear-gradient(90deg,#f5f7fb,#eef1f8,#f5f7fb); background-size: 220% 100%; animation: shimmer 1.4s infinite; }
.editor-form { display: grid; gap: 16px; }.field { display: grid; gap: 7px; }.field > span { color: var(--color-text-secondary); font-size: 12px; }.field i { color: var(--color-danger); font-style: normal; }.field input,.field textarea { width: 100%; padding: 10px 11px; border: 1px solid var(--color-border-strong); border-radius: 8px; outline: 0; color: var(--color-text); background: #fff; font: inherit; resize: vertical; }.field input { min-height: 40px; padding-block: 0; }.field input:focus,.field textarea:focus { border-color: rgba(91,99,235,.68); box-shadow: var(--shadow-focus); }
:deep(.el-dialog) { border-radius: 10px; } @keyframes shimmer { to { background-position: -220% 0; } }
@media(max-width:1200px){.image-grid,.image-card-skeleton{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:860px){.image-grid,.image-card-skeleton{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.page-intro{align-items:flex-start;flex-direction:column}.intro-actions{width:100%;flex-wrap:wrap}.detail-summary{grid-template-columns:repeat(2,1fr)}.upload-bar{align-items:flex-start;flex-direction:column}.upload-actions{width:100%}.upload-actions button{flex:1}.image-grid,.image-card-skeleton{grid-template-columns:1fr}.uploaded-images-heading{align-items:flex-start}.uploaded-images-heading>strong{flex:0 0 auto}}
</style>
