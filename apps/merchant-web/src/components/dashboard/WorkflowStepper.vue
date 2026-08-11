<script setup lang="ts">
import type { WorkflowStage } from '@doubaohk/api-contract'
import {
  Aim,
  ChatDotRound,
  CircleCheckFilled,
  Document,
  Collection,
  Promotion,
} from '@element-plus/icons-vue'
import type { Component } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps<{
  stages: WorkflowStage[]
  publisherEnabled?: boolean
}>()

const icons: Record<WorkflowStage['key'], Component> = {
  profile: Collection,
  questions: ChatDotRound,
  articles: Document,
  publish: Promotion,
  doubao: Aim,
}

const routes: Record<WorkflowStage['key'], string> = {
  profile: 'knowledge',
  questions: 'keywords',
  articles: 'articles',
  publish: 'publish-tasks',
  doubao: 'doubao',
}

function stageComponent(stage: WorkflowStage): Component | string {
  return stage.key === 'publish' && !props.publisherEnabled ? 'div' : RouterLink
}

function stageProps(stage: WorkflowStage): Record<string, unknown> {
  return stage.key === 'publish' && !props.publisherEnabled ? {} : { to: { name: routes[stage.key] } }
}
</script>

<template>
  <section class="workflow-panel surface-panel" aria-labelledby="workflow-title">
    <header class="panel-heading">
      <div>
        <span class="eyebrow">WORKFLOW</span>
        <h2 id="workflow-title">内容创作与发布流程</h2>
      </div>
      <span class="workflow-hint">按流程完成关键配置</span>
    </header>

    <ol class="workflow-list">
      <li
        v-for="(stage, index) in stages"
        :key="stage.key"
        class="workflow-stage"
        :data-status="stage.status"
      >
        <component :is="stageComponent(stage)" v-bind="stageProps(stage)" class="stage-card" :class="{ 'is-deferred': stage.key === 'publish' && !publisherEnabled }">
          <span class="stage-index">{{ String(index + 1).padStart(2, '0') }}</span>
          <span class="stage-icon" aria-hidden="true">
            <el-icon :size="22"><component :is="icons[stage.key]" /></el-icon>
          </span>
          <strong>{{ stage.label }}</strong>
          <span class="stage-status">
            <el-icon v-if="stage.status === 'complete'"><CircleCheckFilled /></el-icon>
            {{ stage.key === 'publish' && !publisherEnabled ? '第二阶段' : stage.status === 'complete' ? '已完成' : stage.status === 'current' ? '进行中' : '待开始' }}
          </span>
        </component>
        <span v-if="index < stages.length - 1" class="stage-connector" aria-hidden="true" />
      </li>
    </ol>
  </section>
</template>

<style scoped>
.workflow-panel {
  min-width: 0;
  padding: 22px 24px 24px;
}

.panel-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 20px;
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

.workflow-hint {
  color: var(--color-text-muted);
  font-size: 11px;
}

.workflow-list {
  display: grid;
  grid-template-columns: repeat(5, minmax(112px, 1fr));
  padding: 0;
  margin: 0;
  list-style: none;
}

.workflow-stage {
  position: relative;
  min-width: 0;
}

.stage-card {
  position: relative;
  z-index: 1;
  display: flex;
  min-height: 132px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 0 7px;
  padding: 18px 10px 14px;
  border: 1px solid #e2e6ef;
  border-radius: 8px;
  background: #ffffff;
  transition:
    transform var(--transition-fast),
    border-color var(--transition-fast),
    background var(--transition-fast);
}

.stage-card:hover {
  transform: translateY(-2px);
  border-color: #cdd3fb;
  background: #f8f9ff;
}
.stage-card.is-deferred{cursor:default;opacity:.58}.stage-card.is-deferred:hover{transform:none;border-color:#e2e6ef;background:#fff}

.workflow-stage[data-status='current'] .stage-card {
  border-color: rgba(216, 174, 105, 0.48);
  box-shadow: inset 0 0 24px rgba(216, 174, 105, 0.04);
}

.stage-index {
  position: absolute;
  top: 9px;
  left: 10px;
  color: var(--color-champagne);
  font-family: var(--font-mono);
  font-size: 10px;
}

.stage-icon {
  display: grid;
  width: 40px;
  height: 40px;
  margin-bottom: 8px;
  place-items: center;
  border-radius: 10px;
  color: #7283bc;
  background: #f0f3fb;
}

.workflow-stage[data-status='complete'] .stage-icon {
  color: #22b38c;
  background: #eaf9f5;
}

.workflow-stage[data-status='current'] .stage-icon {
  color: var(--color-champagne);
}

.stage-card strong {
  overflow: hidden;
  max-width: 100%;
  font-size: 13px;
  font-weight: 560;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-status {
  display: flex;
  align-items: center;
  margin-top: 5px;
  color: var(--color-text-muted);
  font-size: 10px;
  gap: 4px;
}

.workflow-stage[data-status='complete'] .stage-status {
  color: #69cbb3;
}

.workflow-stage[data-status='current'] .stage-status {
  color: var(--color-champagne);
}

.stage-connector {
  position: absolute;
  z-index: 0;
  top: 66px;
  right: -8px;
  width: 16px;
  height: 1px;
  background: linear-gradient(90deg, rgba(216, 174, 105, 0.22), rgba(216, 174, 105, 0.7));
}

.stage-connector::after {
  position: absolute;
  top: -3px;
  right: 0;
  width: 6px;
  height: 6px;
  border-top: 1px solid rgba(216, 174, 105, 0.75);
  border-right: 1px solid rgba(216, 174, 105, 0.75);
  content: '';
  transform: rotate(45deg);
}

@media (max-width: 920px) {
  .workflow-list {
    grid-template-columns: repeat(5, 132px);
    overflow-x: auto;
    padding-bottom: 8px;
  }
}

@media (max-width: 560px) {
  .workflow-panel {
    padding: 20px;
  }

  .workflow-hint {
    display: none;
  }
}
</style>
