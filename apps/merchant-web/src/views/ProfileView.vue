<script setup lang="ts">
import type { GalleryImage, MerchantProfile, ProfileUpdateRequest, WebsiteProfileDraft, WebsiteTemplate, WebsiteThemePreset } from '@doubaohk/api-contract'
import { CircleCheckFilled, InfoFilled, Picture, RefreshRight, UploadFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, nextTick, onMounted, reactive, ref } from 'vue'

import WebsiteLivePreview, { type WebsitePreviewSection } from '@/components/WebsiteLivePreview.vue'
import { ApiError } from '@/services/http'
import { getMerchantProfile, updateMerchantProfile } from '@/services/merchant.service'
import { useAppStore } from '@/stores/app'
import { formatDateTime } from '@/utils/format'
import { normalizeWebsiteList, truncateWebsiteText } from '@/utils/website-profile'

interface ProfileForm {
  companyName: string
  aliases: string
  industry: string
  coreBusiness: string
  serviceAreas: string
  introduction: string
  advantages: string
  products: string
  address: string
  nearbyLandmark: string
  transportGuide: string
  parkingGuide: string
  phoneLabel: string
  phone: string
  phoneContacts: Array<{ label: string; phone: string }>
  wechatLabel: string
  wechat: string
  businessHours: string
  credentials: string
  cases: string
  proofMaterials: string
}

const props = withDefaults(defineProps<{
  embedded?: boolean
  loadExisting?: boolean
  previewTemplate?: WebsiteTemplate
  previewTheme?: WebsiteThemePreset
  availableImages?: GalleryImage[]
  heroImageId?: string | null
  showcaseImageIds?: string[]
  articleCount?: number
  uploadingImages?: boolean
}>(), {
  embedded: false,
  loadExisting: true,
  previewTemplate: 'minimal_enterprise',
  previewTheme: 'blue',
  availableImages: () => [],
  heroImageId: null,
  showcaseImageIds: () => [],
  articleCount: 0,
  uploadingImages: false,
})
const emit = defineEmits<{
  profileLoaded: [profile: MerchantProfile]
  profileSaved: [profile: MerchantProfile]
  imageSettingsChange: [settings: { heroImageId: string | null; showcaseImageIds: string[] }]
  imageUploadRequest: [file: File]
}>()

const appStore = useAppStore()
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const savedProfile = ref<MerchantProfile | null>(null)
const editorRoot = ref<HTMLElement | null>(null)
const websitePreview = ref<InstanceType<typeof WebsiteLivePreview> | null>(null)
const activePreviewSection = ref<WebsitePreviewSection>('hero')
const websiteImageInput = ref<HTMLInputElement | null>(null)
const MAX_WEBSITE_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
const WEBSITE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png'])

const form = reactive<ProfileForm>({
  companyName: '',
  aliases: '',
  industry: '',
  coreBusiness: '',
  serviceAreas: '',
  introduction: '',
  advantages: '',
  products: '',
  address: '',
  nearbyLandmark: '',
  transportGuide: '',
  parkingGuide: '',
  phoneLabel: '电话咨询',
  phone: '',
  phoneContacts: [{ label: '电话咨询', phone: '' }, { label: '业务咨询', phone: '' }, { label: '售后服务', phone: '' }],
  wechatLabel: '微信咨询',
  wechat: '',
  businessHours: '',
  credentials: '',
  cases: '',
  proofMaterials: '',
})

const versionLabel = computed(() =>
  savedProfile.value ? `V${savedProfile.value.version} · ${formatDateTime(savedProfile.value.updatedAt)}` : '未加载',
)
const previewTemplateName = computed(() => props.previewTemplate === 'local_store' ? '通用门店型' : props.previewTemplate === 'brand_content' ? '品牌内容型' : '现代企业型')
const previewServices = computed(() => splitLines(form.products).slice(0, 8))
const previewAdvantages = computed(() => splitLines(form.advantages).slice(0, 3))
const selectedHeroImage = computed(() => props.availableImages.find((image) => image.id === props.heroImageId) ?? null)
const selectedShowcaseImages = computed(() => props.showcaseImageIds.flatMap((id) => {
  const image = props.availableImages.find((item) => item.id === id)
  return image ? [image] : []
}))

function setPreviewSection(section: WebsitePreviewSection): void {
  activePreviewSection.value = section
  void websitePreview.value?.focusSection(section)
}

async function handlePreviewSection(section: WebsitePreviewSection): Promise<void> {
  activePreviewSection.value = section
  await nextTick()
  const mappedSection = section === 'articles' ? 'services' : section === 'trust' ? 'contact' : section
  const editor = editorRoot.value
  const target = editor?.querySelector<HTMLElement>(`[data-form-section="${mappedSection}"]`)
  const dialogBody = editor?.closest<HTMLElement>('.el-dialog__body')
  if (!target || !dialogBody) return

  // scrollIntoView 会继续滚动弹窗外层和页面，导致左侧导航与背景一起跳动。
  // 只计算并更新弹窗内容区的 scrollTop，保证页面主体位置保持不变。
  const containerRect = dialogBody.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const nextScrollTop = dialogBody.scrollTop + targetRect.top - containerRect.top - 12
  const maxScrollTop = Math.max(0, dialogBody.scrollHeight - dialogBody.clientHeight)
  dialogBody.scrollTo({
    top: Math.min(maxScrollTop, Math.max(0, nextScrollTop)),
    behavior: 'smooth',
  })
}

function selectHeroImage(imageId: string | null): void {
  emit('imageSettingsChange', { heroImageId: imageId, showcaseImageIds: props.showcaseImageIds })
  setPreviewSection('hero')
}

function toggleShowcaseImage(imageId: string): void {
  const selected = props.showcaseImageIds.includes(imageId)
    ? props.showcaseImageIds.filter((id) => id !== imageId)
    : [...props.showcaseImageIds, imageId].slice(0, 3)
  if (!props.showcaseImageIds.includes(imageId) && props.showcaseImageIds.length >= 3) {
    ElMessage.warning('门店环境展示图片最多选择 3 张')
    return
  }
  emit('imageSettingsChange', { heroImageId: props.heroImageId, showcaseImageIds: selected })
  setPreviewSection('showcase')
}

function chooseWebsiteImage(): void {
  websiteImageInput.value?.click()
}

async function handleWebsiteImageChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!WEBSITE_IMAGE_TYPES.has(file.type)) {
    ElMessage.warning('官网图片仅支持 JPG、PNG 格式')
    return
  }
  if (file.size > MAX_WEBSITE_IMAGE_SIZE_BYTES) {
    ElMessage.warning('官网图片单张不能超过 5 MB')
    return
  }
  try {
    const bitmap = await createImageBitmap(file)
    const ratio = bitmap.width / bitmap.height
    const validDimensions = bitmap.width >= 800
      && bitmap.height >= 450
      && ratio >= 4 / 3 - 0.01
      && ratio <= 16 / 9 + 0.01
    bitmap.close()
    if (!validDimensions) {
      ElMessage.warning('官网图片需为横版 4:3 至 16:9，且不小于 800×450 像素')
      return
    }
  } catch {
    ElMessage.warning('图片文件无法读取，请重新选择有效的 JPG 或 PNG 图片')
    return
  }
  emit('imageUploadRequest', file)
}

const characterCount = (value: string): number => Array.from(value).length
const lineCount = (value: string): number => splitLines(value).length
const fieldCount = (value: string, max: number): string => `${characterCount(value)} / ${max} 字`
const listCount = (value: string, maxItems: number, maxLength: number): string =>
  `${lineCount(value)} / ${maxItems} 项 · 每项≤${maxLength}字`

function joinLines(values: string[]): string {
  return values.join('\n')
}

function splitLines(value: string): string[] {
  return value
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function fillForm(profile: MerchantProfile): void {
  form.companyName = truncateWebsiteText(profile.companyName, 60)
  form.aliases = normalizeWebsiteList(profile.aliases, 8, 30).join('、')
  form.industry = truncateWebsiteText(profile.industry, 30)
  form.coreBusiness = truncateWebsiteText(profile.coreBusiness, 28)
  form.serviceAreas = normalizeWebsiteList(profile.serviceAreas, 10, 40).join('、')
  form.introduction = truncateWebsiteText(profile.introduction, 120)
  form.advantages = joinLines(normalizeWebsiteList(profile.advantages, 4, 60))
  form.products = joinLines(normalizeWebsiteList(profile.products, 8, 60))
  form.address = truncateWebsiteText(profile.address, 120)
  form.nearbyLandmark = truncateWebsiteText(profile.nearbyLandmark, 80)
  form.transportGuide = truncateWebsiteText(profile.transportGuide, 120)
  form.parkingGuide = truncateWebsiteText(profile.parkingGuide, 120)
  form.phoneLabel = profile.phoneLabel
  form.phone = profile.phone
  const contacts = profile.phoneContacts?.length > 0
    ? profile.phoneContacts
    : profile.phone ? [{ label: profile.phoneLabel || '电话咨询', phone: profile.phone }] : []
  form.phoneContacts = Array.from({ length: 3 }, (_, index) => contacts[index] ?? {
    label: index === 0 ? '电话咨询' : index === 1 ? '业务咨询' : '售后服务',
    phone: '',
  })
  form.wechatLabel = profile.wechatLabel
  form.wechat = profile.wechat
  form.businessHours = truncateWebsiteText(profile.businessHours, 50)
  form.credentials = joinLines(normalizeWebsiteList(profile.credentials, 4, 80))
  form.cases = joinLines(normalizeWebsiteList(profile.cases, 6, 120))
  form.proofMaterials = joinLines(normalizeWebsiteList(profile.proofMaterials, 4, 80))
}

function buildPayload(): ProfileUpdateRequest {
  const phoneContacts = form.phoneContacts
    .map((item) => ({ label: item.label.trim(), phone: item.phone.trim() }))
    .filter((item) => item.phone)
    .map((item) => ({ ...item, label: item.label || '电话咨询' }))
  const primaryPhone = phoneContacts[0]
  return {
    companyName: form.companyName.trim(),
    aliases: splitLines(form.aliases),
    industry: form.industry.trim(),
    coreBusiness: form.coreBusiness.trim(),
    serviceAreas: splitLines(form.serviceAreas),
    introduction: form.introduction.trim(),
    advantages: splitLines(form.advantages),
    products: splitLines(form.products),
    address: form.address.trim(),
    nearbyLandmark: form.nearbyLandmark.trim(),
    transportGuide: form.transportGuide.trim(),
    parkingGuide: form.parkingGuide.trim(),
    phoneLabel: primaryPhone?.label ?? '',
    phone: primaryPhone?.phone ?? '',
    phoneContacts,
    wechatLabel: form.wechatLabel.trim(),
    wechat: form.wechat.trim(),
    businessHours: form.businessHours.trim(),
    credentials: splitLines(form.credentials),
    cases: splitLines(form.cases),
    proofMaterials: splitLines(form.proofMaterials),
  }
}

async function loadProfile(): Promise<void> {
  loading.value = true
  errorMessage.value = ''

  try {
    const profile = await getMerchantProfile()
    savedProfile.value = profile
    fillForm(profile)
    emit('profileLoaded', profile)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '网站信息加载失败'
  } finally {
    loading.value = false
  }
}

function applyAiDraft(draft: WebsiteProfileDraft): void {
  form.companyName = truncateWebsiteText(draft.companyName, 60)
  form.aliases = normalizeWebsiteList(draft.aliases, 8, 30).join('、')
  form.industry = truncateWebsiteText(draft.industry, 30)
  form.coreBusiness = truncateWebsiteText(draft.coreBusiness, 28)
  form.serviceAreas = normalizeWebsiteList(draft.serviceAreas, 10, 40).join('、')
  form.introduction = truncateWebsiteText(draft.introduction, 120)
  form.advantages = joinLines(normalizeWebsiteList(draft.advantages, 4, 60))
  form.products = joinLines(normalizeWebsiteList(draft.products, 8, 60))
  form.address = truncateWebsiteText(draft.address, 120)
  form.nearbyLandmark = truncateWebsiteText(draft.nearbyLandmark, 80)
  form.transportGuide = truncateWebsiteText(draft.transportGuide, 120)
  form.parkingGuide = truncateWebsiteText(draft.parkingGuide, 120)
  form.businessHours = truncateWebsiteText(draft.businessHours, 50)
  form.credentials = joinLines(normalizeWebsiteList(draft.credentials, 4, 80))
  form.cases = joinLines(normalizeWebsiteList(draft.cases, 6, 120))
  form.proofMaterials = joinLines(normalizeWebsiteList(draft.proofMaterials, 4, 80))
}

defineExpose({ applyAiDraft })

async function saveProfile(): Promise<void> {
  if (!form.companyName.trim()) {
    ElMessage.warning('请填写公司或门店全称')
    return
  }

  const listLimits: Array<[string, string, number, number]> = [
    ['企业优势', form.advantages, 4, 60],
    ['产品与服务', form.products, 8, 60],
    ['资质与证明', form.credentials, 4, 80],
    ['客户案例', form.cases, 6, 120],
    ['其他证明材料', form.proofMaterials, 4, 80],
  ]
  for (const [label, value, maxItems, maxLength] of listLimits) {
    const items = splitLines(value)
    if (items.length > maxItems || items.some((item) => characterCount(item) > maxLength)) {
      ElMessage.warning(`${label}最多${maxItems}项，每项不超过${maxLength}字`)
      return
    }
  }

  saving.value = true
  try {
    const profile = await updateMerchantProfile(buildPayload())
    savedProfile.value = profile
    fillForm(profile)
    emit('profileLoaded', profile)
    emit('profileSaved', profile)
    await appStore.loadBootstrap(true)
    ElMessage.success(`网站信息已保存为 V${profile.version}`)
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '网站信息保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  if (props.loadExisting) {
    void loadProfile()
    return
  }
  loading.value = false
})
</script>

<template>
  <div class="profile-page" :class="{ 'is-embedded': embedded }">
    <header v-if="!embedded" class="page-intro">
      <div>
        <h2>网站信息设置</h2>
        <p>维护官网展示的企业资料和联系方式，保存后会同步到企业网站。</p>
      </div>
      <div class="intro-actions">
        <span class="version-chip"><el-icon><InfoFilled /></el-icon>{{ versionLabel }}</span>
        <button class="secondary-button" type="button" :disabled="loading || saving" @click="loadProfile">
          <el-icon><RefreshRight /></el-icon>刷新
        </button>
        <button class="primary-button" type="button" :disabled="loading || saving" @click="saveProfile">
          <el-icon><CircleCheckFilled /></el-icon>{{ saving ? '保存中…' : '保存网站信息' }}
        </button>
      </div>
    </header>

    <section v-if="!embedded" class="fact-notice surface-panel">
      <span class="notice-mark"><el-icon><CircleCheckFilled /></el-icon></span>
      <div>
        <strong>单套网站资料</strong>
        <p>这里的信息只供企业网站使用，不会覆盖企业信息库，也不作为 AI 写作资料。</p>
      </div>
    </section>

    <section v-if="loading" class="loading-panel surface-panel" aria-label="网站信息加载中">
      <span /><span /><span /><span />
    </section>

    <section v-else-if="errorMessage" class="error-panel surface-panel" role="alert">
      <strong>网站信息暂时无法加载</strong>
      <p>{{ errorMessage }}</p>
      <button class="secondary-button" type="button" @click="loadProfile">重新加载</button>
    </section>

    <div v-else ref="editorRoot" class="profile-editor-layout" :class="{ 'with-preview': embedded }">
    <form class="profile-form" @submit.prevent="saveProfile">
      <section class="form-card surface-panel" data-form-section="hero" @focusin="setPreviewSection('hero')">
        <header class="form-card-heading">
          <div><span>01</span><h3>网站基础信息</h3></div>
          <small>用于网站首页、企业介绍和基础元数据</small>
        </header>
        <div class="field-grid">
          <label class="field field-wide">
            <span>公司或门店全称 <i>*</i><small>{{ fieldCount(form.companyName, 60) }}</small></span>
            <input v-model="form.companyName" maxlength="60" placeholder="例如：北京示例科技有限公司" />
          </label>
          <label class="field">
            <span>品牌简称 <small>最多8项，每项≤30字</small></span>
            <input v-model="form.aliases" maxlength="247" placeholder="多个简称用顿号、逗号或换行分隔" />
          </label>
          <label class="field">
            <span>所属行业 <small>{{ fieldCount(form.industry, 30) }}</small></span>
            <input v-model="form.industry" maxlength="30" placeholder="建议6-20字，例如：企业数字化服务" />
          </label>
          <label class="field field-wide">
            <span>核心业务 <small>{{ fieldCount(form.coreBusiness, 28) }} · 建议16-24字</small></span>
            <input v-model="form.coreBusiness" maxlength="28" placeholder="一句话说明服务对象、核心产品或服务方式" />
          </label>
          <label class="field field-wide">
            <span>服务范围 <small>最多10项，每项≤40字</small></span>
            <input v-model="form.serviceAreas" maxlength="409" placeholder="例如：北京、全国线上服务" />
          </label>
          <label class="field field-wide">
            <span>企业简介 <small>{{ fieldCount(form.introduction, 120) }} · 建议70-110字</small></span>
            <textarea v-model="form.introduction" rows="4" maxlength="120" placeholder="说明企业是谁、提供什么以及服务特点，仅填写可证实的信息" />
          </label>
        </div>
      </section>

      <section class="form-card surface-panel" data-form-section="services" @focusin="setPreviewSection('services')">
        <header class="form-card-heading">
          <div><span>02</span><h3>网站业务与服务</h3></div>
          <small>每行一项，用于网站业务板块和服务详情展示</small>
        </header>
        <div class="field-grid dual-notes">
          <label class="field" @focusin.stop="setPreviewSection('trust')">
            <span>企业优势 <small>{{ listCount(form.advantages, 4, 60) }}</small></span>
            <textarea v-model="form.advantages" rows="6" maxlength="243" placeholder="每行一项，建议3-4项" />
          </label>
          <label class="field" @focusin.stop="setPreviewSection('services')">
            <span>产品与服务 <small>{{ listCount(form.products, 8, 60) }}</small></span>
            <textarea v-model="form.products" rows="6" maxlength="487" placeholder="每行一项，建议3-8项" />
          </label>
        </div>
      </section>

      <section class="form-card surface-panel" data-form-section="contact" @focusin="setPreviewSection('contact')">
        <header class="form-card-heading">
          <div><span>03</span><h3>网站联系与信任信息</h3></div>
          <small>联系方式和资质材料仅在网站对应模块展示</small>
        </header>
        <div class="field-grid">
          <fieldset class="phone-contact-list field-wide">
            <legend>联系电话 <small>填写几组显示几组，最多3组</small></legend>
            <div v-for="(contact, index) in form.phoneContacts" :key="index" class="phone-contact-row">
              <span class="contact-index">0{{ index + 1 }}</span>
              <label class="field"><span>电话昵称 <small>{{ fieldCount(contact.label, 12) }}</small></span><input v-model="contact.label" maxlength="12" :placeholder="index === 0 ? '例如：业务咨询' : '例如：售后服务'" /></label>
              <label class="field"><span>手机或电话号码 <small>{{ fieldCount(contact.phone, 30) }}</small></span><input v-model="contact.phone" maxlength="30" placeholder="例如：13800000000" /></label>
            </div>
          </fieldset>
          <label class="field"><span>微信昵称 <small>{{ fieldCount(form.wechatLabel, 12) }}</small></span><input v-model="form.wechatLabel" maxlength="12" placeholder="例如：添加客服微信" /></label>
          <label class="field"><span>微信号 <small>{{ fieldCount(form.wechat, 40) }}</small></span><input v-model="form.wechat" maxlength="40" placeholder="微信号或企业微信" /></label>
          <label class="field field-wide" @focusin.stop="setPreviewSection(previewTemplate === 'local_store' ? 'trust' : 'contact')"><span>地址 <small>{{ fieldCount(form.address, 120) }}</small></span><input v-model="form.address" maxlength="120" placeholder="详细办公或门店地址" /></label>
          <label class="field field-wide" @focusin.stop="setPreviewSection(previewTemplate === 'local_store' ? 'trust' : 'contact')"><span>营业时间 <small>{{ fieldCount(form.businessHours, 50) }}</small></span><input v-model="form.businessHours" maxlength="50" placeholder="例如：周一至周五 09:00–18:00" /></label>
          <template v-if="previewTemplate === 'local_store'">
            <label class="field field-wide" @focusin.stop="setPreviewSection('trust')"><span>附近地标 <small>{{ fieldCount(form.nearbyLandmark, 80) }}</small></span><input v-model="form.nearbyLandmark" maxlength="80" placeholder="例如：距钟楼地铁站约300米、某商场东门旁" /></label>
            <label class="field" @focusin.stop="setPreviewSection('trust')"><span>公交 / 地铁到店 <small>{{ fieldCount(form.transportGuide, 120) }}</small></span><textarea v-model="form.transportGuide" rows="4" maxlength="120" placeholder="说明可乘坐的地铁、公交线路与步行方向" /></label>
            <label class="field" @focusin.stop="setPreviewSection('trust')"><span>停车说明 <small>{{ fieldCount(form.parkingGuide, 120) }}</small></span><textarea v-model="form.parkingGuide" rows="4" maxlength="120" placeholder="说明门店停车位、附近停车场或停车限制" /></label>
          </template>
          <label class="field" @focusin.stop="setPreviewSection('trust')"><span>资质与证明 <small>{{ listCount(form.credentials, 4, 80) }}</small></span><textarea v-model="form.credentials" rows="5" maxlength="323" placeholder="每行一项，最多4项" /></label>
          <label class="field" @focusin.stop="setPreviewSection('trust')"><span>客户案例 <small>{{ listCount(form.cases, 6, 120) }}</small></span><textarea v-model="form.cases" rows="5" maxlength="725" placeholder="每行一项，最多6项；只填写已授权、可复核的案例" /></label>
          <label class="field field-wide" @focusin.stop="setPreviewSection('trust')"><span>其他证明材料 <small>{{ listCount(form.proofMaterials, 4, 80) }}</small></span><textarea v-model="form.proofMaterials" rows="4" maxlength="323" placeholder="每行一项，最多4项" /></label>
        </div>
      </section>

      <section class="form-card surface-panel" data-form-section="showcase">
        <header class="form-card-heading">
          <div><span>04</span><h3>官网图片版位</h3></div>
          <small>{{ previewTemplate === 'local_store' ? '不选择时使用门店品牌色占位版式' : '不选择时继续使用当前模板默认图片' }}</small>
        </header>
        <div class="website-image-uploader">
          <div class="upload-guidance">
            <span><el-icon><UploadFilled /></el-icon></span>
            <div>
              <strong>上传官网图片</strong>
              <p>推荐 1200×900 px（4:3）；接受 4:3–16:9 横图，最小 800×450 px。JPG / PNG，单张不超过 5 MB；主体尽量居中，超出展示比例时会居中裁切。</p>
            </div>
          </div>
          <input ref="websiteImageInput" class="file-input" type="file" accept="image/jpeg,image/png" @change="handleWebsiteImageChange" />
          <button class="upload-image-button" type="button" :disabled="uploadingImages" @click="chooseWebsiteImage">
            <el-icon><UploadFilled /></el-icon>{{ uploadingImages ? '上传中…' : '选择并上传' }}
          </button>
        </div>
        <div class="image-position-block">
          <div class="position-heading"><div><strong>首屏主图</strong><p>{{ previewTemplate === 'local_store' ? '显示在门店官网首屏右侧' : '显示在企业官网首屏右侧' }}</p></div><span>单选</span></div>
          <div class="asset-options" @focusin="setPreviewSection('hero')">
            <button class="asset-option default-asset" :class="{ selected: !heroImageId }" type="button" @click="selectHeroImage(null)"><span><el-icon><Picture /></el-icon></span><strong>{{ previewTemplate === 'local_store' ? '品牌占位版式' : '模板默认图' }}</strong><small>{{ previewTemplate === 'local_store' ? '不依赖门店照片' : '系统自动匹配' }}</small></button>
            <button v-for="image in availableImages" :key="`hero-${image.id}`" class="asset-option" :class="{ selected: heroImageId === image.id }" type="button" @click="selectHeroImage(image.id)"><span><img v-if="image.url" :src="image.url" :alt="image.fileName" /><el-icon v-else><Picture /></el-icon></span><strong>{{ image.fileName }}</strong><small>设为首屏主图</small></button>
          </div>
        </div>
        <div v-if="previewTemplate === 'local_store'" class="image-position-block">
          <div class="position-heading"><div><strong>门店环境展示</strong><p>按选择顺序显示在门店环境板块，最多三张</p></div><span>{{ showcaseImageIds.length }} / 3</span></div>
          <div class="asset-options" @focusin="setPreviewSection('showcase')">
            <button v-for="image in availableImages" :key="`showcase-${image.id}`" class="asset-option" :class="{ selected: showcaseImageIds.includes(image.id) }" type="button" @click="toggleShowcaseImage(image.id)"><span><img v-if="image.url" :src="image.url" :alt="image.fileName" /><el-icon v-else><Picture /></el-icon></span><strong>{{ image.fileName }}</strong><small>{{ showcaseImageIds.includes(image.id) ? `第 ${showcaseImageIds.indexOf(image.id) + 1} 张` : '选择此图片' }}</small></button>
          </div>
        </div>
        <div v-if="!availableImages.length" class="asset-note"><el-icon><UploadFilled /></el-icon>图库暂无已上传完成的图片，请先到“企业图库”上传；不上传不影响生成，{{ previewTemplate === 'local_store' ? '门店模板会使用品牌色占位版式。' : '将继续使用模板默认图。' }}</div>
      </section>

      <div class="form-footer">
        <span>保存后会生成新的网站资料版本；需要重新生成站点才会更新预览。</span>
        <button class="primary-button" type="submit" :disabled="saving">
          <el-icon><CircleCheckFilled /></el-icon>{{ saving ? '保存中…' : '保存网站信息' }}
        </button>
      </div>
    </form>
    <aside v-if="embedded" class="website-live-preview">
      <header class="preview-toolbar">
        <div><strong>电脑端官网实时预览</strong></div>
        <small>{{ previewTemplateName }}</small>
      </header>
      <WebsiteLivePreview
        ref="websitePreview"
        mode="editor"
        :template="previewTemplate"
        :theme="previewTheme"
        :company-name="form.companyName"
        :industry="form.industry"
        :core-business="form.coreBusiness"
        :introduction="form.introduction"
        :products="previewServices"
        :advantages="previewAdvantages"
        :address="form.address"
        :nearby-landmark="form.nearbyLandmark"
        :transport-guide="form.transportGuide"
        :parking-guide="form.parkingGuide"
        :business-hours="form.businessHours"
        :phone-contacts="form.phoneContacts"
        :article-count="articleCount"
        :hero-image-url="selectedHeroImage?.url ?? null"
        :showcase-image-urls="selectedShowcaseImages.flatMap((image) => image.url ? [image.url] : [])"
        :active-section="activePreviewSection"
        @section-select="handlePreviewSection"
      />
      <p class="preview-hint">在左侧选择或输入时，右侧自动定位并实时更新；点击右侧板块只定位弹窗内的对应编辑区域。</p>
    </aside>
    </div>
  </div>
</template>

<style scoped>
.profile-page { display: grid; max-width: 1440px; margin: 0 auto; gap: 16px; }
.profile-page.is-embedded { width: 100%; max-width: none; margin: 0; }
.page-intro, .intro-actions, .fact-notice, .form-card-heading, .form-footer, .asset-note, .website-image-uploader, .upload-guidance { display: flex; align-items: center; }
.page-intro { justify-content: space-between; gap: 24px; }
.eyebrow { display: block; margin-bottom: 5px; color: var(--color-champagne); font-family: var(--font-mono); font-size: 10px; letter-spacing: .13em; }
h2, h3, p { margin: 0; }
h2 { font-size: 26px; font-weight: 670; letter-spacing: -.035em; }
.page-intro p { margin-top: 5px; color: var(--color-text-secondary); }
.intro-actions { flex-wrap: wrap; justify-content: flex-end; gap: 9px; }
.version-chip { display: inline-flex; align-items: center; padding: 8px 10px; border: 1px solid var(--color-border); border-radius: var(--radius-pill); color: var(--color-text-muted); background: rgba(16, 32, 59, .52); font-family: var(--font-mono); font-size: 11px; gap: 6px; }
.secondary-button, .primary-button { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; padding: 0 14px; border: 1px solid var(--color-border-strong); border-radius: 8px; color: var(--color-text-secondary); background: rgba(13, 28, 52, .68); cursor: pointer; gap: 8px; transition: .16s ease; }
.primary-button { border-color: rgba(113,111,255,.62); color: #fff; background: var(--gradient-primary); box-shadow: 0 8px 22px rgba(72,73,194,.22); }
.secondary-button:hover, .primary-button:hover { transform: translateY(-1px); color: #fff; border-color: rgba(126,137,255,.7); }
.secondary-button:disabled, .primary-button:disabled { cursor: not-allowed; opacity: .55; transform: none; }
.fact-notice { padding: 15px 18px; gap: 12px; }
.notice-mark { display: grid; width: 34px; height: 34px; flex: 0 0 auto; place-items: center; border: 1px solid rgba(52,211,153,.28); border-radius: 10px; color: var(--color-success); background: rgba(52,211,153,.08); }
.fact-notice strong { font-size: 15px; }
.fact-notice p { margin-top: 3px; color: var(--color-text-muted); font-size: 14px; }
.profile-editor-layout { display: grid; min-width: 0; gap: 16px; }
.profile-editor-layout.with-preview { grid-template-columns: minmax(640px, 1fr) minmax(500px, 560px); align-items: start; }
.profile-form { display: grid; min-width: 0; gap: 16px; }
.form-card { padding: 22px 24px; }
.form-card-heading { justify-content: space-between; padding-bottom: 17px; border-bottom: 1px solid var(--color-border); gap: 20px; }
.form-card-heading > div { display: flex; align-items: center; gap: 10px; }
.form-card-heading span { color: var(--color-champagne); font-family: var(--font-mono); font-size: 12px; }
h3 { font-size: 19px; font-weight: 680; }
.form-card-heading small { color: var(--color-text-muted); font-size: 13px; text-align: right; }
.field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); padding-top: 19px; gap: 16px; }
.field { display: grid; min-width: 0; gap: 7px; }
.field-wide { grid-column: 1 / -1; }
.phone-contact-list { display: grid; min-width: 0; margin: 0; padding: 0; border: 0; gap: 10px; }
.phone-contact-list legend { width: 100%; margin-bottom: 3px; color: var(--color-text-secondary); font-size: 14px; font-weight: 600; }
.phone-contact-list legend small { float: right; color: var(--color-text-muted); font-size: 13px; font-weight: 400; }
.phone-contact-row { display: grid; grid-template-columns: 38px minmax(0, .7fr) minmax(0, 1.3fr); align-items: end; padding: 12px; border: 1px solid rgba(145,168,205,.18); border-radius: 9px; background: rgba(7,19,38,.24); gap: 12px; }
.contact-index { align-self: center; color: var(--color-champagne); font-family: var(--font-mono); font-size: 13px; }
.field > span { display: flex; align-items: center; justify-content: space-between; color: var(--color-text-secondary); font-size: 14px; font-weight: 600; gap: 12px; }
.field > span small { color: var(--color-text-muted); font-size: 13px; font-weight: 400; white-space: nowrap; }
.field i { color: var(--color-danger); font-style: normal; }
input, textarea { width: 100%; border: 1px solid rgba(145,168,205,.25); border-radius: 8px; outline: none; color: var(--color-text); background: rgba(4,15,31,.48); font: inherit; transition: border-color var(--transition-fast), box-shadow var(--transition-fast); }
input { min-height: 46px; padding: 0 13px; }
textarea { min-height: 108px; padding: 12px 13px; line-height: 1.7; resize: vertical; }
input::placeholder, textarea::placeholder { color: #66748a; }
input:focus, textarea:focus { border-color: rgba(115,125,255,.76); box-shadow: var(--shadow-focus); }
.asset-note { min-height: 46px; margin-top: 18px; padding: 11px 13px; border: 1px dashed rgba(112,132,178,.26); border-radius: 8px; color: var(--color-text-muted); background: rgba(17,35,64,.28); font-size: 13px; gap: 8px; }
.asset-note .el-icon { color: #92a2ff; }
.website-image-uploader { justify-content: space-between; margin-top: 18px; padding: 14px 15px; border: 1px solid #dce2ef; border-radius: 10px; background: linear-gradient(90deg,#f7f8ff,#fff); gap: 18px; }
.upload-guidance { min-width: 0; gap: 12px; }
.upload-guidance > span { display: grid; width: 38px; height: 38px; flex: 0 0 auto; place-items: center; border-radius: 10px; color: #666ce5; background: #eceeff; font-size: 18px; }
.upload-guidance strong { display: block; color: #1c2942; font-size: 14px; }
.upload-guidance p { max-width: 690px; margin-top: 4px; color: #6f7b90; font-size: 13px; line-height: 1.6; }
.file-input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
.upload-image-button { display: inline-flex; min-height: 38px; flex: 0 0 auto; align-items: center; justify-content: center; padding: 0 14px; border: 0; border-radius: 8px; color: #fff; background: var(--gradient-primary); box-shadow: 0 7px 18px rgba(80,88,210,.16); cursor: pointer; gap: 7px; font: inherit; }
.upload-image-button:disabled { cursor: not-allowed; opacity: .55; }
.form-footer { justify-content: space-between; padding: 0 2px; color: var(--color-text-muted); font-size: 13px; gap: 16px; }
.loading-panel { display: grid; min-height: 480px; padding: 24px; gap: 16px; }
.loading-panel span { display: block; height: 64px; border-radius: 9px; background: linear-gradient(90deg, rgba(120,143,182,.08), rgba(120,143,182,.18), rgba(120,143,182,.08)); background-size: 220% 100%; animation: shimmer 1.4s ease-in-out infinite; }
.error-panel { display: grid; min-height: 280px; place-items: center; align-content: center; padding: 32px; text-align: center; gap: 9px; }
.error-panel p { color: var(--color-text-muted); }
@keyframes shimmer { to { background-position: -220% 0; } }
.is-embedded .form-card { border: 1px solid #dfe4ee; background: #fff; box-shadow: 0 7px 20px rgba(34, 47, 79, .05); }
.is-embedded .form-card-heading { border-color: #e4e8f0; }
.is-embedded .form-card-heading h3 { color: #17233a; }
.is-embedded .form-card-heading span { color: #666be1; }
.is-embedded .form-card-heading small, .is-embedded .field > span small, .is-embedded .phone-contact-list legend small { color: #8993a7; }
.is-embedded .field > span, .is-embedded .phone-contact-list legend { color: #4e5a70; }
.is-embedded input, .is-embedded textarea { border-color: #d9dfeb; color: #17233a; background: #fff; }
.is-embedded input::placeholder, .is-embedded textarea::placeholder { color: #9aa3b4; }
.is-embedded .phone-contact-row { border-color: #e1e5ed; background: #f6f7fa; }
.is-embedded .contact-index { color: #6a6fe3; }
.is-embedded .asset-note { border-color: #d9dfed; color: #7f899d; background: #f7f8fc; }
.is-embedded .form-footer { position: sticky; z-index: 6; bottom: 0; padding: 12px 4px; border-top: 1px solid #e1e5ed; color: #7d8799; background: rgba(245,247,251,.96); backdrop-filter: blur(8px); }
.image-position-block{display:grid;padding-top:18px;gap:12px}.image-position-block+.image-position-block{margin-top:20px;border-top:1px solid #e5e9f0}.position-heading{display:flex;align-items:center;justify-content:space-between}.position-heading strong{color:#1a2740;font-size:15px}.position-heading p{margin-top:4px;color:#78859a;font-size:13px}.position-heading>span{padding:5px 9px;border-radius:20px;color:#656be0;background:#f0f1ff;font-size:12px}.asset-options{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.asset-option{display:grid;overflow:hidden;padding:0 0 11px;border:1px solid #dce2ec;border-radius:8px;color:#566278;background:#fff;text-align:left;cursor:pointer;gap:4px}.asset-option>span{display:grid;height:92px;place-items:center;overflow:hidden;color:#7781e7;background:#eef1f7;font-size:23px}.asset-option img{width:100%;height:100%;object-fit:cover}.asset-option strong,.asset-option small{overflow:hidden;padding:0 9px;text-overflow:ellipsis;white-space:nowrap}.asset-option strong{color:#22304a;font-size:13px}.asset-option small{color:#7f8a9e;font-size:12px}.asset-option.selected{border-color:#666bf0;box-shadow:0 0 0 2px rgba(102,107,240,.12)}.asset-option.selected>span{box-shadow:inset 0 0 0 3px #666bf0}.default-asset>span{background:linear-gradient(135deg,#edf1f8,#dfe6f2)}
.website-live-preview { position: sticky; top: 0; overflow:hidden;border: 1px solid #d9dfeb; border-radius: 12px; background: #f4f6fa; box-shadow: 0 14px 34px rgba(36,50,84,.1); }
.preview-toolbar { display: flex; min-height: 65px; align-items: center; justify-content: space-between; padding: 0 16px; border-bottom: 1px solid #e4e8f0; }
.preview-toolbar span, .preview-toolbar strong { display: block; }
.preview-toolbar span { color: #7479df; font-family: var(--font-mono); font-size: 10px; letter-spacing: .13em; }
.preview-toolbar strong { margin-top: 3px; color: #18243a; font-size: 16px; }
.preview-toolbar small { padding: 5px 9px; border-radius: 20px; color: #6268df; background: #f0f1ff; font-size: 12px; }
.preview-browser { padding: 13px; background: #edf0f6; }
.browser-bar { display: flex; height: 26px; align-items: center; padding: 0 9px; border-radius: 7px 7px 0 0; color: #8c95a7; background: #fff; font-size: 8px; gap: 4px; }
.browser-bar i { width: 5px; height: 5px; border-radius: 50%; background: #d4d9e2; }
.browser-bar span { margin-left: 8px; }
.preview-site { overflow: hidden; height: 540px; color: #17233a; background: #fff; }
.preview-site nav { display: flex; height: 36px; align-items: center; justify-content: space-between; padding: 0 12px; border-bottom: 1px solid #e5e9f0; font-size: 6px; }
.preview-site nav strong { max-width: 190px; overflow: hidden; font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
.map-section { position: relative; cursor: pointer; transition: box-shadow .16s ease, background .16s ease; }
.map-section.active { z-index: 2; box-shadow: inset 0 0 0 2px var(--preview-accent), 0 0 0 3px color-mix(in srgb, var(--preview-accent) 12%, transparent); }
.map-section em { position: absolute; top: 5px; right: 6px; display: none; padding: 2px 5px; border-radius: 10px; color: #fff; background: var(--preview-accent); font-size: 6px; font-style: normal; }
.map-section.active em { display: block; }
.preview-hero { display: grid; min-height: 142px; padding: 24px 18px; align-content: center; background: linear-gradient(120deg, color-mix(in srgb, var(--preview-accent) 8%, white), color-mix(in srgb, var(--preview-accent) 18%, white)); gap: 6px; }
.preview-hero small { color: var(--preview-accent); font-size: 7px; font-weight: 700; }
.preview-hero h4 { max-width: 280px; margin: 0; font-size: 18px; line-height: 1.3; }
.preview-hero p { display: -webkit-box; overflow: hidden; margin: 0; color: #687388; font-size: 7px; line-height: 1.65; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.preview-services, .preview-trust, .preview-articles, .preview-contact { padding: 14px 16px; }
.preview-services header, .preview-trust header, .preview-articles header, .preview-contact header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 9px; }
.preview-services header strong, .preview-trust header strong, .preview-articles header strong, .preview-contact header strong { font-size: 9px; }
.preview-services header em, .preview-trust header em, .preview-articles header em, .preview-contact header em { color: #9099aa; font-size: 6px; font-style: normal; }
.preview-services>div { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
.preview-services>div span { display: -webkit-box; overflow: hidden; min-height: 45px; padding: 9px 7px; border: 1px solid #e2e6ed; font-size: 7px; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.preview-trust { background: #f8f9fb; }
.preview-trust p, .preview-contact p { overflow: hidden; margin: 0; color: #727d91; font-size: 7px; text-overflow: ellipsis; white-space: nowrap; }
.preview-articles { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid #e6e9ef; gap: 6px; }
.preview-articles header { grid-column: 1 / -1; margin-bottom: 2px; }
.preview-articles span { height: 35px; border: 1px solid #e1e5ec; border-left: 3px solid var(--preview-accent); background: #fff; }
.preview-contact { display: grid; min-height: 74px; align-content: center; color: #fff; background: #172840; gap: 4px; }
.preview-contact header { margin-bottom: 3px; }
.preview-contact header strong { color: #fff; }
.preview-contact p { color: #bdc7d8; }
.mapping-legend { display: grid; grid-template-columns: repeat(3, 1fr); padding: 12px; gap: 6px; }
.mapping-legend button { min-height: 34px; padding: 5px; border: 1px solid #dde2ec; border-radius: 6px; color: #6f7a8f; background: #fff; font-size: 8px; cursor: pointer; }
.mapping-legend button.active { border-color: var(--preview-accent); color: var(--preview-accent); background: color-mix(in srgb, var(--preview-accent) 7%, white); }
.preview-hint { margin: 0; padding: 13px 16px 15px; color: #6f7b8f; background:#fff;font-size: 13px; line-height: 1.6; }
@media(max-width:1280px){.profile-editor-layout.with-preview{grid-template-columns:1fr}.website-live-preview{position:relative}.asset-options{grid-template-columns:repeat(3,minmax(0,1fr))}}
</style>
