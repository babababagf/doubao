<script setup lang="ts">
import type { MerchantProfile, ProfileUpdateRequest } from '@doubaohk/api-contract'
import { CircleCheckFilled, InfoFilled, RefreshRight, UploadFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'

import { ApiError } from '@/services/http'
import { getMerchantProfile, updateMerchantProfile } from '@/services/merchant.service'
import { useAppStore } from '@/stores/app'
import { formatDateTime } from '@/utils/format'

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
  phone: string
  wechat: string
  businessHours: string
  credentials: string
  cases: string
  proofMaterials: string
}

withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
const emit = defineEmits<{ profileLoaded: [profile: MerchantProfile] }>()

const appStore = useAppStore()
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const savedProfile = ref<MerchantProfile | null>(null)

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
  phone: '',
  wechat: '',
  businessHours: '',
  credentials: '',
  cases: '',
  proofMaterials: '',
})

const versionLabel = computed(() =>
  savedProfile.value ? `V${savedProfile.value.version} · ${formatDateTime(savedProfile.value.updatedAt)}` : '未加载',
)

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
  form.companyName = profile.companyName
  form.aliases = profile.aliases.join('、')
  form.industry = profile.industry
  form.coreBusiness = profile.coreBusiness
  form.serviceAreas = profile.serviceAreas.join('、')
  form.introduction = profile.introduction
  form.advantages = joinLines(profile.advantages)
  form.products = joinLines(profile.products)
  form.address = profile.address
  form.phone = profile.phone
  form.wechat = profile.wechat
  form.businessHours = profile.businessHours
  form.credentials = joinLines(profile.credentials)
  form.cases = joinLines(profile.cases)
  form.proofMaterials = joinLines(profile.proofMaterials)
}

function buildPayload(): ProfileUpdateRequest {
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
    phone: form.phone.trim(),
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

async function saveProfile(): Promise<void> {
  if (!form.companyName.trim()) {
    ElMessage.warning('请填写公司或门店全称')
    return
  }

  saving.value = true
  try {
    const profile = await updateMerchantProfile(buildPayload())
    savedProfile.value = profile
    fillForm(profile)
    emit('profileLoaded', profile)
    await appStore.loadBootstrap(true)
    ElMessage.success(`网站信息已保存为 V${profile.version}`)
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '网站信息保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void loadProfile()
})
</script>

<template>
  <div class="profile-page" :class="{ 'is-embedded': embedded }">
    <header v-if="!embedded" class="page-intro">
      <div>
        <span class="eyebrow">WEBSITE INFORMATION</span>
        <h2>网站信息设置</h2>
        <p>每个商户仅维护一套网站资料，用于企业站页面和联系方式展示。</p>
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

    <form v-else class="profile-form" @submit.prevent="saveProfile">
      <section class="form-card surface-panel">
        <header class="form-card-heading">
          <div><span>01</span><h3>网站基础信息</h3></div>
          <small>用于网站首页、企业介绍和基础元数据</small>
        </header>
        <div class="field-grid">
          <label class="field field-wide">
            <span>公司或门店全称 <i>*</i></span>
            <input v-model="form.companyName" maxlength="120" placeholder="例如：北京示例科技有限公司" />
          </label>
          <label class="field">
            <span>品牌简称</span>
            <input v-model="form.aliases" maxlength="200" placeholder="多个简称用顿号、逗号或换行分隔" />
          </label>
          <label class="field">
            <span>所属行业</span>
            <input v-model="form.industry" maxlength="80" placeholder="例如：企业数字化服务" />
          </label>
          <label class="field field-wide">
            <span>核心业务</span>
            <input v-model="form.coreBusiness" maxlength="300" placeholder="一句话说明主要服务或产品" />
          </label>
          <label class="field field-wide">
            <span>服务范围</span>
            <input v-model="form.serviceAreas" maxlength="300" placeholder="例如：北京、全国线上服务" />
          </label>
          <label class="field field-wide">
            <span>企业简介</span>
            <textarea v-model="form.introduction" rows="5" maxlength="6000" placeholder="仅填写可证实的企业介绍、经营范围与服务方式" />
          </label>
        </div>
      </section>

      <section class="form-card surface-panel">
        <header class="form-card-heading">
          <div><span>02</span><h3>网站业务与服务</h3></div>
          <small>每行一项，用于网站业务板块和服务详情展示</small>
        </header>
        <div class="field-grid dual-notes">
          <label class="field">
            <span>企业优势</span>
            <textarea v-model="form.advantages" rows="7" maxlength="2400" placeholder="每行一项，例如：真实项目经验" />
          </label>
          <label class="field">
            <span>产品与服务</span>
            <textarea v-model="form.products" rows="7" maxlength="4000" placeholder="每行一项，例如：企业内容获客方案" />
          </label>
        </div>
      </section>

      <section class="form-card surface-panel">
        <header class="form-card-heading">
          <div><span>03</span><h3>网站联系与信任信息</h3></div>
          <small>联系方式和资质材料仅在网站对应模块展示</small>
        </header>
        <div class="field-grid">
          <label class="field"><span>联系电话</span><input v-model="form.phone" maxlength="50" placeholder="400-000-0000" /></label>
          <label class="field"><span>微信</span><input v-model="form.wechat" maxlength="80" placeholder="微信号或企业微信" /></label>
          <label class="field field-wide"><span>地址</span><input v-model="form.address" maxlength="300" placeholder="详细办公或门店地址" /></label>
          <label class="field field-wide"><span>营业时间</span><input v-model="form.businessHours" maxlength="120" placeholder="例如：周一至周五 09:00–18:00" /></label>
          <label class="field"><span>资质与证明</span><textarea v-model="form.credentials" rows="5" maxlength="2400" placeholder="每行一项" /></label>
          <label class="field"><span>客户案例</span><textarea v-model="form.cases" rows="5" maxlength="4000" placeholder="只填写已授权、可复核的案例" /></label>
          <label class="field field-wide"><span>其他证明材料</span><textarea v-model="form.proofMaterials" rows="4" maxlength="4000" placeholder="每行一项，例如：客户授权材料已留存" /></label>
        </div>
        <div class="asset-note">
          <el-icon><UploadFilled /></el-icon>
          Logo、二维码、门店和产品图片从已上传图库中选用，网站信息页不重复保存图片文件。
        </div>
      </section>

      <div class="form-footer">
        <span>保存后会生成新的网站资料版本；需要重新生成站点才会更新预览。</span>
        <button class="primary-button" type="submit" :disabled="saving">
          <el-icon><CircleCheckFilled /></el-icon>{{ saving ? '保存中…' : '保存网站信息' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.profile-page { display: grid; max-width: 1440px; margin: 0 auto; gap: 16px; }
.profile-page.is-embedded { width: 100%; max-width: none; margin: 0; }
.page-intro, .intro-actions, .fact-notice, .form-card-heading, .form-footer, .asset-note { display: flex; align-items: center; }
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
.fact-notice strong { font-size: 13px; }
.fact-notice p { margin-top: 2px; color: var(--color-text-muted); font-size: 12px; }
.profile-form { display: grid; gap: 16px; }
.form-card { padding: 22px 24px; }
.form-card-heading { justify-content: space-between; padding-bottom: 17px; border-bottom: 1px solid var(--color-border); gap: 20px; }
.form-card-heading > div { display: flex; align-items: center; gap: 10px; }
.form-card-heading span { color: var(--color-champagne); font-family: var(--font-mono); font-size: 11px; }
h3 { font-size: 16px; font-weight: 650; }
.form-card-heading small { color: var(--color-text-muted); font-size: 11px; text-align: right; }
.field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); padding-top: 19px; gap: 16px; }
.field { display: grid; min-width: 0; gap: 7px; }
.field-wide { grid-column: 1 / -1; }
.field > span { color: var(--color-text-secondary); font-size: 12px; }
.field i { color: var(--color-danger); font-style: normal; }
input, textarea { width: 100%; border: 1px solid rgba(145,168,205,.25); border-radius: 8px; outline: none; color: var(--color-text); background: rgba(4,15,31,.48); font: inherit; transition: border-color var(--transition-fast), box-shadow var(--transition-fast); }
input { min-height: 40px; padding: 0 12px; }
textarea { min-height: 96px; padding: 10px 12px; line-height: 1.65; resize: vertical; }
input::placeholder, textarea::placeholder { color: #66748a; }
input:focus, textarea:focus { border-color: rgba(115,125,255,.76); box-shadow: var(--shadow-focus); }
.asset-note { min-height: 42px; margin-top: 18px; padding: 10px 12px; border: 1px dashed rgba(112,132,178,.26); border-radius: 8px; color: var(--color-text-muted); background: rgba(17,35,64,.28); font-size: 12px; gap: 8px; }
.asset-note .el-icon { color: #92a2ff; }
.form-footer { justify-content: space-between; padding: 0 2px; color: var(--color-text-muted); font-size: 12px; gap: 16px; }
.loading-panel { display: grid; min-height: 480px; padding: 24px; gap: 16px; }
.loading-panel span { display: block; height: 64px; border-radius: 9px; background: linear-gradient(90deg, rgba(120,143,182,.08), rgba(120,143,182,.18), rgba(120,143,182,.08)); background-size: 220% 100%; animation: shimmer 1.4s ease-in-out infinite; }
.error-panel { display: grid; min-height: 280px; place-items: center; align-content: center; padding: 32px; text-align: center; gap: 9px; }
.error-panel p { color: var(--color-text-muted); }
@keyframes shimmer { to { background-position: -220% 0; } }
@media (max-width: 760px) { .page-intro, .form-footer { align-items: flex-start; flex-direction: column; } .intro-actions { justify-content: flex-start; } .form-card { padding: 20px; } .form-card-heading { align-items: flex-start; flex-direction: column; } .form-card-heading small { text-align: left; } .field-grid { grid-template-columns: 1fr; } .field-wide { grid-column: auto; } .form-footer .primary-button { width: 100%; } }
</style>
