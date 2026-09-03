<script setup lang="ts">
import type { DashboardOverview } from '@doubaohk/api-contract'
import { RefreshRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import DataOverviewCards from '@/components/dashboard/DataOverviewCards.vue'
import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton.vue'
import { ApiError } from '@/services/http'
import { getDashboard } from '@/services/merchant.service'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const overview = ref<DashboardOverview | null>(null)
const loading = ref(true)
const errorMessage = ref('')

async function loadOverview(): Promise<void> {
  loading.value = true
  errorMessage.value = ''

  try {
    overview.value = (await getDashboard()).overview
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await authStore.logout()
      await router.replace({ name: 'login' })
      return
    }

    errorMessage.value = error instanceof Error ? error.message : '数据总览加载失败'
    ElMessage.error(errorMessage.value)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadOverview()
})
</script>

<template>
  <div class="data-overview-page">
    <DashboardSkeleton v-if="loading" variant="overview" />

    <section v-else-if="errorMessage" class="error-panel surface-panel" role="alert">
      <div class="error-mark">!</div>
      <h1>数据暂时无法加载</h1>
      <p>{{ errorMessage }}</p>
      <button type="button" class="retry-button" @click="loadOverview">
        <el-icon><RefreshRight /></el-icon>
        重新加载
      </button>
    </section>

    <DataOverviewCards v-else-if="overview" :overview="overview" />
  </div>
</template>

<style scoped>
.data-overview-page {
  max-width: 1720px;
  margin: 0 auto;
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

.error-panel h1 {
  margin: 18px 0 5px;
  font-size: 21px;
}

.error-panel p {
  margin: 0;
  color: var(--color-text-muted);
}

.retry-button {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  margin-top: 22px;
  padding: 0 16px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  color: #5965db;
  background: #ffffff;
  cursor: pointer;
  font-weight: 600;
  gap: 8px;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}

.retry-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(40, 53, 104, 0.1);
}
</style>
