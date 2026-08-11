<template>
  <div class="dashboard-skeleton" aria-label="控制台数据加载中" aria-busy="true">
    <div class="skeleton-actions">
      <span /><span /><span />
    </div>
    <div class="skeleton-strip surface-panel">
      <span v-for="index in 6" :key="index" />
    </div>
    <div class="skeleton-grid">
      <div class="skeleton-chart surface-panel"><span /><span /><span /></div>
      <div class="skeleton-side surface-panel"><span v-for="index in 4" :key="index" /></div>
    </div>
    <div class="skeleton-bottom">
      <div class="surface-panel" /><div class="surface-panel" />
    </div>
  </div>
</template>

<style scoped>
.dashboard-skeleton {
  display: grid;
  gap: 16px;
}

.skeleton-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.skeleton-actions span,
.skeleton-strip span,
.skeleton-chart span,
.skeleton-side span {
  display: block;
  border-radius: 7px;
  background: linear-gradient(90deg, rgba(120, 143, 182, 0.08), rgba(120, 143, 182, 0.18), rgba(120, 143, 182, 0.08));
  background-size: 220% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

.skeleton-actions span {
  width: 118px;
  height: 36px;
}

.skeleton-strip {
  display: grid;
  min-height: 104px;
  grid-template-columns: repeat(6, 1fr);
  align-items: center;
  padding: 20px;
  gap: 24px;
}

.skeleton-strip span {
  height: 48px;
}

.skeleton-grid,
.skeleton-bottom {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(340px, 0.75fr);
  gap: 16px;
}

.skeleton-chart,
.skeleton-side {
  min-height: 390px;
  padding: 24px;
}

.skeleton-chart span {
  width: 38%;
  height: 18px;
  margin-bottom: 28px;
}

.skeleton-chart span:nth-child(2) {
  width: 22%;
  height: 64px;
}

.skeleton-chart span:last-child {
  width: 100%;
  height: 180px;
}

.skeleton-side span {
  height: 56px;
  margin-bottom: 21px;
}

.skeleton-bottom .surface-panel {
  min-height: 260px;
}

@keyframes shimmer {
  to {
    background-position: -220% 0;
  }
}

@media (max-width: 1100px) {
  .skeleton-grid,
  .skeleton-bottom {
    grid-template-columns: 1fr;
  }
}
</style>
