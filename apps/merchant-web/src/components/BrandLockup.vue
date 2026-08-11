<script setup lang="ts">
defineProps<{
  logoUrl: string
  nickname: string
  collapsed?: boolean
}>()
</script>

<template>
  <div class="brand-lockup" :class="{ 'is-collapsed': collapsed }">
    <span class="brand-mark">
      <img :src="logoUrl" alt="" />
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
  display: grid;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  place-items: center;
}

.brand-mark img {
  display: block;
  width: 100%;
  height: 100%;
}

.brand-name {
  overflow: hidden;
  color: inherit;
  font-size: 19px;
  font-weight: 650;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
