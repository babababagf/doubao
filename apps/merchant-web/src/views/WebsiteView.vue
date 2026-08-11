<script setup lang="ts">
import type { MerchantProfile, MerchantWebsite, WebsiteTemplate } from '@doubaohk/api-contract'
import { Check, Connection, DocumentChecked, Monitor, RefreshRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'

import { ApiError, isRealApiMode } from '@/services/http'
import { generateWebsite, generateWebsiteMock, getWebsite, updateWebsite } from '@/services/merchant.service'
import { formatDateTime } from '@/utils/format'
import WebsiteInformationForm from '@/views/ProfileView.vue'

type TemplateOption = { id: WebsiteTemplate; name: string; audience: string; description: string; accent: string; focus: string[] }
const templates: TemplateOption[] = [
  { id: 'minimal_enterprise', name: '简约企业型', audience: '企业服务、生产制造、专业机构', description: '强调企业定位、核心服务、可信依据、重点问题和联系方式。', accent: 'indigo', focus: ['企业定位', '核心服务', '重点问题', '联系方式'] },
  { id: 'local_store', name: '本地门店型', audience: '本地生活、门店、到店服务', description: '强调服务项目、营业时间、地址、地图入口和电话微信。', accent: 'teal', focus: ['门店信息', '服务项目', '到店指引', '常见问题'] },
  { id: 'brand_content', name: '品牌内容型', audience: '品牌介绍、案例与内容沉淀', description: '强调品牌故事、真实背书、案例专题和最新文章。', accent: 'gold', focus: ['品牌介绍', '真实背书', '案例专题', '内容文章'] },
]
const defaultTemplate = templates[0]!
const website = ref<MerchantWebsite | null>(null)
const companyName = ref('企业名称')
const loading = ref(true)
const saving = ref(false)
const generating = ref(false)
const errorMessage = ref('')
const selectedTemplate = computed(() => templates.find((item) => item.id === website.value?.template) ?? defaultTemplate)

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    website.value = await getWebsite()
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : '网站配置加载失败' } finally { loading.value = false }
}
async function selectTemplate(template: WebsiteTemplate): Promise<void> {
  if (!website.value || website.value.template === template) return
  saving.value = true
  try { website.value = await updateWebsite({ template }); ElMessage.success('模板选择已保存，待重新生成网站') } catch (error) { ElMessage.error(error instanceof ApiError ? error.message : '模板保存失败') } finally { saving.value = false }
}
async function generate(): Promise<void> {
  generating.value = true
  try { website.value = isRealApiMode ? await generateWebsite() : await generateWebsiteMock(); ElMessage.success(isRealApiMode ? (website.value.storageState === 'uploaded' ? '站点制品已完整写入所属贴牌对象存储，等待域名发布' : '本地静态网站已生成，请打开预览核验内容') : '本地 Mock 网站已生成；未创建域名或上传静态文件') } catch (error) { ElMessage.error(error instanceof ApiError ? error.message : '站点生成失败') } finally { generating.value = false }
}
function handleProfileLoaded(profile: MerchantProfile): void {
  companyName.value = profile.companyName
}
onMounted(() => { void load() })
</script>

<template>
  <div class="website-page">
    <header class="page-intro"><div><span class="eyebrow">ENTERPRISE SITE STUDIO</span><h2>企业网站</h2><p>每个商户仅维护一套网站信息、一个内容站；网站资料与文章使用的企业信息库互不影响。</p></div><button class="secondary-button" type="button" :disabled="loading" @click="load"><el-icon><RefreshRight /></el-icon>刷新</button></header>
    <section class="notice surface-panel"><el-icon><DocumentChecked /></el-icon><p v-if="isRealApiMode"><strong>静态站制品：</strong>生成主页、已发布文章页、sitemap 与 robots；所属贴牌 OSS 可用时写入不可变版本目录。上传完成不等于域名已切换，正式发布仍需独立确认。</p><p v-else><strong>本地 Mock 模式：</strong>“生成网站”仅更新本地 Mock 状态。不会分配二级域名、上传对象存储、配置 HTTPS 或对外发布。</p></section>
    <section class="information-head"><div><span class="panel-kicker">01 · WEBSITE INFORMATION</span><h3>网站信息设置</h3></div><p>每个商户只保存一套，直接编辑后保存，不需要新建信息库。</p></section>
    <WebsiteInformationForm embedded @profile-loaded="handleProfileLoaded" />
    <section v-if="errorMessage" class="error-panel surface-panel"><strong>网站配置加载失败</strong><p>{{ errorMessage }}</p><button class="secondary-button" type="button" @click="load">重新加载</button></section>
    <template v-else-if="website">
      <section class="site-status surface-panel"><div><span class="panel-kicker">SITE STATUS</span><strong>{{ website.status === 'published' ? '网站已发布' : website.status === 'local_ready' ? (website.storageState === 'uploaded' ? '对象存储制品已就绪' : (isRealApiMode ? '本地静态站已生成' : '本地 Mock 已生成')) : '尚未生成网站' }}</strong><p>{{ website.artifactUploadedAt ? `制品上传：${formatDateTime(website.artifactUploadedAt)}；尚未自动切换域名` : website.lastGeneratedAt ? `最近本地生成：${formatDateTime(website.lastGeneratedAt)}` : '选择模板后创建本地静态站生成记录。' }}</p></div><dl><div><dt>模板</dt><dd>{{ selectedTemplate.name }}</dd></div><div><dt>正式主机名</dt><dd>{{ website.hostname || '尚未分配' }}</dd></div><div><dt>站点版本</dt><dd>V{{ website.version }}</dd></div><div><dt>资料引用</dt><dd>{{ website.profileVersion ? `网站信息 V${website.profileVersion}` : '待生成' }}</dd></div></dl><a v-if="isRealApiMode && website.previewUrl" class="secondary-button" :href="website.previewUrl" target="_blank" rel="noopener">打开本地预览</a><button class="primary-button" type="button" :disabled="generating || saving" @click="generate"><el-icon><Connection /></el-icon>{{ generating ? '站点制品生成中…' : (isRealApiMode ? '生成站点制品' : '生成本地 Mock 网站') }}</button></section>
      <section class="template-head"><div><span class="panel-kicker">02 · TEMPLATE SELECTION</span><h3>选择网站模板</h3></div><p>切换模板不会丢失网站信息和文章；真实环境需重新生成静态站并保留上一版，避免半成品上线。</p></section>
      <section class="template-grid"><article v-for="template in templates" :key="template.id" class="template-card surface-panel" :class="[`tone-${template.accent}`, { selected: website.template === template.id }]" @click="selectTemplate(template.id)"><header><div><span class="template-index">0{{ templates.indexOf(template)+1 }}</span><h3>{{ template.name }}</h3></div><el-icon v-if="website.template === template.id"><Check /></el-icon></header><div class="mini-site"><div class="mini-nav"><i /><span>{{ companyName }}</span><b /></div><div class="mini-hero"><span>{{ template.name }}</span><strong>{{ template.focus[0] }}</strong><small>{{ template.focus[1] }} · {{ template.focus[2] }}</small></div><div class="mini-columns"><i v-for="item in 3" :key="item" /></div></div><p>{{ template.description }}</p><dl><div><dt>适用</dt><dd>{{ template.audience }}</dd></div><div><dt>首页重点</dt><dd>{{ template.focus.join('、') }}</dd></div></dl><button type="button" :disabled="saving" @click.stop="selectTemplate(template.id)">{{ website.template === template.id ? '当前模板' : '选用此模板' }}</button></article></section>
      <section class="data-boundary surface-panel"><el-icon><Monitor /></el-icon><div><strong>站点数据边界</strong><p>页面主内容与联系方式仅来自本页的单套网站信息、可发布文章和选用图片；不读取 AI 写作的企业信息库，不生成城市分站或虚假数据。</p></div></section>
    </template>
  </div>
</template>

<style scoped>
.website-page{display:grid;max-width:1500px;margin:0 auto;gap:16px}.page-intro,.notice,.site-status,.site-status dl,.template-head,.template-card header,.data-boundary{display:flex;align-items:center}.page-intro{justify-content:space-between;gap:20px}.eyebrow,.panel-kicker{display:block;color:var(--color-champagne);font-family:var(--font-mono);font-size:10px;letter-spacing:.13em}.eyebrow{margin-bottom:5px}h2,h3,p{margin:0}h2{font-size:26px;font-weight:670;letter-spacing:-.035em}.page-intro p{margin-top:5px;color:var(--color-text-secondary)}.secondary-button,.primary-button{display:inline-flex;min-height:38px;align-items:center;justify-content:center;padding:0 14px;border:1px solid var(--color-border-strong);border-radius:8px;color:var(--color-text-secondary);background:rgba(13,28,52,.68);cursor:pointer;gap:7px}.primary-button{border-color:rgba(113,111,255,.62);color:#fff;background:var(--gradient-primary)}button:disabled{cursor:not-allowed;opacity:.5}.notice{padding:13px 16px;border-color:rgba(102,203,221,.24);align-items:flex-start;color:var(--color-text-secondary);gap:10px}.notice .el-icon,.data-boundary>.el-icon{margin-top:1px;color:#61d2e8;font-size:18px}.notice p,.data-boundary p{font-size:12px;line-height:1.65}.site-status{justify-content:space-between;padding:18px 20px;gap:20px}.site-status strong{display:block;margin-top:5px;font-size:18px}.site-status p{margin-top:4px;color:var(--color-text-muted);font-size:11px}.site-status dl{gap:24px;margin:0;margin-left:auto}.site-status dl div{display:grid;gap:3px}.site-status dt{color:var(--color-text-muted);font-size:10px}.site-status dd{margin:0;color:var(--color-text-secondary);font-family:var(--font-mono);font-size:11px}.template-head{justify-content:space-between;gap:25px}.panel-kicker{margin-bottom:4px;color:var(--color-text-muted)}h3{font-size:17px;font-weight:650}.template-head p{max-width:550px;color:var(--color-text-muted);font-size:12px;line-height:1.6}.template-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.template-card{padding:16px;cursor:pointer;transition:.18s ease}.template-card:hover,.template-card.selected{transform:translateY(-2px);border-color:rgba(118,130,255,.62);box-shadow:0 18px 36px rgba(1,8,23,.32)}.template-card header{justify-content:space-between}.template-card header>div{display:flex;align-items:center;gap:9px}.template-index{color:#8e98d6;font-family:var(--font-mono);font-size:11px}.template-card header .el-icon{display:grid;width:25px;height:25px;place-items:center;border-radius:50%;color:#0c1729;background:#b7baff}.mini-site{overflow:hidden;margin:16px 0 13px;border:1px solid rgba(159,176,220,.2);border-radius:8px;background:#e7edf8;color:#17233d}.mini-nav{display:flex;align-items:center;height:26px;padding:0 8px;background:#fff;gap:5px;font-size:7px}.mini-nav i,.mini-nav b{display:block;width:9px;height:9px;border-radius:2px;background:#696be9}.mini-nav b{width:22px;height:4px;margin-left:auto;background:#b8c3d7}.mini-hero{display:grid;min-height:108px;padding:15px;background:linear-gradient(140deg,#dce2f5,#aeb9eb);align-content:center;gap:4px}.mini-hero span{font-size:7px}.mini-hero strong{font-size:17px}.mini-hero small{font-size:7px}.mini-columns{display:grid;grid-template-columns:repeat(3,1fr);padding:9px;gap:7px}.mini-columns i{display:block;height:29px;border-radius:3px;background:#bdc9dd}.tone-teal .mini-hero{background:linear-gradient(140deg,#d9efeb,#9ad4ca)}.tone-teal .mini-nav i{background:#228d86}.tone-gold .mini-hero{background:linear-gradient(140deg,#f1eadc,#d8b776)}.tone-gold .mini-nav i{background:#9b6a1c}.template-card>p{min-height:38px;color:var(--color-text-secondary);font-size:12px;line-height:1.55}.template-card dl{display:grid;margin:12px 0;gap:6px}.template-card dl div{display:grid;grid-template-columns:54px 1fr;gap:8px}.template-card dt{color:var(--color-text-muted);font-size:10px}.template-card dd{margin:0;color:#b7c2d6;font-size:10px;line-height:1.5}.template-card button{width:100%;min-height:35px;border:1px solid rgba(119,130,255,.42);border-radius:7px;color:#c7caff;background:rgba(82,82,205,.11);cursor:pointer}.template-card.selected button{color:#fff;background:rgba(100,96,236,.4)}.data-boundary{padding:14px 16px;color:var(--color-text-secondary);align-items:flex-start;gap:10px}.data-boundary strong{font-size:12px}.data-boundary p{margin-top:3px;color:var(--color-text-muted)}.error-panel{display:grid;min-height:230px;place-items:center;align-content:center;padding:30px;text-align:center;gap:8px}.error-panel p{color:var(--color-text-muted)}@media(max-width:1050px){.site-status{display:grid}.site-status dl{margin-left:0}.template-grid{grid-template-columns:1fr}}@media(max-width:680px){.page-intro,.template-head{align-items:flex-start;flex-direction:column}.site-status dl{display:grid;grid-template-columns:1fr 1fr;gap:10px}.site-status .primary-button{width:100%}}
.information-head{display:flex;align-items:center;justify-content:space-between;gap:25px}.information-head p{max-width:550px;color:var(--color-text-muted);font-size:12px;line-height:1.6}
@media(max-width:680px){.information-head{align-items:flex-start;flex-direction:column}}
</style>
