<script setup lang="ts">
import type { WebsiteTemplate, WebsiteThemePreset } from '@doubaohk/api-contract'
import { ChatLineRound, Clock, Location, Medal, OfficeBuilding, Picture, Service, Shop, User, Van } from '@element-plus/icons-vue'
import { computed, nextTick, ref, watch } from 'vue'

export type WebsitePreviewSection = 'hero' | 'services' | 'trust' | 'showcase' | 'articles' | 'contact'

const props = withDefaults(defineProps<{
  template: WebsiteTemplate
  theme: WebsiteThemePreset
  companyName?: string
  industry?: string
  coreBusiness?: string
  introduction?: string
  products?: string[]
  advantages?: string[]
  address?: string
  nearbyLandmark?: string
  transportGuide?: string
  parkingGuide?: string
  businessHours?: string
  phoneContacts?: Array<{ label: string; phone: string }>
  articleCount?: number
  heroImageUrl?: string | null
  showcaseImageUrls?: string[]
  activeSection?: WebsitePreviewSection
  mode?: 'workspace' | 'editor' | 'thumbnail'
}>(), {
  companyName: '',
  industry: '',
  coreBusiness: '',
  introduction: '',
  products: () => [],
  advantages: () => [],
  address: '',
  nearbyLandmark: '',
  transportGuide: '',
  parkingGuide: '',
  businessHours: '',
  phoneContacts: () => [],
  articleCount: 0,
  heroImageUrl: null,
  showcaseImageUrls: () => [],
  activeSection: 'hero',
  mode: 'workspace',
})

const emit = defineEmits<{ sectionSelect: [section: WebsitePreviewSection] }>()
const viewport = ref<HTMLElement | null>(null)

const palette = computed(() => ({
  terracotta: { accent: '#C6532D', dark: '#71301F', soft: '#FFF2EB' },
  forest: { accent: '#1F6B5B', dark: '#123F36', soft: '#EAF6F2' },
  blue: { accent: '#2F5FCC', dark: '#17377F', soft: '#EDF3FF' },
  brick: { accent: '#B64B3A', dark: '#6F2D24', soft: '#FFF0ED' },
  violet: { accent: '#7658A5', dark: '#453263', soft: '#F4EFFE' },
  graphite_gold: { accent: '#9A6A32', dark: '#4D3A23', soft: '#FBF4E8' },
}[props.theme]))
const isStore = computed(() => props.template === 'local_store')
const articleName = computed(() => isStore.value ? '本地服务指南' : props.template === 'brand_content' ? '品牌内容' : '行业洞察')
const serviceItems = computed(() => (props.products.length ? props.products : ['核心服务项目', '专业解决方案', '持续运营支持']).slice(0, 6))
const advantageItems = computed(() => (props.advantages.length ? props.advantages : ['流程清晰', '服务透明', '长期维护']).slice(0, 4))
const visiblePhones = computed(() => props.phoneContacts.filter((item) => item.phone.trim()).slice(0, 3))
const primaryPhone = computed(() => visiblePhones.value[0]?.phone || '联系电话填写后显示')
const heroTitle = computed(() => props.coreBusiness || (isStore.value ? '专业服务，让每一次到店更安心' : '以专业能力解决企业真实业务问题'))
const displayedHeroImageUrl = computed(() => props.heroImageUrl || (isStore.value ? null : '/site-preview/minimal-enterprise-hero.webp'))
const displayedShowcaseImageUrls = computed(() => props.showcaseImageUrls)
const serviceIcons = [Service, User, Medal, ChatLineRound, Clock, OfficeBuilding]
const arrivalItems = computed(() => [
  { label: '门店地址', value: props.address || '门店地址填写后显示', icon: Location },
  { label: '附近地标', value: props.nearbyLandmark || '附近地标填写后显示', icon: OfficeBuilding },
  { label: '公交 / 地铁', value: props.transportGuide || '公共交通说明填写后显示', icon: Van },
  { label: '停车说明', value: props.parkingGuide || '停车说明填写后显示', icon: Shop },
])

function selectSection(section: WebsitePreviewSection): void {
  if (props.mode === 'thumbnail') return
  emit('sectionSelect', section)
}

async function focusSection(section: WebsitePreviewSection): Promise<void> {
  await nextTick()
  const previewViewport = viewport.value
  const target = previewViewport?.querySelector<HTMLElement>(`[data-preview-section="${section}"]`)
  if (!previewViewport || !target) return

  // scrollIntoView 会连带滚动弹窗及左侧表单。这里只允许右侧预览容器自身定位。
  const viewportRect = previewViewport.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const centeredOffset = (previewViewport.clientHeight - targetRect.height) / 2
  const nextScrollTop = previewViewport.scrollTop + targetRect.top - viewportRect.top - centeredOffset
  const maxScrollTop = Math.max(0, previewViewport.scrollHeight - previewViewport.clientHeight)
  previewViewport.scrollTo({
    top: Math.min(maxScrollTop, Math.max(0, nextScrollTop)),
    behavior: 'smooth',
  })
}

watch(() => props.activeSection, (section) => { void focusSection(section) })
defineExpose({ focusSection })
</script>

<template>
  <div
    class="live-preview"
    :class="[`is-${mode}`, `is-${template}`]"
    :style="{ '--site-accent': palette.accent, '--site-dark': palette.dark, '--site-soft': palette.soft }"
  >
    <div class="browser-chrome">
      <div class="window-dots"><i /><i /><i /></div>
      <div class="address-bar"><span>https://</span>{{ companyName || '企业官网' }}.com</div>
      <div class="browser-actions"><i /><i /></div>
    </div>
    <div ref="viewport" class="preview-viewport">
      <div class="preview-scale-shell">
        <article v-if="isStore" class="desktop-site store-desktop-site">
          <div class="store-utility-bar"><div><span><el-icon><Clock /></el-icon>{{ businessHours || '营业时间填写后显示' }}</span><span><el-icon><Location /></el-icon>{{ address || '门店地址填写后显示' }}</span></div><strong>{{ primaryPhone }}</strong></div>
          <header class="store-site-header"><div class="store-site-brand"><span><el-icon><Shop /></el-icon></span><div><strong>{{ companyName || '门店全称' }}</strong><small>{{ industry || '本地专业服务' }}</small></div></div><nav><a>首页</a><a>核心服务</a><a>到店指南</a><a>门店环境</a><a>{{ articleName }}</a></nav><button type="button">联系方式</button></header>

          <section class="preview-section store-hero-preview" :class="{ active: activeSection === 'hero' }" data-preview-section="hero" @click="selectSection('hero')">
            <div class="store-hero-copy"><small>LOCAL SERVICE</small><h1>{{ companyName || '门店全称' }}</h1><p>{{ introduction || '门店简介将显示在首屏，清楚说明门店提供的服务、所在区域与主要特色。' }}</p><div><button type="button">了解服务项目</button><span>查看联系方式</span></div></div>
            <figure><img v-if="displayedHeroImageUrl" :src="displayedHeroImageUrl || undefined" alt="门店首屏主图预览" /><div v-else class="store-image-placeholder"><el-icon><Shop /></el-icon><strong>{{ companyName || '门店全称' }}</strong><small>可在官网图片版位设置门店照片</small></div></figure>
          </section>

          <section class="preview-section store-services-preview" :class="{ active: activeSection === 'services' }" data-preview-section="services" @click="selectSection('services')">
            <header><div><small>OUR SERVICES</small><h2>核心服务</h2></div><p>按门店实际提供的项目展示</p></header><div class="store-service-grid"><article v-for="(item, index) in serviceItems" :key="`${item}-${index}`"><span class="store-service-icon"><el-icon><component :is="serviceIcons[index % serviceIcons.length]" /></el-icon></span><strong>{{ item }}</strong><p>展示项目内容、适用对象与门店服务特点。</p><em>0{{ index + 1 }}</em></article></div>
          </section>

          <section class="preview-section store-arrival-preview" :class="{ active: activeSection === 'trust' || activeSection === 'showcase' }" data-preview-section="trust" @click="selectSection('trust')">
            <div class="store-arrival-card"><small>VISIT GUIDE</small><h2>到店指南</h2><div v-for="item in arrivalItems" :key="item.label"><el-icon><component :is="item.icon" /></el-icon><span><strong>{{ item.label }}</strong><small>{{ item.value }}</small></span></div></div>
            <div class="store-showcase-grid" data-preview-section="showcase" @click.stop="selectSection('showcase')"><figure v-for="index in 3" :key="index"><img v-if="displayedShowcaseImageUrls[index - 1]" :src="displayedShowcaseImageUrls[index - 1]" :alt="`门店环境图${index}`" /><div v-else class="store-space-placeholder"><el-icon><Picture /></el-icon><span>{{ index === 1 ? '门店外观' : index === 2 ? '服务空间' : '环境细节' }}</span></div></figure></div>
          </section>

          <section class="preview-section store-articles-preview" :class="{ active: activeSection === 'articles' }" data-preview-section="articles" @click="selectSection('articles')"><header><div><small>LOCAL GUIDE</small><h2>{{ articleName }}</h2></div><span>共 {{ articleCount }} 篇</span></header><div class="store-article-grid"><article v-for="index in 4" :key="index"><span>指南 0{{ index }}</span><strong>本地服务常见问题与实用选择建议</strong><p>通过清晰、可信的内容帮助访客和 AI 理解门店服务。</p><em>阅读全文 →</em></article></div></section>

          <footer class="preview-section store-contact-preview" :class="{ active: activeSection === 'contact' }" data-preview-section="contact" @click="selectSection('contact')"><div><small>CONTACT</small><h2>联系我们</h2><p>{{ address || '门店详细地址' }}</p><p>{{ businessHours || '营业时间' }}</p></div><div class="store-contact-list"><span v-for="contact in visiblePhones" :key="`${contact.label}-${contact.phone}`"><small>{{ contact.label }}</small><strong>{{ contact.phone }}</strong></span><span v-if="!visiblePhones.length"><small>联系电话</small><strong>填写后显示</strong></span></div></footer>
        </article>

        <article v-else class="desktop-site">
          <header class="site-header">
            <div class="site-brand"><span>{{ isStore ? '店' : '企' }}</span><strong>{{ companyName || '公司或门店全称' }}</strong></div>
            <nav><a>首页</a><a>核心业务</a><a>{{ articleName }}</a><a>联系我们</a></nav>
            <button type="button">查看联系方式</button>
          </header>

          <section
            class="preview-section site-hero"
            :class="{ active: activeSection === 'hero' }"
            data-preview-section="hero"
            @click="selectSection('hero')"
          >
            <div class="hero-copy">
              <small>{{ industry || (isStore ? '本地专业服务' : '企业专业服务') }}</small>
              <h1>{{ heroTitle }}</h1>
              <p>{{ introduction || '企业简介将显示在首屏，用于说明企业是谁、提供什么服务以及主要优势。' }}</p>
              <div><button type="button">了解核心业务</button><span>联系方式 →</span></div>
            </div>
            <div class="hero-media">
              <img :src="displayedHeroImageUrl || undefined" alt="首屏主图预览" />
              <em>{{ heroImageUrl ? '自选首屏图' : '模板默认图' }}</em>
            </div>
          </section>

          <section
            class="preview-section site-services"
            :class="{ active: activeSection === 'services' }"
            data-preview-section="services"
            @click="selectSection('services')"
          >
            <header><div><small>OUR SERVICES</small><h2>{{ isStore ? '服务项目' : '核心业务' }}</h2></div><p>根据填写数量自动排列</p></header>
            <div class="service-grid">
              <article v-for="(item, index) in serviceItems" :key="`${item}-${index}`"><span>0{{ index + 1 }}</span><strong>{{ item }}</strong><p>围绕真实业务资料展示服务内容与交付价值。</p></article>
            </div>
          </section>

          <section
            class="preview-section trust-strip"
            :class="{ active: activeSection === 'trust' }"
            data-preview-section="trust"
            @click="selectSection('trust')"
          >
            <strong>{{ isStore ? '为什么选择我们' : '服务优势' }}</strong>
            <div><span v-for="item in advantageItems" :key="item">✓ {{ item }}</span></div>
          </section>

          <section
            v-if="isStore"
            class="preview-section site-showcase"
            :class="{ active: activeSection === 'showcase' }"
            data-preview-section="showcase"
            @click="selectSection('showcase')"
          >
            <header><small>STORE SPACE</small><h2>门店环境</h2></header>
            <div class="showcase-grid">
              <figure v-for="index in 3" :key="index">
                <img :src="displayedShowcaseImageUrls[index - 1]" :alt="`环境展示图${index}`" />
              </figure>
            </div>
          </section>

          <section
            class="preview-section site-articles"
            :class="{ active: activeSection === 'articles' }"
            data-preview-section="articles"
            @click="selectSection('articles')"
          >
            <header><div><small>GEO CONTENT</small><h2>{{ articleName }}</h2></div><span>共 {{ articleCount }} 篇</span></header>
            <div class="article-list">
              <article v-for="index in 3" :key="index"><i /><div><strong>{{ isStore ? '本地服务常见问题与选择建议' : '行业问题的专业分析与实用指南' }}</strong><p>文章摘要将在这里展示，帮助访客和 AI 更清晰地理解业务信息。</p></div><span>阅读全文 →</span></article>
            </div>
          </section>

          <footer
            class="preview-section site-contact"
            :class="{ active: activeSection === 'contact' }"
            data-preview-section="contact"
            @click="selectSection('contact')"
          >
            <div><small>CONTACT</small><h2>联系我们</h2><p>{{ address || '企业或门店详细地址' }}</p><p>{{ businessHours || '营业时间或服务时间' }}</p></div>
            <div class="contact-list"><span v-for="contact in visiblePhones" :key="`${contact.label}-${contact.phone}`"><small>{{ contact.label }}</small><strong>{{ contact.phone }}</strong></span><span v-if="!visiblePhones.length"><small>联系电话</small><strong>填写后显示</strong></span></div>
          </footer>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.live-preview{overflow:hidden;border:1px solid #d9e0ec;border-radius:12px;background:#e9edf4;box-shadow:0 18px 45px rgba(31,45,78,.12)}.browser-chrome{display:grid;height:42px;grid-template-columns:78px minmax(0,1fr) 78px;align-items:center;padding:0 14px;border-bottom:1px solid #dce2ec;background:#f8fafc}.window-dots,.browser-actions{display:flex;align-items:center;gap:6px}.window-dots i{width:8px;height:8px;border-radius:50%;background:#c5cbd6}.window-dots i:first-child{background:#ef7f78}.window-dots i:nth-child(2){background:#e9bd60}.window-dots i:nth-child(3){background:#65bd81}.address-bar{overflow:hidden;max-width:520px;justify-self:center;padding:6px 30px;border:1px solid #dfe4ec;border-radius:7px;color:#7e899c;background:#fff;font-size:11px;text-align:center;text-overflow:ellipsis;white-space:nowrap}.address-bar span{color:#a6aebb}.browser-actions{justify-content:flex-end}.browser-actions i{width:17px;height:17px;border:1px solid #d6dde8;border-radius:4px;background:#fff}.preview-viewport{overflow:auto;max-height:640px;padding:18px;background:#e9edf4}.preview-scale-shell{--preview-scale:.67;width:calc(1280px * var(--preview-scale));height:calc(1100px * var(--preview-scale));margin:0 auto}.is-editor .preview-viewport{max-height:690px;padding:12px}.is-editor .preview-scale-shell{--preview-scale:.46}.desktop-site{width:1280px;min-height:1100px;overflow:hidden;transform:scale(var(--preview-scale));transform-origin:top left;color:#10213e;background:#fff;font-family:"Microsoft YaHei","PingFang SC",sans-serif;box-shadow:0 8px 30px rgba(25,37,64,.08)}.site-header{display:flex;height:74px;align-items:center;justify-content:space-between;padding:0 70px;border-bottom:1px solid #e7ebf1;background:#fff}.site-brand{display:flex;max-width:360px;align-items:center;gap:12px}.site-brand>span{display:grid;width:38px;height:38px;place-items:center;border-radius:9px;color:#fff;background:var(--site-accent);font-weight:800}.site-brand strong{overflow:hidden;font-size:18px;text-overflow:ellipsis;white-space:nowrap}.site-header nav{display:flex;gap:28px;font-size:13px;font-weight:650}.site-header button,.hero-copy button{border:0;border-radius:5px;color:#fff;background:var(--site-accent);font-weight:700}.site-header button{padding:13px 20px}.preview-section{position:relative;cursor:pointer;transition:box-shadow .18s ease}.preview-section.active{z-index:2;box-shadow:inset 0 0 0 4px var(--site-accent),0 0 0 7px color-mix(in srgb,var(--site-accent) 18%,transparent)}.site-hero{display:grid;min-height:430px;grid-template-columns:1fr 1fr;background:var(--site-soft)}.hero-copy{display:grid;padding:74px 44px 70px 70px;align-content:center;gap:22px}.hero-copy small,.site-services header small,.site-showcase header small,.site-articles header small,.site-contact small{color:var(--site-accent);font-size:12px;font-weight:800;letter-spacing:.1em}.hero-copy h1{max-width:560px;margin:0;font-size:42px;line-height:1.25;letter-spacing:-.04em}.hero-copy p{display:-webkit-box;overflow:hidden;max-width:570px;margin:0;color:#60708a;font-size:15px;line-height:1.9;-webkit-box-orient:vertical;-webkit-line-clamp:4}.hero-copy>div{display:flex;align-items:center;gap:26px}.hero-copy button{padding:14px 23px}.hero-copy span{color:var(--site-accent);font-size:14px;font-weight:700}.hero-media{position:relative;overflow:hidden;min-height:430px;background:#dbe5f1}.hero-media img{width:100%;height:100%;object-fit:cover}.hero-media em{position:absolute;right:18px;bottom:18px;padding:7px 10px;border-radius:4px;color:#fff;background:rgba(8,19,36,.74);font-size:11px;font-style:normal}.default-visual{position:absolute;inset:0;display:grid;place-items:center;overflow:hidden;background:linear-gradient(135deg,var(--site-soft),color-mix(in srgb,var(--site-accent) 36%,#dce7f4))}.default-visual i{position:absolute;width:210px;height:210px;border:1px solid color-mix(in srgb,var(--site-accent) 35%,transparent);border-radius:50%}.default-visual i:nth-child(2){width:330px;height:330px}.default-visual i:nth-child(3){width:450px;height:450px}.default-visual strong{z-index:1;padding:13px 18px;border:1px solid rgba(255,255,255,.62);border-radius:5px;color:#fff;background:rgba(13,34,67,.24);backdrop-filter:blur(7px)}.site-services,.site-showcase,.site-articles{padding:62px 70px}.site-services>header,.site-articles>header{display:flex;align-items:end;justify-content:space-between;margin-bottom:30px}.site-services h2,.site-showcase h2,.site-articles h2,.site-contact h2{margin:5px 0 0;font-size:30px}.site-services header p,.site-articles header>span{color:#8390a3;font-size:13px}.service-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#dfe5ee;border:1px solid #dfe5ee}.service-grid article{display:grid;min-height:132px;padding:25px;background:#fff;gap:10px}.service-grid article>span{color:var(--site-accent);font-family:monospace;font-size:11px}.service-grid article strong{font-size:17px}.service-grid article p{margin:0;color:#758299;font-size:12px;line-height:1.65}.trust-strip{display:flex;min-height:116px;align-items:center;justify-content:space-between;padding:30px 70px;color:#fff;background:var(--site-dark)}.trust-strip>strong{font-size:24px}.trust-strip>div{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:12px}.trust-strip span{padding:8px 12px;border:1px solid rgba(255,255,255,.2);border-radius:3px;font-size:12px}.site-showcase{background:#f7f4ee}.site-showcase header{margin-bottom:25px}.showcase-grid{display:grid;height:250px;grid-template-columns:1.3fr 1fr 1fr;gap:12px}.showcase-grid figure{display:grid;overflow:hidden;margin:0;place-items:center;color:#836f57;background:#e9dfd2}.showcase-grid img{width:100%;height:100%;object-fit:cover}.showcase-grid span{font-size:13px}.site-articles{background:#f7f9fc}.article-list{display:grid;gap:12px}.article-list article{display:grid;grid-template-columns:135px 1fr 100px;min-height:90px;align-items:center;padding:12px;border:1px solid #e1e6ef;border-radius:5px;background:#fff;gap:18px}.article-list i{height:66px;background:linear-gradient(135deg,var(--site-soft),color-mix(in srgb,var(--site-accent) 22%,white))}.article-list strong{font-size:15px}.article-list p{overflow:hidden;margin:8px 0 0;color:#748198;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.article-list>article>span{color:var(--site-accent);font-size:12px;font-weight:700}.site-contact{display:flex;min-height:235px;align-items:center;justify-content:space-between;padding:52px 70px;color:#fff;background:#11243e}.site-contact p{margin:10px 0 0;color:#b8c5d5;font-size:13px}.contact-list{display:grid;min-width:390px;gap:8px}.contact-list>span{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border:1px solid rgba(255,255,255,.14)}.contact-list small{color:#aebbd0;letter-spacing:0}.contact-list strong{font-size:16px}.is-local_store .site-hero{background:#fff8ed}.is-local_store .site-header{border-top:4px solid var(--site-accent)}.is-local_store .site-brand>span{border-radius:50%}.is-local_store .service-grid article{border-top:3px solid var(--site-accent)}.is-brand_content .site-hero{grid-template-columns:1.15fr .85fr}.is-brand_content .desktop-site{font-family:Georgia,"Noto Serif SC",serif}.is-brand_content .site-header button{display:none}@media(max-width:900px){.is-workspace .preview-scale-shell{--preview-scale:.55}}
.store-desktop-site{color:#262822;background:#fffaf3}.store-utility-bar{display:flex;height:34px;align-items:center;justify-content:space-between;padding:0 70px;color:#756e62;background:#f5eee3;font-size:11px}.store-utility-bar div{display:flex;align-items:center;gap:14px}.store-utility-bar b{font-weight:600}.store-utility-bar i{width:1px;height:11px;background:#d2c7b8}.store-site-header{display:flex;height:84px;align-items:center;justify-content:space-between;padding:0 70px;border-bottom:1px solid #e7ded1;background:#fff}.store-site-brand{display:flex;max-width:390px;align-items:center;gap:13px}.store-site-brand>span{display:grid;width:45px;height:45px;place-items:center;border:2px solid var(--site-accent);border-radius:10px;color:var(--site-accent);font-size:17px;font-weight:900}.store-site-brand>div{display:grid;gap:3px}.store-site-brand strong{overflow:hidden;max-width:310px;font-size:18px;text-overflow:ellipsis;white-space:nowrap}.store-site-brand small{color:#8a8174;font-size:10px}.store-site-header nav{display:flex;gap:24px;font-size:12px;font-weight:700}.store-site-header nav a:first-child{color:var(--site-accent)}.store-site-header button,.store-hero-card button{border:0;border-radius:4px;color:#fff;background:var(--site-accent);font-weight:800}.store-site-header button{padding:13px 19px}.store-hero-preview{position:relative;min-height:470px;overflow:hidden;background:#d8ccbc}.store-hero-preview>figure{position:absolute;inset:0;margin:0}.store-hero-preview>figure:after{position:absolute;inset:0;background:linear-gradient(90deg,rgba(23,27,25,.16),rgba(23,27,25,.02) 55%,rgba(23,27,25,.16));content:""}.store-hero-preview>figure img{width:100%;height:100%;object-fit:cover}.store-hero-preview>figure em{position:absolute;right:20px;bottom:18px;z-index:1;padding:7px 10px;color:#fff;background:rgba(20,23,20,.68);font-size:10px;font-style:normal}.store-hero-card{position:relative;z-index:1;width:470px;margin:62px 0 62px 70px;padding:38px 42px;border-top:5px solid var(--site-accent);background:rgba(255,255,255,.95);box-shadow:0 22px 55px rgba(33,28,20,.18)}.store-hero-card>small,.store-services-preview header small,.store-showcase-preview header small,.store-advantage-panel>small,.store-articles-preview header small,.store-contact-preview>div>small{color:var(--site-accent);font-size:10px;font-weight:900;letter-spacing:.14em}.store-hero-card h1{margin:13px 0 12px;font-family:"Songti SC","STSong",serif;font-size:39px;line-height:1.28;letter-spacing:-.03em}.store-hero-card>p{display:-webkit-box;overflow:hidden;margin:0;color:#6f6a62;font-size:13px;line-height:1.8;-webkit-box-orient:vertical;-webkit-line-clamp:3}.store-hero-card dl{display:grid;margin:20px 0 23px;padding:14px 0;border-block:1px solid #e6ddd2;gap:9px}.store-hero-card dl>div{display:grid;grid-template-columns:68px 1fr;gap:12px}.store-hero-card dt{color:#9a9185;font-size:11px}.store-hero-card dd{overflow:hidden;margin:0;font-size:11px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}.store-hero-card button{padding:13px 20px}.store-services-preview,.store-showcase-preview,.store-articles-preview{padding:60px 70px}.store-services-preview>header,.store-showcase-preview>header,.store-articles-preview>header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:28px}.store-services-preview h2,.store-showcase-preview h2,.store-articles-preview h2,.store-advantage-panel h2,.store-contact-preview h2{margin:6px 0 0;font-family:"Songti SC","STSong",serif;font-size:31px}.store-services-preview header p,.store-showcase-preview header p,.store-articles-preview header>span{margin:0;color:#8c8477;font-size:12px}.store-service-grid{display:grid;grid-template-columns:repeat(2,1fr);border-top:1px solid #e6ded2;border-left:1px solid #e6ded2}.store-service-grid article{display:grid;min-height:118px;grid-template-columns:58px 1fr 54px;align-items:center;padding:21px 22px;border-right:1px solid #e6ded2;border-bottom:1px solid #e6ded2;background:#fff;gap:15px}.store-service-icon{position:relative;display:grid;width:48px;height:48px;place-items:center;border:1px solid color-mix(in srgb,var(--site-accent) 35%,#ddd);color:var(--site-accent)}.store-service-icon i{position:absolute;width:19px;height:19px;border:2px solid currentColor;border-radius:50%}.store-service-icon b{position:absolute;right:-6px;bottom:-6px;padding:2px 4px;color:#fff;background:var(--site-accent);font-size:9px}.store-service-grid article>div{display:grid;gap:7px}.store-service-grid strong{font-size:16px}.store-service-grid p{margin:0;color:#817a70;font-size:11px;line-height:1.6}.store-service-grid article>em{color:var(--site-accent);font-size:10px;font-style:normal;font-weight:700}.store-showcase-preview{background:#f5eee4}.store-showcase-grid{display:grid;height:280px;grid-template-columns:1.45fr 1fr 1fr;gap:14px}.store-showcase-grid figure{position:relative;overflow:hidden;margin:0;background:#ded4c7}.store-showcase-grid img{width:100%;height:100%;object-fit:cover}.store-showcase-grid figcaption{position:absolute;right:10px;bottom:10px;padding:6px 9px;color:#fff;background:rgba(23,24,21,.72);font-size:10px}.store-visit-preview{display:grid;min-height:330px;grid-template-columns:1.15fr .85fr;padding:60px 70px;background:#fff;gap:54px}.store-advantage-panel ul{display:grid;margin:24px 0 0;padding:0;grid-template-columns:1fr 1fr;gap:11px;list-style:none}.store-advantage-panel li{display:flex;min-height:46px;align-items:center;padding:0 14px;border:1px solid #e6ded2;color:#625d55;font-size:12px;gap:10px}.store-advantage-panel li i{display:grid;width:21px;height:21px;place-items:center;border-radius:50%;color:#fff;background:var(--site-accent);font-size:10px;font-style:normal}.store-arrival-card{padding:32px 34px;color:#fff;background:var(--site-dark)}.store-arrival-card>span{font-size:10px;font-weight:800;letter-spacing:.12em}.store-arrival-card h3{margin:10px 0 23px;font-family:"Songti SC","STSong",serif;font-size:23px}.store-arrival-card dl{display:grid;margin:0;gap:13px}.store-arrival-card dl>div{display:grid;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.16);grid-template-columns:52px 1fr;gap:12px}.store-arrival-card dt{color:rgba(255,255,255,.62);font-size:10px}.store-arrival-card dd{overflow:hidden;margin:0;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.store-articles-preview{background:#fffaf3}.store-article-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:13px}.store-article-grid article{display:grid;min-height:178px;padding:22px;border:1px solid #e4dbcf;background:#fff;gap:12px}.store-article-grid article>span{color:var(--site-accent);font-size:10px;font-weight:800}.store-article-grid strong{font-size:15px;line-height:1.55}.store-article-grid p{margin:0;color:#817a70;font-size:11px;line-height:1.65}.store-article-grid em{align-self:end;color:var(--site-accent);font-size:10px;font-style:normal;font-weight:800}.store-contact-preview{display:flex;min-height:240px;align-items:center;justify-content:space-between;padding:50px 70px;color:#fff;background:#252821}.store-contact-preview p{margin:9px 0 0;color:#bdc1b5;font-size:12px}.store-contact-list{display:grid;min-width:410px;gap:8px}.store-contact-list>span{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border:1px solid rgba(255,255,255,.17)}.store-contact-list small{color:#b8bcaf;font-size:10px}.store-contact-list strong{font-size:15px}
.store-desktop-site{color:#18243a;background:#fff}.store-utility-bar{height:36px;padding:0 70px;color:#6f6a62;background:#fbf8f2}.store-utility-bar>div{display:flex;gap:24px}.store-utility-bar span{display:flex;align-items:center;gap:7px}.store-utility-bar .el-icon{color:var(--site-accent)}.store-site-header{height:74px;border-bottom:1px solid #e7e2da}.store-site-brand>span{border:1px solid color-mix(in srgb,var(--site-accent) 38%,#e7e2da);border-radius:10px;background:var(--site-soft)}.store-site-brand>span .el-icon{font-size:22px}.store-site-header button{border-radius:5px}.store-hero-preview{display:grid;min-height:430px;grid-template-columns:1.12fr .88fr;align-items:center;padding:58px 70px;background:linear-gradient(120deg,#fffaf1,var(--site-soft));gap:58px}.store-hero-copy{padding:8px 0}.store-hero-copy>small,.store-services-preview header small,.store-arrival-card>small,.store-articles-preview header small,.store-contact-preview>div>small{color:var(--site-accent);font-size:10px;font-weight:900;letter-spacing:.14em}.store-hero-copy h1{margin:17px 0 0;font-family:"Songti SC","STSong",serif;font-size:43px;line-height:1.18;letter-spacing:-.04em}.store-hero-copy>p{display:-webkit-box;overflow:hidden;margin:20px 0 0;color:#616a78;font-size:13px;line-height:1.9;-webkit-box-orient:vertical;-webkit-line-clamp:4}.store-hero-copy>div{display:flex;align-items:center;margin-top:25px;gap:22px}.store-hero-copy button{border:0;border-radius:5px;padding:13px 20px;color:#fff;background:var(--site-accent);font-weight:800}.store-hero-copy span{color:var(--site-accent);font-size:12px;font-weight:750}.store-hero-preview>figure{position:relative;inset:auto;overflow:hidden;margin:0;aspect-ratio:4/3;border:1px solid color-mix(in srgb,var(--site-accent) 22%,#e7e2da);border-radius:16px;background:var(--site-soft);box-shadow:0 22px 48px rgba(54,43,30,.13)}.store-hero-preview>figure:after{display:none}.store-hero-preview>figure img{display:block;width:100%;height:100%;object-fit:cover}.store-image-placeholder{display:grid;width:100%;height:100%;place-items:center;color:var(--site-accent);text-align:center}.store-image-placeholder .el-icon{display:grid;width:74px;height:74px;margin:0 auto 13px;place-items:center;border:1px solid color-mix(in srgb,var(--site-accent) 32%,#e7e2da);border-radius:18px;background:rgba(255,255,255,.7);font-size:34px}.store-image-placeholder strong,.store-image-placeholder small{display:block}.store-image-placeholder strong{font-size:16px}.store-image-placeholder small{margin-top:4px;color:#827b72;font-size:10px}.store-services-preview,.store-articles-preview{padding:62px 70px}.store-services-preview>header,.store-articles-preview>header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:27px}.store-service-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid #e7e2da;border-left:1px solid #e7e2da}.store-service-grid article{display:flex;min-height:190px;flex-direction:column;align-items:flex-start;padding:25px 22px;border-right:1px solid #e7e2da;border-bottom:1px solid #e7e2da;background:#fff;gap:0}.store-service-icon{display:grid;width:44px;height:44px;place-items:center;border:1px solid color-mix(in srgb,var(--site-accent) 35%,#e7e2da);border-radius:11px;color:var(--site-accent);background:var(--site-soft)}.store-service-icon i{position:static;width:auto;height:auto;border:0;border-radius:0;font-size:22px}.store-service-grid article>strong{margin-top:20px;font-size:15px}.store-service-grid article>p{display:-webkit-box;overflow:hidden;margin:7px 0 0;color:#7d7a74;font-size:10px;line-height:1.65;-webkit-box-orient:vertical;-webkit-line-clamp:3}.store-service-grid article>em{margin-top:auto;padding-top:14px;color:#aaa197;font:9px monospace}.store-arrival-preview{display:grid;min-height:560px;grid-template-columns:.9fr 1.1fr;padding:62px 70px;background:#faf7f1;gap:26px}.store-arrival-card{padding:31px 32px;border:1px solid #e7e2da;border-radius:15px;color:#18243a;background:#fff;box-shadow:0 14px 32px rgba(54,43,30,.06)}.store-arrival-card h2{margin:7px 0 20px;font-family:"Songti SC","STSong",serif;font-size:28px}.store-arrival-card>div{display:grid;min-height:72px;grid-template-columns:40px 1fr;align-items:center;padding:10px 0;border-top:1px solid #e7e2da;gap:13px}.store-arrival-card>div>.el-icon{display:grid;width:37px;height:37px;place-items:center;border-radius:9px;color:var(--site-accent);background:var(--site-soft);font-size:18px}.store-arrival-card>div span,.store-arrival-card>div strong,.store-arrival-card>div small{display:block}.store-arrival-card>div strong{font-size:12px}.store-arrival-card>div small{margin-top:2px;color:#777f8c;font-size:10px;line-height:1.55}.store-showcase-grid{display:grid;height:auto;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.store-showcase-grid figure{position:relative;overflow:hidden;margin:0;aspect-ratio:4/3;border:1px solid #e7e2da;border-radius:13px;background:#fff}.store-showcase-grid img{display:block;width:100%;height:100%;object-fit:cover}.store-space-placeholder{display:grid;width:100%;height:100%;place-items:center;color:#857d73;background:linear-gradient(145deg,#fff,var(--site-soft));text-align:center}.store-space-placeholder .el-icon{display:block;margin:0 auto 7px;color:var(--site-accent);font-size:28px}.store-space-placeholder span{font-size:10px}.store-article-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.store-article-grid article{min-height:205px;border-radius:12px}.store-contact-preview{min-height:230px;background:#172437}.store-contact-list>span{border-radius:6px}
.preview-scale-shell{height:calc(1800px * var(--preview-scale))}.is-local_store .preview-scale-shell{height:calc(2100px * var(--preview-scale))}
.store-hero-preview{min-height:330px;grid-template-columns:1.18fr .82fr;padding:36px 70px;gap:44px}.store-hero-copy{padding:4px 0}.store-hero-copy h1{margin-top:12px;font-size:40px;line-height:1.14}.store-hero-copy>p{margin-top:13px;font-size:12px;line-height:1.75;-webkit-line-clamp:3}.store-hero-copy>div{margin-top:18px;gap:19px}.store-hero-copy button{padding:11px 18px}.store-hero-preview>figure{border-radius:14px;box-shadow:0 18px 38px rgba(54,43,30,.12)}.store-image-placeholder .el-icon{width:62px;height:62px;margin-bottom:9px;border-radius:16px;font-size:29px}.store-image-placeholder strong{font-size:14px}.store-image-placeholder small{margin-top:3px;font-size:9px}.store-services-preview,.store-articles-preview{padding:34px 70px}.store-services-preview>header,.store-articles-preview>header{margin-bottom:16px}.store-service-grid article{min-height:125px;padding:16px 18px}.store-service-icon{width:38px;height:38px;border-radius:10px}.store-service-icon i{font-size:19px}.store-service-grid article>strong{margin-top:10px;font-size:14px}.store-service-grid article>p{margin-top:4px;font-size:9px;line-height:1.5;-webkit-line-clamp:2}.store-service-grid article>em{padding-top:6px;font-size:8px}.store-arrival-preview{min-height:340px;grid-template-columns:.82fr 1.18fr;padding:34px 70px;gap:16px}.store-arrival-card{padding:21px 23px;border-radius:13px}.store-arrival-card h2{margin:5px 0 10px;font-size:23px}.store-arrival-card>div{min-height:58px;grid-template-columns:34px 1fr;padding:7px 0;gap:10px}.store-arrival-card>div>.el-icon{width:31px;height:31px;font-size:15px}.store-arrival-card>div strong{font-size:11px}.store-arrival-card>div small{font-size:9px;line-height:1.45}.store-showcase-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.store-showcase-grid figure{border-radius:11px}.store-space-placeholder .el-icon{margin-bottom:6px;font-size:24px}.store-space-placeholder span{font-size:9px}.store-article-grid{gap:10px}.store-article-grid article{min-height:154px;padding:16px;border-radius:10px}.store-contact-preview{min-height:165px;padding-block:30px}.is-local_store .preview-scale-shell{height:calc(1450px * var(--preview-scale))}
.store-service-grid{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.is-thumbnail{border-radius:8px;box-shadow:none;pointer-events:none}.is-thumbnail .browser-chrome{display:none}.is-thumbnail .preview-viewport{max-height:none;padding:0;overflow:hidden;background:#fff}.is-thumbnail .preview-scale-shell,.is-thumbnail.is-local_store .preview-scale-shell{--preview-scale:.235;width:300px;height:260px;margin:0}.is-thumbnail .preview-section{cursor:default}.is-thumbnail .preview-section.active{box-shadow:none}
</style>
