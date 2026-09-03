<script setup lang="ts">
import type { DashboardOverview } from '@doubaohk/api-contract'
import { ChatDotRound, CircleCheck, EditPen, Phone, Pointer, Promotion, Search } from '@element-plus/icons-vue'
import type { Component } from 'vue'

const props = defineProps<{
  overview: DashboardOverview
}>()

type OverviewKey = keyof DashboardOverview
type MetricItem = {
  key: OverviewKey
  label: string
  hint: string
  icon: Component
  tone: string
}

const metrics: MetricItem[] = [
  { key: 'keywordCount', label: '关键词数量', hint: '当前有效关键词', icon: Search, tone: 'blue' },
  { key: 'expandedQuestionCount', label: '拓展问题数量', hint: '已沉淀问题词', icon: ChatDotRound, tone: 'violet' },
  { key: 'aiWritingCount', label: '写作数量', hint: 'AI 生成文章', icon: EditPen, tone: 'cyan' },
  { key: 'publishedCount', label: '发文数量', hint: '平台发布成功', icon: Promotion, tone: 'amber' },
  { key: 'doubaoIncludedCount', label: '豆包收录数', hint: '最新检测命中', icon: CircleCheck, tone: 'green' },
  { key: 'phoneExposureCount', label: '电话曝光数', hint: '官网电话展示', icon: Phone, tone: 'sky' },
  { key: 'phoneClickCount', label: '电话点击数', hint: '官网电话点击', icon: Pointer, tone: 'rose' },
]

const numberFormatter = new Intl.NumberFormat('zh-CN')
</script>

<template>
  <section class="overview-panel surface-panel" aria-labelledby="overview-title">
    <div class="panel-heading">
      <div>
        <h1 id="overview-title">数据总览</h1>
      </div>
      <p>查看内容生产、发布和获客数据，了解近期业务情况。</p>
    </div>

    <div class="metric-grid">
      <article v-for="metric in metrics" :key="metric.key" class="metric-card" :class="`is-${metric.tone}`">
        <div class="metric-icon" aria-hidden="true">
          <el-icon><component :is="metric.icon" /></el-icon>
        </div>
        <div class="metric-copy">
          <span>{{ metric.label }}</span>
          <strong>{{ numberFormatter.format(props.overview[metric.key]) }}</strong>
          <small>{{ metric.hint }}</small>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.overview-panel {
  position: relative;
  overflow: hidden;
  padding: 0;
}

.overview-panel::after {
  position: absolute;
  top: -170px;
  right: -110px;
  width: 360px;
  height: 360px;
  border-radius: 50%;
  pointer-events: none;
  background: radial-gradient(circle, rgba(31, 122, 255, 0.12), transparent 69%);
  content: '';
}

.panel-heading {
  position: relative;
  z-index: 1;
  display: flex;
  min-height: 94px;
  align-items: center;
  justify-content: space-between;
  padding: 0 26px;
  border-bottom: 1px solid rgba(182, 206, 235, 0.62);
  gap: 24px;
}

.section-kicker {
  display: block;
  margin-bottom: 4px;
  color: #2775df;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.16em;
}

.panel-heading h1 {
  margin: 0;
  color: #19375f;
  font-size: 23px;
  letter-spacing: -0.03em;
}

.panel-heading p {
  max-width: 440px;
  margin: 0;
  color: #8395ab;
  font-size: 14px;
  text-align: right;
}

.metric-grid {
  position: relative;
  z-index: 1;
  display: grid;
  padding: 20px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.metric-card {
  --metric-color: #1f78ff;
  --metric-soft: #eaf4ff;
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 138px;
  align-items: flex-start;
  overflow: hidden;
  padding: 21px 18px;
  border: 1px solid rgba(165, 198, 237, 0.62);
  border-radius: 17px;
  background:
    radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--metric-color) 14%, transparent), transparent 45%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.97), rgba(245, 250, 255, 0.9));
  box-shadow: 0 10px 28px rgba(43, 86, 147, 0.08), inset 0 1px 0 #ffffff;
  gap: 14px;
  transition:
    border-color var(--transition-fast),
    transform var(--transition-fast),
    box-shadow var(--transition-fast);
}

.metric-card::after {
  position: absolute;
  right: -20px;
  bottom: -32px;
  width: 92px;
  height: 92px;
  border: 1px solid color-mix(in srgb, var(--metric-color) 18%, transparent);
  border-radius: 50%;
  content: '';
}

.metric-card:hover {
  transform: translateY(-4px);
  border-color: color-mix(in srgb, var(--metric-color) 40%, #d4e3f4);
  box-shadow: 0 18px 38px rgba(35, 87, 158, 0.14), inset 0 1px 0 #ffffff;
}

.metric-card.is-violet {
  --metric-color: #6c6de5;
  --metric-soft: #f0efff;
}

.metric-card.is-cyan {
  --metric-color: #16a9cb;
  --metric-soft: #e8f9fd;
}

.metric-card.is-amber {
  --metric-color: #df922d;
  --metric-soft: #fff5e7;
}

.metric-card.is-green {
  --metric-color: #1aae83;
  --metric-soft: #e9faf4;
}

.metric-card.is-sky {
  --metric-color: #2b91d5;
  --metric-soft: #eaf7ff;
}

.metric-card.is-rose {
  --metric-color: #d85c7c;
  --metric-soft: #fff0f5;
}

.metric-icon {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--metric-color) 24%, transparent);
  border-radius: 14px;
  color: var(--metric-color);
  background: linear-gradient(145deg, #ffffff, var(--metric-soft));
  box-shadow: 0 8px 20px color-mix(in srgb, var(--metric-color) 13%, transparent);
  font-size: 20px;
}

.metric-copy {
  display: grid;
  min-width: 0;
}

.metric-copy span {
  overflow: hidden;
  color: #637892;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-copy strong {
  margin-top: 7px;
  color: #16375f;
  font-family: var(--font-display);
  font-size: 30px;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.045em;
  line-height: 1;
}

.metric-copy small {
  margin-top: 11px;
  overflow: hidden;
  color: #8a9bb0;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1280px) {
  .metric-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .panel-heading {
    align-items: flex-start;
    padding: 20px;
    flex-direction: column;
    gap: 8px;
  }

  .panel-heading p {
    text-align: left;
  }

  .metric-grid {
    padding: 14px;
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .metric-card {
    animation: metric-enter 440ms cubic-bezier(.2, .72, .2, 1) both;
  }

  .metric-card:nth-child(2) { animation-delay: 45ms; }
  .metric-card:nth-child(3) { animation-delay: 90ms; }
  .metric-card:nth-child(4) { animation-delay: 135ms; }
  .metric-card:nth-child(5) { animation-delay: 180ms; }
  .metric-card:nth-child(6) { animation-delay: 225ms; }
  .metric-card:nth-child(7) { animation-delay: 270ms; }

  @keyframes metric-enter {
    from { opacity: 0; transform: translateY(9px); }
    to { opacity: 1; transform: translateY(0); }
  }
}
</style>

<style scoped>
.overview-panel {
  border-radius: 18px;
}

.overview-panel::after {
  opacity: 0.65;
}

.panel-heading {
  min-height: 88px;
  padding: 0 24px;
  border-bottom-color: #e7ecf3;
}

.section-kicker {
  color: #3575dd;
  font-size: 13px;
  letter-spacing: 0.18em;
}

.panel-heading h1 {
  color: #152641;
  font-size: 21px;
  font-weight: 720;
}

.panel-heading p {
  color: #8794a7;
  font-size: 14px;
}

.metric-grid {
  padding: 18px;
  gap: 11px;
}

.metric-card {
  min-height: 116px;
  padding: 18px 16px;
  border-color: #e1e8f2;
  border-radius: 13px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(18, 38, 68, 0.035);
}

.metric-card::after {
  right: -34px;
  bottom: -46px;
  width: 106px;
  height: 106px;
  opacity: 0.5;
}

.metric-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 28px rgba(33, 70, 125, 0.09);
}

.metric-icon {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  background: var(--metric-soft);
  box-shadow: none;
  font-size: 18px;
}

.metric-copy span {
  color: #5d6e85;
  font-size: 15px;
}

.metric-copy strong {
  margin-top: 6px;
  color: #142540;
  font-size: 27px;
}

.metric-copy small {
  margin-top: 9px;
  color: #929dad;
}
</style>
