<script setup lang="ts">
import type { DashboardDailyTrendPoint } from '@doubaohk/api-contract'
import { computed, ref } from 'vue'

const props = defineProps<{
  points: DashboardDailyTrendPoint[]
}>()

type ActivityKey = 'aiWritingCount' | 'publishedCount'
type ActivityMetric = { key: ActivityKey; label: string; color: string }

const chartWidth = 1120
const chartHeight = 306
const plot = { left: 58, right: 26, top: 34, bottom: 50 }
const plotWidth = chartWidth - plot.left - plot.right
const plotHeight = chartHeight - plot.top - plot.bottom
const metrics: ActivityMetric[] = [
  { key: 'aiWritingCount', label: 'AI 写作数量', color: '#2168ff' },
  { key: 'publishedCount', label: '发布成功数量', color: '#12a982' },
]
const activeIndex = ref<number | null>(null)

const recentPoints = computed(() => props.points.slice(-7))
const totals = computed(() => ({
  aiWritingCount: recentPoints.value.reduce((total, point) => total + point.aiWritingCount, 0),
  publishedCount: recentPoints.value.reduce((total, point) => total + point.publishedCount, 0),
}))
const combinedTotal = computed(() => totals.value.aiWritingCount + totals.value.publishedCount)
const valueMax = computed(() => {
  const rawMax = Math.max(0, ...recentPoints.value.flatMap((point) => [point.aiWritingCount, point.publishedCount]))
  if (rawMax <= 12) return 12
  const magnitude = 10 ** Math.floor(Math.log10(rawMax))
  const normalized = rawMax / magnitude
  const rounded = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return rounded * magnitude
})
const yTicks = computed(() => Array.from({ length: 5 }, (_, index) => Math.round((valueMax.value * (4 - index)) / 4)))
const groupWidth = computed(() => recentPoints.value.length ? plotWidth / recentPoints.value.length : plotWidth)
const barWidth = computed(() => Math.max(14, Math.min(26, groupWidth.value * 0.2)))
const activePoint = computed(() => activeIndex.value === null ? null : recentPoints.value[activeIndex.value] ?? null)
const recentPeriod = computed(() => {
  const first = recentPoints.value[0]?.date
  const last = recentPoints.value.at(-1)?.date
  return first && last ? `${formatDate(first)} — ${formatDate(last)}` : '最近 7 天'
})

function xPosition(index: number): number {
  return plot.left + ((index + 0.5) / Math.max(1, recentPoints.value.length)) * plotWidth
}

function barX(index: number, metricIndex: number): number {
  const offset = metricIndex === 0 ? -(barWidth.value / 2 + 4) : barWidth.value / 2 + 4
  return xPosition(index) + offset - barWidth.value / 2
}

function barHeight(value: number): number {
  if (value <= 0) return 0
  return Math.max(3, (value / valueMax.value) * plotHeight)
}

function barY(value: number): number {
  return plot.top + plotHeight - barHeight(value)
}

function formatDate(date: string): string {
  return `${String(Number(date.slice(5, 7))).padStart(2, '0')}/${String(Number(date.slice(8, 10))).padStart(2, '0')}`
}

function formatDateLabel(date: string): string {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const day = new Date(`${date}T00:00:00`).getDay()
  return `${formatDate(date)} ${weekdays[day]}`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function barDelay(index: number, metricIndex: number): string {
  return `${210 + index * 62 + metricIndex * 24}ms`
}

function handlePointerMove(event: PointerEvent): void {
  if (!recentPoints.value.length) return
  const svg = event.currentTarget as SVGElement
  const bounds = svg.getBoundingClientRect()
  const svgX = ((event.clientX - bounds.left) / bounds.width) * chartWidth
  const ratio = Math.min(0.9999, Math.max(0, (svgX - plot.left) / plotWidth))
  activeIndex.value = Math.floor(ratio * recentPoints.value.length)
}
</script>

<template>
  <section class="weekly-panel surface-panel" aria-labelledby="weekly-chart-title">
    <header class="weekly-header">
      <div class="weekly-heading">
        <h2 id="weekly-chart-title">最近 7 天内容产出</h2>
        <p>{{ recentPeriod }}</p>
      </div>

      <div class="weekly-summary" aria-label="最近 7 天累计数量">
        <article class="summary-item is-writing">
          <span>AI 写作数量</span>
          <strong>{{ formatNumber(totals.aiWritingCount) }}</strong>
          <small>近 7 天</small>
        </article>
        <article class="summary-item is-published">
          <span>发布数量</span>
          <strong>{{ formatNumber(totals.publishedCount) }}</strong>
          <small>近 7 天</small>
        </article>
      </div>

      <label class="period-select">
        <span class="sr-only">统计周期</span>
        <select aria-label="统计周期">
          <option>近 7 天</option>
        </select>
      </label>
    </header>

    <div class="chart-canvas">
      <div class="chart-meta">
        <div class="chart-legend" aria-label="图例">
          <span v-for="metric in metrics" :key="metric.key"><i :style="{ backgroundColor: metric.color }" />{{ metric.label }}</span>
        </div>
        <span>每日统计</span>
      </div>

      <svg
        class="weekly-chart"
        :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
        role="img"
        aria-label="最近7天AI写作与平台发布柱状图"
        @pointermove="handlePointerMove"
        @pointerleave="activeIndex = null"
      >
        <title>最近 7 天 AI 写作与平台发布数量</title>

        <g class="grid-lines">
          <g v-for="(tick, index) in yTicks" :key="`${tick}-${index}`">
            <line :x1="plot.left" :x2="chartWidth - plot.right" :y1="plot.top + (index / 4) * plotHeight" :y2="plot.top + (index / 4) * plotHeight" />
            <text :x="plot.left - 14" :y="plot.top + (index / 4) * plotHeight + 4" text-anchor="end">{{ tick }}</text>
          </g>
        </g>

        <g class="data-series">
          <g
            v-for="(point, index) in recentPoints"
            :key="point.date"
            class="bar-group"
            :class="{ 'is-active': activeIndex === index, 'is-dimmed': activeIndex !== null && activeIndex !== index }"
          >
            <rect
              class="activity-bar is-writing"
              :x="barX(index, 0)"
              :y="barY(point.aiWritingCount)"
              :width="barWidth"
              :height="barHeight(point.aiWritingCount)"
              :rx="Math.min(5, barWidth / 2)"
              :style="{ animationDelay: barDelay(index, 0) }"
            />
            <rect
              class="activity-bar is-published"
              :x="barX(index, 1)"
              :y="barY(point.publishedCount)"
              :width="barWidth"
              :height="barHeight(point.publishedCount)"
              :rx="Math.min(5, barWidth / 2)"
              :style="{ animationDelay: barDelay(index, 1) }"
            />
            <text v-if="point.aiWritingCount > 0" class="bar-value" :x="barX(index, 0) + barWidth / 2" :y="barY(point.aiWritingCount) - 8" text-anchor="middle">{{ point.aiWritingCount }}</text>
            <text v-if="point.publishedCount > 0" class="bar-value" :x="barX(index, 1) + barWidth / 2" :y="barY(point.publishedCount) - 8" text-anchor="middle">{{ point.publishedCount }}</text>
            <text class="x-label" :x="xPosition(index)" :y="chartHeight - 17" text-anchor="middle">{{ formatDateLabel(point.date) }}</text>
          </g>
        </g>

        <text v-if="combinedTotal === 0" :x="chartWidth / 2" :y="plot.top + plotHeight / 2" text-anchor="middle" class="empty-label">最近 7 天暂无写作与发布数据</text>

        <g v-if="activeIndex !== null && activePoint" class="hover-state">
          <line :x1="xPosition(activeIndex)" :x2="xPosition(activeIndex)" :y1="plot.top" :y2="plot.top + plotHeight" />
          <g :transform="`translate(${xPosition(activeIndex) > chartWidth * 0.72 ? xPosition(activeIndex) - 200 : xPosition(activeIndex) + 14}, ${plot.top + 8})`">
            <rect width="174" height="82" rx="10" />
            <text x="14" y="23" class="tooltip-date">{{ activePoint.date }}</text>
            <circle cx="16" cy="45" r="3" :fill="metrics[0]!.color" />
            <text x="28" y="49">写作数量</text>
            <text x="158" y="49" text-anchor="end" class="tooltip-value">{{ activePoint.aiWritingCount }}</text>
            <circle cx="16" cy="66" r="3" :fill="metrics[1]!.color" />
            <text x="28" y="70">发布数量</text>
            <text x="158" y="70" text-anchor="end" class="tooltip-value">{{ activePoint.publishedCount }}</text>
          </g>
        </g>
      </svg>
    </div>
  </section>
</template>

<style scoped>
.weekly-panel {
  position: relative;
  min-width: 0;
  min-height: 100%;
  overflow: hidden;
  border-radius: 20px;
  background: #ffffff;
}

.weekly-panel::before {
  position: absolute;
  z-index: 2;
  top: 0;
  right: 0;
  left: 0;
  height: 3px;
  background: linear-gradient(90deg, #1d63e9, #19b8dc 62%, transparent);
  content: '';
}

.weekly-header {
  display: flex;
  min-height: 118px;
  align-items: center;
  justify-content: space-between;
  padding: 0 26px;
  gap: 24px;
}

.section-kicker {
  display: block;
  margin-bottom: 4px;
  color: #2b6ed6;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 750;
  letter-spacing: 0.18em;
}

.weekly-heading h2 {
  margin: 0;
  color: var(--color-text);
  font-size: 24px;
  font-weight: 740;
  letter-spacing: -0.035em;
}

.weekly-heading p {
  margin: 4px 0 0;
  color: #71829a;
  font-family: var(--font-mono);
  font-size: 13px;
}

.weekly-summary {
  display: flex;
  align-items: center;
  gap: 10px;
}

.summary-item {
  display: grid;
  min-width: 148px;
  min-height: 72px;
  align-content: center;
  padding: 0 14px;
  border: 1px solid #d8e5f5;
  border-radius: 12px;
  background: #f6f9fe;
  grid-template-columns: 1fr auto;
  gap: 1px 9px;
}

.summary-item.is-published {
  border-color: #d5eee7;
  background: #f2faf7;
}

.summary-item span,
.summary-item small {
  color: var(--color-text-muted);
  font-size: 14px;
}

.summary-item strong {
  color: #155bdd;
  font-size: 28px;
  font-variant-numeric: tabular-nums;
  font-weight: 740;
  line-height: 1;
  grid-row: 1 / 3;
  grid-column: 2;
}

.summary-item.is-published strong {
  color: #0f9f7a;
}

.chart-canvas {
  margin: 0 16px 16px;
  padding: 0 14px 12px;
  border: 1px solid #e2eaf4;
  border-radius: 14px;
  background:
    linear-gradient(rgba(55, 105, 171, 0.025) 1px, transparent 1px),
    #f8fafd;
  background-size: 100% 42px, auto;
}

.chart-meta {
  display: flex;
  min-height: 54px;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px;
  color: var(--color-text-muted);
  font-size: 13px;
  gap: 18px;
}

.chart-legend {
  display: flex;
  color: var(--color-text-secondary);
  gap: 17px;
}

.chart-legend span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.chart-legend i {
  width: 7px;
  height: 7px;
  border-radius: 3px;
}

.weekly-chart {
  display: block;
  width: 100%;
  height: 320px;
  padding: 0 4px;
  overflow: visible;
  touch-action: none;
}

.grid-lines line {
  stroke: #dde7f2;
  stroke-width: 1;
}

.grid-lines text,
.x-label {
  fill: #71839a;
  font-family: var(--font-mono);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.bar-group {
  transition: opacity 160ms ease;
}

.bar-group.is-dimmed {
  opacity: 0.28;
}

.activity-bar {
  transform-box: fill-box;
  transform-origin: center bottom;
  transition: opacity 160ms ease, filter 160ms ease;
}

.activity-bar.is-writing {
  fill: #1d63e9;
}

.activity-bar.is-published {
  fill: #10a786;
}

.bar-group.is-active .activity-bar {
  filter: drop-shadow(0 7px 9px rgba(30, 91, 169, 0.2));
}

.bar-value {
  fill: #49617d;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 650;
}

.empty-label {
  fill: #8799af;
  font-size: 14px;
}

.hover-state > line {
  stroke: #8cadd3;
  stroke-dasharray: 4 4;
}

.hover-state rect {
  fill: rgba(255, 255, 255, 0.97);
  stroke: #cbdff3;
  filter: drop-shadow(0 10px 22px rgba(34, 76, 132, 0.16));
}

.hover-state text {
  fill: #61748d;
  font-size: 13px;
}

.hover-state .tooltip-date,
.hover-state .tooltip-value {
  fill: #17365d;
  font-family: var(--font-mono);
  font-weight: 700;
}

@media (max-width: 760px) {
  .weekly-header {
    align-items: flex-start;
    padding: 18px;
    flex-direction: column;
    gap: 12px;
  }

  .weekly-summary {
    width: 100%;
    min-height: 60px;
  }

  .summary-item {
    min-width: 0;
    flex: 1;
    padding-left: 0;
  }

  .chart-canvas {
    overflow-x: auto;
    padding: 0 10px 12px;
  }

  .weekly-chart {
    min-width: 650px;
  }
}

@media (max-width: 480px) {
  .weekly-summary {
    flex-direction: column;
  }

  .summary-item {
    min-height: 48px;
  }

  .summary-item + .summary-item::before {
    top: 0;
    right: 0;
    bottom: auto;
    width: auto;
    height: 1px;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .activity-bar {
    animation: bar-grow 520ms cubic-bezier(.22, 1, .36, 1) backwards;
  }

  .bar-value {
    animation: value-enter 180ms 520ms ease-out backwards;
  }

  @keyframes bar-grow {
    from { opacity: 0; transform: scaleY(0.04); }
    to { opacity: 1; transform: scaleY(1); }
  }

  @keyframes value-enter {
    from { opacity: 0; transform: translateY(3px); }
    to { opacity: 1; transform: translateY(0); }
  }
}
</style>

<style scoped src="@/styles/dashboard-trend-reference.css"></style>
