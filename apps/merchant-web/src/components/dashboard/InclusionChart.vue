<script setup lang="ts">
import type { DashboardResponse } from '@doubaohk/api-contract'
import { CircleCheckFilled, InfoFilled } from '@element-plus/icons-vue'
import { computed } from 'vue'

import { formatDateTime, formatNumber } from '@/utils/format'

const props = defineProps<{
  count: number
  points: DashboardResponse['inclusionTrend']
  lastCheckedAt: string | null
}>()

interface ChartPoint {
  date: string
  value: number
  x: number
  y: number
}

const chart = {
  width: 760,
  height: 252,
  left: 20,
  right: 58,
  top: 20,
  bottom: 34,
}

const maximum = computed(() => {
  const highest = Math.max(10, ...props.points.map((point) => point.includedCount))
  return Math.ceil(highest / 10) * 10
})

const chartPoints = computed<ChartPoint[]>(() => {
  const plotWidth = chart.width - chart.left - chart.right
  const plotHeight = chart.height - chart.top - chart.bottom
  const lastIndex = Math.max(1, props.points.length - 1)

  return props.points.map((point, index) => ({
    date: point.date,
    value: point.includedCount,
    x: chart.left + (index / lastIndex) * plotWidth,
    y: chart.top + plotHeight - (point.includedCount / maximum.value) * plotHeight,
  }))
})

function buildLinePath(points: ChartPoint[]): string {
  if (points.length === 0) {
    return ''
  }

  const first = points[0]

  if (!first) {
    return ''
  }

  if (points.length === 1) {
    return `M ${first.x} ${first.y}`
  }

  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index]

    if (!previous) {
      return path
    }

    const controlX = (previous.x + point.x) / 2
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`
  }, `M ${first.x} ${first.y}`)
}

const linePath = computed(() => buildLinePath(chartPoints.value))
const areaPath = computed(() => {
  const points = chartPoints.value
  const first = points[0]
  const last = points.at(-1)
  const baseline = chart.height - chart.bottom

  if (!first || !last || !linePath.value) {
    return ''
  }

  return `${linePath.value} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`
})

const gridRows = computed(() =>
  Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4
    const plotHeight = chart.height - chart.top - chart.bottom
    return {
      value: Math.round(maximum.value * (1 - ratio)),
      y: chart.top + plotHeight * ratio,
    }
  }),
)

function displayDate(value: string): string {
  return value.slice(5).replace('-', '/')
}
</script>

<template>
  <section class="chart-panel surface-panel" aria-labelledby="inclusion-chart-title">
    <header class="chart-header">
      <div>
        <span class="eyebrow">DOUBAO VISIBILITY</span>
        <h2 id="inclusion-chart-title">豆包收录数</h2>
      </div>
      <div class="check-status">
        <el-icon :size="18" aria-hidden="true"><CircleCheckFilled /></el-icon>
        <span>
          {{ lastCheckedAt ? '最近检测完成' : '暂无检测记录' }}
          <small>{{ lastCheckedAt ? formatDateTime(lastCheckedAt) : '请由贴牌后台发起检测' }}</small>
        </span>
      </div>
    </header>

    <div class="chart-body">
      <div class="chart-summary">
        <strong>{{ formatNumber(count) }}</strong>
        <span>当前名称命中问题数</span>
        <div class="chart-legend"><i aria-hidden="true" />近 30 天趋势</div>
      </div>

      <figure v-if="points.length" class="chart-figure">
        <svg
          class="chart-svg"
          :viewBox="`0 0 ${chart.width} ${chart.height}`"
          role="img"
          aria-labelledby="chart-svg-title chart-svg-description"
        >
          <title id="chart-svg-title">近三十天豆包收录数趋势</title>
          <desc id="chart-svg-description">按豆包接口回答中是否出现企业全称或简称统计</desc>
          <defs>
            <linearGradient id="inclusion-stroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#4d83ff" />
              <stop offset="56%" stop-color="#7b61ff" />
              <stop offset="100%" stop-color="#55d3e7" />
            </linearGradient>
            <linearGradient id="inclusion-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#6e67ff" stop-opacity="0.42" />
              <stop offset="70%" stop-color="#3276e7" stop-opacity="0.1" />
              <stop offset="100%" stop-color="#2357a8" stop-opacity="0" />
            </linearGradient>
            <filter id="line-glow" x="-30%" y="-40%" width="160%" height="180%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <g class="grid-lines">
            <g v-for="row in gridRows" :key="row.value">
              <line :x1="chart.left" :x2="chart.width - chart.right" :y1="row.y" :y2="row.y" />
              <text :x="chart.width - chart.right + 18" :y="row.y + 4">{{ row.value }}</text>
            </g>
          </g>

          <path v-if="areaPath" :d="areaPath" fill="url(#inclusion-fill)" />
          <path
            v-if="linePath"
            class="trend-line"
            :d="linePath"
            fill="none"
            stroke="url(#inclusion-stroke)"
            stroke-width="3"
            stroke-linecap="round"
            filter="url(#line-glow)"
          />

          <g v-for="(point, index) in chartPoints" :key="point.date" class="chart-point">
            <circle v-if="index === chartPoints.length - 1" :cx="point.x" :cy="point.y" r="8" />
            <circle :cx="point.x" :cy="point.y" r="3.5">
              <title>{{ point.date }}：{{ point.value }}</title>
            </circle>
            <text :x="point.x" :y="chart.height - 9" text-anchor="middle">
              {{ displayDate(point.date) }}
            </text>
          </g>
        </svg>
      </figure>
      <div v-else class="chart-empty"><strong>暂无趋势数据</strong><span>贴牌后台完成首次检测后展示近 30 天名称命中趋势。</span></div>
    </div>

    <footer class="metric-definition">
      <el-icon aria-hidden="true"><InfoFilled /></el-icon>
      <span>按 API 回答中企业全称或简称命中统计，不代表豆包官方索引收录。</span>
    </footer>
  </section>
</template>

<style scoped>
.chart-panel {
  min-width: 0;
  overflow: hidden;
  padding: 23px 24px 18px;
}

.chart-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.eyebrow {
  display: block;
  margin-bottom: 4px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
}

h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
}

.check-status {
  display: flex;
  align-items: center;
  padding: 9px 12px;
  border: 1px solid rgba(52, 211, 153, 0.21);
  border-radius: 10px;
  color: #56ddb0;
  background: rgba(40, 132, 115, 0.09);
  gap: 9px;
}

.check-status span,
.check-status small {
  display: block;
}

.check-status span {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.check-status small {
  margin-top: 1px;
  color: var(--color-text-muted);
  font-size: 10px;
}

.chart-body {
  display: grid;
  min-width: 0;
  grid-template-columns: 150px minmax(0, 1fr);
  align-items: stretch;
  margin-top: 8px;
}

.chart-summary {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 18px 18px 30px 0;
}

.chart-summary strong {
  font-size: clamp(44px, 4vw, 64px);
  font-variant-numeric: tabular-nums;
  font-weight: 690;
  letter-spacing: -0.06em;
  line-height: 1;
}

.chart-summary > span {
  margin-top: 9px;
  color: var(--color-text-muted);
  font-size: 11px;
}

.chart-legend {
  display: flex;
  align-items: center;
  margin-top: 35px;
  color: var(--color-text-secondary);
  font-size: 11px;
  gap: 8px;
}

.chart-legend i {
  display: block;
  width: 22px;
  height: 2px;
  border-radius: var(--radius-pill);
  background: var(--gradient-chart);
  box-shadow: 0 0 8px rgba(93, 104, 255, 0.6);
}

.chart-figure {
  min-width: 0;
  margin: 0;
}

.chart-empty { display: grid; min-height: 252px; align-content: center; padding: 0 24px; border: 1px dashed rgba(145, 168, 205, .24); border-radius: 10px; color: var(--color-text-muted); gap: 8px; text-align: center; }
.chart-empty strong { color: var(--color-text-secondary); font-size: 14px; }
.chart-empty span { font-size: 12px; line-height: 1.65; }

.chart-svg {
  display: block;
  width: 100%;
  height: 252px;
  overflow: visible;
}

.grid-lines line {
  stroke: rgba(139, 160, 195, 0.13);
  stroke-dasharray: 3 5;
}

.grid-lines text,
.chart-point text {
  fill: #6f7d94;
  font-family: var(--font-mono);
  font-size: 10px;
}

.chart-point circle:first-of-type {
  fill: rgba(83, 201, 230, 0.16);
  stroke: rgba(83, 201, 230, 0.2);
}

.chart-point circle:last-of-type {
  fill: #b5e7ff;
  stroke: #5f9fff;
  stroke-width: 2;
}

.metric-definition {
  display: flex;
  align-items: center;
  min-height: 36px;
  margin-top: 3px;
  padding-top: 13px;
  border-top: 1px solid rgba(145, 168, 205, 0.13);
  color: var(--color-text-muted);
  font-size: 11px;
  gap: 7px;
}

@media (max-width: 760px) {
  .chart-panel {
    padding: 20px;
  }

  .check-status {
    display: none;
  }

  .chart-body {
    grid-template-columns: 1fr;
  }

  .chart-summary {
    padding-bottom: 0;
  }

  .chart-legend {
    margin-top: 18px;
  }

  .chart-svg {
    height: 220px;
  }
}
</style>
