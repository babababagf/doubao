<script setup lang="ts">
import type { RecentTask } from '@doubaohk/api-contract'
import {
  Aim,
  ArrowRight,
  Document,
  InfoFilled,
  Phone,
  Picture,
  Promotion,
  Refresh,
} from '@element-plus/icons-vue'
import { computed, type Component } from 'vue'

const props = defineProps<{
  tasks: RecentTask[]
}>()

const emit = defineEmits<{
  navigate: [routeName: string]
}>()

const icons: Record<RecentTask['type'], Component> = {
  ai_article: Document,
  publish: Promotion,
  doubao_check: Aim,
  phone_followup: Phone,
  media_sync: Refresh,
  gallery_upload: Picture,
}

const routes: Record<RecentTask['type'], string> = {
  ai_article: 'content-create',
  publish: 'publish-tasks',
  doubao_check: 'data-overview',
  phone_followup: 'data-overview',
  media_sync: 'media',
  gallery_upload: 'gallery',
}

const statusLabels: Record<RecentTask['status'], string> = {
  queued: '等待处理',
  running: '进行中',
  succeeded: '已完成',
  failed: '需要处理',
  stopped: '已停止',
}

const actionableTasks = computed(() => props.tasks
  .filter((task) => task.type !== 'doubao_check')
  .filter((task) => task.status === 'queued' || task.status === 'running' || task.status === 'failed')
  .slice(0, 2))

function actionLabel(task: RecentTask): string {
  if (task.type === 'ai_article') return '去创作'
  if (task.type === 'publish') return task.status === 'running' ? '查看进度' : '去发布'
  if (task.type === 'media_sync') return '去管理'
  return '去查看'
}

function displayStatus(task: RecentTask): string {
  return task.type === 'media_sync' ? '待同步' : statusLabels[task.status]
}
</script>

<template>
  <section class="tasks-panel surface-panel" aria-labelledby="recent-tasks-title">
    <header class="panel-heading">
      <div class="heading-title">
        <h2 id="recent-tasks-title">我的待办</h2>
        <span v-if="actionableTasks.length" class="task-count">{{ actionableTasks.length }}</span>
      </div>
      <button type="button" class="all-tasks-button" @click="emit('navigate', 'publish-tasks')">
        全部任务
        <el-icon><ArrowRight /></el-icon>
      </button>
    </header>

    <ol v-if="actionableTasks.length" class="task-list">
      <li
        v-for="(task, index) in actionableTasks"
        :key="task.id"
        class="task-item"
        :style="{ animationDelay: `${230 + index * 45}ms` }"
      >
        <span class="task-icon" :data-type="task.type" aria-hidden="true">
          <el-icon><component :is="icons[task.type]" /></el-icon>
        </span>

        <span class="task-copy">
          <span class="task-title-row">
            <strong>{{ task.title }}</strong>
            <small :data-status="task.status"><i aria-hidden="true" />{{ displayStatus(task) }}</small>
          </span>
          <span class="task-detail">{{ task.detail }}</span>
        </span>

        <button type="button" class="task-action" @click="emit('navigate', routes[task.type])">
          {{ actionLabel(task) }}
        </button>
        <el-icon class="task-arrow" aria-hidden="true"><ArrowRight /></el-icon>
      </li>
    </ol>

    <div v-else class="empty-state">
      <span class="empty-icon"><el-icon><Document /></el-icon></span>
      <strong>当前没有待处理任务</strong>
      <small>新任务创建后会在这里提醒你</small>
    </div>

    <footer class="task-footer">
      <el-icon aria-hidden="true"><InfoFilled /></el-icon>
      <span>及时处理待办，有助于保持内容生产与分发效率。</span>
    </footer>
  </section>
</template>

<style scoped>
.tasks-panel {
  display: grid;
  min-width: 0;
  min-height: 100%;
  overflow: hidden;
  border-color: rgba(56, 112, 190, 0.26);
  border-radius: 20px;
  color: #ffffff;
  background:
    radial-gradient(circle at 100% 0, rgba(35, 142, 222, 0.25), transparent 34%),
    linear-gradient(155deg, #07172f, #0a2852);
  box-shadow: 0 24px 58px rgba(6, 25, 54, 0.18);
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.panel-heading {
  display: flex;
  min-height: 82px;
  align-items: center;
  justify-content: space-between;
  padding: 0 22px;
  border-bottom: 1px solid rgba(190, 218, 255, 0.13);
  gap: 16px;
}

.heading-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.heading-title h2 {
  margin: 0;
  color: #ffffff;
  font-size: 22px;
  font-weight: 730;
  letter-spacing: -0.03em;
}

.task-count {
  display: grid;
  min-width: 21px;
  height: 21px;
  place-items: center;
  padding: 0 6px;
  border-radius: 999px;
  color: #ffdce2;
  background: rgba(226, 82, 108, 0.23);
  font-size: 13px;
  font-weight: 750;
}

.all-tasks-button,
.task-action {
  border: 0;
  cursor: pointer;
  font: inherit;
}

.all-tasks-button {
  display: inline-flex;
  align-items: center;
  padding: 6px 0;
  color: #78ccff;
  background: transparent;
  font-size: 14px;
  font-weight: 650;
  gap: 5px;
}

.all-tasks-button .el-icon {
  transition: transform 180ms ease;
}

.all-tasks-button:hover .el-icon {
  transform: translateX(2px);
}

.task-list {
  padding: 8px 14px;
  margin: 0;
  list-style: none;
}

.task-item {
  display: grid;
  min-height: 88px;
  padding: 0 8px;
  border-radius: 11px;
  align-items: center;
  grid-template-columns: 38px minmax(0, 1fr) auto 14px;
  gap: 10px;
  transition: background 180ms ease, transform 180ms ease;
}

.task-item + .task-item {
  border-top: 1px solid rgba(190, 218, 255, 0.11);
}

.task-item:hover {
  background: rgba(255, 255, 255, 0.065);
  transform: translateX(2px);
}

.task-icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 10px;
  border: 1px solid rgba(152, 204, 255, 0.15);
  color: #7bc9ff;
  background: rgba(62, 132, 232, 0.14);
  font-size: 17px;
}

.task-icon[data-type='publish'] {
  color: #b4a4ff;
  background: rgba(119, 93, 245, 0.16);
}

.task-icon[data-type='doubao_check'] {
  color: #57dfbf;
  background: rgba(15, 158, 121, 0.15);
}

.task-icon[data-type='phone_followup'] {
  color: #ffc170;
  background: rgba(208, 120, 23, 0.15);
}

.task-icon[data-type='media_sync'] {
  color: #74d9f6;
  background: rgba(24, 143, 183, 0.15);
}

.task-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.task-title-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.task-title-row strong,
.task-detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-title-row strong {
  color: #f5f9ff;
  font-size: 15px;
  font-weight: 680;
}

.task-title-row small {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  color: #8fa7c4;
  font-size: 14px;
  gap: 4px;
}

.task-title-row small i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.task-title-row small[data-status='running'] {
  color: #67baff;
}

.task-title-row small[data-status='failed'] {
  color: var(--color-danger);
}

.task-detail {
  color: #8fa7c4;
  font-size: 14px;
}

.task-action {
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid rgba(126, 189, 255, 0.24);
  border-radius: 8px;
  color: #8dd1ff;
  background: rgba(255, 255, 255, 0.045);
  font-size: 14px;
  font-weight: 650;
  white-space: nowrap;
  transition: border-color 180ms ease, background 180ms ease, transform 180ms ease;
}

.task-action:hover {
  border-color: rgba(126, 205, 255, 0.5);
  color: #ffffff;
  background: rgba(54, 128, 229, 0.2);
  transform: translateY(-1px);
}

.task-action:active {
  transform: translateY(0) scale(0.98);
}

.task-arrow {
  color: #5f7897;
  font-size: 14px;
}

.empty-state {
  display: grid;
  min-height: 280px;
  place-items: center;
  align-content: center;
  color: #8fa7c4;
  text-align: center;
  gap: 5px;
}

.empty-state strong {
  color: #f5f9ff;
  font-size: 15px;
}

.empty-state small {
  font-size: 14px;
}

.empty-icon {
  display: grid;
  width: 40px;
  height: 40px;
  margin-bottom: 5px;
  place-items: center;
  border-radius: 12px;
  color: #7bc9ff;
  background: rgba(62, 132, 232, 0.14);
  font-size: 18px;
}

.task-footer {
  display: flex;
  min-height: 50px;
  align-items: center;
  margin: 0 14px 14px;
  padding: 0 12px;
  border-radius: 9px;
  border: 1px solid rgba(190, 218, 255, 0.1);
  color: #8fa7c4;
  background: rgba(3, 15, 34, 0.22);
  font-size: 14px;
  gap: 8px;
}

.task-footer .el-icon {
  color: #67baff;
}

@media (max-width: 500px) {
  .panel-heading,
  .task-list {
    padding-right: 15px;
    padding-left: 15px;
  }

  .task-item {
    grid-template-columns: 36px minmax(0, 1fr) auto;
  }

  .task-arrow {
    display: none;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .task-title-row small[data-status='running'] i {
    animation: running-dot 1.8s ease-in-out infinite;
  }

  @keyframes running-dot {
    0%, 100% { opacity: 0.55; box-shadow: 0 0 0 rgba(34, 113, 233, 0); }
    50% { opacity: 1; box-shadow: 0 0 0 4px rgba(34, 113, 233, 0.1); }
  }
}
</style>

<style scoped src="@/styles/recent-tasks-reference.css"></style>
