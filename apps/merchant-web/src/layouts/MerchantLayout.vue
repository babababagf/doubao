<script setup lang="ts">
import {
  Aim,
  ArrowDown,
  Calendar,
  Collection,
  Connection,
  Document,
  Expand,
  Fold,
  HomeFilled,
  MagicStick,
  Memo,
  Monitor,
  Picture,
  Promotion,
  Search,
  SwitchButton,
  User,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import BrandLockup from '@/components/BrandLockup.vue'
import { ApiError } from '@/services/http'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'

const publisherEnabled = import.meta.env.VITE_PUBLISHER_ENABLED === 'true'
const navigationGroups = computed(() => [
  {
    id: 'home',
    items: [{ label: '首页', routeName: 'dashboard', icon: HomeFilled }],
  },
  {
    id: 'materials',
    sectionLabel: 'AI创作准备',
    label: 'AI素材管理',
    icon: Collection,
    defaultRouteName: 'knowledge',
    items: [
      { label: '企业信息库', routeName: 'knowledge', icon: Collection },
      { label: '关键词与问题', routeName: 'keywords', icon: Search },
      { label: '企业图库', routeName: 'gallery', icon: Picture },
    ],
  },
  {
    id: 'writing',
    label: 'AI文章写作',
    icon: Document,
    items: [
      { label: '创作指令', routeName: 'instructions', icon: Memo },
      { label: 'AI写作任务', routeName: 'content-create', icon: MagicStick },
      { label: '文章列表', routeName: 'articles', icon: Document },
    ],
  },
  {
    id: 'operations',
    sectionLabel: '内容运营',
    label: '企业内容运营',
    icon: Monitor,
    items: [
      { label: '企业网站', routeName: 'website', icon: Monitor },
      { label: '豆包检测', routeName: 'doubao', icon: Aim },
    ],
  },
  ...(publisherEnabled
    ? [{
        id: 'publishing',
        sectionLabel: '文章发布',
        label: '媒体内容发布',
        icon: Promotion,
        items: [
          { label: '媒体账号', routeName: 'media', icon: Connection },
          { label: '发布任务', routeName: 'publish-tasks', icon: Promotion },
        ],
      }]
    : []),
])

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const authStore = useAuthStore()
const collapsed = ref(false)
const mobileMenuOpen = ref(false)
const openedGroups = ref<Record<string, boolean>>({
  materials: true,
  writing: true,
  operations: true,
  publishing: true,
})

const pageTitle = computed(() => route.meta.title ?? '控制台')
const brand = computed(() => ({
  nickname: appStore.brand?.nickname?.trim() || '豆包获客',
  logoUrl: appStore.brand?.logoUrl?.trim() || '/brand-mark.svg',
}))
const statusLabel = computed(() => {
  const labels = { active: '正常', expired: '已到期', disabled: '已停用' }
  return appStore.account ? labels[appStore.account.status] : '加载中'
})

function isActive(routeName: string): boolean {
  return route.name === routeName
}

function groupIsActive(items: ReadonlyArray<{ routeName: string }>): boolean {
  return items.some((item) => isActive(item.routeName))
}

function activateGroup(groupId: string, defaultRouteName?: string): void {
  if (defaultRouteName && route.name !== defaultRouteName) {
    openedGroups.value[groupId] = true
    void router.push({ name: defaultRouteName })
    return
  }
  openedGroups.value[groupId] = !openedGroups.value[groupId]
}

function toggleMenu(): void {
  if (window.matchMedia('(max-width: 760px)').matches) {
    mobileMenuOpen.value = !mobileMenuOpen.value
    return
  }

  collapsed.value = !collapsed.value
}

async function loadContext(): Promise<void> {
  try {
    await appStore.loadBootstrap()
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await authStore.logout()
      await router.replace({ name: 'login' })
      return
    }
    ElMessage.error(appStore.errorMessage)
  }
}

async function handleLogout(): Promise<void> {
  await authStore.logout()
  appStore.reset()
  await router.replace({ name: 'login' })
}

onMounted(() => {
  void loadContext()
})

watch(
  () => route.fullPath,
  () => {
    mobileMenuOpen.value = false
    const activeGroup = navigationGroups.value.find((group) => group.items.some((item) => isActive(item.routeName)))
    if (activeGroup?.label) openedGroups.value[activeGroup.id] = true
  },
)
</script>

<template>
  <div
    class="merchant-shell"
    :class="{ 'is-collapsed': collapsed, 'is-mobile-open': mobileMenuOpen }"
  >
    <aside class="sidebar" aria-label="主导航">
      <div class="sidebar-brand">
        <BrandLockup
          :collapsed="collapsed"
          :logo-url="brand.logoUrl"
          :nickname="brand.nickname"
        />
      </div>

      <nav class="nav-list" aria-label="业务菜单">
        <section v-for="group in navigationGroups" :key="group.id" class="nav-group">
          <p v-if="group.sectionLabel && !collapsed" class="nav-section-label">{{ group.sectionLabel }}</p>
          <button
            v-if="group.label"
            type="button"
            class="nav-group-toggle"
            :class="{ 'is-active': groupIsActive(group.items) }"
            :aria-expanded="openedGroups[group.id]"
            @click="activateGroup(group.id, group.defaultRouteName)"
          >
            <el-icon :size="18" aria-hidden="true"><component :is="group.icon" /></el-icon>
            <span v-if="!collapsed">{{ group.label }}</span>
            <el-icon v-if="!collapsed" class="group-arrow" :class="{ 'is-open': openedGroups[group.id] }" aria-hidden="true"><ArrowDown /></el-icon>
          </button>
          <div v-show="!group.label || collapsed || openedGroups[group.id]" class="nav-group-items">
            <RouterLink
              v-for="item in group.items"
              :key="item.routeName"
              :to="{ name: item.routeName }"
              class="nav-item"
              :class="{ 'is-active': isActive(item.routeName), 'is-child': Boolean(group.label) }"
              :aria-label="collapsed ? item.label : undefined"
              :title="collapsed ? item.label : undefined"
              @click="mobileMenuOpen = false"
            >
              <el-icon :size="17" aria-hidden="true"><component :is="item.icon" /></el-icon>
              <span v-if="!collapsed">{{ item.label }}</span>
            </RouterLink>
          </div>
        </section>
      </nav>

      <div class="sidebar-footer">
        <button
          type="button"
          class="collapse-button"
          :aria-label="collapsed ? '展开菜单' : '收起菜单'"
          @click="toggleMenu"
        >
          <el-icon :size="18" aria-hidden="true">
            <Expand v-if="collapsed" />
            <Fold v-else />
          </el-icon>
          <span v-if="!collapsed">收起菜单</span>
        </button>
      </div>
    </aside>

    <button
      v-if="mobileMenuOpen"
      type="button"
      class="mobile-backdrop"
      aria-label="关闭菜单"
      @click="mobileMenuOpen = false"
    />

    <section class="workspace">
      <header class="topbar">
        <div class="page-heading">
          <button
            type="button"
            class="menu-trigger"
            aria-label="切换菜单"
            @click="toggleMenu"
          >
            <el-icon :size="20"><Fold /></el-icon>
          </button>
          <p class="topbar-notice">必读：内容应基于真实企业资料，请勿夸大宣传、伪造数据或冒充权威。</p>
          <h1>{{ pageTitle }}</h1>
        </div>

        <div v-if="appStore.account" class="account-context">
          <span class="company-name">{{ appStore.account.companyName }}</span>
          <span class="context-divider" aria-hidden="true" />
          <span class="account-item">
            <el-icon aria-hidden="true"><User /></el-icon>
            {{ appStore.account.username }}
          </span>
          <span class="context-divider" aria-hidden="true" />
          <span class="account-status" :data-status="appStore.account.status">
            <span class="status-dot" aria-hidden="true" />
            {{ statusLabel }}
          </span>
          <span class="context-divider" aria-hidden="true" />
          <span class="account-item expiry-chip">
            <el-icon aria-hidden="true"><Calendar /></el-icon>
            到期时间 {{ appStore.account.expiresAt }}
          </span>
          <button type="button" class="logout-button" title="退出登录" @click="handleLogout">
            <el-icon :size="18"><SwitchButton /></el-icon>
            <span class="sr-only">退出登录</span>
          </button>
        </div>

        <div v-else class="account-loading" aria-label="账户信息加载中">
          <span /><span /><span />
        </div>
      </header>

      <main class="page-content">
        <RouterView />
      </main>
    </section>
  </div>
</template>

<style scoped>
.merchant-shell {
  --sidebar-width: 218px;
  display: grid;
  min-height: 100vh;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  transition: grid-template-columns var(--transition-base);
}

.merchant-shell.is-collapsed {
  --sidebar-width: 78px;
}

.sidebar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  height: 100vh;
  min-width: 0;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  background: linear-gradient(180deg, rgba(4, 13, 29, 0.98), rgba(4, 13, 27, 0.92));
  box-shadow: 18px 0 50px rgba(0, 0, 0, 0.14);
}

.sidebar-brand {
  display: flex;
  min-height: 76px;
  align-items: center;
  padding: 0 18px;
  border-bottom: 1px solid rgba(145, 168, 205, 0.12);
}

.nav-list {
  display: grid;
  overflow-y: auto;
  padding: 14px 10px;
  gap: 4px;
  scrollbar-width: thin;
}

.nav-item {
  position: relative;
  display: flex;
  min-height: 44px;
  align-items: center;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 9px;
  color: var(--color-text-secondary);
  gap: 13px;
  transition:
    color var(--transition-fast),
    border-color var(--transition-fast),
    background var(--transition-fast);
}

.is-collapsed .nav-item {
  justify-content: center;
  padding: 0;
}

.nav-item:hover {
  color: var(--color-text);
  background: rgba(88, 104, 160, 0.1);
}

.nav-item.is-active {
  color: #cad7ff;
  border-color: rgba(93, 112, 255, 0.45);
  background: linear-gradient(90deg, rgba(67, 90, 217, 0.3), rgba(50, 72, 144, 0.13));
}

.nav-item.is-active::before {
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: -1px;
  width: 2px;
  border-radius: var(--radius-pill);
  background: #6f79ff;
  box-shadow: 0 0 16px rgba(90, 105, 255, 0.72);
  content: '';
}

.sidebar-footer {
  margin-top: auto;
  padding: 14px 10px 18px;
}

.collapse-button,
.menu-trigger,
.logout-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  color: var(--color-text-secondary);
  background: transparent;
  cursor: pointer;
}

.collapse-button {
  width: 100%;
  min-height: 42px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  gap: 10px;
}

.collapse-button:hover,
.menu-trigger:hover,
.logout-button:hover {
  color: var(--color-text);
  background: var(--color-surface-soft);
}

.workspace {
  min-width: 0;
}

.mobile-backdrop {
  display: none;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 8;
  display: flex;
  min-height: 76px;
  align-items: center;
  justify-content: space-between;
  padding: 0 clamp(18px, 2.2vw, 34px);
  border-bottom: 1px solid var(--color-border);
  background: rgba(5, 12, 25, 0.86);
  backdrop-filter: blur(18px);
  gap: 16px;
}

.page-heading,
.account-context,
.account-item,
.account-status {
  display: flex;
  align-items: center;
}

.page-heading {
  flex: 1 1 auto;
  min-width: 0;
  gap: 14px;
}

.page-heading h1 {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 650;
  letter-spacing: -0.025em;
  white-space: nowrap;
}

.menu-trigger,
.logout-button {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-sm);
}

.account-context {
  flex: 0 1 auto;
  min-width: 0;
  color: var(--color-text-secondary);
  gap: 14px;
  white-space: nowrap;
}

.company-name {
  max-width: 240px;
  overflow: hidden;
  color: var(--color-text);
  text-overflow: ellipsis;
}

.context-divider {
  width: 1px;
  height: 22px;
  background: var(--color-border);
}

.account-item {
  gap: 7px;
}

.account-status {
  color: var(--color-success);
  gap: 7px;
}

.account-status[data-status='expired'],
.account-status[data-status='disabled'] {
  color: var(--color-danger);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 14px currentColor;
}

.account-loading {
  display: flex;
  flex: 0 0 auto;
  gap: 10px;
}

.account-loading span {
  display: block;
  width: 94px;
  height: 16px;
  border-radius: 5px;
  background: rgba(126, 146, 181, 0.12);
}

.page-content {
  min-width: 0;
  padding: clamp(18px, 2.2vw, 34px);
}

@media (max-width: 1366px) {
  .account-context {
    gap: 10px;
    font-size: 12px;
  }

  .company-name {
    max-width: 170px;
  }
}

@media (max-width: 1120px) {
  .merchant-shell {
    --sidebar-width: 78px;
  }

  .sidebar-brand :deep(.brand-name),
  .nav-item span,
  .collapse-button span {
    display: none;
  }

  .sidebar-brand,
  .nav-item {
    justify-content: center;
  }

  .nav-item {
    padding: 0;
  }

  .company-name,
  .context-divider:nth-of-type(3),
  .account-item:last-of-type {
    display: none;
  }
}

@media (max-width: 760px) {
  .merchant-shell,
  .merchant-shell.is-collapsed {
    --sidebar-width: 0px;
  }

  .sidebar {
    position: fixed;
    z-index: 21;
    display: flex;
    width: min(280px, 84vw);
    transform: translateX(-102%);
    transition: transform var(--transition-base);
  }

  .merchant-shell.is-mobile-open .sidebar {
    transform: translateX(0);
  }

  .merchant-shell.is-mobile-open .sidebar-brand,
  .merchant-shell.is-mobile-open .nav-item {
    justify-content: flex-start;
  }

  .merchant-shell.is-mobile-open .nav-item {
    padding: 0 14px;
  }

  .merchant-shell.is-mobile-open .sidebar-brand :deep(.brand-name),
  .merchant-shell.is-mobile-open .nav-item span,
  .merchant-shell.is-mobile-open .collapse-button span {
    display: block;
  }

  .mobile-backdrop {
    position: fixed;
    z-index: 20;
    display: block;
    inset: 0;
    border: 0;
    background: rgba(1, 6, 15, 0.68);
    backdrop-filter: blur(4px);
    cursor: pointer;
  }

  .workspace {
    grid-column: 1 / -1;
  }

  .topbar {
    min-height: 64px;
    padding: 0 14px;
    gap: 8px;
  }

  .page-content {
    padding: 16px;
  }

  .page-heading h1 {
    font-size: 20px;
  }

  .account-loading span {
    display: none;
  }

  .account-loading span:first-child {
    display: block;
    width: 38px;
  }

  .context-divider,
  .account-status,
  .account-item {
    display: none;
  }
}

/* 浅色高密度企业后台：参考分组导航，但只保留本系统已有业务。 */
.merchant-shell {
  --sidebar-width: 230px;
  background: var(--color-canvas);
}

.merchant-shell.is-collapsed {
  --sidebar-width: 68px;
}

.sidebar {
  border-right-color: #e4e7ee;
  color: #303849;
  background: #ffffff;
  box-shadow: 4px 0 14px rgba(37, 48, 73, 0.035);
}

.sidebar-brand {
  min-height: 52px;
  padding: 0 20px;
  border-bottom: 0;
  color: #ffffff;
  background: linear-gradient(100deg, #7b6ce9 0%, #526cf3 100%);
}

.nav-list {
  display: block;
  padding: 14px 8px 24px;
}

.nav-group + .nav-group {
  margin-top: 7px;
}

.nav-section-label {
  margin: 16px 11px 7px;
  color: #a1a8b5;
  font-size: 11px;
  line-height: 1;
}

.nav-group-toggle {
  display: flex;
  width: 100%;
  min-height: 42px;
  align-items: center;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  color: #2f3747;
  background: transparent;
  cursor: pointer;
  gap: 11px;
  text-align: left;
}

.nav-group-toggle:hover,
.nav-group-toggle.is-active {
  color: #5966db;
  background: #f2f4ff;
}

.nav-group-toggle span {
  flex: 1;
  font-size: 14px;
  font-weight: 560;
}

.group-arrow {
  flex: 0 0 auto;
  color: #9ba3b1;
  transition: transform var(--transition-base);
}

.group-arrow.is-open {
  transform: rotate(180deg);
}

.nav-group-items {
  display: grid;
  gap: 2px;
}

.nav-item {
  min-height: 39px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  color: #505b6d;
  gap: 11px;
}

.nav-item.is-child {
  padding-left: 34px;
}

.nav-item:hover {
  color: #5966db;
  background: #f5f6fb;
}

.nav-item.is-active {
  color: #5262d9;
  border-color: transparent;
  background: #e8ecff;
}

.nav-item.is-active::before {
  display: none;
}

.sidebar-footer {
  padding: 10px 8px 14px;
  border-top: 1px solid #edf0f4;
}

.collapse-button {
  min-height: 38px;
  border-color: #e4e7ee;
  color: #727c8e;
  background: #ffffff;
}

.topbar {
  min-height: 52px;
  padding: 0 18px;
  border-bottom: 0;
  color: #ffffff;
  background: linear-gradient(90deg, #786ce9 0%, #486df3 100%);
  box-shadow: 0 2px 8px rgba(71, 86, 181, 0.14);
  backdrop-filter: none;
}

.page-heading {
  gap: 12px;
}

.page-heading h1 {
  display: none;
}

.menu-trigger,
.logout-button {
  color: rgba(255, 255, 255, 0.88);
}

.menu-trigger:hover,
.logout-button:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.13);
}

.topbar-notice {
  overflow: hidden;
  margin: 0;
  color: rgba(255, 255, 255, 0.93);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-context {
  color: rgba(255, 255, 255, 0.9);
  gap: 10px;
}

.company-name,
.account-status {
  color: #ffffff;
}

.status-dot {
  box-shadow: none;
}

.context-divider {
  background: rgba(255, 255, 255, 0.22);
}

.expiry-chip {
  padding: 5px 10px;
  border-radius: 5px;
  color: #4f3920;
  background: #ffc789;
}

.account-loading span {
  background: rgba(255, 255, 255, 0.22);
}

.page-content {
  min-height: calc(100vh - 52px);
  padding: 16px;
  background: #f3f5f8;
}

@media (max-width: 1120px) {
  .merchant-shell {
    --sidebar-width: 68px;
  }

  .nav-section-label,
  .nav-group-toggle span,
  .group-arrow {
    display: none;
  }

  .nav-group-toggle,
  .nav-item,
  .nav-item.is-child {
    justify-content: center;
    padding: 0;
  }
}

@media (max-width: 760px) {
  .merchant-shell,
  .merchant-shell.is-collapsed {
    --sidebar-width: 0px;
  }

  .merchant-shell.is-mobile-open .nav-section-label {
    display: block;
  }

  .merchant-shell.is-mobile-open .nav-group-toggle {
    justify-content: flex-start;
    padding: 0 12px;
  }

  .merchant-shell.is-mobile-open .nav-group-toggle span,
  .merchant-shell.is-mobile-open .group-arrow {
    display: flex;
  }

  .merchant-shell.is-mobile-open .nav-item.is-child {
    justify-content: flex-start;
    padding-left: 34px;
  }

  .topbar {
    min-height: 52px;
    padding: 0 12px;
  }

  .topbar-notice {
    display: none;
  }

  .page-heading h1 {
    display: block;
    color: #ffffff;
    font-size: 17px;
  }

  .page-content {
    min-height: calc(100vh - 52px);
    padding: 12px;
  }
}
</style>
