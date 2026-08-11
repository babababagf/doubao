<script setup lang="ts">
import type { GalleryImage, GalleryInput, MerchantGallery } from '@doubaohk/api-contract'
import { Delete, FolderOpened, Picture, Plus, RefreshRight, UploadFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'

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
import { formatDateTime } from '@/utils/format'

const galleries = ref<MerchantGallery[]>([])
const images = ref<GalleryImage[]>([])
const selectedGalleryId = ref<string | null>(null)
const loading = ref(true)
const loadingImages = ref(false)
const saving = ref(false)
const uploading = ref(false)
const errorMessage = ref('')
const selectedFile = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const form = reactive<GalleryInput>({ name: '', description: '' })

const selectedGallery = computed(
  () => galleries.value.find((gallery) => gallery.id === selectedGalleryId.value) ?? null,
)

function assignForm(gallery: MerchantGallery): void {
  form.name = gallery.name
  form.description = gallery.description
}

function clearForm(): void {
  selectedGalleryId.value = null
  form.name = ''
  form.description = ''
  images.value = []
  selectedFile.value = null
}

async function loadImages(galleryId: string): Promise<void> {
  loadingImages.value = true
  try {
    images.value = await listGalleryImages(galleryId)
  } catch (error) {
    images.value = []
    ElMessage.error(error instanceof ApiError ? error.message : '图片元数据加载失败')
  } finally {
    loadingImages.value = false
  }
}

async function loadGalleries(preferredId?: string): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await listGalleries()
    galleries.value = result
    const selected = result.find((gallery) => gallery.id === (preferredId ?? selectedGalleryId.value)) ?? result[0]
    if (selected) {
      selectedGalleryId.value = selected.id
      assignForm(selected)
      await loadImages(selected.id)
    } else clearForm()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '图库加载失败'
  } finally {
    loading.value = false
  }
}

async function selectGallery(gallery: MerchantGallery): Promise<void> {
  if (gallery.id === selectedGalleryId.value) return
  selectedGalleryId.value = gallery.id
  assignForm(gallery)
  selectedFile.value = null
  await loadImages(gallery.id)
}

async function saveGallery(): Promise<void> {
  if (form.name.trim().length < 2) {
    ElMessage.warning('图库名称至少输入 2 个字符')
    return
  }

  saving.value = true
  try {
    const galleryId = selectedGalleryId.value
    const input = { name: form.name.trim(), description: form.description.trim() }
    const result = galleryId ? await updateGallery(galleryId, input) : await createGallery(input)
    await loadGalleries(result.id)
    ElMessage.success(galleryId ? '图库已更新' : '图库已创建')
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '图库保存失败')
  } finally {
    saving.value = false
  }
}

async function removeGallery(): Promise<void> {
  const gallery = selectedGallery.value
  if (!gallery || !window.confirm(`确认删除图库“${gallery.name}”及其图片元数据吗？`)) return

  saving.value = true
  try {
    await deleteGallery(gallery.id)
    await loadGalleries()
    ElMessage.success('图库已删除')
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '图库删除失败')
  } finally {
    saving.value = false
  }
}

function chooseFile(): void {
  fileInput.value?.click()
}

function handleFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  if (!file) return
  if (!file.type.startsWith('image/')) {
    ElMessage.warning('请选择图片文件')
    input.value = ''
    return
  }
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.warning('单张图片最大为 20 MB')
    input.value = ''
    return
  }
  selectedFile.value = file
}

async function addImage(): Promise<void> {
  const gallery = selectedGallery.value
  const file = selectedFile.value
  if (!gallery) {
    ElMessage.warning('请先创建或选择图库')
    return
  }
  if (!file) {
    ElMessage.warning('请先选择一张本地图片')
    return
  }

  uploading.value = true
  try {
    if (isRealApiMode) {
      const ticket = await createGalleryImageUpload(gallery.id, { fileName: file.name, mimeType: file.type, sizeBytes: file.size })
      const uploaded = await fetch(ticket.uploadUrl, { method: ticket.method, headers: ticket.headers, body: file })
      if (!uploaded.ok) throw new Error(`对象存储直传失败（HTTP ${uploaded.status}），请贴牌检查 OSS CORS 与 Bucket 权限`)
      await completeGalleryImageUpload(gallery.id, ticket.uploadId)
    } else {
      await addGalleryImageMetadata(gallery.id, {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      })
    }
    selectedFile.value = null
    if (fileInput.value) fileInput.value.value = ''
    await loadGalleries(gallery.id)
    ElMessage.success(isRealApiMode ? '图片已直传对象存储并完成校验' : '图片元数据已加入本地 Mock 图库；未上传对象存储')
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '图片元数据添加失败')
  } finally {
    uploading.value = false
  }
}

async function removeImage(imageId: string): Promise<void> {
  if (!window.confirm('确认删除该图片元数据吗？')) return

  try {
    await deleteGalleryImage(imageId)
    if (selectedGalleryId.value) await loadGalleries(selectedGalleryId.value)
    ElMessage.success('图片元数据已删除')
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '图片删除失败')
  }
}

onMounted(() => {
  void loadGalleries()
})
</script>

<template>
  <div class="gallery-page">
    <header class="page-intro">
      <div><span class="eyebrow">GALLERY ASSET INVENTORY</span><h2>企业图库</h2><p>{{ isRealApiMode ? '图片直传所属贴牌的 OSS，后端校验对象后才写入图库。' : '统一管理文章和网站可引用的真实图片素材；当前仅保存本地 Mock 元数据，尚未上传贴牌对象存储。' }}</p></div>
      <div class="intro-actions"><button class="secondary-button" type="button" :disabled="loading" @click="() => loadGalleries()"><el-icon><RefreshRight /></el-icon>刷新</button><button class="primary-button" type="button" @click="clearForm"><el-icon><Plus /></el-icon>新建图库</button></div>
    </header>

    <section class="storage-banner surface-panel"><el-icon><Picture /></el-icon><div><strong>{{ isRealApiMode ? '直传前置条件：贴牌 OSS 已测试并启用' : '图片空间 · 1.8 GB 已使用' }}</strong><p>{{ isRealApiMode ? '上传会话有效期 5 分钟；浏览器将文件直传贴牌 Bucket，平台服务器不接收图片内容。若直传失败，请贴牌检查 Bucket CORS 与最小权限。' : '空间数来自账户总览的 Mock 对象元数据；图片实际上传、压缩图、CDN 和权限将在贴牌 OSS 接口接入后启用。' }}</p></div></section>

    <section v-if="errorMessage" class="error-panel surface-panel" role="alert"><strong>图库暂时无法加载</strong><p>{{ errorMessage }}</p><button class="secondary-button" type="button" @click="() => loadGalleries()">重新加载</button></section>

    <section v-else class="gallery-workspace">
      <aside class="gallery-list-panel surface-panel">
        <header class="panel-heading"><div><span class="panel-kicker">GALLERIES</span><h3>图库集合</h3></div><span class="count-badge">{{ galleries.length }}</span></header>
        <div v-if="loading" class="skeleton-list"><span v-for="index in 4" :key="index" /></div>
        <div v-else-if="galleries.length" class="gallery-list">
          <button v-for="gallery in galleries" :key="gallery.id" class="gallery-item" :class="{ 'is-selected': gallery.id === selectedGalleryId }" type="button" @click="selectGallery(gallery)"><span class="gallery-icon"><el-icon><FolderOpened /></el-icon></span><div><strong>{{ gallery.name }}</strong><p>{{ gallery.description || '未填写图库说明' }}</p><small>{{ gallery.imageCount }} 张图片 · 更新于 {{ formatDateTime(gallery.updatedAt) }}</small></div></button>
        </div>
        <div v-else class="empty-state"><el-icon><FolderOpened /></el-icon><span>还没有图库</span></div>
      </aside>

      <section class="asset-panel surface-panel">
        <header class="editor-heading"><div><span class="panel-kicker">{{ selectedGalleryId ? 'EDIT GALLERY' : 'NEW GALLERY' }}</span><h3>{{ selectedGalleryId ? '编辑图库与图片素材' : '新建图库' }}</h3></div><div class="editor-actions"><button v-if="selectedGallery" class="compact-button danger" type="button" :disabled="saving" aria-label="删除当前图库" @click="removeGallery"><el-icon><Delete /></el-icon></button><button class="primary-button" type="button" :disabled="saving" @click="saveGallery">{{ saving ? '保存中…' : '保存图库' }}</button></div></header>
        <div class="gallery-form"><label class="field"><span>图库名称 <i>*</i></span><input v-model="form.name" maxlength="100" placeholder="例如：产品与服务场景" /></label><label class="field"><span>图库说明</span><input v-model="form.description" maxlength="400" placeholder="说明图片的来源、用途与授权边界" /></label></div>

        <template v-if="selectedGallery">
          <section class="upload-box"><input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="sr-only" @change="handleFileChange" /><div><span class="upload-label">{{ isRealApiMode ? 'OSS DIRECT UPLOAD' : 'LOCAL MOCK ASSET' }}</span><strong>{{ selectedFile ? selectedFile.name : '选择一张本地图片' }}</strong><p>{{ selectedFile ? `${selectedFile.type || '未知类型'} · ${(selectedFile.size / 1024 / 1024).toFixed(2)} MB` : (isRealApiMode ? '支持 JPEG、PNG、WebP、GIF；对象校验成功后才会进入图库。' : '仅读取文件名称、类型和大小用于验证图库流程；不会上传文件内容。') }}</p></div><div class="upload-actions"><button class="secondary-button" type="button" @click="chooseFile"><el-icon><UploadFilled /></el-icon>选择图片</button><button class="primary-button" type="button" :disabled="uploading || !selectedFile" @click="addImage">{{ uploading ? '上传中…' : (isRealApiMode ? '上传并校验' : '加入图库') }}</button></div></section>
          <div v-if="loadingImages" class="image-skeleton"><span v-for="index in 4" :key="index" /></div>
          <div v-else-if="images.length" class="image-grid"><article v-for="image in images" :key="image.id" class="image-card"><div class="image-placeholder" :data-tone="Number(image.id.replace(/\D/g, '')) % 4"><img v-if="image.url" :src="image.url" :alt="image.fileName" /><template v-else><el-icon><Picture /></el-icon><span>本地 Mock</span></template></div><div class="image-meta"><strong>{{ image.fileName }}</strong><span>{{ image.mimeType }} · {{ image.formattedSize }}</span><small>{{ formatDateTime(image.createdAt) }}</small></div><button class="compact-button danger image-delete" type="button" :aria-label="`删除${image.fileName}`" @click="removeImage(image.id)"><el-icon><Delete /></el-icon></button></article></div>
          <div v-else class="asset-empty"><el-icon><Picture /></el-icon><strong>当前图库还没有图片</strong><span>选择本地图片后即可验证图文创作的图库数量校验。</span></div>
        </template>
        <div v-else class="asset-empty"><el-icon><FolderOpened /></el-icon><strong>先保存一个图库</strong><span>图库创建后才可以加入图片元数据。</span></div>
      </section>
    </section>
  </div>
</template>

<style scoped>
.gallery-page { display:grid; max-width:1500px; margin:0 auto; gap:16px }.page-intro,.intro-actions,.storage-banner,.panel-heading,.editor-heading,.editor-actions,.upload-box,.upload-actions,.gallery-item,.image-meta { display:flex; align-items:center }.page-intro{justify-content:space-between;gap:24px}.eyebrow,.panel-kicker,.upload-label{display:block;color:var(--color-champagne);font-family:var(--font-mono);font-size:10px;letter-spacing:.13em}.eyebrow{margin-bottom:5px}h2,h3,p{margin:0}h2{font-size:26px;font-weight:670;letter-spacing:-.035em}.page-intro p{margin-top:5px;color:var(--color-text-secondary)}.intro-actions{gap:9px}.secondary-button,.primary-button,.compact-button{display:inline-flex;min-height:38px;align-items:center;justify-content:center;padding:0 14px;border:1px solid var(--color-border-strong);border-radius:8px;color:var(--color-text-secondary);background:rgba(13,28,52,.68);cursor:pointer;gap:7px;transition:.16s ease}.primary-button{border-color:rgba(113,111,255,.62);color:#fff;background:var(--gradient-primary);box-shadow:0 8px 22px rgba(72,73,194,.18)}.compact-button{width:38px;padding:0}.danger{color:#e77d8e;border-color:rgba(251,113,133,.22);background:rgba(251,113,133,.05)}.secondary-button:hover,.primary-button:hover,.compact-button:hover{border-color:rgba(126,137,255,.7);color:#fff}.secondary-button:disabled,.primary-button:disabled,.compact-button:disabled{cursor:not-allowed;opacity:.5}.storage-banner{padding:14px 17px;border-color:rgba(66,201,223,.22);gap:11px}.storage-banner>.el-icon{color:#68d5e9;font-size:20px}.storage-banner strong{font-size:13px}.storage-banner p{margin-top:2px;color:var(--color-text-muted);font-size:12px}.gallery-workspace{display:grid;grid-template-columns:minmax(320px,.68fr) minmax(0,1.72fr);align-items:start;gap:16px}.gallery-list-panel,.asset-panel{min-width:0;padding:22px}.panel-heading,.editor-heading{justify-content:space-between;padding-bottom:16px;border-bottom:1px solid var(--color-border);gap:16px}.panel-kicker{margin-bottom:4px;color:var(--color-text-muted)}h3{font-size:17px;font-weight:650}.count-badge{display:grid;width:28px;height:28px;place-items:center;border:1px solid rgba(111,121,255,.38);border-radius:50%;color:#bbc3ff;background:rgba(91,99,255,.13);font-family:var(--font-mono);font-size:11px}.gallery-list{display:grid;margin-top:14px;gap:8px}.gallery-item{width:100%;align-items:flex-start;padding:13px 12px;border:1px solid rgba(145,168,205,.14);border-radius:9px;color:inherit;background:rgba(9,22,42,.34);cursor:pointer;text-align:left;gap:10px;transition:.16s ease}.gallery-item:hover,.gallery-item.is-selected{border-color:rgba(112,124,255,.5);background:rgba(70,83,174,.13)}.gallery-icon{display:grid;width:36px;height:36px;flex:0 0 auto;place-items:center;border-radius:9px;color:#9b9eff;background:rgba(95,85,222,.12)}.gallery-item>div{min-width:0}.gallery-item strong,.gallery-item p,.gallery-item small{display:block}.gallery-item strong{overflow:hidden;font-size:13px;font-weight:570;text-overflow:ellipsis;white-space:nowrap}.gallery-item p{display:-webkit-box;overflow:hidden;margin-top:3px;color:var(--color-text-muted);font-size:11px;line-height:1.45;-webkit-box-orient:vertical;-webkit-line-clamp:2}.gallery-item small{margin-top:7px;color:#718097;font-family:var(--font-mono);font-size:10px}.gallery-form{display:grid;grid-template-columns:1fr 1.4fr;padding-top:19px;gap:14px}.field{display:grid;gap:7px}.field>span{color:var(--color-text-secondary);font-size:12px}.field i{color:var(--color-danger);font-style:normal}input{width:100%;min-height:40px;padding:0 12px;border:1px solid rgba(145,168,205,.25);border-radius:8px;outline:none;color:var(--color-text);background:rgba(4,15,31,.48);font:inherit}input:focus{border-color:rgba(115,125,255,.76);box-shadow:var(--shadow-focus)}.upload-box{justify-content:space-between;margin-top:18px;padding:14px 15px;border:1px solid rgba(124,102,255,.27);border-radius:10px;background:linear-gradient(100deg,rgba(84,73,201,.13),rgba(10,27,51,.4));gap:16px}.upload-box strong{display:block;margin-top:4px;font-size:13px}.upload-box p{margin-top:4px;color:var(--color-text-muted);font-size:11px}.upload-actions{flex:0 0 auto;gap:8px}.image-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:16px;gap:12px}.image-card{position:relative;overflow:hidden;border:1px solid rgba(145,168,205,.16);border-radius:10px;background:rgba(9,22,42,.34)}.image-placeholder{display:grid;min-height:124px;place-items:center;align-content:center;color:#91a8e6;background:radial-gradient(circle at 25% 20%,rgba(86,124,255,.32),rgba(13,34,69,.7));gap:7px}.image-placeholder[data-tone='1']{color:#a69aff;background:radial-gradient(circle at 70% 25%,rgba(139,100,255,.3),rgba(23,22,72,.72))}.image-placeholder[data-tone='2']{color:#65d8c0;background:radial-gradient(circle at 30% 30%,rgba(36,210,161,.26),rgba(12,55,63,.72))}.image-placeholder[data-tone='3']{color:#e7b569;background:radial-gradient(circle at 70% 25%,rgba(229,174,87,.25),rgba(61,42,18,.75))}.image-placeholder .el-icon{font-size:28px}.image-placeholder span{font-family:var(--font-mono);font-size:10px}.image-meta{align-items:flex-start;flex-direction:column;padding:10px;gap:3px}.image-meta strong,.image-meta span{overflow:hidden;max-width:100%;text-overflow:ellipsis;white-space:nowrap}.image-meta strong{font-size:11px;font-weight:570}.image-meta span,.image-meta small{color:var(--color-text-muted);font-size:10px}.image-delete{position:absolute;top:7px;right:7px;width:30px;min-height:30px}.asset-empty,.empty-state{display:grid;min-height:290px;place-items:center;align-content:center;color:var(--color-text-muted);text-align:center;gap:8px}.asset-empty .el-icon,.empty-state .el-icon{color:#909dff;font-size:30px}.asset-empty strong{color:var(--color-text-secondary);font-size:14px}.asset-empty span{font-size:12px}.image-skeleton,.skeleton-list{display:grid;margin-top:15px;gap:9px}.image-skeleton{grid-template-columns:repeat(3,1fr)}.image-skeleton span{height:190px}.skeleton-list span{height:78px}.image-skeleton span,.skeleton-list span{display:block;border-radius:9px;background:linear-gradient(90deg,rgba(120,143,182,.08),rgba(120,143,182,.18),rgba(120,143,182,.08));background-size:220% 100%;animation:shimmer 1.4s ease-in-out infinite}.error-panel{display:grid;min-height:230px;place-items:center;align-content:center;padding:30px;text-align:center;gap:8px}.error-panel p{color:var(--color-text-muted)}@keyframes shimmer{to{background-position:-220% 0}}@media(max-width:1050px){.gallery-workspace{grid-template-columns:1fr}.gallery-list{grid-template-columns:repeat(2,minmax(0,1fr))}.gallery-form{grid-template-columns:1fr 1fr}}@media(max-width:680px){.page-intro{align-items:flex-start;flex-direction:column}.intro-actions{width:100%}.intro-actions button{flex:1}.gallery-list{grid-template-columns:1fr}.gallery-form{grid-template-columns:1fr}.upload-box{align-items:flex-start;flex-direction:column}.upload-actions{width:100%}.upload-actions button{flex:1}.image-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.image-placeholder img{width:100%;height:124px;object-fit:cover;display:block}
</style>
