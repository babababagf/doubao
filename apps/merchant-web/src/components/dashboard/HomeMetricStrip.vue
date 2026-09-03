<script setup lang="ts">
import type { DashboardDailyTrendPoint, DashboardOverview } from '@doubaohk/api-contract'
import { ArrowDown, Calendar } from '@element-plus/icons-vue'
import { computed } from 'vue'

type MetricKey = 'aiWritingCount' | 'publishedCount' | 'doubaoIncludedCount'
type MetricTone = 'blue' | 'cyan' | 'violet'
type ChartPoint = { x: number; y: number; value: number }
type MetricDefinition = {
  key: MetricKey
  label: string
  recentLabel: string
  tone: MetricTone
  colorStart: string
  colorEnd: string
  disclosure?: string
}

const props = withDefaults(defineProps<{
  overview: DashboardOverview
  points: DashboardDailyTrendPoint[]
  active?: boolean
}>(), {
  active: true,
})

const metricDefinitions: MetricDefinition[] = [
  {
    key: 'aiWritingCount',
    label: '写作数量',
    recentLabel: '近 7 天新增',
    tone: 'blue',
    colorStart: '#2468ff',
    colorEnd: '#63b6ff',
  },
  {
    key: 'publishedCount',
    label: '发布数量',
    recentLabel: '近 7 天成功',
    tone: 'cyan',
    colorStart: '#05b9be',
    colorEnd: '#67e2da',
  },
  {
    key: 'doubaoIncludedCount',
    label: '豆包收录数',
    recentLabel: '近 7 天命中',
    tone: 'violet',
    colorStart: '#7164f5',
    colorEnd: '#a99aff',
    disclosure: '联网回答中的企业名称命中统计',
  },
]

const fallbackZeroValues = Object.freeze([0, 0, 0, 0, 0, 0, 0])
const recentPoints = computed(() => props.points.slice(-7))
const trendDates = computed(() => recentPoints.value.map((point) => formatDate(point.date)))
const chartMaximum = computed(() => Math.max(
  1,
  ...recentPoints.value.flatMap((point) => metricDefinitions.map((definition) => point[definition.key])),
))

const metrics = computed(() => metricDefinitions.map((definition) => {
  const recordedValues = recentPoints.value.map((point) => point[definition.key])
  const values = recordedValues.length ? recordedValues : [...fallbackZeroValues]
  const isFlat = values.every((value) => value === 0)
  const sparklinePoints = isFlat
    ? createFlatPoints(values.length, 112, 14, 3)
    : createChartPoints(values, 112, 28, 3, 4, Math.max(1, ...values))
  const trendPoints = createChartPoints(values, 650, 76, 8, 9, chartMaximum.value)
  const sparklinePath = createSmoothPath(sparklinePoints)
  const trendPath = createSmoothPath(trendPoints)

  return {
    ...definition,
    value: props.overview[definition.key],
    recentValue: recordedValues.reduce((total, value) => total + value, 0),
    isFlat,
    sparklinePoints,
    sparklinePath,
    trendPoints,
    trendPath,
    trendAreaPath: createAreaPath(trendPoints, trendPath, 67),
    sparklineGradientId: `metric-sparkline-${definition.tone}`,
    trendGradientId: `metric-trend-${definition.tone}`,
  }
}))

const allSeriesFlat = computed(() => metrics.value.every((metric) => metric.isFlat))

const periodLabel = computed(() => {
  if (!recentPoints.value.length) return '暂无记录'
  const first = trendDates.value[0]
  const last = trendDates.value.at(-1)
  return first === last ? first : `${first} — ${last}`
})

function createChartPoints(
  values: number[],
  width: number,
  height: number,
  horizontalPadding: number,
  verticalPadding: number,
  maximum: number,
): ChartPoint[] {
  const step = values.length > 1
    ? (width - horizontalPadding * 2) / (values.length - 1)
    : 0

  return values.map((value, index) => ({
    x: horizontalPadding + index * step,
    y: height - verticalPadding - (value / maximum) * (height - verticalPadding * 2),
    value,
  }))
}

function createFlatPoints(count: number, width: number, y: number, horizontalPadding: number): ChartPoint[] {
  const step = count > 1 ? (width - horizontalPadding * 2) / (count - 1) : 0
  return Array.from({ length: count }, (_, index) => ({
    x: horizontalPadding + index * step,
    y,
    value: 0,
  }))
}

function createSmoothPath(points: ChartPoint[]): string {
  if (!points.length) return ''
  if (points.length === 1) return `M ${round(points[0]!.x)} ${round(points[0]!.y)}`

  const commands = [`M ${round(points[0]!.x)} ${round(points[0]!.y)}`]
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)]!
    const current = points[index]!
    const next = points[index + 1]!
    const following = points[Math.min(points.length - 1, index + 2)]!
    const controlOne = {
      x: current.x + (next.x - previous.x) / 6,
      y: current.y + (next.y - previous.y) / 6,
    }
    const controlTwo = {
      x: next.x - (following.x - current.x) / 6,
      y: next.y - (following.y - current.y) / 6,
    }
    commands.push(
      `C ${round(controlOne.x)} ${round(controlOne.y)}, ${round(controlTwo.x)} ${round(controlTwo.y)}, ${round(next.x)} ${round(next.y)}`,
    )
  }
  return commands.join(' ')
}

function createAreaPath(points: ChartPoint[], linePath: string, baseline: number): string {
  if (!points.length) return ''
  const first = points[0]!
  const last = points.at(-1)!
  return `${linePath} L ${round(last.x)} ${baseline} L ${round(first.x)} ${baseline} Z`
}

function round(value: number): string {
  return value.toFixed(1)
}

function formatDate(date: string): string {
  return date ? date.slice(5).replace('-', '/') : ''
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}
</script>

<template>
  <section
    class="metrics-strip"
    :data-active="active"
    :data-flat="allSeriesFlat"
    aria-label="内容增长核心指标"
  >
    <div class="metrics-period" aria-label="统计周期：最近 7 天">
      <span class="period-icon" aria-hidden="true"><el-icon><Calendar /></el-icon></span>
      <span class="period-copy">
        <strong>最近 7 天</strong>
        <small>{{ periodLabel }}</small>
      </span>
      <el-icon class="period-chevron" aria-hidden="true"><ArrowDown /></el-icon>
    </div>

    <div class="metrics-summary">
      <article
        v-for="metric in metrics"
        :key="metric.key"
        class="growth-metric"
        :data-tone="metric.tone"
      >
        <span class="metric-label">{{ metric.label }}</span>
        <span class="metric-number-row">
          <strong class="metric-value animated-number">{{ formatNumber(metric.value) }}</strong>
          <small class="metric-recent" :data-zero="metric.recentValue === 0">
            <b v-if="metric.recentValue > 0" aria-hidden="true">↑</b>
            {{ metric.recentLabel }} {{ formatNumber(metric.recentValue) }}
          </small>
        </span>
        <svg
          class="metric-sparkline"
          :data-flat="metric.isFlat"
          viewBox="0 0 112 28"
          role="img"
          :aria-label="`${metric.label}最近 7 天趋势`"
        >
          <defs>
            <linearGradient :id="metric.sparklineGradientId" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" :stop-color="metric.colorStart" />
              <stop offset="1" :stop-color="metric.colorEnd" />
            </linearGradient>
          </defs>
          <path class="sparkline-glow" :d="metric.sparklinePath" :stroke="`url(#${metric.sparklineGradientId})`" pathLength="1" />
          <path class="sparkline-line" :d="metric.sparklinePath" :stroke="`url(#${metric.sparklineGradientId})`" pathLength="1" />
          <circle
            v-if="metric.sparklinePoints.length"
            class="sparkline-latest"
            :cx="metric.sparklinePoints.at(-1)?.x"
            :cy="metric.sparklinePoints.at(-1)?.y"
            r="2.8"
          />
        </svg>
        <small v-if="metric.disclosure" class="metric-disclosure">{{ metric.disclosure }}</small>
      </article>
    </div>

    <div class="metrics-trend" :data-flat="allSeriesFlat" aria-label="最近 7 天写作、发布与豆包收录趋势">
      <span v-if="allSeriesFlat" class="trend-zero-label">近 7 天暂无新增记录</span>
      <svg viewBox="0 0 650 76" role="img" aria-label="最近 7 天三项真实指标趋势图">
        <defs>
          <linearGradient
            v-for="metric in metrics"
            :id="metric.trendGradientId"
            :key="metric.trendGradientId"
            x1="0"
            y1="0"
            x2="1"
            y2="0"
          >
            <stop offset="0" :stop-color="metric.colorStart" stop-opacity="0.72" />
            <stop offset="0.5" :stop-color="metric.colorEnd" />
            <stop offset="1" :stop-color="metric.colorStart" stop-opacity="0.88" />
          </linearGradient>
        </defs>

        <line class="trend-baseline" x1="8" x2="642" y1="67" y2="67" />
        <g
          v-for="metric in metrics"
          :key="metric.key"
          class="trend-series"
          :data-tone="metric.tone"
          :data-flat="metric.isFlat"
        >
          <path class="trend-area" :d="metric.trendAreaPath" :fill="`url(#${metric.trendGradientId})`" />
          <path class="trend-glow" :d="metric.trendPath" :stroke="`url(#${metric.trendGradientId})`" pathLength="1" />
          <path class="trend-line" :d="metric.trendPath" :stroke="`url(#${metric.trendGradientId})`" pathLength="1" />
          <circle
            v-for="(point, index) in metric.trendPoints"
            :key="`${metric.key}-${index}`"
            class="trend-point"
            :class="{ 'is-latest': index === metric.trendPoints.length - 1 }"
            :cx="point.x"
            :cy="point.y"
            :r="index === metric.trendPoints.length - 1 ? 4.2 : 2.2"
          />
        </g>
      </svg>
      <div v-if="trendDates.length" class="trend-dates" aria-hidden="true">
        <span v-for="date in trendDates" :key="date">{{ date }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.metrics-strip {
  position: relative;
  isolation: isolate;
  display: grid;
  width: 100%;
  min-width: 0;
  min-height: 135px;
  align-items: center;
  overflow: hidden;
  border: 1px solid rgba(145, 177, 222, 0.28);
  border-radius: 20px;
  background:
    radial-gradient(circle at 88% -28%, rgba(103, 220, 236, 0.26), transparent 46%),
    linear-gradient(103deg, rgba(245, 249, 255, 0.96), rgba(233, 242, 253, 0.92) 58%, rgba(220, 242, 250, 0.9));
  box-shadow:
    0 20px 46px rgba(43, 87, 151, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.96),
    inset 0 -1px 0 rgba(117, 170, 225, 0.06);
  backdrop-filter: blur(22px) saturate(1.08);
  grid-template-columns: 152px minmax(414px, 0.82fr) minmax(470px, 1.18fr);
}

.metrics-strip::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  background:
    linear-gradient(112deg, rgba(255, 255, 255, 0.66), transparent 32%),
    radial-gradient(circle at 68% 118%, rgba(67, 151, 255, 0.1), transparent 36%);
  content: '';
  pointer-events: none;
}

.metrics-period {
  position: relative;
  display: flex;
  min-height: 82px;
  align-items: center;
  padding: 0 17px;
  border-right: 1px solid rgba(116, 153, 208, 0.16);
  color: #29486f;
  gap: 9px;
}

.period-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgba(130, 170, 225, 0.3);
  border-radius: 10px;
  color: #2f73ec;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.94), rgba(234, 243, 255, 0.88));
  box-shadow: 0 8px 20px rgba(57, 103, 169, 0.08), inset 0 1px 0 #ffffff;
  font-size: 15px;
}

.period-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.period-copy strong {
  color: #234368;
  font-size: 13px;
  font-weight: 720;
  white-space: nowrap;
}

.period-copy small {
  display: none;
}

.period-chevron {
  margin-left: auto;
  color: #8da4c1;
  font-size: 11px;
}

.metrics-summary {
  display: grid;
  min-width: 0;
  align-items: center;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.growth-metric {
  --metric-color: #2d73f3;
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 92px;
  align-content: center;
  padding: 7px 15px 5px;
  gap: 2px;
}

.growth-metric[data-tone='cyan'] { --metric-color: #0ab8bb; }
.growth-metric[data-tone='violet'] { --metric-color: #7669ee; }

.growth-metric + .growth-metric::before {
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: 0;
  width: 1px;
  background: linear-gradient(180deg, transparent, rgba(117, 151, 203, 0.2) 24%, rgba(117, 151, 203, 0.2) 76%, transparent);
  content: '';
}

.metric-label {
  color: #4f6788;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.2;
}

.metric-number-row {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 7px;
}

.metric-value {
  color: #102b53;
  font-size: 21px;
  font-variant-numeric: tabular-nums;
  font-weight: 790;
  letter-spacing: -0.035em;
  line-height: 1.08;
}

.metric-recent {
  overflow: hidden;
  color: #08a892;
  font-size: 9px;
  font-variant-numeric: tabular-nums;
  font-weight: 680;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-recent[data-zero='true'] { color: #8ca0ba; }
.metric-recent b { font-size: 10px; }

.metric-sparkline {
  display: block;
  width: min(112px, 100%);
  height: 24px;
  overflow: visible;
}

.sparkline-glow,
.sparkline-line {
  fill: none;
  stroke-dasharray: 1;
  stroke-dashoffset: 0;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sparkline-glow {
  opacity: 0.32;
  stroke-width: 6;
  filter: blur(3px);
}

.sparkline-line {
  stroke-width: 1.8;
  filter: drop-shadow(0 2px 3px color-mix(in srgb, var(--metric-color) 32%, transparent));
}

.sparkline-latest {
  fill: #ffffff;
  stroke: var(--metric-color);
  stroke-width: 1.5;
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--metric-color) 55%, transparent));
}

.metric-sparkline[data-flat='true'] .sparkline-glow,
.metric-sparkline[data-flat='true'] .sparkline-line {
  stroke: var(--metric-color);
  stroke-dasharray: none;
  stroke-dashoffset: 0;
}

.metric-sparkline[data-flat='true'] .sparkline-glow { opacity: 0.4; }
.metric-sparkline[data-flat='true'] .sparkline-line { stroke-width: 2.1; }

.metric-disclosure {
  max-width: 160px;
  color: #93a3b8;
  font-size: 9.5px;
  line-height: 1.3;
  white-space: normal;
}

.metrics-trend {
  position: relative;
  min-width: 0;
  padding: 10px 23px 8px;
}

.trend-zero-label {
  position: absolute;
  z-index: 1;
  top: 12px;
  left: 24px;
  color: #647d9e;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.02em;
}

.metrics-trend::before {
  position: absolute;
  top: 22px;
  bottom: 22px;
  left: 0;
  width: 1px;
  background: linear-gradient(180deg, transparent, rgba(111, 153, 210, 0.16), transparent);
  content: '';
}

.metrics-trend svg {
  display: block;
  width: 100%;
  height: 77px;
  overflow: visible;
}

.trend-baseline {
  stroke: rgba(100, 145, 207, 0.16);
  stroke-width: 1;
}

.trend-area { opacity: 0.07; }

.trend-glow,
.trend-line {
  fill: none;
  stroke-dasharray: 1;
  stroke-dashoffset: 0;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.trend-glow {
  opacity: 0.28;
  stroke-width: 9;
  filter: blur(4px);
}

.trend-line { stroke-width: 2.15; }
.trend-series { --trend-color: #2d73f3; }
.trend-series[data-tone='cyan'] { --trend-color: #0ab8bb; }
.trend-series[data-tone='violet'] { --trend-color: #7669ee; }
.trend-series[data-tone='blue'] .trend-line { filter: drop-shadow(0 0 5px rgba(37, 105, 255, 0.46)); }
.trend-series[data-tone='cyan'] .trend-line { filter: drop-shadow(0 0 5px rgba(7, 189, 190, 0.42)); }
.trend-series[data-tone='violet'] .trend-line { filter: drop-shadow(0 0 5px rgba(119, 103, 239, 0.4)); }

.trend-point {
  fill: rgba(255, 255, 255, 0.88);
  stroke: #84aaf1;
  stroke-width: 1.2;
}

.trend-series[data-tone='cyan'] .trend-point { stroke: #22c3c0; }
.trend-series[data-tone='violet'] .trend-point { stroke: #8474f2; }

.trend-series[data-flat='true'] .trend-glow,
.trend-series[data-flat='true'] .trend-line {
  stroke: var(--trend-color);
}

.trend-point.is-latest {
  fill: #ffffff;
  stroke-width: 2;
  filter: drop-shadow(0 0 6px rgba(65, 148, 247, 0.68));
}

.trend-dates {
  display: grid;
  margin: -3px 6px 0;
  color: #8398b5;
  font-size: 9px;
  font-variant-numeric: tabular-nums;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.trend-dates span { text-align: center; }
.metrics-strip[data-flat='true'] .trend-area { opacity: 0; }
.metrics-strip[data-flat='true'] .trend-baseline { stroke: rgba(85, 140, 220, 0.2); }
.metrics-strip[data-flat='true'] .trend-glow { opacity: 0; }
.metrics-strip[data-flat='true'] .trend-line {
  opacity: 0.72;
  stroke-width: 1.6;
  filter: none;
}
.metrics-strip[data-flat='true'] .trend-series[data-tone='cyan'] .trend-line,
.metrics-strip[data-flat='true'] .trend-series[data-tone='violet'] .trend-line { opacity: 0.24; }
.metrics-strip[data-flat='true'] .trend-point { opacity: 0.44; }
.metrics-strip[data-flat='true'] .trend-point.is-latest { filter: none; }

@media (max-width: 1320px) {
  .metrics-strip {
    grid-template-columns: 138px minmax(380px, 0.92fr) minmax(360px, 1.08fr);
  }

  .metrics-period { padding-inline: 13px; }
  .growth-metric { padding-inline: 11px; }
  .metrics-trend { padding-inline: 16px; }
}

@media (prefers-reduced-motion: no-preference) {
  .metrics-strip .animated-number {
    animation: metric-number-enter 220ms cubic-bezier(.22, 1, .36, 1) both;
  }

  .metrics-strip .sparkline-line,
  .metrics-strip .trend-line {
    animation: metric-line-draw 520ms cubic-bezier(.22, 1, .36, 1) both;
  }

  .metrics-strip .metric-sparkline[data-flat='true'] .sparkline-glow,
  .metrics-strip .metric-sparkline[data-flat='true'] .sparkline-line {
    animation: none;
  }

  .metrics-strip .sparkline-glow,
  .metrics-strip .trend-glow {
    animation: metric-opacity-enter 220ms ease-out both;
  }

  .metrics-strip .growth-metric:nth-child(2) .sparkline-glow,
  .metrics-strip .growth-metric:nth-child(2) .sparkline-line,
  .metrics-strip .trend-series:nth-of-type(2) .trend-glow,
  .metrics-strip .trend-series:nth-of-type(2) .trend-line {
    animation-delay: 60ms;
  }

  .metrics-strip .growth-metric:nth-child(3) .sparkline-glow,
  .metrics-strip .growth-metric:nth-child(3) .sparkline-line,
  .metrics-strip .trend-series:nth-of-type(3) .trend-glow,
  .metrics-strip .trend-series:nth-of-type(3) .trend-line {
    animation-delay: 120ms;
  }

  .metrics-strip .trend-area,
  .metrics-strip .trend-point,
  .metrics-strip .sparkline-latest {
    animation: metric-opacity-enter 240ms ease-out both;
  }

  @keyframes metric-line-draw {
    from { opacity: 0.12; stroke-dashoffset: 1; }
    to { opacity: 1; stroke-dashoffset: 0; }
  }

  @keyframes metric-opacity-enter {
    from { opacity: 0; }
  }

  @keyframes metric-number-enter {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
}

@media (prefers-reduced-motion: reduce) {
  .animated-number,
  .sparkline-glow,
  .sparkline-line,
  .sparkline-latest,
  .trend-area,
  .trend-glow,
  .trend-line,
  .trend-point {
    animation: none !important;
    transition: none !important;
  }
}
</style>
