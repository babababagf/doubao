<script setup lang="ts">
import { DataLine } from '@element-plus/icons-vue'

defineProps<{
  logoUrl: string
  nickname: string
  collapsed?: boolean
}>()
</script>

<template>
  <div class="brand-lockup" :class="{ 'is-collapsed': collapsed }">
    <span class="brand-mark">
      <img v-if="logoUrl" :src="logoUrl" alt="" />
      <el-icon v-else aria-hidden="true"><DataLine /></el-icon>
    </span>
    <span v-if="!collapsed" class="brand-name">{{ nickname }}</span>
  </div>
</template>

<style scoped>
.brand-lockup {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 10px;
}

.brand-lockup.is-collapsed {
  justify-content: center;
}

.brand-mark {
  position: relative;
  display: grid;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  place-items: center;
  overflow: hidden;
  border: 1px solid #c8d9f3;
  border-radius: 8px;
  color: #ffffff;
  background: #ffffff;
  box-shadow: 0 4px 12px rgba(28, 86, 181, 0.12);
  font-size: 17px;
}

.brand-mark img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.brand-name {
  overflow: hidden;
  color: #13233f;
  font-size: 18px;
  font-weight: 720;
  letter-spacing: -0.025em;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
