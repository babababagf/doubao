<script setup lang="ts">
import type { MediaAccount, PublishTask } from '@doubaohk/api-contract'
import { CircleCheckFilled, Clock, Connection, InfoFilled, Monitor, Plus, RefreshRight, Search, UserFilled, WarningFilled } from '@element-plus/icons-vue'
import { ElMessage, ElSwitch } from 'element-plus'
import 'element-plus/theme-chalk/el-switch.css'
import { computed, onMounted, ref } from 'vue'
import { platformLogos } from '@/assets/platform-logos'
import { listMediaAccounts, listPublishTasks } from '@/services/merchant.service'
import { formatDateTime } from '@/utils/format'

type Platform = MediaAccount['platform']

const DEFAULT_DAILY_LIMIT = 3
const accounts = ref<MediaAccount[]>([])
const publishTasks = ref<PublishTask[]>([])
const loading = ref(true)
const opening = ref<Platform | 'all' | null>(null)
const error = ref('')
const keyword = ref('')
const platformFilter = ref<'all' | Platform>('all')
const failedAvatars = ref(new Set<string>())

const platformMeta: Record<Platform, { label: string; shortLabel: string }> = {
  toutiao: { label: '今日头条', shortLabel: '头条号' },
  douyin: { label: '抖音', shortLabel: '抖音' },
  smzdm: { label: '什么值得买', shortLabel: '值得买' },
}

const statusMeta: Record<MediaAccount['status'], { label: string; tone: string }> = {
  connected: { label: '授权成功', tone: 'success' },
  expired: { label: '授权已过期', tone: 'warning' },
  verification_required: { label: '需要验证', tone: 'warning' },
  unbound: { label: '未授权', tone: 'neutral' },
  connection_requested: { label: '等待本地助手', tone: 'pending' },
}

const authorizedCount = computed(() => accounts.value.filter((item) => item.id && item.status === 'connected').length)
const managedAccountCount = computed(() => accounts.value.filter((item) => Boolean(item.id)).length)

const filteredAccounts = computed(() => {
  const query = keyword.value.trim().toLocaleLowerCase('zh-CN')
  return accounts.value.filter((item) => {
    if (platformFilter.value !== 'all' && item.platform !== platformFilter.value) return false
    if (!query) return true
    return [item.maskedName, item.localReferenceId, platformMeta[item.platform].label, statusMeta[item.status].label]
      .some((value) => value?.toLocaleLowerCase('zh-CN').includes(query))
  })
})

const todayPublishedByAccount = computed(() => {
  const today = localDateKey(new Date())
  const counts = new Map<string, number>()
  for (const task of publishTasks.value) {
    if (task.status !== 'succeeded' || !task.mediaAccountId || !task.publishedAt || localDateKey(new Date(task.publishedAt)) !== today) continue
    counts.set(task.mediaAccountId, (counts.get(task.mediaAccountId) ?? 0) + 1)
  }
  return counts
})

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function rowKey(item: MediaAccount): string {
  return item.id ?? item.localReferenceId ?? `unbound-${item.platform}`
}

function avatarFailed(item: MediaAccount): void {
  failedAvatars.value = new Set(failedAvatars.value).add(rowKey(item))
}

function hasAvatar(item: MediaAccount): boolean {
  return Boolean(item.avatarUrl && !failedAvatars.value.has(rowKey(item)))
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  const [accountResult, taskResult] = await Promise.allSettled([listMediaAccounts(), listPublishTasks()])
  if (accountResult.status === 'fulfilled') accounts.value = accountResult.value
  else error.value = accountResult.reason instanceof Error ? accountResult.reason.message : '账号状态加载失败'
  if (taskResult.status === 'fulfilled') publishTasks.value = taskResult.value
  loading.value = false
}

function openPublisherAssistant(platform: Platform | 'all' = 'all'): void {
  opening.value = platform
  window.location.href = 'doubaohk-publisher://open/media'
  window.setTimeout(() => { opening.value = null }, 900)
  ElMessage.info(platform === 'all'
    ? '已尝试唤起本地发布助手，请在助手内选择平台并新增授权'
    : `已尝试唤起本地发布助手，请在助手内完成${platformMeta[platform].label}登录`)
}

onMounted(() => { void load() })
</script>

<template>
  <div class="media-page">
    <header class="page-heading">
      <div>
        <h1>媒体账号</h1>
        <p>绑定并管理各平台账号，查看授权状态，供发布任务选择使用。</p>
      </div>
      <div class="heading-actions">
        <button class="toolbar-button" type="button" :disabled="loading" aria-label="刷新媒体账号" @click="load">
          <el-icon><RefreshRight /></el-icon>
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
        <button class="primary-button" type="button" :disabled="opening === 'all'" @click="openPublisherAssistant('all')">
          <el-icon><Plus /></el-icon>
          {{ opening === 'all' ? '正在唤起…' : '新增授权' }}
        </button>
      </div>
    </header>

    <section class="notice surface-panel">
      <el-icon><InfoFilled /></el-icon>
      <p>账号登录和发布均在发布助手中完成；网页只同步授权结果与登录状态，不保存账号密码或验证码。</p>
    </section>

    <section class="account-panel surface-panel">
      <div class="table-toolbar">
        <div class="table-title">
          <h2>账号授权 <span>（{{ managedAccountCount }}）</span></h2>
          <p>已授权 {{ authorizedCount }} 个账号，支持今日头条、抖音和什么值得买。</p>
        </div>
        <div class="table-filters">
          <select v-model="platformFilter" aria-label="按平台筛选">
            <option value="all">全部平台</option>
            <option value="toutiao">今日头条</option>
            <option value="douyin">抖音</option>
            <option value="smzdm">什么值得买</option>
          </select>
          <label class="search-field">
            <el-icon><Search /></el-icon>
            <input v-model="keyword" type="search" aria-label="搜索账号" placeholder="搜索账号或状态">
          </label>
        </div>
      </div>

      <div v-if="error" class="state-panel is-error">{{ error }}</div>
      <div v-else-if="loading" class="state-panel">正在读取媒体账号与发布统计…</div>
      <div v-else class="table-scroll">
        <table>
          <thead>
            <tr>
              <th class="sequence-column">序号</th>
              <th>账号名称</th>
              <th>自媒体</th>
              <th>发布状态</th>
              <th>今日发布</th>
              <th>授权状态</th>
              <th>登录状态</th>
              <th>授权时间</th>
              <th class="action-column">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in filteredAccounts" :key="rowKey(item)" data-testid="media-account-row">
              <td data-label="序号" class="sequence-cell">{{ index + 1 }}</td>
              <td data-label="账号名称" class="account-cell">
                <img v-if="hasAvatar(item)" :src="item.avatarUrl!" :alt="`${item.maskedName || platformMeta[item.platform].label}头像`" @error="avatarFailed(item)">
                <span v-else class="avatar-fallback" aria-hidden="true"><el-icon><UserFilled /></el-icon></span>
                <span class="account-copy">
                  <strong>{{ item.maskedName || '尚未绑定账号' }}</strong>
                  <small>{{ item.id ? '账号资料已同步' : '等待新增授权' }}</small>
                </span>
              </td>
              <td data-label="自媒体">
                <span class="platform-badge" :class="`is-${item.platform}`">
                  <img :src="platformLogos[item.platform]" alt="" aria-hidden="true">
                  {{ platformMeta[item.platform].label }}
                </span>
              </td>
              <td data-label="发布状态" class="publish-status-cell">
                <ElSwitch :model-value="item.status === 'connected'" disabled aria-label="账号发布状态" />
                <small>{{ item.status === 'connected' ? '可发布' : '已暂停' }}</small>
              </td>
              <td data-label="今日发布" class="today-cell">
                <strong>{{ item.id ? (todayPublishedByAccount.get(item.id) ?? 0) : 0 }}</strong>
                <span>/ {{ DEFAULT_DAILY_LIMIT }}</span>
              </td>
              <td data-label="授权状态">
                <span class="status-badge" :class="`is-${statusMeta[item.status].tone}`">
                  <el-icon aria-hidden="true"><CircleCheckFilled v-if="item.status === 'connected'" /><WarningFilled v-else-if="item.status === 'expired' || item.status === 'verification_required'" /><Clock v-else /></el-icon>
                  {{ statusMeta[item.status].label }}
                </span>
                <small v-if="item.failureReason" class="failure-reason" :title="item.failureReason">{{ item.failureReason }}</small>
              </td>
              <td data-label="登录状态" class="backup-cell">
                <strong :class="{ 'is-ready': item.backupAvailable }">{{ item.backupAvailable ? '状态已保护' : '需要登录' }}</strong>
                <small>{{ item.backupCapturedAt ? `同步于 ${formatDateTime(item.backupCapturedAt)}` : '请在发布助手中完成登录' }}</small>
              </td>
              <td data-label="授权时间" class="time-cell">{{ item.lastVerifiedAt ? formatDateTime(item.lastVerifiedAt) : '—' }}</td>
              <td data-label="操作" class="action-cell">
                <button class="row-action" type="button" :disabled="opening === item.platform" @click="openPublisherAssistant(item.platform)">
                  <el-icon><Monitor v-if="item.status === 'connected'" /><Connection v-else /></el-icon>
                  {{ opening === item.platform ? '唤起中…' : item.status === 'connected' ? '打开助手' : '新增授权' }}
                </button>
              </td>
            </tr>
            <tr v-if="filteredAccounts.length === 0">
              <td class="empty-cell" colspan="9">没有符合当前筛选条件的媒体账号</td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer v-if="!loading && !error" class="table-footer">
        <span>已管理 {{ managedAccountCount }} 个账号，已授权 {{ authorizedCount }} 个</span>
        <span>今日发布按平台明确成功回传统计，默认日上限为 {{ DEFAULT_DAILY_LIMIT }} 篇。</span>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.media-page { display:grid; max-width:1560px; margin:0 auto; gap:18px; }
.page-heading,.heading-actions,.notice,.table-toolbar,.table-filters,.search-field,.publish-status-cell,.status-badge,.row-action,.table-footer { display:flex; align-items:center; }
.page-heading { justify-content:space-between; gap:24px; }
.eyebrow { color:#3975d2; font:700 9px var(--font-mono); letter-spacing:.16em; }
h1,h2,p { margin:0; }
h1 { margin-top:5px; color:#142540; font-size:28px; font-weight:730; line-height:1.2; letter-spacing:-.035em; }
.page-heading p { margin-top:6px; color:var(--color-text-secondary); font-size:13px; }
.heading-actions { flex:0 0 auto; gap:8px; }
.toolbar-button,.primary-button,.row-action { min-height:40px; border:1px solid var(--color-border-strong); border-radius:9px; cursor:pointer; }
.toolbar-button,.primary-button { display:inline-flex; align-items:center; justify-content:center; padding:0 14px; gap:7px; }
.toolbar-button { color:var(--color-text-secondary); background:#fff; }
.primary-button { color:#fff; border-color:#6672ed; background:var(--gradient-primary); }
button:disabled { cursor:not-allowed; opacity:.62; }
.notice { min-height:46px; padding:11px 14px; align-items:flex-start; border-radius:12px; color:var(--color-text-secondary); background:#f7f9fc; box-shadow:none; gap:9px; }
.notice .el-icon { margin-top:2px; color:#42a7d9; }
.notice p { font-size:12px; line-height:1.65; }
.account-panel { min-width:0; padding:18px; overflow:hidden; }
.table-toolbar { min-height:56px; padding:2px 2px 14px; justify-content:space-between; gap:18px; }
.table-title h2 { color:#28324a; font-size:17px; }
.table-title h2 span { color:#635ed8; }
.table-title p { margin-top:4px; color:var(--color-text-muted); font-size:11px; }
.table-filters { gap:8px; }
.table-filters select,.search-field { height:36px; border:1px solid var(--color-border-strong); border-radius:6px; color:var(--color-text-secondary); background:#fff; }
.table-filters select { min-width:118px; padding:0 30px 0 10px; }
.search-field { width:210px; padding:0 10px; gap:7px; }
.search-field .el-icon { flex:0 0 auto; color:#7e86a0; }
.search-field input { min-width:0; width:100%; border:0 !important; outline:0; background:transparent !important; box-shadow:none !important; }
.table-scroll { overflow-x:auto; border:1px solid #e3e9f2; border-radius:11px; }
table { width:100%; min-width:1020px; border-collapse:collapse; table-layout:fixed; color:#30384a; font-size:12px; }
th,td { padding:12px 13px; border-right:1px solid #e8ebf1; border-bottom:1px solid #e8ebf1; text-align:center; vertical-align:middle; }
th:last-child,td:last-child { border-right:0; }
tbody tr:last-child td { border-bottom:0; }
th { height:46px; color:#5a687d; background:#f8fafc; font-size:11px; font-weight:680; white-space:nowrap; }
tbody tr { transition:background-color .18s ease; }
tbody tr:nth-child(even) { background:#fbfbfc; }
tbody tr:hover { background:#f5f6ff; }
.sequence-column { width:64px; }
.action-column { width:120px; }
.sequence-cell,.time-cell { white-space:nowrap; }
.account-cell { width:220px; text-align:left; }
.account-cell,.account-copy { align-items:center; }
.account-cell { display:flex; gap:10px; }
.account-copy { display:grid; min-width:0; }
.account-cell strong,.account-cell small,.backup-cell strong,.backup-cell small,.failure-reason { display:block; }
.account-cell strong { overflow:hidden; color:#222b3e; font-size:13px; text-overflow:ellipsis; white-space:nowrap; }
.account-cell small,.backup-cell small,.publish-status-cell small,.failure-reason { margin-top:3px; color:var(--color-text-muted); font-size:10px; }
.account-cell>img,.avatar-fallback { width:36px; height:36px; flex:0 0 auto; border-radius:10px; }
.account-cell>img { display:block; object-fit:cover; background:#edf0f5; }
.avatar-fallback { display:inline-flex; align-items:center; justify-content:center; color:#718198; background:#edf2f8; font-size:18px; }
.platform-badge { display:inline-flex; min-height:30px; align-items:center; padding:0 9px 0 6px; border:1px solid #e0e7f1; border-radius:9px; color:#33445d; background:#fff; font-size:10px; font-weight:650; gap:7px; }
.platform-badge img { width:20px; height:20px; border-radius:6px; object-fit:cover; }
.publish-status-cell { justify-content:center; flex-direction:column; }
.publish-status-cell :deep(.el-switch) { --el-switch-on-color:#1fbd99; --el-switch-off-color:#b7beca; }
.publish-status-cell :deep(.el-switch.is-disabled) { opacity:1; }
.today-cell strong { color:#1d2740; font-size:14px; }
.today-cell span { margin-left:3px; color:#8c95a5; }
.status-badge { justify-content:center; color:var(--color-text-secondary); white-space:nowrap; gap:5px; }
.status-badge.is-success { color:#14aa84; }
.status-badge.is-warning { color:#d98d25; }
.status-badge.is-pending { color:#676ee0; }
.failure-reason { max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.backup-cell strong { color:#858e9d; font-size:11px; }
.backup-cell strong.is-ready { color:#15a982; }
.row-action { min-height:32px; margin:0 auto; padding:0 10px; justify-content:center; color:#2766c9; border-color:#d4e0f0; background:#f7faff; font-size:11px; gap:5px; }
.row-action:hover { border-color:#aeb6f3; background:#f0f2ff; }
.state-panel,.empty-cell { padding:52px 20px; color:var(--color-text-muted); text-align:center; }
.state-panel.is-error { color:#d95d71; }
.table-footer { min-height:46px; padding:13px 2px 0; justify-content:space-between; color:#737d8f; font-size:11px; gap:18px; }

@media (max-width:1180px) {
  .page-heading { align-items:flex-start; }
  .table-toolbar { align-items:flex-start; flex-direction:column; }
  .table-filters { width:100%; }
  .search-field { flex:1; }
}

@media (max-width:760px) {
  .page-heading,.heading-actions,.table-filters,.table-footer { width:100%; align-items:stretch; flex-direction:column; }
  .heading-actions { flex-direction:row; }
  .heading-actions button { flex:1; }
  .table-filters select,.search-field { width:100%; }
  .account-panel { padding:12px; }
  .table-scroll { overflow:visible; border:0; }
  table,tbody { display:block; min-width:0; }
  thead { display:none; }
  tbody { display:grid; gap:12px; }
  tbody tr { display:grid; grid-template-columns:1fr 1fr; overflow:hidden; border:1px solid #e3e6ee; border-radius:7px; background:#fff !important; }
  tbody td { display:grid; min-height:58px; padding:10px 12px; align-content:center; border-right:0; text-align:left; }
  tbody td::before { content:attr(data-label); margin-bottom:4px; color:#929bab; font-size:10px; }
  .account-cell,.action-cell,.empty-cell { width:auto; grid-column:1 / -1; }
  .avatar-cell img,.avatar-fallback,.row-action { margin:0; }
  .publish-status-cell { align-items:flex-start; }
  .status-badge { justify-content:flex-start; }
  .failure-reason { max-width:100%; }
  .table-footer { gap:5px; }
}
/* 媒体账号列表可读性校准 */
.notice p,.table-title p,.account-cell small,.backup-cell small,.publish-status-cell small,.failure-reason,.platform-badge,.backup-cell strong,.row-action,.table-footer{font-size:13px}
.account-cell strong,.today-cell strong{font-size:14px}
.table-title h2{font-size:20px}
tbody td::before{font-size:12px}
</style>
