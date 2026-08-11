<script setup lang="ts">
import type { DashboardResponse } from '@doubaohk/api-contract'
import { ArrowRight, MagicStick, Promotion, RefreshRight, View } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import CoreMetricsPanel from '@/components/dashboard/CoreMetricsPanel.vue'
import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton.vue'
import InclusionChart from '@/components/dashboard/InclusionChart.vue'
import RecentTasksPanel from '@/components/dashboard/RecentTasksPanel.vue'
import ResourceStrip from '@/components/dashboard/ResourceStrip.vue'
import WorkflowStepper from '@/components/dashboard/WorkflowStepper.vue'
import { ApiError } from '@/services/http'
import { getDashboard } from '@/services/merchant.service'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const dashboard = ref<DashboardResponse | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const publisherEnabled = import.meta.env.VITE_PUBLISHER_ENABLED === 'true'

async function loadDashboard(): Promise<void> {
  loading.value = true
  errorMessage.value = ''

  try {
    dashboard.value = await getDashboard()
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await authStore.logout()
      await router.replace({ name: 'login' })
      return
    }

    errorMessage.value = error instanceof Error ? error.message : '控制台数据加载失败'
    ElMessage.error(errorMessage.value)
  } finally {
    loading.value = false
  }
}

function navigate(routeName: string, query?: Record<string, string>): void {
  void router.push(query ? { name: routeName, query } : { name: routeName })
}

onMounted(() => {
  void loadDashboard()
})
</script>

<template>
  <div class="dashboard-page">
    <header class="dashboard-toolbar">
      <div class="dashboard-intro">
        <span class="section-kicker">MERCHANT OVERVIEW</span>
        <p>资源、内容、企业网站与豆包检测结果一屏掌握</p>
      </div>
      <div class="toolbar-actions" aria-label="快捷操作">
        <button type="button" class="action-button" @click="navigate('doubao')">
          <el-icon><View /></el-icon>
          查看检测结果
        </button>
        <button type="button" class="action-button" @click="navigate('content-create')">
          <el-icon><MagicStick /></el-icon>
          AI 创作
        </button>
        <button
          v-if="publisherEnabled"
          type="button"
          class="action-button is-primary"
          @click="navigate('publish-tasks', { create: '1' })"
        >
          <el-icon><Promotion /></el-icon>
          新建发布任务
          <el-icon class="button-arrow"><ArrowRight /></el-icon>
        </button>
      </div>
    </header>

    <DashboardSkeleton v-if="loading" />

    <section v-else-if="errorMessage" class="error-panel surface-panel" role="alert">
      <div class="error-mark">!</div>
      <h2>数据暂时无法加载</h2>
      <p>{{ errorMessage }}</p>
      <button type="button" class="retry-button" @click="loadDashboard">
        <el-icon><RefreshRight /></el-icon>
        重新加载
      </button>
    </section>

    <template v-else-if="dashboard">
      <ResourceStrip :resources="dashboard.resources" />

      <div class="dashboard-main-grid">
        <InclusionChart
          :count="dashboard.effects.doubaoIncludedCount"
          :last-checked-at="dashboard.lastCheckedAt"
          :points="dashboard.inclusionTrend"
        />
        <CoreMetricsPanel :effects="dashboard.effects" />
      </div>

      <div class="dashboard-bottom-grid">
        <WorkflowStepper :stages="dashboard.workflow" :publisher-enabled="publisherEnabled" />
        <RecentTasksPanel :tasks="dashboard.recentTasks" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.dashboard-page {
  display: grid;
  max-width: 1720px;
  margin: 0 auto;
  gap: 16px;
}

.dashboard-toolbar {
  display: flex;
  min-height: 46px;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.section-kicker {
  display: block;
  margin-bottom: 2px;
  color: var(--color-champagne);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.13em;
}

.dashboard-intro p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.toolbar-actions {
  display: flex;
  gap: 9px;
}

.action-button,
.retry-button {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  color: var(--color-text-secondary);
  background: #ffffff;
  cursor: pointer;
  gap: 8px;
  transition:
    transform var(--transition-fast),
    color var(--transition-fast),
    border-color var(--transition-fast),
    background var(--transition-fast);
}

.action-button:hover,
.retry-button:hover {
  transform: translateY(-1px);
  border-color: rgba(117, 127, 255, 0.58);
  color: var(--color-text);
  color: #5965db;
  background: #f8f9ff;
}

.action-button.is-primary {
  border-color: rgba(113, 111, 255, 0.62);
  color: #ffffff;
  background: var(--gradient-primary);
  box-shadow: 0 8px 22px rgba(72, 73, 194, 0.22);
}

.button-arrow {
  margin-left: 4px;
}

.dashboard-main-grid,
.dashboard-bottom-grid {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1.72fr) minmax(350px, 0.78fr);
  gap: 16px;
}

.dashboard-bottom-grid {
  grid-template-columns: minmax(650px, 1.45fr) minmax(420px, 0.95fr);
}

.error-panel {
  display: grid;
  min-height: 520px;
  place-items: center;
  align-content: center;
  padding: 40px;
  text-align: center;
}

.error-mark {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border: 1px solid rgba(251, 113, 133, 0.32);
  border-radius: 14px;
  color: var(--color-danger);
  background: rgba(251, 113, 133, 0.08);
  font-size: 26px;
}

.error-panel h2 {
  margin: 18px 0 5px;
  font-size: 21px;
}

.error-panel p {
  margin: 0;
  color: var(--color-text-muted);
}

.retry-button {
  margin-top: 22px;
}

@media (max-width: 1400px) {
  .dashboard-bottom-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1200px) {
  .dashboard-main-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .dashboard-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .toolbar-actions {
    width: 100%;
    overflow-x: auto;
    padding-bottom: 3px;
  }

  .action-button {
    flex: 0 0 auto;
  }
}

@media (max-width: 480px) {
  .dashboard-intro {
    display: none;
  }

  .toolbar-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .action-button.is-primary {
    grid-column: 1 / -1;
  }
}
</style>
