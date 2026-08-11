<script setup lang="ts">
import type { RecentTask } from '@doubaohk/api-contract'
import {
  Aim,
  Document,
  Phone,
  Picture,
  Promotion,
  Refresh,
} from '@element-plus/icons-vue'
import type { Component } from 'vue'

import { formatRelativeTime } from '@/utils/format'

defineProps<{
  tasks: RecentTask[]
}>()

const icons: Record<RecentTask['type'], Component> = {
  ai_article: Document,
  publish: Promotion,
  doubao_check: Aim,
  phone_followup: Phone,
  media_sync: Refresh,
  gallery_upload: Picture,
}

const statusLabels: Record<RecentTask['status'], string> = {
  queued: '等待中',
  running: '进行中',
  succeeded: '已完成',
  failed: '失败',
  stopped: '已停止',
}
</script>

<template>
  <section class="tasks-panel surface-panel" aria-labelledby="recent-tasks-title">
    <header class="panel-heading">
      <div>
        <span class="eyebrow">RECENT ACTIVITY</span>
        <h2 id="recent-tasks-title">最近任务</h2>
      </div>
      <span class="task-count">{{ tasks.length }} 条</span>
    </header>

    <ol v-if="tasks.length" class="task-list">
      <li v-for="task in tasks" :key="task.id" class="task-item">
        <span class="timeline-dot" :data-status="task.status" aria-hidden="true" />
        <span class="task-icon" aria-hidden="true">
          <el-icon :size="18"><component :is="icons[task.type]" /></el-icon>
        </span>
        <span class="task-copy">
          <strong>{{ task.title }}</strong>
          <small>{{ task.detail }}</small>
        </span>
        <span class="task-status" :data-status="task.status">
          {{ statusLabels[task.status] }}
        </span>
        <time :datetime="task.occurredAt">{{ formatRelativeTime(task.occurredAt) }}</time>
      </li>
    </ol>

    <div v-else class="empty-state">暂无任务记录</div>
  </section>
</template>

<style scoped>
.tasks-panel {
  min-width: 0;
  padding: 22px 24px 15px;
}

.panel-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding-bottom: 14px;
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
  font-size: 17px;
  font-weight: 650;
}

.task-count {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.task-list {
  position: relative;
  padding: 0;
  margin: 0;
  list-style: none;
}

.task-list::before {
  position: absolute;
  top: 30px;
  bottom: 30px;
  left: 4px;
  width: 1px;
  background: rgba(128, 150, 187, 0.22);
  content: '';
}

.task-item {
  position: relative;
  display: grid;
  min-height: 58px;
  grid-template-columns: 9px 32px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
}

.task-item + .task-item {
  border-top: 1px solid rgba(145, 168, 205, 0.11);
}

.timeline-dot {
  position: relative;
  z-index: 1;
  width: 8px;
  height: 8px;
  border: 2px solid #102440;
  border-radius: 50%;
  background: var(--color-text-muted);
  box-shadow: 0 0 0 1px rgba(130, 151, 188, 0.28);
}

.timeline-dot[data-status='running'] {
  background: #5d8bff;
  box-shadow: 0 0 10px rgba(93, 139, 255, 0.65);
}

.timeline-dot[data-status='succeeded'] {
  background: var(--color-success);
}

.timeline-dot[data-status='failed'] {
  background: var(--color-danger);
}

.task-icon {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 8px;
  color: #81a5ee;
  background: rgba(74, 104, 174, 0.11);
}

.task-copy {
  min-width: 0;
}

.task-copy strong,
.task-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-copy strong {
  font-size: 12px;
  font-weight: 560;
}

.task-copy small {
  margin-top: 2px;
  color: var(--color-text-muted);
  font-size: 10px;
}

.task-status {
  padding: 3px 7px;
  border: 1px solid rgba(130, 151, 188, 0.25);
  border-radius: var(--radius-pill);
  color: var(--color-text-muted);
  font-size: 10px;
  white-space: nowrap;
}

.task-status[data-status='running'] {
  border-color: rgba(80, 125, 255, 0.34);
  color: #78a3ff;
  background: rgba(68, 105, 219, 0.08);
}

.task-status[data-status='succeeded'] {
  border-color: rgba(52, 211, 153, 0.28);
  color: #5ed6af;
  background: rgba(52, 211, 153, 0.06);
}

.task-status[data-status='failed'] {
  border-color: rgba(251, 113, 133, 0.28);
  color: #fb8b9d;
}

time {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  white-space: nowrap;
}

.empty-state {
  display: grid;
  min-height: 290px;
  place-items: center;
  color: var(--color-text-muted);
}

@media (max-width: 560px) {
  .tasks-panel {
    padding: 20px;
  }

  .task-item {
    grid-template-columns: 9px 32px minmax(0, 1fr) auto;
  }

  .task-status {
    display: none;
  }

  time {
    font-size: 9px;
  }
}
</style>
