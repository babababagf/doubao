<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'home' | 'trend' | 'overview'
}>(), {
  variant: 'trend',
})
</script>

<template>
  <div
    class="dashboard-skeleton"
    :aria-label="variant === 'home' ? '首页数据加载中' : variant === 'trend' ? '最近 7 天数据加载中' : '数据总览加载中'"
    aria-busy="true"
  >
    <section v-if="variant === 'home'" class="skeleton-command">
      <div class="skeleton-canvas">
        <div class="skeleton-command-copy">
          <span class="skeleton-kicker" />
          <span class="skeleton-title" />
          <span class="skeleton-description" />
          <span class="skeleton-actions" />
        </div>
        <div class="skeleton-orbit">
          <span class="skeleton-hub" />
          <span v-for="index in 5" :key="index" class="skeleton-node" />
        </div>
      </div>

      <aside class="skeleton-signals">
        <span class="skeleton-signal-heading" />
        <span v-for="index in 4" :key="index" class="skeleton-signal-card" />
      </aside>

      <div class="skeleton-command-metrics">
        <span v-for="index in 3" :key="index" class="skeleton-metric" />
        <span class="skeleton-metric-trend" />
      </div>
    </section>

    <div v-else-if="variant === 'trend'" class="skeleton-dashboard-grid">
      <div class="skeleton-chart surface-panel">
        <div class="skeleton-heading"><span /><span /></div>
        <div class="skeleton-legend"><span v-for="index in 2" :key="index" /></div>
        <div class="skeleton-plot" />
      </div>
    </div>

    <div v-else class="skeleton-overview surface-panel">
      <div class="skeleton-heading"><span /><span /></div>
      <div class="skeleton-cards">
        <span v-for="index in 7" :key="index" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-skeleton {
  width: 100%;
}

.skeleton-command span,
.skeleton-heading span,
.skeleton-cards span,
.skeleton-chart span,
.skeleton-plot {
  display: block;
  border-radius: 8px;
  background: linear-gradient(90deg, rgba(120, 143, 182, 0.08), rgba(120, 143, 182, 0.18), rgba(120, 143, 182, 0.08));
  background-size: 220% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

.skeleton-command {
  display: grid;
  width: 100%;
  height: clamp(690px, calc(100dvh - 102px), 820px);
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) 252px;
  grid-template-rows: minmax(0, 1fr) 128px;
  gap: 12px;
}

.skeleton-canvas {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(126, 161, 217, 0.17);
  border-radius: 24px;
  background:
    radial-gradient(circle at 62% 44%, rgba(114, 184, 255, 0.16), transparent 38%),
    linear-gradient(135deg, rgba(248, 251, 255, 0.98), rgba(235, 244, 255, 0.92));
}

.skeleton-command-copy {
  position: absolute;
  z-index: 2;
  top: 36px;
  left: 30px;
  display: grid;
  width: min(410px, 34%);
  gap: 13px;
}

.skeleton-kicker { width: 146px; height: 18px; }
.skeleton-title { width: min(100%, 390px); height: 50px; }
.skeleton-description { width: min(100%, 410px); height: 16px; }
.skeleton-actions { width: 312px; max-width: 100%; height: 44px; margin-top: 7px; }

.skeleton-orbit {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background:
    radial-gradient(circle at 59% 51%, rgba(72, 132, 238, 0.22), transparent 15%),
    radial-gradient(ellipse at 59% 51%, transparent 0 20%, rgba(108, 166, 245, 0.13) 20.2% 20.5%, transparent 20.7% 31%, rgba(108, 166, 245, 0.1) 31.2% 31.5%, transparent 31.7%);
}

.skeleton-hub {
  position: absolute;
  top: 51%;
  left: 59%;
  width: 152px;
  height: 152px;
  border-radius: 50% !important;
  transform: translate(-50%, -50%);
}

.skeleton-node {
  position: absolute;
  width: 176px;
  height: 56px;
}

.skeleton-node:nth-of-type(2) { top: 24%; left: 33%; }
.skeleton-node:nth-of-type(3) { top: 24%; right: 11%; }
.skeleton-node:nth-of-type(4) { bottom: 21%; left: 27%; }
.skeleton-node:nth-of-type(5) { right: 8%; bottom: 22%; }
.skeleton-node:nth-of-type(6) { bottom: 4%; left: 55%; }

.skeleton-signals {
  display: grid;
  min-height: 0;
  padding: 20px 15px 14px;
  overflow: hidden;
  border: 1px solid rgba(59, 118, 202, 0.25);
  border-radius: 22px;
  background: linear-gradient(165deg, #e8f1ff, #dceaff);
  grid-column: 2;
  grid-row: 1 / span 2;
  grid-template-rows: 32px repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.skeleton-signal-heading { width: 150px; height: 22px; }
.skeleton-signal-card { min-height: 0; border-radius: 14px !important; }

.skeleton-command-metrics {
  display: grid;
  min-width: 0;
  align-items: center;
  padding: 12px 18px;
  overflow: hidden;
  border: 1px solid rgba(122, 160, 220, 0.18);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.8);
  grid-column: 1;
  grid-row: 2;
  grid-template-columns: repeat(3, minmax(128px, 0.7fr)) minmax(260px, 1.2fr);
  gap: 14px;
}

.skeleton-metric { height: 66px; }
.skeleton-metric-trend { height: 72px; }

.skeleton-dashboard-grid {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
}

.skeleton-overview,
.skeleton-chart {
  overflow: hidden;
}

.skeleton-heading {
  display: flex;
  min-height: 78px;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 1px solid var(--color-border);
}

.skeleton-heading span:first-child { width: 150px; height: 28px; }
.skeleton-heading span:last-child { width: 240px; height: 12px; }

.skeleton-cards {
  display: grid;
  padding: 18px;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 10px;
}

.skeleton-cards span {
  height: 116px;
  border: 1px solid #e8ebf2;
  border-radius: 10px;
}

.skeleton-legend {
  display: flex;
  padding: 16px 24px 4px;
  gap: 8px;
}

.skeleton-legend span {
  width: 88px;
  height: 30px;
}

.skeleton-plot {
  height: 306px;
  margin: 18px 22px 22px;
}

@keyframes shimmer {
  to { background-position: -220% 0; }
}

@media (max-width: 1120px) {
  .skeleton-command {
    height: auto;
    grid-template-columns: 1fr;
    grid-template-rows: 640px auto 240px;
  }

  .skeleton-canvas { grid-column: 1; grid-row: 1; }
  .skeleton-command-metrics { grid-column: 1; grid-row: 2; }
  .skeleton-signals {
    grid-column: 1;
    grid-row: 3;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-rows: 30px 1fr;
  }
  .skeleton-signal-heading { grid-column: 1 / -1; }
  .skeleton-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 760px) {
  .skeleton-command {
    grid-template-rows: 830px auto auto;
  }

  .skeleton-canvas,
  .skeleton-signals {
    border-radius: 16px;
  }

  .skeleton-command-copy {
    top: 24px;
    left: 20px;
    width: calc(100% - 40px);
  }

  .skeleton-title { height: 72px; }

  .skeleton-hub {
    top: 59%;
    left: 50%;
    width: 126px;
    height: 126px;
  }

  .skeleton-node {
    width: calc(50% - 28px);
    height: 58px;
  }

  .skeleton-node:nth-of-type(2) { top: 39%; left: 14px; }
  .skeleton-node:nth-of-type(3) { top: 39%; right: 14px; }
  .skeleton-node:nth-of-type(4) { bottom: 7%; left: 14px; }
  .skeleton-node:nth-of-type(5) { right: 14px; bottom: 7%; }
  .skeleton-node:nth-of-type(6) { bottom: 21%; left: 50%; transform: translateX(-50%); }

  .skeleton-command-metrics {
    grid-template-columns: 1fr;
  }

  .skeleton-signals {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: 30px repeat(2, 110px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-command span,
  .skeleton-heading span,
  .skeleton-cards span,
  .skeleton-chart span,
  .skeleton-plot {
    animation: none;
  }
}
</style>
