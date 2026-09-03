<script setup lang="ts">
import type { ResourceSummary } from '@doubaohk/api-contract'
import {
  Cpu,
  Document,
  EditPen,
  Picture,
  Promotion,
  Search,
} from '@element-plus/icons-vue'
import { computed, type Component } from 'vue'

import { clampPercent, formatNumber } from '@/utils/format'

const props = defineProps<{
  resources: ResourceSummary
}>()

interface ResourceItem {
  key: string
  label: string
  value: string
  context?: string
  icon: Component
  progress?: number
  tone: 'blue' | 'violet' | 'teal' | 'amber'
}

const items = computed<ResourceItem[]>(() => {
  const computeTotal =
    props.resources.computePoints.available + props.resources.computePoints.consumedThisPeriod

  return [
    {
      key: 'keywords',
      label: '关键词',
      value: `${formatNumber(props.resources.keywords.used)} / ${formatNumber(props.resources.keywords.limit)}`,
      icon: Search,
      progress: clampPercent(
        props.resources.keywords.limit > 0
          ? (props.resources.keywords.used / props.resources.keywords.limit) * 100
          : 0,
      ),
      tone: 'blue',
    },
    {
      key: 'compute',
      label: '算力点数',
      value: formatNumber(props.resources.computePoints.available),
      context: '可用',
      icon: Cpu,
      progress: clampPercent(
        computeTotal > 0 ? (props.resources.computePoints.available / computeTotal) * 100 : 0,
      ),
      tone: 'violet',
    },
    {
      key: 'writing',
      label: '写作篇数',
      value: `${formatNumber(props.resources.writing.used)} / ${formatNumber(props.resources.writing.limit)}`,
      icon: EditPen,
      progress: clampPercent(
        props.resources.writing.limit > 0
          ? (props.resources.writing.used / props.resources.writing.limit) * 100
          : 0,
      ),
      tone: 'teal',
    },
    {
      key: 'articles',
      label: '文章数量',
      value: formatNumber(props.resources.articleCount),
      context: '累计',
      icon: Document,
      tone: 'blue',
    },
    {
      key: 'publish',
      label: '发布篇数',
      value: formatNumber(props.resources.publishCount),
      context: '累计',
      icon: Promotion,
      tone: 'amber',
    },
    {
      key: 'storage',
      label: '图片空间',
      value: props.resources.imageStorage.available
        ? props.resources.imageStorage.formatted
        : '不可用',
      context: '已使用',
      icon: Picture,
      tone: 'violet',
    },
  ]
})
</script>

<template>
  <section class="resource-strip surface-panel" aria-label="账户资源概览">
    <article v-for="item in items" :key="item.key" class="resource-item" :data-tone="item.tone">
      <div class="resource-icon" aria-hidden="true">
        <el-icon :size="22"><component :is="item.icon" /></el-icon>
      </div>
      <div class="resource-copy">
        <span class="resource-label">{{ item.label }}</span>
        <div class="resource-value-row">
          <strong>{{ item.value }}</strong>
          <span v-if="item.context">{{ item.context }}</span>
        </div>
        <div v-if="item.progress !== undefined" class="quota-track" aria-hidden="true">
          <span :style="{ width: `${item.progress}%` }" />
        </div>
        <div v-else class="quota-rule" aria-hidden="true" />
      </div>
    </article>
  </section>
</template>

<style scoped>
.resource-strip {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  min-height: 104px;
  overflow: hidden;
}

.resource-item {
  position: relative;
  display: grid;
  min-width: 0;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  padding: 20px 18px;
  gap: 13px;
}

.resource-item + .resource-item::before {
  position: absolute;
  top: 22px;
  bottom: 22px;
  left: 0;
  width: 1px;
  background: linear-gradient(180deg, transparent, var(--color-border), transparent);
  content: '';
}

.resource-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
  border-radius: 12px;
  color: #6fa5ff;
  background: color-mix(in srgb, currentColor 10%, transparent);
}

.resource-item[data-tone='violet'] .resource-icon {
  color: #927cff;
}

.resource-item[data-tone='teal'] .resource-icon {
  color: #35d1b0;
}

.resource-item[data-tone='amber'] .resource-icon {
  color: #e5ae57;
}

.resource-copy {
  min-width: 0;
}

.resource-label {
  display: block;
  overflow: hidden;
  margin-bottom: 3px;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-value-row {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 6px;
}

.resource-value-row strong {
  overflow: hidden;
  color: var(--color-text);
  font-size: 19px;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  letter-spacing: -0.02em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-value-row span {
  color: var(--color-text-muted);
  font-size: 11px;
}

.quota-track,
.quota-rule {
  width: 100%;
  height: 2px;
  margin-top: 10px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: rgba(133, 151, 187, 0.13);
}

.quota-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--gradient-chart);
  box-shadow: 0 0 10px rgba(91, 99, 255, 0.56);
}

.quota-rule {
  opacity: 0.52;
}

@media (max-width: 1460px) {
  .resource-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .resource-item:nth-child(4)::before {
    display: none;
  }

  .resource-item:nth-child(n + 4)::after {
    position: absolute;
    top: 0;
    right: 18px;
    left: 18px;
    height: 1px;
    background: var(--color-border);
    content: '';
  }
}

@media (max-width: 760px) {
  .resource-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .resource-item {
    padding: 16px 14px;
  }

  .resource-item:nth-child(odd)::before {
    display: none;
  }

  .resource-item:nth-child(n + 3)::after {
    position: absolute;
    top: 0;
    right: 14px;
    left: 14px;
    height: 1px;
    background: var(--color-border);
    content: '';
  }
}

@media (max-width: 460px) {
  .resource-strip {
    grid-template-columns: 1fr;
  }

  .resource-item::before {
    display: none;
  }

  .resource-item:nth-child(n + 2)::after {
    position: absolute;
    top: 0;
    right: 14px;
    left: 14px;
    height: 1px;
    background: var(--color-border);
    content: '';
  }
}
</style>
