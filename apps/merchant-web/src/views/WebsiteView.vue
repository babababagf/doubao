<script setup lang="ts">
import type { GalleryImage, KnowledgeLibrary, MerchantProfile, MerchantWebsite, WebsiteProfileDraft, WebsiteTemplate, WebsiteThemePreset } from '@doubaohk/api-contract'
import { Check, Connection, CopyDocument, Document, EditPen, Link, MagicStick, Monitor, Plus, RefreshRight, Setting, View } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'

import WebsiteLivePreview from '@/components/WebsiteLivePreview.vue'
import { ApiError, isRealApiMode } from '@/services/http'
import {
  addGalleryImageMetadata,
  completeGalleryImageUpload,
  createGallery,
  createGalleryImageUpload,
  createWebsiteAiProfile,
  generateWebsite,
  generateWebsiteMock,
  getMerchantProfile,
  getWebsite,
  listArticleGroups,
  listGalleries,
  listGalleryImages,
  listKnowledgeLibraries,
  updateWebsite,
} from '@/services/merchant.service'
import { formatDateTime } from '@/utils/format'
import WebsiteInformationForm from '@/views/ProfileView.vue'

type TemplateOption = { id: WebsiteTemplate; name: string; audience: string; description: string; accent: string; focus: string[] }
type ThemeOption = { id: WebsiteThemePreset; name: string; color: string; suitable: string }
type ProfileFormExpose = { applyAiDraft: (draft: WebsiteProfileDraft) => void }

const templates: TemplateOption[] = [
  { id: 'minimal_enterprise', name: '现代企业型', audience: '企业服务、生产制造、科技公司', description: '强调企业能力、服务优势与行业洞察，适合大多数企业。', accent: 'blueprint', focus: ['品牌定位', '服务能力', '行业洞察'] },
  { id: 'local_store', name: '通用门店型', audience: '餐饮、零售、美业、维修、教育及本地服务', description: '突出服务项目、门店环境、到店信息与本地服务指南。', accent: 'local', focus: ['门店展示', '服务项目', '本地指南'] },
  { id: 'brand_content', name: '品牌内容型', audience: '品牌机构、内容企业、专业服务', description: '品牌主视觉、核心定位、服务能力与内容专栏结合。', accent: 'editorial', focus: ['品牌定位', '视觉封面', '内容专栏'] },
]
const themes: ThemeOption[] = [
  { id: 'terracotta', name: '暖陶橙', color: '#C6532D', suitable: '通用门店、生活服务' },
  { id: 'forest', name: '深青绿', color: '#1F6B5B', suitable: '养生、家居、教育' },
  { id: 'blue', name: '稳重蓝', color: '#2F5FCC', suitable: '企业服务、咨询、维修' },
  { id: 'brick', name: '砖红色', color: '#B64B3A', suitable: '餐饮、零售、传统品牌' },
  { id: 'violet', name: '雅致紫', color: '#7658A5', suitable: '美业、形象、创意服务' },
  { id: 'graphite_gold', name: '石墨金', color: '#9A6A32', suitable: '会所、品质服务、高端企业' },
]

const website = ref<MerchantWebsite | null>(null)
const profile = ref<MerchantProfile | null>(null)
const knowledgeLibraries = ref<KnowledgeLibrary[]>([])
const profileForm = ref<ProfileFormExpose | null>(null)
const articleCount = ref(0)
const loading = ref(true)
const errorMessage = ref('')
const profileDialogOpen = ref(false)
const profileDialogMode = ref<'create' | 'edit'>('create')
const templateDialogOpen = ref(false)
const loadingLibraries = ref(false)
const aiGenerating = ref(false)
const generating = ref(false)
const applyingTemplate = ref(false)
const loadingImages = ref(false)
const uploadingWebsiteImage = ref(false)
const selectedKnowledgeLibraryId = ref('')
const pendingTemplate = ref<WebsiteTemplate>('minimal_enterprise')
const pendingTheme = ref<WebsiteThemePreset>('blue')
const heroImageId = ref<string | null>(null)
const showcaseImageIds = ref<string[]>([])
const galleryImages = ref<GalleryImage[]>([])

const selectedTemplate = computed(() => templates.find((item) => item.id === website.value?.template) ?? templates[0]!)
const selectedTheme = computed(() => themes.find((item) => item.id === website.value?.themePreset) ?? themes[2]!)
const hasWebsiteProfile = computed(() => Boolean(profile.value?.companyName.trim()))
const statusLabel = computed(() => website.value?.status === 'published'
  ? '已发布'
  : website.value?.status === 'local_ready'
    ? '已生成'
    : '待生成')
const websitePublicUrl = computed(() => {
  const previewUrl = website.value?.previewUrl?.trim()
  if (!previewUrl) return ''
  if (/^https?:\/\//i.test(previewUrl)) return previewUrl
  return `http://127.0.0.1:3010${previewUrl.startsWith('/') ? previewUrl : `/${previewUrl}`}`
})
const articleModuleName = computed(() => website.value?.template === 'local_store'
  ? '本地服务指南'
  : website.value?.template === 'brand_content'
    ? '品牌内容'
    : '行业洞察')
const selectedHeroImage = computed(() => galleryImages.value.find((image) => image.id === heroImageId.value) ?? null)
const selectedShowcaseImages = computed(() => (showcaseImageIds.value ?? []).flatMap((id) => {
  const image = galleryImages.value.find((item) => item.id === id)
  return image ? [image] : []
}))
const selectedShowcaseImageUrls = computed(() => selectedShowcaseImages.value.flatMap((image) => image.url ? [image.url] : []))

async function copyWebsiteUrl(): Promise<void> {
  if (!websitePublicUrl.value) return
  try {
    await navigator.clipboard.writeText(websitePublicUrl.value)
    ElMessage.success('网址已复制')
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

async function loadWebsiteImages(force = false): Promise<void> {
  if (loadingImages.value || (!force && galleryImages.value.length)) return
  loadingImages.value = true
  try {
    const galleries = await listGalleries()
    galleryImages.value = (await Promise.all(galleries.map((gallery) => listGalleryImages(gallery.id).catch(() => [])))).flat()
  } finally {
    loadingImages.value = false
  }
}

async function uploadWebsiteImage(file: File): Promise<void> {
  if (uploadingWebsiteImage.value) return
  uploadingWebsiteImage.value = true
  try {
    const galleries = await listGalleries()
    const gallery = galleries.find((item) => item.name.trim() === '官网图片')
      ?? await createGallery({ name: '官网图片', description: '用于官网首屏主图和门店环境展示的横版图片' })
    const input = { fileName: file.name, mimeType: file.type, sizeBytes: file.size, purpose: 'website' as const }
    const image = isRealApiMode
      ? await (async () => {
          const ticket = await createGalleryImageUpload(gallery.id, input)
          const uploaded = await fetch(ticket.uploadUrl, { method: ticket.method, headers: ticket.headers, body: file })
          if (!uploaded.ok) throw new Error(`对象存储直传失败（HTTP ${uploaded.status}），请贴牌检查 OSS CORS 与 Bucket 权限`)
          return completeGalleryImageUpload(gallery.id, ticket.uploadId)
        })()
      : await addGalleryImageMetadata(gallery.id, input)
    await loadWebsiteImages(true)
    if (!heroImageId.value) {
      heroImageId.value = image.id
      ElMessage.success('官网图片已上传，并设为首屏主图')
    } else {
      ElMessage.success('官网图片已上传，请在下方选择使用版位')
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '官网图片上传失败')
  } finally {
    uploadingWebsiteImage.value = false
  }
}

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const [websiteValue, profileValue, articleGroups] = await Promise.all([
      getWebsite(),
      getMerchantProfile().catch((error: unknown) => {
        if (error instanceof ApiError && error.code === 'MERCHANT_PROFILE_MISSING') return null
        throw error
      }),
      listArticleGroups().catch(() => []),
    ])
    website.value = websiteValue
    profile.value = profileValue
    articleCount.value = articleGroups.reduce((total, group) => total + group.completedCount, 0)
    pendingTemplate.value = websiteValue.template
    pendingTheme.value = websiteValue.themePreset
    heroImageId.value = websiteValue.heroImageId
    showcaseImageIds.value = websiteValue.showcaseImageIds ?? []
    void loadWebsiteImages()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '企业网站加载失败'
  } finally {
    loading.value = false
  }
}

async function openProfileDialog(mode: 'create' | 'edit'): Promise<void> {
  profileDialogMode.value = mode
  profileDialogOpen.value = true
  void loadWebsiteImages()
  if (knowledgeLibraries.value.length || loadingLibraries.value) return
  loadingLibraries.value = true
  try {
    knowledgeLibraries.value = await listKnowledgeLibraries()
    selectedKnowledgeLibraryId.value = knowledgeLibraries.value[0]?.id ?? ''
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '企业信息库加载失败')
  } finally {
    loadingLibraries.value = false
  }
}

async function generateProfileWithAi(): Promise<void> {
  if (!selectedKnowledgeLibraryId.value) {
    ElMessage.warning('请先选择一套企业信息库')
    return
  }
  aiGenerating.value = true
  try {
    const draft = await createWebsiteAiProfile({ knowledgeLibraryId: selectedKnowledgeLibraryId.value })
    profileForm.value?.applyAiDraft(draft)
    ElMessage.success('AI已生成网站基础信息，请检查并修改后保存')
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'AI生成网站信息失败'
    ElMessage.error(`${message}，当前表单仍保留上一次内容`)
  } finally {
    aiGenerating.value = false
  }
}

async function handleProfileSaved(value: MerchantProfile): Promise<void> {
  profile.value = value
  try {
    await persistWebsiteSettings()
    profileDialogOpen.value = false
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '网站图片配置保存失败')
  }
}

function handleImageSettingsChange(settings: { heroImageId: string | null; showcaseImageIds: string[] }): void {
  heroImageId.value = settings.heroImageId
  showcaseImageIds.value = settings.showcaseImageIds
}

async function persistWebsiteSettings(): Promise<void> {
  if (!website.value) return
  const savedShowcase = website.value.showcaseImageIds ?? []
  const imageSettingsUnchanged = (website.value.heroImageId ?? null) === heroImageId.value
    && savedShowcase.length === showcaseImageIds.value.length
    && savedShowcase.every((id, index) => id === showcaseImageIds.value[index])
  if (imageSettingsUnchanged) return
  website.value = await updateWebsite({
    template: website.value.template,
    themePreset: website.value.themePreset,
    heroImageId: heroImageId.value,
    showcaseImageIds: showcaseImageIds.value,
  })
}

function openTemplateDialog(): void {
  if (!website.value || !profile.value?.companyName.trim()) {
    ElMessage.warning('请先完善并保存网站基础信息')
    return
  }
  pendingTemplate.value = website.value.template
  pendingTheme.value = website.value.themePreset
  templateDialogOpen.value = true
}

async function applyTemplateSettings(): Promise<void> {
  if (!website.value) return
  applyingTemplate.value = true
  try {
    website.value = await updateWebsite({
      template: pendingTemplate.value,
      themePreset: pendingTheme.value,
      heroImageId: heroImageId.value,
      showcaseImageIds: showcaseImageIds.value,
    })
    templateDialogOpen.value = false
    ElMessage.success('模板与配色已应用到工作台预览，确认内容后再生成官网')
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '模板配置保存失败')
  } finally {
    applyingTemplate.value = false
  }
}

async function publishWebsite(): Promise<void> {
  if (!website.value || !profile.value?.companyName.trim()) {
    ElMessage.warning('请先完善网站基础信息')
    return
  }
  generating.value = true
  try {
    await persistWebsiteSettings()
    website.value = isRealApiMode ? await generateWebsite() : await generateWebsiteMock()
    ElMessage.success(website.value.storageState === 'uploaded' ? '官网已生成并完成发布准备' : '官网已生成，可打开预览检查')
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '官网生成失败')
  } finally {
    generating.value = false
  }
}

onMounted(() => { void load() })
</script>

<template>
  <div class="website-page">
    <header class="page-intro">
      <div>
        <h2>企业网站</h2>
        <p>维护官网资料、选择页面样式，并生成可对外访问的企业网站。</p>
      </div>
      <button class="icon-button" type="button" :disabled="loading" aria-label="刷新网站" @click="load"><el-icon><RefreshRight /></el-icon></button>
    </header>

    <section v-if="loading" class="loading-panel surface-panel"><span /><span /><span /></section>
    <section v-else-if="errorMessage" class="empty-state surface-panel">
      <strong>网站暂时无法加载</strong><p>{{ errorMessage }}</p><button class="secondary-button" type="button" @click="load">重新加载</button>
    </section>
    <section v-else-if="!hasWebsiteProfile" class="setup-state surface-panel">
      <span class="setup-icon"><el-icon><Monitor /></el-icon></span>
      <div><h3>先完善官网基础信息</h3><p>填写企业资料后，即可选择网站样式并生成官网。</p></div>
      <button class="primary-button" type="button" @click="openProfileDialog('create')"><el-icon><Plus /></el-icon>新建网站</button>
    </section>
    <template v-else>
      <section class="workspace-shell surface-panel">
        <header class="workspace-header">
          <div class="site-identity">
            <span class="site-logo"><el-icon><Monitor /></el-icon></span>
            <div class="site-identity-copy">
              <div class="site-identity-main"><h3>{{ profile?.companyName }}</h3><span class="status-pill" :class="website?.status">{{ statusLabel }}</span></div>
              <div v-if="websitePublicUrl" class="site-url-row">
                <a class="site-public-url" :href="websitePublicUrl" target="_blank" rel="noopener">{{ websitePublicUrl }}</a>
                <button class="copy-url-button" type="button" aria-label="复制官网网址" title="复制官网网址" @click="copyWebsiteUrl"><el-icon><CopyDocument /></el-icon>复制</button>
              </div>
            </div>
          </div>
          <div class="workspace-actions">
            <button class="secondary-button" type="button" @click="openProfileDialog('edit')"><el-icon><EditPen /></el-icon>编辑网站信息</button>
            <button class="secondary-button" type="button" @click="openTemplateDialog"><el-icon><Setting /></el-icon>模板与配色</button>
            <button class="primary-button" type="button" :disabled="generating" @click="publishWebsite"><el-icon><Connection /></el-icon>{{ generating ? '官网生成中…' : website?.status === 'not_generated' ? '生成官网' : '重新生成' }}</button>
          </div>
        </header>

        <div class="workflow-strip">
          <span class="done"><i>1</i>选择模板与配色</span><b>→</b><span class="done"><i>2</i>编辑资料并实时预览</span><b>→</b><span :class="{ done: website?.status !== 'not_generated' }"><i>3</i>生成对外官网</span>
        </div>

        <div class="workspace-grid">
          <section class="preview-panel">
            <header><div><strong>工作台实时预览</strong><span>模板、配色和资料修改会在这里同步显示</span></div><a v-if="isRealApiMode && websitePublicUrl" :href="websitePublicUrl" target="_blank" rel="noopener"><el-icon><View /></el-icon>查看已生成官网</a></header>
            <div class="preview-frame">
              <WebsiteLivePreview
                :template="website?.template ?? 'minimal_enterprise'"
                :theme="website?.themePreset ?? 'blue'"
                :company-name="profile?.companyName ?? ''"
                :industry="profile?.industry ?? ''"
                :core-business="profile?.coreBusiness ?? ''"
                :introduction="profile?.introduction ?? ''"
                :products="profile?.products ?? []"
                :advantages="profile?.advantages ?? []"
                :address="profile?.address ?? ''"
                :business-hours="profile?.businessHours ?? ''"
                :phone-contacts="profile?.phoneContacts ?? []"
                :article-count="articleCount"
                :hero-image-url="selectedHeroImage?.url ?? null"
                :showcase-image-urls="selectedShowcaseImageUrls"
              />
            </div>
          </section>

          <aside class="control-panel">
            <div class="control-heading"><span>官网配置概览</span><small>当前生效设置</small></div>
            <dl>
              <div><dt>模板</dt><dd>{{ selectedTemplate.name }}</dd></div>
              <div><dt>主色</dt><dd><i :style="{ backgroundColor: selectedTheme.color }" />{{ selectedTheme.name }}</dd></div>
              <div><dt>网址</dt><dd class="domain-value"><a v-if="websitePublicUrl" :href="websitePublicUrl" target="_blank" rel="noopener">{{ websitePublicUrl }}</a><template v-else>尚未生成</template></dd></div>
              <div><dt>资料版本</dt><dd>{{ profile ? `V${profile.version}` : '未保存' }}</dd></div>
              <div><dt>站点版本</dt><dd>V{{ website?.version ?? 0 }}</dd></div>
              <div><dt>更新时间</dt><dd>{{ profile ? formatDateTime(profile.updatedAt) : '—' }}</dd></div>
            </dl>
            <div class="sync-note"><el-icon><RefreshRight /></el-icon><span>网站资料保存后需重新生成，文章模块会读取当前可发布文章。</span></div>
          </aside>
        </div>
      </section>

      <section class="content-map surface-panel">
        <header><div><h3>网站内容结构</h3></div><p>查看填写的资料会显示在官网哪个位置。</p></header>
        <div class="map-grid">
          <article><span><el-icon><Monitor /></el-icon></span><div><small>01 · 首屏</small><strong>名称、核心业务、企业简介</strong><p>来自“网站基础信息”</p></div></article>
          <article><span><el-icon><Setting /></el-icon></span><div><small>02 · 业务</small><strong>产品服务与企业优势</strong><p>自动按填写数量自适应</p></div></article>
          <article><span><el-icon><Document /></el-icon></span><div><small>03 · {{ articleModuleName }}</small><strong>{{ articleCount }} 篇可用文章</strong><p>与文章列表自动同步</p></div></article>
          <article><span><el-icon><Link /></el-icon></span><div><small>04 · 联系</small><strong>电话、微信、地址</strong><p>填写一项显示一项</p></div></article>
        </div>
      </section>
    </template>

    <el-dialog v-model="profileDialogOpen" width="min(1480px, calc(100vw - 48px))" class="website-dialog" destroy-on-close :close-on-click-modal="false">
      <template #header>
        <div class="dialog-header">
          <div><h3>{{ profileDialogMode === 'create' ? '新建网站基础信息' : '编辑网站基础信息' }}</h3><p>填写资料时可在右侧实时查看官网效果，保存后会返回网站工作台。</p></div>
          <div class="ai-actions">
            <select v-model="selectedKnowledgeLibraryId" name="knowledge-library" aria-label="选择企业信息库" autocomplete="off" :disabled="loadingLibraries || aiGenerating"><option value="">{{ loadingLibraries ? '信息库加载中…' : '选择企业信息库' }}</option><option v-for="library in knowledgeLibraries" :key="library.id" :value="library.id">{{ library.name }} · {{ library.companyName }}</option></select>
            <button class="ai-button" type="button" :disabled="loadingLibraries || aiGenerating" @click="generateProfileWithAi"><el-icon><MagicStick /></el-icon>{{ aiGenerating ? 'AI生成中…' : 'AI智能生成' }}</button>
          </div>
        </div>
      </template>
      <WebsiteInformationForm
        ref="profileForm"
        embedded
        :load-existing="profileDialogMode === 'edit'"
        :preview-template="website?.template ?? 'minimal_enterprise'"
        :preview-theme="website?.themePreset ?? 'blue'"
        :available-images="galleryImages"
        :hero-image-id="heroImageId"
        :showcase-image-ids="showcaseImageIds"
        :article-count="articleCount"
        :uploading-images="uploadingWebsiteImage"
        @profile-loaded="profile = $event"
        @profile-saved="handleProfileSaved"
        @image-settings-change="handleImageSettingsChange"
        @image-upload-request="uploadWebsiteImage"
      />
    </el-dialog>

    <el-dialog v-model="templateDialogOpen" width="1120px" class="template-dialog" :close-on-click-modal="false">
      <template #header><div class="template-title"><h3>选择官网样式</h3><p>选择页面布局和主色，确认后即可生成对应官网。</p></div></template>
      <section class="template-grid" role="radiogroup" aria-label="官网模板">
        <button v-for="template in templates" :key="template.id" type="button" class="template-card" :class="[`tone-${template.accent}`, { selected: pendingTemplate === template.id }]" role="radio" :aria-checked="pendingTemplate === template.id" @click="pendingTemplate = template.id">
          <header><div><small>0{{ templates.indexOf(template) + 1 }}</small><strong>{{ template.name }}</strong></div><el-icon v-if="pendingTemplate === template.id"><Check /></el-icon></header>
          <div class="template-live-sample" inert aria-hidden="true">
            <WebsiteLivePreview
              :template="template.id"
              :theme="pendingTheme"
              :company-name="profile?.companyName ?? ''"
              :industry="profile?.industry ?? ''"
              :core-business="profile?.coreBusiness ?? ''"
              :introduction="profile?.introduction ?? ''"
              :products="profile?.products ?? []"
              :advantages="profile?.advantages ?? []"
              :address="profile?.address ?? ''"
              :business-hours="profile?.businessHours ?? ''"
              :phone-contacts="profile?.phoneContacts ?? []"
              :article-count="articleCount"
              :hero-image-url="selectedHeroImage?.url ?? null"
              :showcase-image-urls="selectedShowcaseImageUrls"
              mode="thumbnail"
            />
          </div>
          <p>{{ template.description }}</p><span class="select-state">{{ pendingTemplate === template.id ? '已选择' : '选择此样式' }}</span>
        </button>
      </section>
      <section v-if="pendingTemplate !== 'brand_content'" class="theme-selection" aria-label="官网配色">
        <div class="theme-copy"><strong>选择{{ pendingTemplate === 'local_store' ? '门店' : '企业' }}官网主色</strong><span>只切换安全配色，不影响文字可读性。</span></div>
        <div class="theme-options"><button v-for="theme in themes" :key="theme.id" class="theme-option" :class="{ selected: pendingTheme === theme.id }" type="button" :title="theme.suitable" @click="pendingTheme = theme.id"><i :style="{ backgroundColor: theme.color }" /><span><b>{{ theme.name }}</b><small>{{ theme.suitable }}</small></span><el-icon v-if="pendingTheme === theme.id"><Check /></el-icon></button></div>
      </section>
      <template #footer><div class="dialog-footer"><span>应用后返回工作台查看电脑端预览，不会立即发布官网。</span><button class="primary-button" type="button" :disabled="applyingTemplate" @click="applyTemplateSettings"><el-icon><Check /></el-icon>{{ applyingTemplate ? '配置保存中…' : '应用到工作台预览' }}</button></div></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.website-page{display:grid;max-width:1500px;margin:0 auto;gap:16px}.page-intro,.workspace-header,.workspace-actions,.site-identity,.content-map>header,.dialog-header,.ai-actions,.dialog-footer{display:flex;align-items:center}.page-intro,.workspace-header,.content-map>header,.dialog-header,.dialog-footer{justify-content:space-between}.eyebrow,.dialog-header>div>span,.template-title>span{display:block;margin-bottom:5px;color:#6468df;font-family:var(--font-mono);font-size:10px;letter-spacing:.14em}h2,h3,p{margin:0}h2{font-size:28px;font-weight:700;letter-spacing:-.04em}.page-intro p{margin-top:5px;color:var(--color-text-secondary)}button,a{font:inherit}.primary-button,.secondary-button,.ai-button,.icon-button{display:inline-flex;min-height:38px;align-items:center;justify-content:center;padding:0 14px;border:1px solid #d8deea;border-radius:8px;color:#4d5870;background:#fff;cursor:pointer;gap:7px}.primary-button,.ai-button{border-color:#6d68ef;color:#fff;background:linear-gradient(135deg,#5f6bf2,#7c5ce6);box-shadow:0 9px 22px rgba(72,73,194,.18)}.icon-button{width:38px;padding:0;color:#5964d9}.secondary-button:hover,.icon-button:hover{border-color:#8589ef;background:#f6f6ff}button:disabled{cursor:not-allowed;opacity:.5}.loading-panel{display:grid;min-height:540px;padding:24px;align-content:start;gap:14px}.loading-panel span{height:110px;border-radius:12px;background:linear-gradient(90deg,#eef1f7,#f7f8fb,#eef1f7);background-size:220% 100%;animation:shimmer 1.4s infinite}.empty-state,.setup-state{display:grid;min-height:430px;place-items:center;align-content:center;text-align:center;gap:12px}.empty-state p,.setup-state p{max-width:540px;color:#747f94;line-height:1.75}.setup-icon{display:grid;width:60px;height:60px;place-items:center;border:1px solid #d9def9;border-radius:16px;color:#6269e6;background:#f0f1ff;font-size:26px}.setup-state small{color:#7177e5;font-family:var(--font-mono);letter-spacing:.12em}.setup-state h3{margin:5px 0;font-size:22px}.workspace-shell{overflow:hidden;padding:0}.workspace-header{min-height:86px;padding:0 24px;border-bottom:1px solid #e4e8f1;gap:24px}.site-identity{min-width:0;gap:13px}.site-logo{display:grid;width:43px;height:43px;flex:0 0 auto;place-items:center;border-radius:11px;color:#fff;background:linear-gradient(145deg,#586ff0,#754fe3);font-size:20px}.site-identity small{color:#8b94a8;font-size:10px}.site-identity h3{display:inline-block;max-width:560px;margin-top:2px;overflow:hidden;color:#17233a;font-size:18px;text-overflow:ellipsis;vertical-align:middle;white-space:nowrap}.status-pill{display:inline-flex;margin-left:10px;align-items:center;color:#d58b29;font-size:11px;gap:5px}.status-pill::before{width:7px;height:7px;border-radius:50%;background:currentColor;content:''}.status-pill.local_ready,.status-pill.published{color:#18a97b}.workspace-actions{flex-wrap:wrap;justify-content:flex-end;gap:8px}.workspace-grid{display:grid;grid-template-columns:minmax(0,1fr) 330px;min-height:600px}.preview-panel{min-width:0;padding:22px;background:#eef1f6}.preview-panel>header{display:flex;height:38px;align-items:center;padding:0 13px;border:1px solid #d8deea;border-bottom:0;border-radius:10px 10px 0 0;color:#8590a5;background:#fff;font-size:10px}.preview-panel>header>div{display:flex;gap:5px}.preview-panel>header i{width:7px;height:7px;border-radius:50%;background:#d7dde7}.preview-panel>header i.red{background:#ef7569}.preview-panel>header i.amber{background:#eebf55}.preview-panel>header i.green{background:#66c384}.preview-panel>header>span{margin:auto}.preview-panel>header>a{display:inline-flex;align-items:center;color:#5864d9;text-decoration:none;gap:4px}.preview-frame{overflow:hidden;height:520px;border:1px solid #d8deea;border-radius:0 0 10px 10px;background:#fff;box-shadow:0 16px 38px rgba(33,47,79,.12)}.preview-frame iframe{width:1600px;height:900px;border:0;transform:scale(.575);transform-origin:0 0}.preview-placeholder{height:100%;color:#12213a;background:#fff}.preview-placeholder nav{display:flex;height:52px;align-items:center;justify-content:space-between;padding:0 28px;border-bottom:1px solid #e5e9f0;font-size:10px}.preview-placeholder nav b{font-size:13px}.preview-hero{display:grid;min-height:260px;padding:38px 44px;align-content:center;background:linear-gradient(110deg,#f5f8ff,#e7edfb);gap:10px}.preview-hero small{color:var(--preview-accent);font-weight:700}.preview-hero strong{max-width:520px;font-size:31px;line-height:1.25}.preview-hero p{max-width:520px;color:#657086;font-size:12px;line-height:1.8}.preview-hero i{width:72px;height:24px;border-radius:4px;background:var(--preview-accent)}.preview-cards{display:grid;grid-template-columns:repeat(3,1fr);padding:26px 44px;gap:12px}.preview-cards span{height:90px;border:1px solid #e1e5ec}.control-panel{padding:24px;border-left:1px solid #e3e7ef;background:#fff}.control-heading{display:flex;align-items:flex-end;justify-content:space-between;padding-bottom:15px;border-bottom:1px solid #e6e9f0}.control-heading span{color:#17233a;font-weight:700}.control-heading small{color:#98a0b1;font-size:10px}.control-panel dl{display:grid;margin:0}.control-panel dl>div{display:grid;min-height:62px;grid-template-columns:82px minmax(0,1fr);align-items:center;border-bottom:1px solid #edf0f5}.control-panel dt{color:#8a94a8;font-size:11px}.control-panel dd{display:flex;min-width:0;align-items:center;margin:0;color:#26334b;font-size:12px;font-weight:650;gap:7px}.control-panel dd i{width:12px;height:12px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px #d4d9e2}.domain-value{overflow-wrap:anywhere}.sync-note{display:flex;margin-top:20px;padding:13px;border-radius:9px;color:#657087;background:#f2f4fb;font-size:11px;line-height:1.65;gap:9px}.sync-note .el-icon{flex:0 0 auto;margin-top:2px;color:#646ae4}.content-map{padding:22px 24px}.content-map>header{padding-bottom:18px;border-bottom:1px solid #e5e9f0}.content-map>header p{color:#8490a5;font-size:11px}.map-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#e3e7ef}.map-grid article{display:grid;min-height:128px;grid-template-columns:38px 1fr;align-content:center;padding:20px;background:#fff;gap:12px}.map-grid article>span{display:grid;width:34px;height:34px;place-items:center;border-radius:9px;color:#5f66e0;background:#f0f1ff}.map-grid small,.map-grid strong,.map-grid p{display:block}.map-grid small{color:#7a80dd;font-family:var(--font-mono);font-size:9px}.map-grid strong{margin-top:5px;color:#1e2a42;font-size:13px}.map-grid p{margin-top:3px;color:#8a94a7;font-size:10px}.dialog-header{min-height:55px;padding-right:32px;gap:24px}.dialog-header>div>span,.template-title>span{color:rgba(255,255,255,.72)}.dialog-header h3,.template-title h3{color:#fff;font-size:20px}.dialog-header p,.template-title p{margin-top:4px;color:rgba(255,255,255,.82);font-size:11px}.ai-actions{gap:8px}.ai-actions select{width:290px;height:38px;padding:0 35px 0 11px;border:1px solid rgba(255,255,255,.55);border-radius:8px;color:#24304a;outline:none;background:rgba(255,255,255,.96)}.ai-button{border-color:rgba(255,255,255,.72);background:rgba(255,255,255,.18);box-shadow:none}.template-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:15px}.template-card{padding:15px;border:1px solid #dbe1ee;border-radius:12px;color:#59647a;background:#fff;text-align:left;cursor:pointer;transition:.18s ease;box-shadow:0 8px 22px rgba(31,45,78,.07)}.template-card:hover,.template-card.selected{transform:translateY(-2px);border-color:#716ff2;box-shadow:0 14px 30px rgba(79,82,183,.16)}.template-card header{display:flex;align-items:center;justify-content:space-between}.template-card header>div{display:flex;align-items:center;gap:9px}.template-card header small{color:#8791a6;font-family:var(--font-mono)}.template-card header strong{color:#17233a;font-size:16px}.template-card header .el-icon{display:grid;width:24px;height:24px;place-items:center;border-radius:50%;color:#fff;background:#716ff2}.mini-site{overflow:hidden;height:205px;margin:14px 0;border:1px solid #d5ddea;border-radius:8px;background:#edf2fa;color:#17233d}.mini-nav{display:flex;height:25px;align-items:center;padding:0 8px;background:#fff;gap:5px;font-size:7px}.mini-nav i{width:9px;height:9px;border-radius:2px;background:#696be9}.mini-nav b{width:22px;height:4px;margin-left:auto;background:#b8c3d7}.mini-hero{display:grid;min-height:105px;padding:15px;align-content:center;background:linear-gradient(140deg,#f8fbff,#dce7ff);gap:5px}.mini-hero small,.mini-hero span{font-size:6px}.mini-hero strong{font-size:18px}.mini-local{background:linear-gradient(140deg,#fff8ee,#ead6c1)}.mini-editorial{background:linear-gradient(140deg,#f4f0e7,#ded5c6)}.mini-columns{display:grid;grid-template-columns:repeat(3,1fr);padding:10px;background:#fff;gap:7px}.mini-columns i{height:43px;border:1px solid #d9e0ed}.template-card>p{min-height:39px;font-size:11px;line-height:1.6}.select-state{display:block;margin-top:11px;color:#6267df;font-size:11px;text-align:center}.theme-selection{display:grid;margin-top:18px;padding:16px;border:1px solid #dce2ee;border-radius:12px;background:#f8f9fc;gap:14px}.theme-copy{display:flex;align-items:baseline;gap:12px}.theme-copy strong{color:#17233a;font-size:14px}.theme-copy span{color:#747e91;font-size:11px}.theme-options{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.theme-option{display:grid;min-height:58px;grid-template-columns:25px minmax(0,1fr) 18px;align-items:center;padding:9px 11px;border:1px solid #dce2ed;border-radius:8px;color:#4e5b71;background:#fff;text-align:left;cursor:pointer;gap:9px}.theme-option:hover,.theme-option.selected{border-color:#716ff2;box-shadow:0 7px 18px rgba(79,82,183,.12)}.theme-option>i{width:22px;height:22px;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(20,31,52,.14)}.theme-option b,.theme-option small{display:block}.theme-option b{color:#17233a;font-size:12px}.theme-option small{margin-top:2px;color:#858da0;font-size:9px}.theme-option .el-icon{color:#716ff2}.dialog-footer>span{color:#6d778c;font-size:11px}@keyframes shimmer{to{background-position:-220% 0}}:deep(.website-dialog),:deep(.template-dialog){--el-dialog-bg-color:#f5f7fb;border:1px solid #d7deeb;border-radius:13px;background:#f5f7fb;box-shadow:0 24px 70px rgba(25,38,73,.24)}:deep(.website-dialog .el-dialog__header),:deep(.template-dialog .el-dialog__header){margin:0;padding:18px 22px;background:linear-gradient(110deg,#6d5ce8 0%,#4779ef 100%)}:deep(.website-dialog .el-dialog__headerbtn),:deep(.template-dialog .el-dialog__headerbtn){top:17px;right:17px}:deep(.website-dialog .el-dialog__close),:deep(.template-dialog .el-dialog__close){color:#fff;font-size:19px}:deep(.website-dialog .el-dialog__body){max-height:calc(100vh - 145px);padding:0 18px 18px;overflow:auto;background:#f5f7fb}:deep(.template-dialog .el-dialog__body){padding:18px 20px 22px;background:#f5f7fb}:deep(.template-dialog .el-dialog__footer){border-top:1px solid #dbe1eb;background:#fff}
.site-identity-copy{display:grid;min-width:0;gap:5px}.site-identity-main{display:flex;min-width:0;align-items:center}.site-public-url{display:block;max-width:610px;overflow:hidden;color:#5864d9;font-family:var(--font-mono);font-size:10px;text-decoration:none;text-overflow:ellipsis;white-space:nowrap}.site-public-url:hover,.domain-value a:hover{text-decoration:underline}.domain-value a{color:#5864d9;font-weight:600;text-decoration:none;overflow-wrap:anywhere}.workflow-strip{display:flex;min-height:54px;align-items:center;padding:0 24px;border-bottom:1px solid #e4e8f1;color:#8993a6;background:#fafbfe;font-size:11px;gap:12px}.workflow-strip span{display:flex;align-items:center;gap:7px}.workflow-strip span i{display:grid;width:22px;height:22px;place-items:center;border:1px solid #d6dce7;border-radius:50%;font-size:9px;font-style:normal}.workflow-strip span.done{color:#4f5ed1;font-weight:650}.workflow-strip span.done i{border-color:#6970e5;color:#fff;background:#6970e5}.workflow-strip b{color:#c1c7d2;font-weight:400}.preview-panel>header{height:48px;justify-content:space-between;padding:0 15px}.preview-panel>header>div{display:grid;gap:2px}.preview-panel>header strong{color:#24314a;font-size:11px}.preview-panel>header span{color:#8c96a8;font-size:9px}.preview-frame{height:auto;border:0;border-radius:0;background:transparent;box-shadow:none}.preview-frame :deep(.live-preview){border-radius:0 0 10px 10px}.preview-frame :deep(.browser-chrome){display:none}.preview-frame :deep(.preview-viewport){max-height:620px;border:1px solid #d8deea;border-radius:0 0 10px 10px}.control-panel{min-height:650px}@media(max-width:1300px){.workspace-grid{grid-template-columns:1fr}.control-panel{min-height:0;border-top:1px solid #e3e7ef;border-left:0}.control-panel dl{grid-template-columns:repeat(3,1fr)}.control-panel dl>div{grid-template-columns:72px 1fr;padding-right:12px}}
.site-identity-main,.site-url-row{display:flex;min-width:0;align-items:center}.site-url-row{gap:8px}.site-public-url{max-width:610px;font-size:12px;font-weight:600;line-height:1.45}.copy-url-button{display:inline-flex;min-height:25px;flex:0 0 auto;align-items:center;padding:0 8px;border:1px solid #d9def1;border-radius:6px;color:#5964d9;background:#f7f8ff;font-size:11px;cursor:pointer;gap:4px}.copy-url-button:hover{border-color:#8589ef;background:#eef0ff}
.template-live-sample{height:205px;margin:14px 0;overflow:hidden;border:1px solid #d5ddea;border-radius:8px;background:#fff}.template-live-sample :deep(.live-preview){width:300px;border:0;border-radius:0}.template-card:focus-visible{outline:3px solid rgba(113,111,242,.28);outline-offset:2px}

/* 官网工作台可读性与编辑弹窗布局 */
.site-identity small,.status-pill,.workflow-strip,.control-heading small,.control-panel dt,.sync-note,.content-map>header p,.map-grid p,.dialog-header p,.template-card>p,.select-state,.theme-copy span,.dialog-footer>span{font-size:13px}
.control-panel dd,.map-grid strong,.preview-panel>header strong,.copy-url-button{font-size:14px}
.workflow-strip span i{font-size:12px}
.preview-panel>header span{font-size:14px}
.dialog-header{min-height:68px;padding-right:44px;gap:28px}
.dialog-header h3,.template-title h3{font-size:22px}
.dialog-header p,.template-title p{line-height:1.55}
.ai-actions{flex:0 0 auto;gap:10px}
.ai-actions select{width:300px;height:44px;padding:0 38px 0 13px;font-size:14px}
.ai-button{min-height:44px;padding:0 16px;font-size:14px;white-space:nowrap}
:deep(.website-dialog .el-dialog__header){padding:18px 24px}
:deep(.website-dialog){display:flex;max-height:calc(100vh - 110px);margin:24px auto!important;flex-direction:column}
:deep(.website-dialog .el-dialog__body){min-height:0;max-height:none;padding:18px 20px 22px;overflow:auto;flex:1}
@media(max-width:1120px){.dialog-header{align-items:flex-start;flex-direction:column}.ai-actions{width:100%}.ai-actions select{flex:1;width:auto}}

/* 蓝色信号台 · 官网工作区视觉统一 */
.website-page {
  max-width: 1560px;
  gap: 20px;
}

.eyebrow,
.dialog-header > div > span,
.template-title > span {
  color: var(--color-primary);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

h2 {
  color: var(--color-text);
  font-size: var(--merchant-text-title-lg);
  font-weight: 740;
}

.page-intro p {
  color: var(--color-text-secondary);
  font-size: 15px;
}

.primary-button,
.ai-button {
  min-height: var(--control-height);
  border-color: transparent;
  border-radius: 9px;
  background: var(--gradient-primary);
  box-shadow: 0 8px 20px rgba(29, 99, 233, 0.2);
  font-size: 15px;
  font-weight: 650;
}

.secondary-button,
.icon-button {
  min-height: var(--control-height);
  border-color: var(--color-border-strong);
  border-radius: 9px;
  color: var(--color-text-secondary);
  font-size: 15px;
  font-weight: 600;
}

.icon-button {
  width: var(--control-height);
  color: var(--color-primary);
}

.workspace-shell {
  border-radius: var(--radius-lg);
}

.workspace-header {
  min-height: 92px;
  padding: 0 26px;
  border-bottom-color: var(--color-border);
}

.site-logo {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  background: var(--gradient-primary);
  box-shadow: 0 8px 18px rgba(29, 99, 233, 0.2);
}

.site-identity small,
.status-pill,
.workflow-strip,
.control-heading small,
.control-panel dt,
.sync-note,
.content-map > header p,
.map-grid p,
.dialog-header p,
.template-card > p,
.select-state,
.theme-copy span,
.dialog-footer > span {
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 1.55;
}

.site-identity h3 {
  color: var(--color-text);
  font-size: 20px;
  font-weight: 720;
}

.site-public-url,
.domain-value a,
.copy-url-button {
  color: var(--color-primary);
}

.site-public-url {
  font-family: var(--font-sans);
  font-size: 14px;
}

.copy-url-button {
  min-height: 30px;
  border-color: #cbdcf5;
  border-radius: 7px;
  background: #f3f7fe;
  font-size: 13px;
  font-weight: 650;
}

.workflow-strip {
  min-height: 60px;
  padding: 0 26px;
  border-bottom-color: var(--color-border);
  background: #f8fafd;
  gap: 14px;
}

.workflow-strip span i {
  width: 25px;
  height: 25px;
  border-color: var(--color-border-strong);
  font-size: 13px;
}

.workflow-strip span.done,
.workflow-strip span.done i {
  color: var(--color-primary);
}

.workflow-strip span.done i {
  border-color: var(--color-primary);
  color: #ffffff;
  background: var(--color-primary);
}

.workspace-grid {
  grid-template-columns: minmax(0, 1fr) 360px;
}

.preview-panel {
  padding: 24px;
  background: #eef3f9;
}

.preview-panel > header {
  height: 52px;
  border-color: var(--color-border-strong);
}

.preview-panel > header strong,
.control-panel dd,
.map-grid strong,
.copy-url-button {
  color: var(--color-text);
  font-size: 15px;
}

.preview-panel > header span,
.control-panel dt,
.control-heading small {
  color: var(--color-text-muted);
  font-size: 14px;
}

.control-panel {
  padding: 26px;
  border-left-color: var(--color-border);
}

.control-heading span {
  color: var(--color-text);
  font-size: 17px;
}

.control-panel dl > div {
  min-height: 68px;
  border-bottom-color: #e5ebf3;
}

.sync-note {
  border: 1px solid #dce7f5;
  color: var(--color-text-secondary);
  background: #f2f6fc;
}

.sync-note .el-icon,
.map-grid article > span {
  color: var(--color-primary);
}

.content-map {
  padding: 24px 26px;
}

.content-map > header p,
.map-grid p {
  font-size: 14px;
}

.map-grid {
  background: var(--color-border);
}

.map-grid article {
  min-height: 138px;
  padding: 22px;
}

.map-grid small {
  color: var(--color-primary);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 700;
}

.map-grid strong {
  margin-top: 6px;
  font-weight: 700;
}

.dialog-header {
  min-height: 72px;
}

.dialog-header > div > span,
.template-title > span,
.dialog-header p,
.template-title p {
  color: rgba(242, 249, 255, 0.9);
}

.dialog-header h3,
.template-title h3 {
  font-size: 23px;
  font-weight: 740;
}

.ai-actions select {
  min-height: var(--control-height);
  border-radius: 9px;
  font-size: 15px;
}

.ai-actions select:focus-visible {
  border-color: #6f9fea;
  outline: 2px solid rgba(29, 99, 233, 0.26);
  outline-offset: 2px;
  box-shadow: var(--shadow-focus);
}

.template-card {
  border-color: var(--color-border);
  border-radius: 14px;
  color: var(--color-text-secondary);
  box-shadow: 0 8px 24px rgba(27, 57, 98, 0.07);
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-base),
    transform var(--transition-base);
}

.template-card:hover,
.template-card.selected,
.theme-option:hover,
.theme-option.selected {
  border-color: #84adf0;
  box-shadow: 0 14px 34px rgba(29, 99, 233, 0.13);
}

.template-card header strong {
  color: var(--color-text);
  font-size: 17px;
}

.template-card header .el-icon {
  background: var(--color-primary);
}

.template-card > p,
.select-state,
.theme-copy span,
.dialog-footer > span {
  font-size: 14px;
}

.select-state,
.theme-option .el-icon {
  color: var(--color-primary);
  font-weight: 650;
}

.theme-selection {
  border-color: var(--color-border);
  border-radius: 14px;
  background: var(--color-surface-soft);
}

.theme-copy strong,
.theme-option b {
  color: var(--color-text);
  font-size: 15px;
}

.theme-option {
  min-height: 66px;
  border-color: var(--color-border);
  border-radius: 10px;
  color: var(--color-text-secondary);
  transition: border-color var(--transition-fast), box-shadow var(--transition-base), transform var(--transition-fast);
}

.theme-option small {
  color: var(--color-text-muted);
  font-size: 13px;
}

:deep(.website-dialog),
:deep(.template-dialog) {
  border-color: var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-soft);
  box-shadow: var(--shadow-dialog);
}

:deep(.website-dialog .el-dialog__header),
:deep(.template-dialog .el-dialog__header) {
  background:
    radial-gradient(circle at 86% 0%, rgba(91, 213, 255, 0.34), transparent 34%),
    linear-gradient(118deg, #124bb7 0%, #1d63e9 58%, #169fc9 100%);
}

:deep(.website-dialog .el-dialog__body),
:deep(.template-dialog .el-dialog__body) {
  background: #f5f8fc;
}

.template-card:focus-visible,
.theme-option:focus-visible {
  outline: 3px solid rgba(29, 99, 233, 0.2);
}

@media (hover: hover) and (pointer: fine) {
  .template-card:hover,
  .theme-option:hover,
  .primary-button:hover,
  .ai-button:hover {
    transform: translateY(-2px);
  }
}

@media (max-width: 1300px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .workspace-header,
  .workflow-strip,
  .content-map {
    padding-right: 16px;
    padding-left: 16px;
  }

  .preview-panel,
  .control-panel {
    padding: 16px;
  }

  .map-grid,
  .theme-options,
  .template-grid {
    grid-template-columns: 1fr;
  }
}
</style>
