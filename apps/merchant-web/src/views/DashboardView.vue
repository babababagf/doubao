<script setup lang="ts">
import type { DashboardResponse } from '@doubaohk/api-contract'
import { RefreshRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton.vue'
import HomeGrowthCommand from '@/components/dashboard/HomeGrowthCommand.vue'
import { ApiError } from '@/services/http'
import { getDashboard } from '@/services/merchant.service'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const appStore = useAppStore()
const dashboard = ref<DashboardResponse | null>(null)
const loading = ref(true)
const errorMessage = ref('')

const accountName = computed(() => appStore.account?.username?.trim() || '用户')

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

onMounted(() => {
  void loadDashboard()
})
</script>

<template>
  <div class="dashboard-page">
    <DashboardSkeleton v-if="loading" variant="home" />

    <section v-else-if="errorMessage" class="error-panel surface-panel" role="alert">
      <span class="error-mark" aria-hidden="true">!</span>
      <h2>运营数据暂时无法加载</h2>
      <p>页面功能仍可继续使用，稍后可重新同步数据。</p>
      <button type="button" class="retry-button" @click="loadDashboard">
        <el-icon aria-hidden="true"><RefreshRight /></el-icon>
        重新加载
      </button>
    </section>

    <HomeGrowthCommand
      v-else-if="dashboard"
      :account-name="accountName"
      :overview="dashboard.overview"
      :points="dashboard.dailyTrend"
    />
  </div>
</template>

<style scoped>
.dashboard-page {
  width: 100%;
  max-width: 1720px;
  min-height: calc(100dvh - 102px);
  margin: 0 auto;
}

.error-panel {
  display: grid;
  min-height: 420px;
  place-items: center;
  align-content: center;
  padding: 42px;
  text-align: center;
}

.error-mark {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border: 1px solid #f2cbd3;
  border-radius: 13px;
  color: var(--color-danger);
  background: #fff5f7;
  font-size: 22px;
  font-weight: 720;
}

.error-panel h2 {
  margin: 15px 0 5px;
  color: var(--color-text);
  font-size: 19px;
}

.error-panel p {
  margin: 0;
  color: var(--color-text-muted);
}

.retry-button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  margin-top: 18px;
  padding: 0 18px;
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  color: var(--color-primary);
  background: #ffffff;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  gap: 8px;
  transition:
    transform 150ms cubic-bezier(.22, 1, .36, 1),
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.retry-button:hover {
  border-color: #8fb4ec;
  box-shadow: 0 10px 24px rgba(38, 93, 173, 0.12);
  transform: translateY(-2px);
}

.retry-button:active {
  transform: translateY(0) scale(0.985);
}

@media (max-width: 760px) {
  .dashboard-page {
    min-height: 0;
  }
}
</style>
