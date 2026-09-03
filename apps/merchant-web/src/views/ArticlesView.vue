<script setup lang="ts">
import type { ArticleGroup, ArticleInput, GalleryImage, MerchantArticle, MerchantGallery } from '@doubaohk/api-contract'
import { ArrowLeft, Delete, DocumentAdd, EditPen, FolderOpened, Picture, Plus, RefreshRight, Search, View } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import ArticleImageCropper from '@/components/ArticleImageCropper.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import { ApiError, isRealApiMode } from '@/services/http'
import { addGalleryImageMetadata, completeGalleryImageUpload, createArticle, createGalleryImageUpload, deleteArticle, listArticleGroups, listArticles, listGalleries, listGalleryImages, updateArticle, updateArticleGroup } from '@/services/merchant.service'
import { CENTERED_ARTICLE_CROP, inspectArticleImage, isArticleImageAspectRatio, normalizeArticleImage, type ArticleCropSelection, type ImageDimensions } from '@/utils/article-image'
import { formatDateTime } from '@/utils/format'

type RichTextEditorHandle = {
  cancelPendingImagePaste: () => void
  insertUploadedImages: (images: Array<{ url: string; alt: string }>) => void
}

const MAX_ARTICLE_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_ARTICLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png'])

const router = useRouter()
const groups = ref<ArticleGroup[]>([])
const articles = ref<MerchantArticle[]>([])
const selectedGroup = ref<ArticleGroup | null>(null)
const loading = ref(true)
const loadingArticles = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const search = ref('')
const articleSearch = ref('')
const groupPage = ref(1)
const articlePage = ref(1)
const pageSize = 10
const editorVisible = ref(false)
const renameVisible = ref(false)
const renamingGroup = ref<ArticleGroup | null>(null)
const editingArticleId = ref<string | null>(null)
const renameForm = reactive({ name: '' })
const galleries = ref<MerchantGallery[]>([])
const galleryImages = ref<GalleryImage[]>([])
const loadingImages = ref(false)
const pastingImages = ref(false)
const richTextEditor = ref<RichTextEditorHandle | null>(null)
const pendingCropFile = ref<File | null>(null)
const pendingCropDimensions = ref<ImageDimensions | null>(null)
const cropRequestId = ref(0)
let resolvePendingCrop: ((selection: ArticleCropSelection | null) => void) | null = null
const form = reactive<ArticleInput>({ title: '', content: '', status: 'draft', articleGroupId: null, galleryId: null, coverImageId: null, galleryImageIds: [] })

const filteredGroups = computed(() => {
  const keyword = search.value.trim().toLocaleLowerCase('zh-CN')
  return keyword ? groups.value.filter((group) => group.name.toLocaleLowerCase('zh-CN').includes(keyword)) : groups.value
})
const pagedGroups = computed(() => filteredGroups.value.slice((groupPage.value - 1) * pageSize, groupPage.value * pageSize))
const groupPageCount = computed(() => Math.max(1, Math.ceil(filteredGroups.value.length / pageSize)))
const filteredArticles = computed(() => {
  const keyword = articleSearch.value.trim().toLocaleLowerCase('zh-CN')
  if (!keyword) return articles.value
  return articles.value.filter((article) => `${article.title}\n${contentText(article.content)}`.toLocaleLowerCase('zh-CN').includes(keyword))
})
const pagedArticles = computed(() => filteredArticles.value.slice((articlePage.value - 1) * pageSize, articlePage.value * pageSize))
const articlePageCount = computed(() => Math.max(1, Math.ceil(filteredArticles.value.length / pageSize)))
const selectedGallery = computed(() => galleries.value.find((gallery) => gallery.id === form.galleryId) ?? null)
const selectedCoverImage = computed(() => galleryImages.value.find((image) => image.id === form.coverImageId) ?? null)

function contentText(content: string): string {
  const node = document.createElement('div')
  node.innerHTML = content
  return (node.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function sourceLabel(source: MerchantArticle['source']): string {
  return source === 'ai_generated' ? 'AI 生成' : source === 'ai_mock' ? 'AI 草稿' : '手动新增'
}

function statusLabel(status: MerchantArticle['status']): string {
  if (status === 'publishable') return '可发布'
  if (status === 'disabled') return '已停用'
  return '草稿'
}

function groupStatus(group: ArticleGroup): string {
  if (group.status === 'running') return '生成中'
  if (group.status === 'completed') return '已完成'
  if (group.status === 'partial') return '部分完成'
  return '生成失败'
}

function groupProgress(group: ArticleGroup): number {
  return group.requestedCount > 0 ? Math.min(100, Math.round(group.completedCount / group.requestedCount * 100)) : 0
}

async function loadGroups(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    groups.value = await listArticleGroups()
    if (groupPage.value > groupPageCount.value) groupPage.value = groupPageCount.value
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '文章分组加载失败'
  } finally {
    loading.value = false
  }
}

async function openGroup(group: ArticleGroup): Promise<void> {
  selectedGroup.value = group
  articleSearch.value = ''
  articlePage.value = 1
  loadingArticles.value = true
  errorMessage.value = ''
  try {
    articles.value = await listArticles(group.id)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '分组文章加载失败'
  } finally {
    loadingArticles.value = false
  }
}

function backToGroups(): void {
  selectedGroup.value = null
  articles.value = []
  editorVisible.value = false
  void loadGroups()
}

function resetForm(groupId: string | null): void {
  editingArticleId.value = null
  form.title = ''
  form.content = ''
  form.status = 'draft'
  form.articleGroupId = groupId === 'ungrouped' ? null : groupId
  form.galleryId = null
  form.coverImageId = null
  form.galleryImageIds = []
  galleryImages.value = []
}

function createManualArticle(): void {
  resetForm(selectedGroup.value?.id ?? null)
  editorVisible.value = true
}

function editArticle(article: MerchantArticle): void {
  editingArticleId.value = article.id
  form.title = article.title
  form.content = article.content
  form.status = article.status === 'pending_review' ? 'draft' : article.status
  form.articleGroupId = article.articleGroupId
  form.galleryId = article.galleryId
  form.coverImageId = article.coverImageId
  form.galleryImageIds = [...article.galleryImageIds]
  editorVisible.value = true
  void loadGalleryImages(article.galleryId)
}

async function loadGalleryImages(galleryId: string | null): Promise<void> {
  if (!galleryId) {
    galleryImages.value = []
    form.coverImageId = null
    form.galleryImageIds = []
    return
  }
  loadingImages.value = true
  const requestedId = galleryId
  try {
    const result = await listGalleryImages(galleryId)
    if (form.galleryId !== requestedId) return
    galleryImages.value = result
    const ids = new Set(result.map((image) => image.id))
    if (form.coverImageId && !ids.has(form.coverImageId)) form.coverImageId = null
    form.galleryImageIds = form.galleryImageIds.filter((id) => ids.has(id))
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '图库图片加载失败')
  } finally {
    if (form.galleryId === requestedId) loadingImages.value = false
  }
}

function handleGalleryChange(): void {
  form.coverImageId = null
  form.galleryImageIds = []
  void loadGalleryImages(form.galleryId)
}

function selectCover(imageId: string): void {
  form.coverImageId = form.coverImageId === imageId ? null : imageId
}

function toggleImage(imageId: string): void {
  const index = form.galleryImageIds.indexOf(imageId)
  if (index >= 0) {
    form.galleryImageIds.splice(index, 1)
  } else if (form.galleryImageIds.length >= 3) {
    ElMessage.warning('每篇文章最多选择 3 张配图')
  } else {
    form.galleryImageIds.push(imageId)
  }
}

function handleImagePasteBlocked(): void {
  ElMessage.warning('未读取到可上传的图片文件，请单独复制图片后再粘贴；网页中的远程图片不会直接写入正文')
}

function articleImageFileName(file: File, index: number): string {
  const extension = file.type === 'image/png' ? 'png' : 'jpg'
  const baseName = file.name.replace(/\.(?:jpe?g|png)$/i, '').trim()
  return `${baseName && baseName !== 'image' ? baseName : '文章配图'}-${Date.now()}-${index + 1}.${extension}`
}

function requestArticleCrop(file: File, dimensions: ImageDimensions): Promise<ArticleCropSelection | null> {
  if (resolvePendingCrop) resolvePendingCrop(null)
  pendingCropFile.value = file
  pendingCropDimensions.value = dimensions
  cropRequestId.value += 1
  return new Promise((resolve) => {
    resolvePendingCrop = resolve
  })
}

function finishArticleCrop(selection: ArticleCropSelection | null): void {
  const resolve = resolvePendingCrop
  resolvePendingCrop = null
  pendingCropFile.value = null
  pendingCropDimensions.value = null
  resolve?.(selection)
}

async function validateArticleImage(file: File): Promise<ImageDimensions> {
  if (!ALLOWED_ARTICLE_IMAGE_TYPES.has(file.type)) throw new Error('文章图片仅支持 JPG / PNG 格式')
  if (file.size <= 0) throw new Error('图片文件为空，请重新选择图片')
  if (file.size > MAX_ARTICLE_IMAGE_BYTES) throw new Error('单张图片不能超过 5 MB')
  try {
    return await inspectArticleImage(file)
  } catch {
    throw new Error('图片文件无法读取，请重新选择有效的 JPG 或 PNG 图片')
  }
}

async function prepareArticleImage(file: File): Promise<File | null> {
  const dimensions = await validateArticleImage(file)
  const selection = isArticleImageAspectRatio(dimensions)
    ? CENTERED_ARTICLE_CROP
    : await requestArticleCrop(file, dimensions)
  if (!selection) return null
  const normalized = await normalizeArticleImage(file, dimensions, selection)
  if (normalized.size > MAX_ARTICLE_IMAGE_BYTES) throw new Error('裁剪后的图片仍超过 5 MB，请更换图片后重试')
  return normalized
}

async function uploadArticleImage(galleryId: string, file: File, index: number): Promise<GalleryImage> {
  const input = {
    fileName: articleImageFileName(file, index),
    mimeType: file.type,
    sizeBytes: file.size,
    purpose: 'article' as const,
  }
  if (!isRealApiMode) return addGalleryImageMetadata(galleryId, input)

  const ticket = await createGalleryImageUpload(galleryId, input)
  const response = await fetch(ticket.uploadUrl, { method: ticket.method, headers: ticket.headers, body: file })
  if (!response.ok) throw new Error(`对象存储直传失败（HTTP ${response.status}），请贴牌检查 OSS CORS 与 Bucket 权限`)
  return completeGalleryImageUpload(galleryId, ticket.uploadId)
}

async function handleArticleImages(files: File[]): Promise<void> {
  const galleryId = form.galleryId
  if (!galleryId) {
    richTextEditor.value?.cancelPendingImagePaste()
    ElMessage.warning('请先在下方选择企业图库，再上传、粘贴或拖入图片')
    return
  }
  const availableSlots = Math.max(0, 3 - form.galleryImageIds.length)
  if (!availableSlots) {
    richTextEditor.value?.cancelPendingImagePaste()
    ElMessage.warning('每篇文章最多关联 3 张正文配图，请先移除一张再粘贴')
    return
  }

  const selectedFiles = files.slice(0, availableSlots)
  if (files.length > availableSlots) ElMessage.warning(`本次只上传前 ${availableSlots} 张，正文配图最多 3 张`)
  pastingImages.value = true
  const uploadedImages: GalleryImage[] = []
  let failureMessage = ''
  let cropCancelled = false
  try {
    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index]
      if (!file) continue
      try {
        const normalized = await prepareArticleImage(file)
        if (!normalized) {
          cropCancelled = true
          break
        }
        uploadedImages.push(await uploadArticleImage(galleryId, normalized, index))
      } catch (error) {
        failureMessage = error instanceof Error ? error.message : '文章图片上传失败'
        break
      }
    }

    if (uploadedImages.length) {
      const knownIds = new Set(galleryImages.value.map((image) => image.id))
      galleryImages.value = [...uploadedImages.filter((image) => !knownIds.has(image.id)), ...galleryImages.value]
      for (const image of uploadedImages) {
        if (!form.galleryImageIds.includes(image.id)) form.galleryImageIds.push(image.id)
      }
      const insertable = uploadedImages
        .filter((image): image is GalleryImage & { url: string } => Boolean(image.url))
        .map((image) => ({ url: image.url, alt: image.fileName }))
      if (insertable.length) richTextEditor.value?.insertUploadedImages(insertable)
      else richTextEditor.value?.cancelPendingImagePaste()
      galleries.value = galleries.value.map((gallery) => gallery.id === galleryId
        ? { ...gallery, imageCount: gallery.imageCount + uploadedImages.length }
        : gallery)
    }

    if (!uploadedImages.length) richTextEditor.value?.cancelPendingImagePaste()
    if (failureMessage) {
      ElMessage.error(uploadedImages.length ? `已成功上传 ${uploadedImages.length} 张，后续图片失败：${failureMessage}` : failureMessage)
    } else if (cropCancelled) {
      ElMessage.info(uploadedImages.length ? `已上传 ${uploadedImages.length} 张，后续裁剪已取消` : '已取消图片裁剪')
    } else if (uploadedImages.length) {
      const insertedCount = uploadedImages.filter((image) => Boolean(image.url)).length
      ElMessage.success(insertedCount
        ? `${insertedCount} 张图片已统一为 1600×1200、插入正文并关联发布`
        : `${uploadedImages.length} 张图片已统一尺寸并加入图库；当前模式未返回预览地址`)
    }
  } finally {
    pastingImages.value = false
  }
}

async function saveArticle(): Promise<void> {
  if (pastingImages.value) {
    ElMessage.warning('图片仍在上传，请稍候再保存文章')
    return
  }
  if (form.title.trim().length < 2 || contentText(form.content).length < 20) {
    ElMessage.warning('文章标题至少 2 个字符，正文至少 20 个字符')
    return
  }
  saving.value = true
  try {
    const input: ArticleInput = { title: form.title.trim(), content: form.content.trim(), status: form.status, articleGroupId: form.articleGroupId, galleryId: form.galleryId, coverImageId: form.coverImageId, galleryImageIds: [...form.galleryImageIds] }
    if (editingArticleId.value) await updateArticle(editingArticleId.value, input)
    else await createArticle(input)
    editorVisible.value = false
    ElMessage.success(editingArticleId.value ? '文章已更新并保留新版本' : '手动文章已创建')
    if (selectedGroup.value) await openGroup(selectedGroup.value)
    else await loadGroups()
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '文章保存失败')
  } finally {
    saving.value = false
  }
}

async function removeArticle(article: MerchantArticle): Promise<void> {
  if (!window.confirm(`确认删除文章“${article.title}”吗？`)) return
  try {
    await deleteArticle(article.id)
    ElMessage.success('文章已删除')
    if (selectedGroup.value) await openGroup(selectedGroup.value)
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '文章删除失败')
  }
}

function openRename(group: ArticleGroup): void {
  if (group.isUngrouped) return
  renamingGroup.value = group
  renameForm.name = group.name
  renameVisible.value = true
}

async function saveGroupName(): Promise<void> {
  const group = renamingGroup.value
  const name = renameForm.name.trim()
  if (!group || group.isUngrouped || !name || name.length > 100) {
    ElMessage.warning('分组名称为 1 到 100 个字符')
    return
  }
  saving.value = true
  try {
    await updateArticleGroup(group.id, { name })
    renameVisible.value = false
    renamingGroup.value = null
    await loadGroups()
    ElMessage.success('分组名称已更新')
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '分组名称保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => { void Promise.all([loadGroups(), listGalleries().then((result) => { galleries.value = result })]) })
</script>

<template>
  <div class="articles-page">
    <header class="page-intro">
      <div><h2>{{ selectedGroup ? selectedGroup.name : '文章列表' }}</h2><p>{{ selectedGroup ? '查看这个分组已生成的文章，可继续编辑标题、正文和配图。' : '按写作任务查看文章分组，快速了解已完成和待处理数量。' }}</p></div>
      <div class="intro-actions">
        <button v-if="selectedGroup" class="secondary-button" type="button" @click="backToGroups"><el-icon><ArrowLeft /></el-icon>返回分组</button>
        <button class="secondary-button" type="button" :disabled="loading || loadingArticles" @click="selectedGroup ? openGroup(selectedGroup) : loadGroups()"><el-icon><RefreshRight /></el-icon>刷新</button>
        <button v-if="selectedGroup" class="secondary-button" type="button" @click="createManualArticle"><el-icon><Plus /></el-icon>添加文章</button>
        <button class="primary-button" type="button" @click="router.push({ name: 'content-create' })"><el-icon><DocumentAdd /></el-icon>创建 AI 写作</button>
      </div>
    </header>

    <section v-if="errorMessage" class="error-panel surface-panel"><strong>数据暂时无法加载</strong><p>{{ errorMessage }}</p></section>

    <section v-else-if="!selectedGroup" class="table-panel surface-panel">
      <div class="table-toolbar"><div class="search-box"><el-icon><Search /></el-icon><input v-model="search" placeholder="搜索分组名" @input="groupPage=1" /></div><span>共 {{ filteredGroups.length }} 个分组</span></div>
      <div v-if="loading" class="skeleton"><span v-for="index in 5" :key="index" /></div>
      <div v-else-if="pagedGroups.length" class="table-scroll">
        <table><thead><tr><th>分组名称</th><th>已提交 AI</th><th>已完成文章</th><th>完成进度</th><th>创建时间</th><th>操作</th></tr></thead>
          <tbody><tr v-for="group in pagedGroups" :key="group.id"><td><button class="group-name" type="button" @click="openGroup(group)"><el-icon><FolderOpened /></el-icon><span><strong>{{ group.name }}</strong><small>{{ groupStatus(group) }}</small></span></button></td><td><b class="metric">{{ group.requestedCount }}</b> 篇</td><td><b class="metric completed">{{ group.completedCount }}</b> 篇</td><td><div class="progress-cell"><span><i :style="{ width: `${groupProgress(group)}%` }" /></span><small>{{ groupProgress(group) }}%</small></div></td><td>{{ group.isUngrouped ? '历史及手动文章' : formatDateTime(group.createdAt) }}</td><td><div class="row-actions"><button type="button" title="查看文章" @click="openGroup(group)"><el-icon><View /></el-icon></button><button v-if="!group.isUngrouped" type="button" title="修改分组名" @click="openRename(group)"><el-icon><EditPen /></el-icon></button></div></td></tr></tbody>
        </table>
      </div>
      <div v-else class="empty"><el-icon><FolderOpened /></el-icon><strong>还没有文章分组</strong><p>从“创建 AI 写作”提交首个任务后，分组会自动出现在这里。</p></div>
      <footer v-if="filteredGroups.length > pageSize" class="pagination"><button :disabled="groupPage===1" @click="groupPage--">上一页</button><span>{{ groupPage }} / {{ groupPageCount }}</span><button :disabled="groupPage===groupPageCount" @click="groupPage++">下一页</button></footer>
    </section>

    <section v-else class="table-panel surface-panel">
      <div class="group-summary"><div><span>已提交 AI</span><strong>{{ selectedGroup.requestedCount }}</strong></div><div><span>已完成文章</span><strong>{{ selectedGroup.completedCount }}</strong></div><div><span>当前状态</span><strong>{{ groupStatus(selectedGroup) }}</strong></div><div><span>完成率</span><strong>{{ groupProgress(selectedGroup) }}%</strong></div></div>
      <div class="table-toolbar"><div class="search-box"><el-icon><Search /></el-icon><input v-model="articleSearch" placeholder="搜索标题或正文" @input="articlePage=1" /></div><span>共 {{ filteredArticles.length }} 篇文章</span></div>
      <div v-if="loadingArticles" class="skeleton"><span v-for="index in 5" :key="index" /></div>
      <div v-else-if="pagedArticles.length" class="table-scroll"><table><thead><tr><th>文章标题</th><th>来源</th><th>版本</th><th>状态</th><th>配图</th><th>更新时间</th><th>操作</th></tr></thead>
        <tbody><tr v-for="article in pagedArticles" :key="article.id"><td><button class="article-title" type="button" @click="editArticle(article)">{{ article.title }}</button></td><td><span :class="['tag', article.source]">{{ sourceLabel(article.source) }}</span></td><td>V{{ article.currentVersion }}</td><td><span :class="['tag', article.status]">{{ statusLabel(article.status) }}</span></td><td>{{ article.coverImageId ? '有封面 · ' : '' }}{{ article.imageCount }} 张配图</td><td>{{ formatDateTime(article.updatedAt) }}</td><td><div class="row-actions"><button type="button" title="编辑文章" @click="editArticle(article)"><el-icon><EditPen /></el-icon></button><button class="danger" type="button" title="删除文章" @click="removeArticle(article)"><el-icon><Delete /></el-icon></button></div></td></tr></tbody>
      </table></div>
      <div v-else class="empty"><el-icon><DocumentAdd /></el-icon><strong>该分组暂时没有已完成文章</strong><p>AI 生成成功后会直接入库，无需人工审核。</p></div>
      <footer v-if="filteredArticles.length > pageSize" class="pagination"><button :disabled="articlePage===1" @click="articlePage--">上一页</button><span>{{ articlePage }} / {{ articlePageCount }}</span><button :disabled="articlePage===articlePageCount" @click="articlePage++">下一页</button></footer>
    </section>

    <el-dialog v-model="renameVisible" title="修改分组名称" width="520px" :close-on-click-modal="false"><label class="field"><span>分组名称</span><input v-model="renameForm.name" maxlength="100" /></label><template #footer><button class="secondary-button" type="button" @click="renameVisible=false">取消</button><button class="primary-button" type="button" :disabled="saving" @click="saveGroupName">保存</button></template></el-dialog>

    <el-dialog v-model="editorVisible" :title="editingArticleId ? '编辑文章' : '添加文章'" width="min(1120px, 86vw)" top="4vh" :close-on-click-modal="false" :close-on-press-escape="!pastingImages" :show-close="!pastingImages" class="article-editor-dialog">
      <div class="editor-form"><label class="field"><span>文章标题 <i>*</i></span><input v-model="form.title" maxlength="150" placeholder="输入文章标题" /></label><div class="field"><span>正文 <i>*</i></span><RichTextEditor ref="richTextEditor" v-model="form.content" :disabled="saving || pastingImages" placeholder="输入文章正文；选择企业图库后，可上传、粘贴或直接拖入 JPG / PNG 图片" @paste-images="handleArticleImages" @select-images="handleArticleImages" @image-paste-blocked="handleImagePasteBlocked" /><small v-if="pastingImages" class="paste-uploading"><span />图片正在裁剪或上传到当前企业图库，请稍候…</small></div>
        <section class="asset-picker">
          <div class="asset-heading"><div><strong>封面与文章配图</strong><p>封面独立保存；正文配图可选 0–3 张，同一图片可以同时作为封面和正文配图。</p></div><span>{{ form.galleryImageIds.length }} / 3</span></div>
          <label class="field"><span>素材图库</span><select v-model="form.galleryId" :disabled="saving" @change="handleGalleryChange"><option :value="null">不使用图片</option><option v-for="gallery in galleries" :key="gallery.id" :value="gallery.id">{{ gallery.name }} · {{ gallery.imageCount }} 张</option></select></label>
          <div v-if="loadingImages" class="asset-loading">图库加载中…</div>
          <template v-else-if="galleryImages.length">
            <div class="cover-section">
              <div class="cover-heading"><div><strong>封面图</strong><p>单击右侧图片设为封面，再次单击可取消。</p></div><button v-if="form.coverImageId" type="button" @click="form.coverImageId=null">清除封面</button></div>
              <div class="cover-layout">
                <div class="cover-preview" :class="{ empty: !selectedCoverImage }"><img v-if="selectedCoverImage?.url" :src="selectedCoverImage.url" :alt="selectedCoverImage.fileName" /><el-icon v-else><Picture /></el-icon><span>{{ selectedCoverImage?.fileName || '暂未设置封面' }}</span></div>
                <div class="cover-options"><button v-for="image in galleryImages" :key="`cover-${image.id}`" :class="{ selected: form.coverImageId === image.id }" type="button" :aria-label="`设为封面：${image.fileName}`" @click="selectCover(image.id)"><img v-if="image.url" :src="image.url" :alt="image.fileName" /><el-icon v-else><Picture /></el-icon><small>{{ image.fileName }}</small></button></div>
              </div>
            </div>
            <div class="body-image-section"><div class="cover-heading"><div><strong>正文配图</strong><p>选择后写入文章版本，发布助手按顺序读取。</p></div><span>{{ form.galleryImageIds.length }} / 3</span></div><div class="asset-grid"><button v-for="image in galleryImages" :key="image.id" :class="{ selected: form.galleryImageIds.includes(image.id) }" type="button" @click="toggleImage(image.id)"><span><img v-if="image.url" :src="image.url" :alt="image.fileName" /><el-icon v-else><Picture /></el-icon></span><small>{{ image.fileName }}</small></button></div></div>
          </template>
          <p v-else class="asset-empty">{{ selectedGallery ? '当前图库没有可用图片' : '不使用图库时文章保存为无图文章' }}</p>
        </section>
        <label class="field compact-field"><span>文章状态</span><select v-model="form.status"><option value="draft">草稿</option><option value="publishable">可发布</option><option value="disabled">停用</option></select><small>AI 成功文章默认可发布；这里不设置人工审核流程。</small></label>
      </div>
      <template #footer><button class="secondary-button" type="button" :disabled="saving || pastingImages" @click="editorVisible=false">取消</button><button class="primary-button" type="button" :disabled="saving || pastingImages" @click="saveArticle">{{ pastingImages ? '图片上传中…' : saving ? '保存中…' : '保存文章' }}</button></template>
    </el-dialog>

    <ArticleImageCropper
      v-if="pendingCropFile && pendingCropDimensions"
      :key="cropRequestId"
      :file="pendingCropFile"
      :dimensions="pendingCropDimensions"
      @confirm="finishArticleCrop"
      @cancel="finishArticleCrop(null)"
    />
  </div>
</template>

<style scoped>
.articles-page { display: grid; max-width: 1500px; margin: 0 auto; gap: 16px; }
.page-intro,.intro-actions,.table-toolbar,.search-box,.row-actions,.group-summary,.asset-heading { display: flex; align-items: center; }
.page-intro { justify-content: space-between; gap: 24px; }
.eyebrow { display: block; margin-bottom: 5px; color: var(--color-text-muted); font-family: var(--font-mono); font-size: 10px; letter-spacing: .13em; }
h2,p { margin: 0; } h2 { color: var(--color-text); font-size: 26px; font-weight: 670; letter-spacing: -.035em; }
.page-intro p { max-width: 780px; margin-top: 5px; color: var(--color-text-secondary); font-size: 12px; line-height: 1.6; }
.intro-actions { flex: 0 0 auto; gap: 8px; }
.primary-button,.secondary-button { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; padding: 0 14px; border: 1px solid var(--color-border-strong); border-radius: 8px; cursor: pointer; gap: 7px; font: inherit; transition: .16s ease; }
.primary-button { border-color: transparent; color: #fff; background: var(--gradient-primary); box-shadow: 0 7px 18px rgba(80,88,210,.16); }
.secondary-button { color: var(--color-text-secondary); background: #fff; }
.primary-button:hover,.secondary-button:hover { transform: translateY(-1px); }
button:disabled { cursor: not-allowed; opacity: .5; transform: none; }
.table-panel { min-height: 500px; overflow: hidden; background: #fff; }
.table-toolbar { min-height: 66px; justify-content: space-between; padding: 13px 16px; border-bottom: 1px solid var(--color-border); }
.table-toolbar > span { color: var(--color-text-muted); font-size: 12px; }
.search-box { width: 310px; min-height: 38px; padding: 0 11px; border: 1px solid var(--color-border-strong); border-radius: 8px; color: var(--color-text-muted); background: #fff; gap: 8px; transition: border-color .16s ease,box-shadow .16s ease; }
.search-box:focus-within { border-color: rgba(91,99,235,.68); box-shadow: var(--shadow-focus); }
.search-box input { width: 100%; min-height: 34px; border: 0; outline: 0; color: var(--color-text); background: transparent; font: inherit; }
.table-scroll { overflow-x: auto; }
table { width: 100%; min-width: 1080px; border-collapse: collapse; table-layout: fixed; }
th,td { height: 58px; padding: 0 16px; border-bottom: 1px solid var(--color-border); color: var(--color-text-secondary); font-size: 12px; text-align: center; vertical-align: middle; }
th { height: 46px; color: var(--color-text); background: #fbfcff; font-size: 12px; font-weight: 650; }
th:first-child,td:first-child { width: 30%; text-align: left; } th:last-child { width: 106px; }
tbody tr { transition: background .14s ease; } tbody tr:hover { background: #f8faff; }
.group-name { display: flex; max-width: 100%; align-items: center; padding: 0; border: 0; color: var(--color-text); background: transparent; cursor: pointer; gap: 10px; text-align: left; }
.group-name > .el-icon { flex: 0 0 auto; color: #6878f3; font-size: 19px; }
.group-name span { display: grid; min-width: 0; gap: 3px; }
.group-name strong,.article-title { overflow: hidden; color: var(--color-text); font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.group-name small { color: var(--color-text-muted); font-size: 10px; }
.metric { color: #5f65db; font-family: var(--font-mono); font-size: 16px; }
.metric.completed { color: #1cad87; }
.progress-cell { display: flex; align-items: center; justify-content: center; gap: 8px; }
.progress-cell > span { width: 100px; height: 6px; overflow: hidden; border-radius: 999px; background: #edf0f7; }
.progress-cell i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg,#6877f2,#31c39a); }
.progress-cell small { width: 34px; color: var(--color-text-muted); font-family: var(--font-mono); font-size: 10px; }
.row-actions { justify-content: center; gap: 6px; }
.row-actions button { display: grid; width: 31px; height: 31px; place-items: center; border: 1px solid #6886f5; border-radius: 7px; color: #fff; background: #6886f5; cursor: pointer; transition: .15s ease; }
.row-actions button:hover { filter: brightness(.96); transform: translateY(-1px); }
.row-actions button.danger { border-color: #e75d6c; background: #e75d6c; }
.article-title { display: block; max-width: 100%; padding: 0; border: 0; background: transparent; cursor: pointer; font: inherit; text-align: left; }
.tag { display: inline-flex; padding: 4px 9px; border-radius: 999px; color: #596579; background: #f0f2f6; font-size: 11px; }
.tag.ai_generated,.tag.publishable { color: #158767; background: #eaf8f3; }
.tag.ai_mock { color: #5d55cc; background: #f0efff; }.tag.disabled { color: #8b95a8; background: #f1f2f5; }
.group-summary { display: grid; grid-template-columns: repeat(4,1fr); border-bottom: 1px solid var(--color-border); background: #fbfcff; }
.group-summary > div { display: grid; padding: 16px 20px; border-right: 1px solid var(--color-border); gap: 4px; }
.group-summary > div:last-child { border-right: 0; }
.group-summary span { color: var(--color-text-muted); font-size: 11px; }
.group-summary strong { color: var(--color-text); font-family: var(--font-mono); font-size: 20px; }
.empty,.error-panel { display: grid; min-height: 340px; place-items: center; align-content: center; padding: 28px; color: var(--color-text-muted); text-align: center; gap: 8px; }
.empty > .el-icon { color: #7a83ec; font-size: 32px; }.empty strong { color: var(--color-text-secondary); }.empty p { font-size: 11px; }
.pagination { display: flex; justify-content: flex-end; padding: 14px 18px; gap: 8px; }
.pagination button { min-height: 31px; padding: 0 11px; border: 1px solid var(--color-border); border-radius: 6px; color: var(--color-text-secondary); background: #fff; cursor: pointer; }
.pagination span { padding: 7px; color: var(--color-text-muted); font-family: var(--font-mono); font-size: 10px; }
.skeleton { display: grid; padding: 16px; gap: 8px; }.skeleton span { height: 48px; border-radius: 7px; background: linear-gradient(90deg,#f5f7fb,#eef1f8,#f5f7fb); background-size: 220% 100%; animation: shimmer 1.4s infinite; }
.field { display: grid; gap: 7px; }.field > span { color: var(--color-text-secondary); font-size: 12px; }.field i { color: var(--color-danger); font-style: normal; }
.field input,.field select { width: 100%; min-height: 40px; padding: 0 11px; border: 1px solid var(--color-border-strong); border-radius: 8px; outline: 0; color: var(--color-text); background: #fff; font: inherit; }
.field input:focus,.field select:focus { border-color: rgba(91,99,235,.68); box-shadow: var(--shadow-focus); }.field small { color: var(--color-text-muted); font-size: 10px; }
.editor-form { display: grid; gap: 16px; }.asset-picker { display: grid; padding: 14px; border: 1px solid var(--color-border); border-radius: 9px; background: #fff; gap: 12px; }
.asset-heading { justify-content: space-between; }.asset-heading strong { display: block; color: var(--color-text); }.asset-heading p { margin-top: 3px; color: var(--color-text-muted); font-size: 10px; }.asset-heading > span { color: #626add; font-family: var(--font-mono); }
.cover-section,.body-image-section { display: grid; padding-top: 13px; border-top: 1px solid var(--color-border); gap: 10px; }.cover-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.cover-heading strong { color: var(--color-text); font-size: 12px; }.cover-heading p { margin-top: 3px; color: var(--color-text-muted); font-size: 10px; }.cover-heading button { padding: 0; border: 0; color: #626add; background: transparent; cursor: pointer; font-size: 11px; }.cover-heading > span { color: #626add; font-family: var(--font-mono); font-size: 11px; }
.cover-layout { display: grid; grid-template-columns: 260px minmax(0,1fr); gap: 12px; }.cover-preview { position: relative; display: grid; height: 146px; overflow: hidden; place-items: center; align-content: center; border: 1px solid #dfe3ed; border-radius: 9px; color: #69768b; background: #f6f8fc; gap: 7px; }.cover-preview img { width: 100%; height: 100%; object-fit: cover; }.cover-preview > span { position: absolute; right: 8px; bottom: 8px; left: 8px; overflow: hidden; padding: 5px 7px; border-radius: 6px; color: #fff; background: rgba(18,27,48,.72); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }.cover-preview.empty > span { position: static; color: var(--color-text-muted); background: transparent; }.cover-preview > .el-icon { font-size: 28px; }
.cover-options { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); align-content: start; gap: 8px; }.cover-options button { position: relative; display: grid; height: 69px; overflow: hidden; padding: 0; place-items: center; border: 1px solid var(--color-border); border-radius: 8px; color: var(--color-text-muted); background: #f6f7fa; cursor: pointer; }.cover-options button.selected { border-color: #6978f2; box-shadow: 0 0 0 2px rgba(105,120,242,.14); }.cover-options img { width: 100%; height: 100%; object-fit: cover; }.cover-options small { position: absolute; right: 4px; bottom: 4px; left: 4px; overflow: hidden; padding: 3px 5px; border-radius: 4px; color: #fff; background: rgba(18,27,48,.68); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.asset-grid { display: grid; grid-template-columns: repeat(6,minmax(0,1fr)); gap: 8px; }.asset-grid button { display: grid; overflow: hidden; padding: 0; border: 1px solid var(--color-border); border-radius: 8px; color: var(--color-text-muted); background: #fff; cursor: pointer; }
.asset-grid button.selected { border-color: #6c78f2; box-shadow: 0 0 0 2px rgba(108,120,242,.13); }.asset-grid button > span { display: grid; height: 78px; place-items: center; overflow: hidden; background: #f6f7fa; }.asset-grid img { width: 100%; height: 100%; object-fit: cover; }.asset-grid small { overflow: hidden; padding: 6px; text-overflow: ellipsis; white-space: nowrap; }
.asset-empty,.asset-loading { color: var(--color-text-muted); font-size: 11px; }.compact-field { max-width: 340px; }
.paste-uploading { display: inline-flex; align-items: center; color: #626add !important; gap: 6px; }
.paste-uploading > span { width: 13px; height: 13px; border: 2px solid rgba(98,106,221,.24); border-top-color: #626add; border-radius: 50%; animation: paste-spin .7s linear infinite; }
:deep(.el-dialog) { border-radius: 10px; }
:deep(.el-dialog__header) { min-height: 58px; margin: 0; padding: 0 22px; border-bottom: 1px solid var(--color-border); color: var(--color-text); font-weight: 650; }
:deep(.el-dialog__body) { max-height: 75vh; overflow-y: auto; padding: 22px; background: #f8f9fc; }
:deep(.el-dialog__footer) { padding: 12px 22px; border-top: 1px solid var(--color-border); background: #fff; }
@keyframes shimmer { to { background-position: -220% 0; } }
@keyframes paste-spin { to { transform: rotate(360deg); } }
/* 文章库列表与编辑器可读性校准 */
.table-toolbar>span,.group-name small,.progress-cell small,.tag,.group-summary span,.empty p,.pagination span,.asset-heading p,.cover-heading p,.cover-heading button,.cover-heading>span,.cover-preview>span,.asset-empty,.asset-loading{font-size:13px}
.group-name strong,.article-title,.field>span,.cover-heading strong{font-size:14px}
.field input,.field select{min-height:44px;font-size:14px}
</style>
