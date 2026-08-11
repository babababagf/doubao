<script setup lang="ts">
import { ArrowLeft, Clock } from '@element-plus/icons-vue'

defineProps<{
  title: string
  description: string
}>()
</script>

<template>
  <section class="placeholder surface-panel">
    <div class="placeholder-icon"><el-icon :size="26"><Clock /></el-icon></div>
    <span class="status-chip">阶段 1 后续模块</span>
    <h2>{{ title }}</h2>
    <p>{{ description }}</p>
    <p class="boundary-note">当前仅保留信息架构与路由，不用静态表单伪装成可用功能。</p>
    <RouterLink :to="{ name: 'dashboard' }" class="back-link">
      <el-icon><ArrowLeft /></el-icon>
      返回控制台
    </RouterLink>
  </section>
</template>

<style scoped>
.placeholder {
  display: grid;
  min-height: 560px;
  place-items: center;
  align-content: center;
  padding: 48px;
  text-align: center;
}

.placeholder-icon {
  display: grid;
  width: 58px;
  height: 58px;
  margin-bottom: 18px;
  place-items: center;
  border: 1px solid rgba(102, 114, 255, 0.42);
  border-radius: 16px;
  color: #a9afff;
  background: rgba(91, 99, 255, 0.12);
}

.status-chip {
  padding: 5px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  color: var(--color-champagne);
  background: rgba(216, 174, 105, 0.08);
  font-size: 12px;
}

h2 {
  margin: 18px 0 8px;
  font-size: 30px;
}

p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 16px;
}

.boundary-note {
  margin-top: 8px;
  color: var(--color-text-muted);
  font-size: 13px;
}

.back-link {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  margin-top: 30px;
  padding: 0 16px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  gap: 8px;
}

.back-link:hover {
  border-color: rgba(111, 121, 255, 0.72);
  background: var(--color-primary-soft);
}
</style>
