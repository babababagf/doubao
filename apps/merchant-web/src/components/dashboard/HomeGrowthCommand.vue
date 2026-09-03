<script setup lang="ts">
import type { DashboardDailyTrendPoint, DashboardOverview } from '@doubaohk/api-contract'
import {
  ArrowRightBold,
  ChatDotRound,
  Clock,
  Collection,
  Connection,
  DataAnalysis,
  Document,
  EditPen,
  Link,
  MagicStick,
  Plus,
  Pointer,
  Promotion,
  QuestionFilled,
  Search,
  StarFilled,
  View,
} from '@element-plus/icons-vue'
import type { Component } from 'vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { platformLogos } from '@/assets/platform-logos'

import HomeMetricStrip from './HomeMetricStrip.vue'

type SignalKey = 'expandedQuestionCount' | 'aiWritingCount' | 'publishedCount' | 'doubaoIncludedCount'
type SignalDefinition = {
  key: SignalKey
  label: string
  icon: Component
  tone: 'blue' | 'violet' | 'cyan' | 'teal'
  route: { name: string }
  showTrend?: boolean
}

const props = defineProps<{
  accountName: string
  overview: DashboardOverview
  points: DashboardDailyTrendPoint[]
}>()

const commandRef = ref<HTMLElement | null>(null)
const isVisible = ref(true)
let visibilityObserver: IntersectionObserver | null = null
const orbitArtwork = `${import.meta.env.BASE_URL}home/knowledge-orbit-light-v3.png`

const recentPoints = computed(() => props.points.slice(-7))
const latestPoint = computed(() => recentPoints.value.at(-1) ?? emptyTrendPoint())
const previousPoint = computed(() => recentPoints.value.at(-2) ?? emptyTrendPoint())

const signalDefinitions: SignalDefinition[] = [
  {
    key: 'expandedQuestionCount',
    label: '新增问题',
    icon: QuestionFilled,
    tone: 'violet',
    route: { name: 'keywords' },
  },
  {
    key: 'aiWritingCount',
    label: '新增写作',
    icon: EditPen,
    tone: 'blue',
    route: { name: 'content-create' },
  },
  {
    key: 'publishedCount',
    label: '已发布内容',
    icon: Promotion,
    tone: 'cyan',
    route: { name: 'publish-tasks' },
  },
  {
    key: 'doubaoIncludedCount',
    label: '豆包命中趋势',
    icon: DataAnalysis,
    tone: 'teal',
    route: { name: 'data-overview' },
    showTrend: true,
  },
]

const signals = computed(() => signalDefinitions.map((definition) => ({
  ...definition,
  value: latestPoint.value[definition.key],
  change: changeFromPrevious(latestPoint.value[definition.key], previousPoint.value[definition.key]),
})))

const signalTrend = computed(() => {
  const values = recentPoints.value.map((point) => point.doubaoIncludedCount)
  const maxValue = Math.max(1, ...values)
  const width = 180
  const height = 46
  const xPadding = 4
  const yPadding = 5
  const source = values.length ? values : [0, 0, 0, 0, 0, 0, 0]
  const step = source.length > 1 ? (width - xPadding * 2) / (source.length - 1) : 0

  return source
    .map((value, index) => {
      const x = xPadding + index * step
      const y = height - yPadding - (value / maxValue) * (height - yPadding * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
})

const latestDate = computed(() => {
  const rawDate = latestPoint.value.date
  return rawDate ? rawDate.slice(5).replace('-', '/') : '暂无'
})

const platforms = [
  { key: 'douyin', label: '抖音', logo: platformLogos.douyin },
  { key: 'toutiao', label: '今日头条', logo: platformLogos.toutiao },
  { key: 'smzdm', label: '什么值得买', logo: platformLogos.smzdm },
] as const

onMounted(() => {
  if (!commandRef.value || typeof IntersectionObserver === 'undefined') return
  visibilityObserver = new IntersectionObserver(([entry]) => {
    isVisible.value = entry?.isIntersecting ?? true
  }, { threshold: 0.12 })
  visibilityObserver.observe(commandRef.value)
})

onBeforeUnmount(() => {
  visibilityObserver?.disconnect()
  visibilityObserver = null
})

function emptyTrendPoint(): DashboardDailyTrendPoint {
  return {
    date: '',
    keywordCount: 0,
    expandedQuestionCount: 0,
    aiWritingCount: 0,
    publishedCount: 0,
    doubaoIncludedCount: 0,
    phoneExposureCount: 0,
    phoneClickCount: 0,
  }
}

function changeFromPrevious(current: number, previous: number): { label: string; tone: 'up' | 'down' | 'flat' } {
  if (previous <= 0) {
    return { label: current > 0 ? '新增' : '0%', tone: current > 0 ? 'up' : 'flat' }
  }
  const percentage = ((current - previous) / previous) * 100
  if (Math.abs(percentage) < 0.05) return { label: '0%', tone: 'flat' }
  return {
    label: `${Math.abs(percentage).toFixed(1)}%`,
    tone: percentage > 0 ? 'up' : 'down',
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}
</script>

<template>
  <section
    ref="commandRef"
    class="growth-command"
    :data-active="isVisible"
    aria-labelledby="growth-command-title"
  >
    <section class="knowledge-canvas">
      <header class="command-copy">
        <span class="command-kicker"><el-icon aria-hidden="true"><EditPen /></el-icon>内容增长工作台</span>
        <h1 id="growth-command-title">客户在提问，品牌要在场</h1>
        <p>围绕客户真实问题，持续积累可被 AI 理解和引用的企业内容资产。</p>
        <div class="command-actions" aria-label="首页快捷操作">
          <RouterLink :to="{ name: 'content-create' }" class="command-button is-primary">
            <el-icon aria-hidden="true"><MagicStick /></el-icon>
            开始布局 AI 搜索
            <span aria-hidden="true">→</span>
          </RouterLink>
          <RouterLink :to="{ name: 'data-overview' }" class="command-button is-secondary">
            <el-icon aria-hidden="true"><DataAnalysis /></el-icon>
            查看运营数据
          </RouterLink>
        </div>
      </header>

      <div class="knowledge-map" aria-label="从企业资料到内容发布和结果反馈的增长链路">
        <img :src="orbitArtwork" alt="" class="orbit-art" />
        <span v-for="index in 9" :key="index" :class="`orbit-particle particle-${index}`" aria-hidden="true" />
        <span v-for="index in 3" :key="`runner-${index}`" :class="`orbit-runner runner-${index}`" aria-hidden="true"><i /></span>

        <span class="flow-chevron is-question-flow" aria-hidden="true"><el-icon><ArrowRightBold /></el-icon></span>
        <span class="flow-chevron is-content-flow" aria-hidden="true"><el-icon><ArrowRightBold /></el-icon></span>
        <span class="flow-chevron is-assets-flow" aria-hidden="true"><el-icon><ArrowRightBold /></el-icon></span>
        <span class="flow-chevron is-publish-flow" aria-hidden="true"><el-icon><ArrowRightBold /></el-icon></span>
        <span class="flow-chevron is-feedback-flow" aria-hidden="true"><el-icon><ArrowRightBold /></el-icon></span>

        <RouterLink :to="{ name: 'knowledge' }" class="knowledge-core">
          <span class="core-star" aria-hidden="true"><el-icon><StarFilled /></el-icon></span>
          <strong>企业知识核心</strong>
          <small>品牌事实 · 产品服务</small>
          <small>案例成果 · 专业资料</small>
          <i aria-hidden="true" />
        </RouterLink>

        <RouterLink :to="{ name: 'keywords' }" class="knowledge-node is-questions">
          <span class="node-orb"><el-icon><QuestionFilled /></el-icon></span>
          <span class="node-copy">
            <strong>客户真实问题</strong>
            <small>发现 · 聚合 · 归类</small>
            <span class="node-pills">
              <i>{{ formatNumber(overview.expandedQuestionCount) }} 个问题</i>
              <i>持续拓展</i>
            </span>
            <span class="node-details">
              <span class="node-detail"><el-icon><Search /></el-icon>品牌认知问题</span>
              <span class="node-detail"><el-icon><Search /></el-icon>产品服务问题</span>
              <span class="node-detail"><el-icon><Search /></el-icon>区域场景问题</span>
              <span class="node-detail is-add"><el-icon><Plus /></el-icon>添加问题</span>
            </span>
          </span>
        </RouterLink>

        <RouterLink :to="{ name: 'content-create' }" class="knowledge-node is-content">
          <span class="node-orb"><el-icon><EditPen /></el-icon></span>
          <span class="node-copy">
            <strong>内容主题生成</strong>
            <small>洞察 · 规划 · 生成</small>
            <span class="node-pills">
              <i>企业资料驱动</i>
              <i>{{ formatNumber(overview.aiWritingCount) }} 篇内容</i>
            </span>
            <span class="node-details">
              <span class="node-detail"><el-icon><Document /></el-icon>企业介绍与定位</span>
              <span class="node-detail"><el-icon><Document /></el-icon>产品与服务体系</span>
              <span class="node-detail"><el-icon><Document /></el-icon>行业方法与案例</span>
            </span>
          </span>
        </RouterLink>

        <RouterLink :to="{ name: 'knowledge' }" class="knowledge-node is-assets">
          <span class="node-orb"><el-icon><Collection /></el-icon></span>
          <span class="node-copy">
            <strong>品牌资料沉淀</strong>
            <small>结构化 · 标准化 · 可复用</small>
            <span class="node-pills">
              <i>{{ formatNumber(overview.keywordCount) }} 个关键词</i>
              <i>企业事实统一</i>
            </span>
            <span class="node-details">
              <span class="node-detail"><el-icon><Collection /></el-icon>品牌事实资料</span>
              <span class="node-detail"><el-icon><Collection /></el-icon>产品能力资料</span>
              <span class="node-detail"><el-icon><Collection /></el-icon>客户案例资料</span>
            </span>
          </span>
        </RouterLink>

        <RouterLink :to="{ name: 'publish-tasks' }" class="knowledge-node is-publish">
          <span class="node-orb"><el-icon><Promotion /></el-icon></span>
          <span class="node-copy">
            <strong>多平台发布</strong>
            <small>分发 · 同步 · 管理</small>
            <span class="platforms" aria-label="支持平台">
              <img
                v-for="platform in platforms"
                :key="platform.key"
                class="platform-logo"
                :src="platform.logo"
                :alt="platform.label"
                :title="platform.label"
              />
            </span>
          </span>
        </RouterLink>

        <RouterLink :to="{ name: 'data-overview' }" class="knowledge-node is-feedback">
          <span class="node-orb"><el-icon><DataAnalysis /></el-icon></span>
          <span class="node-copy">
            <strong>结果反馈与优化</strong>
            <small>监测 · 分析 · 优化</small>
            <span class="node-pills">
              <i>豆包命中 {{ formatNumber(overview.doubaoIncludedCount) }}</i>
              <i>持续迭代</i>
            </span>
            <span class="node-details is-horizontal">
              <span class="node-detail"><el-icon><View /></el-icon>曝光</span>
              <span class="node-detail"><el-icon><Pointer /></el-icon>点击</span>
              <span class="node-detail"><el-icon><Link /></el-icon>引用</span>
              <span class="node-detail"><el-icon><ChatDotRound /></el-icon>咨询</span>
            </span>
          </span>
        </RouterLink>
      </div>
    </section>

    <aside class="growth-signals" aria-labelledby="growth-signals-title">
      <header>
        <span class="signal-beacon" aria-hidden="true"><el-icon><Connection /></el-icon></span>
        <h2 id="growth-signals-title">今日增长信号</h2>
        <span class="signal-status" title="数据已同步" aria-label="数据已同步" />
      </header>

      <div class="signal-list">
        <RouterLink
          v-for="signal in signals"
          :key="signal.key"
          :to="signal.route"
          class="signal-card"
          :data-tone="signal.tone"
        >
          <span class="signal-icon" aria-hidden="true"><el-icon><component :is="signal.icon" /></el-icon></span>
          <span class="signal-copy">
            <span>{{ signal.label }}</span>
            <strong class="animated-number">{{ formatNumber(signal.value) }}</strong>
            <small :data-change="signal.change.tone">
              <b>{{ signal.change.tone === 'up' ? '↑' : signal.change.tone === 'down' ? '↓' : '·' }} {{ signal.change.label }}</b>
              <em>较昨日</em>
            </small>
          </span>
          <svg v-if="signal.showTrend" viewBox="0 0 180 46" aria-label="豆包命中最近 7 天趋势">
            <polyline :points="signalTrend" pathLength="1" />
          </svg>
        </RouterLink>
      </div>

      <footer>
        <el-icon aria-hidden="true"><Clock /></el-icon>
        数据更新：{{ latestDate }}
      </footer>
    </aside>

    <HomeMetricStrip
      class="command-metrics"
      :overview="overview"
      :points="points"
      :active="isVisible"
    />
  </section>
</template>

<style scoped>
.growth-command {
  position: relative;
  display: grid;
  width: 100%;
  height: 807px;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) 260px;
  grid-template-rows: minmax(0, 1fr) 142px;
  column-gap: 15px;
  row-gap: 12px;
}

.knowledge-canvas {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 0;
  border-radius: 0 0 24px 24px;
  background:
    radial-gradient(circle at 58% 44%, rgba(92, 170, 255, 0.19), transparent 36%),
    linear-gradient(132deg, #f0f5fd 0%, #e6effb 54%, #dceafb 100%);
  box-shadow: none;
}

.knowledge-canvas::before {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(108deg, rgba(255, 255, 255, 0.24), rgba(255, 255, 255, 0.08) 29%, transparent 45%),
    radial-gradient(circle at 7% 7%, rgba(255, 255, 255, 0.3), transparent 29%);
  content: '';
  pointer-events: none;
}

.command-copy {
  position: absolute;
  z-index: 8;
  top: 28px;
  left: 24px;
  width: min(500px, 39%);
}

.command-kicker {
  display: inline-flex;
  min-height: 25px;
  align-items: center;
  color: #6480a6;
  font-size: 13px;
  font-weight: 650;
  gap: 6px;
}

.command-kicker .el-icon {
  color: #6384b1;
  font-size: 14px;
}

.command-copy h1 {
  margin: 9px 0 0;
  color: #08234d;
  font-size: 42px;
  font-weight: 760;
  letter-spacing: -0.035em;
  line-height: 1.12;
  white-space: nowrap;
}

.command-copy p {
  max-width: 470px;
  margin: 14px 0 0;
  color: #5a7192;
  font-size: 15px;
  line-height: 1.5;
}

.command-actions {
  display: flex;
  margin-top: 20px;
  align-items: flex-start;
  flex-direction: column;
  gap: 16px;
}

.command-button {
  position: relative;
  isolation: isolate;
  display: inline-flex;
  min-height: 46px;
  align-items: center;
  justify-content: center;
  padding: 0 17px;
  border: 1px solid transparent;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  gap: 8px;
  touch-action: manipulation;
  transition:
    transform 160ms cubic-bezier(.22, 1, .36, 1),
    border-color 180ms ease;
}

.command-button::before {
  position: absolute;
  z-index: -1;
  inset: -9px;
  border-radius: 16px;
  background: rgba(39, 122, 255, 0.5);
  content: '';
  filter: blur(14px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 180ms ease;
}

.command-button.is-primary {
  min-width: 218px;
}

.command-button.is-secondary {
  min-width: 170px;
}

.command-button:active {
  transform: scale(0.97);
  transition-duration: 0ms;
}

.command-button.is-primary {
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.32);
  background: linear-gradient(118deg, #1c5df3 0%, #2a72fa 58%, #4b8cff 100%);
  box-shadow:
    0 12px 24px rgba(30, 95, 232, 0.31),
    0 0 28px rgba(45, 126, 255, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    inset 0 -1px 0 rgba(13, 70, 194, 0.2);
  text-shadow: 0 1px 2px rgba(11, 53, 138, 0.34);
}

.command-button.is-secondary {
  border-color: rgba(155, 190, 239, 0.72);
  color: #245ba6;
  background: linear-gradient(180deg, #f7faff 0%, #e2eaf9 100%);
  box-shadow:
    0 8px 22px rgba(61, 101, 161, 0.09),
    inset 0 1px 0 rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(12px);
}

.command-button.is-secondary::before {
  background: rgba(90, 145, 226, 0.2);
  filter: blur(12px);
}

.knowledge-map {
  --core-x: 55.7%;
  --core-y: 55.3%;
  position: absolute;
  inset: 0;
}

.knowledge-map::before {
  position: absolute;
  z-index: 2;
  inset: 0;
  background:
    radial-gradient(circle at var(--core-x) var(--core-y), transparent 0 22%, rgba(54, 108, 218, 0.015) 46%, rgba(47, 96, 189, 0.03) 100%),
    rgba(90, 145, 235, 0.02);
  content: '';
  mix-blend-mode: multiply;
  pointer-events: none;
}

.orbit-art {
  position: absolute;
  z-index: 1;
  top: -0.1%;
  right: auto;
  left: -12.6%;
  width: 110%;
  height: 110%;
  object-fit: cover;
  object-position: center;
  opacity: 1;
  mix-blend-mode: normal;
  filter: brightness(1.015) saturate(1.06) contrast(1.02);
  mask-image: linear-gradient(90deg, transparent 0%, #000 9%, #000 98%, transparent 100%);
  pointer-events: none;
}

.knowledge-core {
  position: absolute;
  z-index: 6;
  top: var(--core-y);
  left: var(--core-x);
  display: grid;
  width: 159px;
  height: 159px;
  place-items: center;
  align-content: center;
  border: 1px solid rgba(255, 255, 255, 0.92);
  border-radius: 50%;
  color: #ffffff;
  background-color: #164fbe;
  background-image:
    linear-gradient(180deg, rgba(57, 116, 255, 0.02), rgba(6, 34, 121, 0.28)),
    url('/home/knowledge-core-sphere-v1.png');
  background-blend-mode: multiply, normal;
  background-position: center, center calc(50% - 24px);
  background-repeat: no-repeat;
  background-size: cover, 148% auto;
  box-shadow:
    0 0 0 5px rgba(255, 255, 255, 0.4),
    0 0 0 11px rgba(78, 142, 248, 0.11),
    0 0 38px rgba(49, 123, 248, 0.42),
    0 22px 48px rgba(33, 85, 188, 0.3),
    inset 0 0 0 80px rgba(20, 58, 216, 0.08),
    inset 0 2px 16px rgba(255, 255, 255, 0.26),
    inset 0 -14px 24px rgba(17, 49, 142, 0.24);
  text-align: center;
  transform: translate(-50%, -50%);
  text-shadow: 0 2px 7px rgba(10, 43, 126, 0.42);
  transition: transform 160ms cubic-bezier(.22, 1, .36, 1);
  touch-action: manipulation;
}

.knowledge-core:active {
  transform: translate(-50%, -50%) scale(0.97);
}

.core-star {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  margin-bottom: 5px;
  color: #ffffff;
  font-size: 24px;
  filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.92));
}

.knowledge-core strong {
  font-size: 16px;
  font-weight: 760;
}

.knowledge-core small {
  margin-top: 2px;
  color: rgba(243, 249, 255, 0.82);
  font-size: 11px;
}

.knowledge-core > i {
  position: absolute;
  inset: -10px;
  border: 1px solid rgba(93, 154, 255, 0.34);
  border-radius: 50%;
  pointer-events: none;
}

.knowledge-node {
  --node-start: #2f72f2;
  --node-end: #5d96ff;
  --node-glow: rgba(43, 111, 241, 0.28);
  position: absolute;
  z-index: 7;
  display: flex;
  min-width: 236px;
  align-items: flex-start;
  color: #244268;
  gap: 11px;
  transition: transform 170ms cubic-bezier(.22, 1, .36, 1);
  touch-action: manipulation;
}

.knowledge-node:not(.is-feedback) {
  gap: 18px;
}

.knowledge-node.is-questions {
  top: 27.5%;
  right: 55.6%;
  flex-direction: row-reverse;
}

.knowledge-node.is-content { top: 27.7%; right: 12%; }

.knowledge-node.is-assets {
  right: 63%;
  bottom: 12%;
  flex-direction: row-reverse;
}

.knowledge-node.is-publish { right: 16%; bottom: 23%; }

.knowledge-node.is-feedback {
  bottom: 2.2%;
  left: var(--core-x);
  align-items: center;
  flex-direction: column;
  text-align: center;
  transform: translateX(-50%);
}

.knowledge-node.is-questions .node-copy,
.knowledge-node.is-assets .node-copy {
  justify-items: end;
  text-align: right;
}

.knowledge-node.is-questions .node-copy {
  transform: translateY(-18px);
}

.knowledge-node.is-content .node-copy {
  transform: translateY(-15px);
}

.knowledge-node.is-feedback .node-copy {
  justify-items: center;
}

.knowledge-node.is-feedback .node-pills,
.knowledge-node.is-feedback .node-details {
  justify-content: center;
}

.knowledge-node.is-feedback .node-pills {
  display: none;
}

.knowledge-node.is-questions .node-pills,
.knowledge-node.is-content .node-pills,
.knowledge-node.is-assets .node-pills {
  display: none;
}

.node-orb {
  display: grid;
  width: 60px;
  height: 60px;
  flex: 0 0 auto;
  place-items: center;
  border: 4px solid rgba(255, 255, 255, 0.94);
  border-radius: 50%;
  color: #ffffff;
  background: linear-gradient(145deg, var(--node-start), var(--node-end));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--node-start) 34%, transparent),
    0 0 22px var(--node-glow),
    0 12px 26px rgba(44, 103, 217, 0.2),
    inset 0 1px 8px rgba(255, 255, 255, 0.42);
  font-size: 22px;
  transition: transform 140ms cubic-bezier(.22, 1, .36, 1);
}

.knowledge-node.is-content {
  --node-start: #14acae;
  --node-end: #39d8ce;
  --node-glow: rgba(41, 204, 197, 0.31);
}

.knowledge-node.is-assets {
  --node-start: #705ee9;
  --node-end: #9684f5;
  --node-glow: rgba(119, 94, 231, 0.3);
}

.knowledge-node.is-feedback {
  --node-start: #2674e8;
  --node-end: #4cadf0;
  --node-glow: rgba(50, 143, 239, 0.3);
}

.node-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.node-copy strong {
  color: #1e5fc0;
  font-size: 16px;
  font-weight: 740;
}

.is-content .node-copy strong { color: #149c98; }
.is-assets .node-copy strong { color: #5e51bf; }

.node-copy > small {
  color: #7387a4;
  font-size: 13px;
}

.node-pills {
  display: flex;
  margin-top: 5px;
  flex-wrap: wrap;
  gap: 5px;
}

.node-pills i {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  padding: 0 9px;
  border: 1px solid rgba(120, 164, 229, 0.2);
  border-radius: 999px;
  color: #4370ae;
  background: linear-gradient(180deg, rgba(246, 250, 255, 0.94), rgba(230, 240, 255, 0.88));
  box-shadow: 0 6px 15px rgba(73, 112, 175, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  font-size: 11px;
  font-style: normal;
  font-weight: 620;
  white-space: nowrap;
}

.node-details {
  display: grid;
  min-width: 220px;
  margin-top: 6px;
  gap: 5px;
}

.node-details.is-horizontal {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
}

.node-detail {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  padding: 0 10px;
  border: 1px solid rgba(116, 160, 226, 0.2);
  border-radius: 999px;
  color: #456fae;
  background: linear-gradient(180deg, rgba(249, 252, 255, 0.94), rgba(233, 242, 255, 0.86));
  box-shadow:
    0 7px 18px rgba(67, 109, 174, 0.075),
    inset 0 1px 0 rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(9px);
  font-size: 12px;
  font-weight: 620;
  gap: 5px;
  white-space: nowrap;
  transition: color 180ms ease, background-color 180ms ease, transform 150ms cubic-bezier(.22, 1, .36, 1);
}

.node-detail .el-icon {
  color: #4f82d5;
  font-size: 13px;
}

.node-detail.is-add {
  width: max-content;
  min-width: 0;
  justify-self: end;
  border-style: dashed;
  color: #2a69c8;
  background: rgba(233, 242, 255, 0.84);
}

.knowledge-node.is-questions .node-details {
  min-width: 230px;
}

.knowledge-node.is-assets .node-details {
  min-width: 168px;
}

.knowledge-node.is-feedback .node-copy {
  min-width: 330px;
}

.knowledge-node.is-feedback .node-detail {
  min-width: 70px;
  justify-content: center;
}

.knowledge-node.is-content .node-detail {
  border-color: rgba(53, 193, 192, 0.22);
  color: #168f91;
  background: linear-gradient(180deg, rgba(244, 255, 254, 0.96), rgba(225, 249, 247, 0.88));
}

.knowledge-node.is-content .node-detail .el-icon {
  color: #19aaa8;
}

.knowledge-node.is-assets .node-detail {
  border-color: rgba(119, 99, 224, 0.2);
  color: #6257bd;
  background: linear-gradient(180deg, rgba(250, 248, 255, 0.96), rgba(238, 233, 255, 0.9));
}

.knowledge-node.is-assets .node-detail .el-icon {
  color: #7567df;
}

.platforms {
  display: flex;
  margin-top: 6px;
  align-items: center;
  gap: 6px;
}

.platform-logo {
  width: 28px;
  height: 28px;
  padding: 1px;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 6px 14px rgba(58, 90, 139, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.98);
  object-fit: contain;
}

.orbit-particle {
  position: absolute;
  z-index: 4;
  width: 7px;
  height: 7px;
  border: 2px solid rgba(255, 255, 255, 0.84);
  border-radius: 50%;
  background: #72cfff;
  box-shadow: 0 0 13px rgba(75, 174, 246, 0.65);
  pointer-events: none;
}

.particle-1 { top: 18%; left: 50%; }
.particle-2 { top: 33%; left: 68%; }
.particle-3 { top: 55%; left: 75%; }
.particle-4 { top: 68%; left: 64%; }
.particle-5 { top: 72%; left: 46%; }
.particle-6 { top: 47%; left: 39%; }
.particle-7 { top: 31%; left: 43%; }
.particle-8 { top: 13%; left: 76%; }
.particle-9 { top: 78%; left: 82%; }

.orbit-runner {
  --orbit-size: 360px;
  --orbit-scale-y: 0.42;
  --orbit-scale-y-inverse: 2.38;
  position: absolute;
  z-index: 5;
  top: var(--core-y);
  left: var(--core-x);
  width: var(--orbit-size);
  height: var(--orbit-size);
  pointer-events: none;
  transform: translate(-50%, -50%) scaleY(var(--orbit-scale-y));
}

.orbit-runner i {
  position: absolute;
  top: 50%;
  right: -4px;
  display: block;
  width: 9px;
  height: 9px;
  border: 2px solid rgba(255, 255, 255, 0.94);
  border-radius: 50%;
  background: #4aa9ff;
  box-shadow: 0 0 0 4px rgba(68, 164, 249, 0.12), 0 0 16px rgba(68, 164, 249, 0.72);
  transform: translateY(-50%) scaleY(var(--orbit-scale-y-inverse));
}

.orbit-runner.runner-1 {
  --orbit-size: 360px;
  --orbit-scale-y: 0.42;
  --orbit-scale-y-inverse: 2.38;
}

.orbit-runner.runner-2 {
  --orbit-size: 500px;
  --orbit-scale-y: 0.48;
  --orbit-scale-y-inverse: 2.08;
}

.orbit-runner.runner-3 {
  --orbit-size: 650px;
  --orbit-scale-y: 0.52;
  --orbit-scale-y-inverse: 1.92;
  display: none;
}

.flow-chevron {
  position: absolute;
  z-index: 6;
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border: 1px solid rgba(87, 142, 229, 0.14);
  border-radius: 50%;
  color: #5f93e6;
  background: rgba(249, 252, 255, 0.72);
  box-shadow: 0 5px 14px rgba(62, 108, 178, 0.08);
  font-size: 12px;
  pointer-events: none;
}

.flow-chevron .el-icon {
  display: block;
}

.flow-chevron.is-question-flow { top: 37%; left: 43%; transform: rotate(32deg); }
.flow-chevron.is-content-flow { top: 36%; left: 66%; transform: rotate(-32deg); }
.flow-chevron.is-assets-flow { top: 60%; left: 41%; transform: rotate(-28deg); }
.flow-chevron.is-publish-flow { top: 59%; left: 67%; transform: rotate(26deg); }
.flow-chevron.is-feedback-flow { top: 67%; left: 53%; transform: rotate(90deg); }

.growth-signals {
  position: relative;
  display: grid;
  min-height: 0;
  overflow: hidden;
  padding: 20px 15px 14px;
  margin-top: 24px;
  border: 1px solid rgba(89, 157, 238, 0.42);
  border-radius: 20px;
  color: #ffffff;
  background:
    radial-gradient(circle at 92% 0, rgba(62, 143, 230, 0.24), transparent 38%),
    radial-gradient(circle at 8% 72%, rgba(29, 103, 197, 0.18), transparent 42%),
    linear-gradient(164deg, #244b82 0%, #193f76 48%, #14366b 100%);
  box-shadow:
    0 28px 64px rgba(23, 59, 113, 0.23),
    0 0 0 1px rgba(255, 255, 255, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.13),
    inset 0 -1px 0 rgba(0, 20, 59, 0.16);
  grid-column: 2;
  grid-row: 1 / span 2;
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.growth-signals::before {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
  background-size: 28px 28px;
  content: '';
  pointer-events: none;
}

.growth-signals header {
  position: relative;
  z-index: 1;
  display: flex;
  min-height: 38px;
  align-items: center;
  gap: 8px;
}

.growth-signals h2 {
  margin: 0;
  color: #ffffff;
  font-size: 18px;
  font-weight: 740;
}

.signal-beacon {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  color: #43e1c8;
  filter: drop-shadow(0 0 7px rgba(67, 225, 200, 0.48));
  font-size: 19px;
}

.signal-status {
  width: 8px;
  height: 8px;
  margin-left: auto;
  border-radius: 50%;
  background: #43e1c8;
  box-shadow: 0 0 0 5px rgba(67, 225, 200, 0.09);
}

.signal-list {
  position: relative;
  z-index: 1;
  display: grid;
  min-height: 0;
  padding: 8px 0;
  grid-template-rows: repeat(3, minmax(118px, 0.86fr)) minmax(174px, 1.42fr);
  gap: 10px;
}

.signal-card {
  --signal-color: #4e88ff;
  position: relative;
  display: grid;
  min-height: 0;
  align-items: center;
  padding: 13px 12px;
  overflow: hidden;
  border: 1px solid rgba(169, 205, 255, 0.16);
  border-radius: 14px;
  color: #ffffff;
  background: linear-gradient(145deg, rgba(69, 94, 139, 0.38), rgba(28, 56, 104, 0.3));
  box-shadow:
    0 12px 28px rgba(4, 27, 67, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    inset 0 -1px 0 rgba(0, 18, 55, 0.12);
  backdrop-filter: blur(14px) saturate(105%);
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 10px;
  transition:
    transform 160ms cubic-bezier(.22, 1, .36, 1),
    border-color 180ms ease,
    background-color 180ms ease;
}

.signal-card::after {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 24% 12%, rgba(255, 255, 255, 0.16), transparent 52%);
  content: '';
  opacity: 0;
  pointer-events: none;
  transition: opacity 180ms ease;
}

.signal-card[data-tone='violet'] { --signal-color: #8577ff; }
.signal-card[data-tone='cyan'] { --signal-color: #43a3ff; }
.signal-card[data-tone='teal'] { --signal-color: #36d7ca; }

.signal-icon {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--signal-color) 50%, transparent);
  border-radius: 50%;
  color: #ffffff;
  background: linear-gradient(145deg, color-mix(in srgb, var(--signal-color) 82%, white), var(--signal-color));
  box-shadow:
    0 0 20px color-mix(in srgb, var(--signal-color) 34%, transparent),
    0 9px 22px color-mix(in srgb, var(--signal-color) 28%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.34);
  font-size: 19px;
}

.signal-copy {
  display: grid;
  min-width: 0;
  grid-template-columns: 1fr auto;
  gap: 2px 8px;
}

.signal-copy > span {
  color: rgba(232, 243, 255, 0.86);
  font-size: 13px;
  font-weight: 650;
  grid-column: 1 / -1;
}

.signal-copy strong {
  color: #ffffff;
  font-size: 30px;
  font-variant-numeric: tabular-nums;
  font-weight: 780;
  letter-spacing: -0.03em;
}

.signal-copy small {
  display: grid;
  align-self: center;
  color: #52e1c6;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 680;
  justify-items: end;
  gap: 2px;
}

.signal-copy small b {
  font: inherit;
}

.signal-copy small em {
  color: rgba(222, 238, 255, 0.48);
  font-size: 9px;
  font-style: normal;
  font-weight: 560;
}

.signal-copy small[data-change='down'] { color: #ffb5b5; }
.signal-copy small[data-change='flat'] { color: rgba(224, 239, 255, 0.62); }

.signal-card svg {
  width: 100%;
  height: 38px;
  margin-top: 4px;
  grid-column: 1 / -1;
}

.signal-card svg polyline {
  fill: none;
  stroke: #4fe0ce;
  stroke-dasharray: 1;
  stroke-dashoffset: 0;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.4;
  filter: drop-shadow(0 0 5px rgba(79, 224, 206, 0.5));
}

.growth-signals footer {
  position: relative;
  z-index: 1;
  display: flex;
  min-height: 28px;
  align-items: center;
  justify-content: center;
  color: rgba(219, 236, 255, 0.58);
  font-size: 11px;
  gap: 6px;
}

.command-metrics {
  min-width: 0;
  grid-column: 1;
  grid-row: 2;
}

@media (hover: hover) and (pointer: fine) {
  .command-button:hover,
  .signal-card:hover {
    transform: translateY(-2px);
  }

  .command-button.is-primary:hover {
    border-color: rgba(255, 255, 255, 0.46);
  }

  .command-button:hover::before {
    opacity: 0.72;
  }

  .knowledge-node:hover .node-orb {
    box-shadow:
      0 0 0 5px rgba(89, 146, 245, 0.11),
      0 0 28px var(--node-glow),
      0 15px 30px rgba(44, 103, 217, 0.24),
      inset 0 1px 8px rgba(255, 255, 255, 0.46);
    transform: translateY(-1px) scale(1.02);
  }

  .knowledge-node:hover .node-detail {
    color: #285fae;
    background: rgba(248, 251, 255, 0.96);
  }

  .signal-card:hover {
    border-color: rgba(178, 220, 255, 0.4);
  }

  .signal-card:hover::after {
    opacity: 1;
  }
}

@media (max-width: 1420px) {
  .growth-command {
    grid-template-columns: minmax(0, 1fr) 226px;
  }

  .command-copy {
    width: min(500px, 43%);
  }

  .command-copy h1 {
    font-size: 37px;
  }

  .knowledge-node {
    min-width: 178px;
  }

  .node-pills i:nth-child(2) {
    display: none;
  }

  .node-details {
    min-width: 158px;
  }

  .node-detail {
    padding-inline: 8px;
    font-size: 9px;
  }

  .knowledge-node.is-content { right: 12%; }
  .knowledge-node.is-publish { right: 12%; }

  .growth-signals {
    padding-inline: 12px;
  }
}

@media (max-width: 1120px) {
  .growth-command {
    height: auto;
    grid-template-columns: 1fr;
    grid-template-rows: 640px auto auto;
  }

  .knowledge-canvas {
    grid-column: 1;
    grid-row: 1;
  }

  .growth-signals {
    grid-column: 1;
    grid-row: 3;
  }

  .command-metrics {
    grid-column: 1;
    grid-row: 2;
  }

  .growth-signals {
    min-height: 240px;
  }

  .signal-list {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-rows: 1fr;
  }

  .signal-card {
    grid-template-columns: 36px minmax(0, 1fr);
  }

  .signal-icon {
    width: 36px;
    height: 36px;
  }
}

@media (max-width: 760px) {
  .growth-command {
    grid-template-rows: 830px auto auto;
    gap: 10px;
  }

  .knowledge-canvas,
  .growth-signals {
    border-radius: 16px;
  }

  .command-copy {
    top: 24px;
    left: 20px;
    width: calc(100% - 40px);
  }

  .command-copy h1 {
    font-size: 32px;
    white-space: normal;
  }

  .command-copy p {
    font-size: 14px;
  }

  .command-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .knowledge-map {
    top: 265px;
    height: 565px;
  }

  .orbit-art {
    top: 2%;
    right: -42%;
    width: 172%;
    height: 82%;
  }

  .knowledge-core {
    top: 48%;
    left: 50%;
    width: 126px;
    height: 126px;
  }

  .knowledge-node {
    min-width: 0;
    width: calc(50% - 26px);
    padding: 8px;
    border: 1px solid rgba(124, 161, 218, 0.14);
    border-radius: 13px;
    background: rgba(249, 252, 255, 0.74);
    backdrop-filter: blur(8px);
  }

  .knowledge-node.is-questions { top: 5%; left: 13px; }
  .knowledge-node.is-content { top: 5%; right: 13px; }
  .knowledge-node.is-assets { bottom: 8%; left: 13px; }
  .knowledge-node.is-publish { right: 13px; bottom: 8%; }
  .knowledge-node.is-feedback {
    bottom: 23%;
    left: 50%;
    transform: translateX(-50%);
  }

  .knowledge-node.is-feedback:hover {
    transform: translateX(-50%) translateY(-2px);
  }

  .node-orb {
    width: 42px;
    height: 42px;
    border-width: 3px;
    font-size: 17px;
  }

  .node-copy strong {
    font-size: 13px;
  }

  .node-copy > small,
  .node-pills,
  .node-details,
  .node-details.is-horizontal,
  .flow-chevron,
  .orbit-runner {
    display: none;
  }

  .platform-logo {
    width: 22px;
    height: 22px;
  }

  .signal-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .signal-card {
    min-height: 108px;
  }
}

@media (max-width: 460px) {
  .growth-command {
    grid-template-rows: 875px auto auto;
  }

  .command-copy h1 {
    font-size: 29px;
  }

  .knowledge-map {
    top: 300px;
    height: 575px;
  }

  .knowledge-node {
    width: calc(50% - 20px);
    padding: 7px;
    gap: 6px;
  }

  .knowledge-node.is-questions,
  .knowledge-node.is-assets { left: 9px; }

  .knowledge-node.is-content,
  .knowledge-node.is-publish { right: 9px; }

  .node-orb {
    width: 36px;
    height: 36px;
    font-size: 15px;
  }

  .platforms {
    gap: 3px;
  }

  .platform-logo {
    width: 20px;
    height: 20px;
  }

  .growth-signals {
    padding-inline: 10px;
  }

  .signal-list {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .growth-command .knowledge-core > i {
    animation: core-pulse 3.8s cubic-bezier(.4, 0, .2, 1) infinite;
    animation-play-state: paused;
  }

  .growth-command .orbit-runner.runner-1 {
    animation: orbit-run 18s linear infinite;
    animation-play-state: paused;
  }

  .growth-command .orbit-runner.runner-2 {
    animation: orbit-run 28s linear infinite reverse;
    animation-play-state: paused;
  }

  .growth-command[data-active='true'] .knowledge-core > i,
  .growth-command[data-active='true'] .orbit-runner {
    animation-play-state: running;
  }

  .growth-command .animated-number {
    animation: number-enter 220ms cubic-bezier(.22, 1, .36, 1) both;
  }

  .growth-command .signal-card svg polyline {
    animation: signal-draw 520ms cubic-bezier(.22, 1, .36, 1) both;
  }

  @keyframes core-pulse {
    0% { opacity: 0.34; transform: scale(0.98); }
    70%, 100% { opacity: 0; transform: scale(1.16); }
  }

  @keyframes orbit-run {
    from { opacity: 0.18; transform: translate(-50%, -50%) scaleY(var(--orbit-scale-y)) rotate(0deg); }
    12%, 82% { opacity: 1; }
    to { opacity: 0.18; transform: translate(-50%, -50%) scaleY(var(--orbit-scale-y)) rotate(360deg); }
  }

  @keyframes number-enter {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes signal-draw {
    from { opacity: 0.2; stroke-dashoffset: 1; }
    to { opacity: 1; stroke-dashoffset: 0; }
  }
}

@media (prefers-reduced-motion: reduce) {
  .orbit-art,
  .knowledge-core > i,
  .orbit-particle,
  .flow-chevron .el-icon,
  .signal-beacon .el-icon,
  .signal-card svg polyline,
  .knowledge-node,
  .animated-number {
    animation: none !important;
  }

  .orbit-runner {
    display: none;
  }

  .command-button,
  .knowledge-core,
  .knowledge-node,
  .signal-card,
  .node-detail {
    transition: none !important;
  }

  .signal-card::after {
    display: none;
  }

  .command-button:hover,
  .command-button:active,
  .knowledge-node:hover,
  .signal-card:hover,
  .node-detail:hover {
    transform: none;
  }

  .knowledge-core:active {
    transform: translate(-50%, -50%);
  }

  .knowledge-node.is-feedback:hover {
    transform: translateX(-50%);
  }
}
</style>
