<script setup lang="ts">
import type { EffectSummary } from '@doubaohk/api-contract'
import { ChatDotRound, Phone, Pointer } from '@element-plus/icons-vue'
import { computed, type Component } from 'vue'

import { formatNumber } from '@/utils/format'

const props = defineProps<{
  effects: EffectSummary
}>()

interface MetricItem {
  key: string
  label: string
  description: string
  value: string
  icon: Component
  tone: 'blue' | 'cyan' | 'violet'
}

const metrics = computed<MetricItem[]>(() => [
  {
    key: 'questions',
    label: '问题总量',
    description: '当前已管理的问题词',
    value: formatNumber(props.effects.questionTotal),
    icon: ChatDotRound,
    tone: 'violet',
  },
  {
    key: 'exposure',
    label: '电话曝光量',
    description: '网站电话展示次数',
    value: formatNumber(props.effects.phoneExposureCount),
    icon: Phone,
    tone: 'cyan',
  },
  {
    key: 'clicks',
    label: '电话点击量',
    description: '网站电话点击次数',
    value: formatNumber(props.effects.phoneClickCount),
    icon: Pointer,
    tone: 'blue',
  },
])
</script>

<template>
  <section class="metric-panel surface-panel" aria-labelledby="core-metric-title">
    <header class="panel-heading">
      <div>
        <span class="eyebrow">EFFECT METRICS</span>
        <h2 id="core-metric-title">核心效果</h2>
      </div>
      <span class="source-tag">实时汇总</span>
    </header>

    <div class="metric-list">
      <article v-for="metric in metrics" :key="metric.key" class="metric-item">
        <div class="metric-icon" :data-tone="metric.tone" aria-hidden="true">
          <el-icon :size="23"><component :is="metric.icon" /></el-icon>
        </div>
        <div class="metric-copy">
          <span>{{ metric.label }}</span>
          <small>{{ metric.description }}</small>
        </div>
        <strong>{{ metric.value }}</strong>
      </article>
    </div>
  </section>
</template>

<style scoped>
.metric-panel {
  min-width: 0;
  padding: 23px 24px 19px;
}

.panel-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-border);
  gap: 16px;
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

.source-tag {
  padding: 4px 8px;
  border: 1px solid rgba(77, 210, 177, 0.24);
  border-radius: var(--radius-pill);
  color: #77d8c0;
  background: rgba(36, 210, 161, 0.07);
  font-size: 11px;
  white-space: nowrap;
}

.metric-list {
  display: grid;
}

.metric-item {
  display: grid;
  min-height: 88px;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
}

.metric-item + .metric-item {
  border-top: 1px solid rgba(145, 168, 205, 0.14);
}

.metric-icon {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border: 1px solid rgba(118, 128, 255, 0.32);
  border-radius: 50%;
  color: #9d89ff;
  background: radial-gradient(circle at 35% 30%, rgba(137, 105, 255, 0.32), rgba(86, 58, 180, 0.13));
}

.metric-icon[data-tone='cyan'] {
  border-color: rgba(66, 201, 223, 0.3);
  color: #5dd7e9;
  background: radial-gradient(circle at 35% 30%, rgba(66, 201, 223, 0.26), rgba(20, 100, 132, 0.12));
}

.metric-icon[data-tone='blue'] {
  border-color: rgba(86, 124, 255, 0.34);
  color: #78a6ff;
  background: radial-gradient(circle at 35% 30%, rgba(86, 124, 255, 0.28), rgba(45, 66, 170, 0.12));
}

.metric-copy {
  min-width: 0;
}

.metric-copy span,
.metric-copy small {
  display: block;
}

.metric-copy span {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.metric-copy small {
  overflow: hidden;
  margin-top: 3px;
  color: var(--color-text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-item strong {
  font-size: 28px;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  letter-spacing: -0.035em;
}

@media (max-width: 560px) {
  .metric-panel {
    padding: 20px;
  }

  .metric-copy small {
    display: none;
  }
}
</style>
