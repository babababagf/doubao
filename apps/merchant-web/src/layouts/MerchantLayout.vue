<script setup lang="ts">
import {
  ArrowDown,
  Collection,
  Connection,
  DataAnalysis,
  Document,
  Expand,
  Fold,
  HomeFilled,
  MagicStick,
  Memo,
  Monitor,
  OfficeBuilding,
  Picture,
  Promotion,
  Search,
  SwitchButton,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import BrandLockup from '@/components/BrandLockup.vue'
import { ApiError } from '@/services/http'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'

const navigationGroups = computed(() => [
  {
    id: 'home',
    sectionLabel: '工作台',
    items: [
      { label: '首页', routeName: 'dashboard', icon: HomeFilled },
      { label: '数据总览', routeName: 'data-overview', icon: DataAnalysis },
    ],
  },
  {
    id: 'materials',
    sectionLabel: '内容资产',
    items: [
      { label: '关键词与问题', routeName: 'keywords', icon: Search },
      { label: '企业信息库', routeName: 'knowledge', icon: Collection },
      { label: '企业图库', routeName: 'gallery', icon: Picture },
    ],
  },
  {
    id: 'writing',
    sectionLabel: 'AI 创作',
    items: [
      { label: '创作指令', routeName: 'instructions', icon: Memo },
      { label: 'AI文章创作', routeName: 'content-create', icon: MagicStick },
      { label: '文章列表', routeName: 'articles', icon: Document },
    ],
  },
  {
    id: 'growth',
    sectionLabel: '增长运营',
    items: [
      { label: '企业网站', routeName: 'website', icon: Monitor },
      { label: '媒体账号', routeName: 'media', icon: Connection },
      { label: '发布任务', routeName: 'publish-tasks', icon: Promotion },
    ],
  },
])

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const authStore = useAuthStore()
const collapsed = ref(false)
const mobileMenuOpen = ref(false)

const pageTitle = computed(() => route.meta.title ?? '控制台')
// 品牌展示优先使用 bootstrap 已有数据，缺失时回退到平台默认品牌
const brand = computed(() => {
  const configuredNickname = appStore.brand?.nickname?.trim()
  return {
    nickname: !configuredNickname || configuredNickname === '豆包获客' ? '星枢豆包获客' : configuredNickname,
    logoUrl: appStore.brand?.logoUrl?.trim() || '/brand-mark.svg',
  }
})
const statusLabel = computed(() => {
  const labels = { active: '正常', expired: '已到期', disabled: '已停用' }
  return appStore.account ? labels[appStore.account.status] : '加载中'
})

function isActive(routeName: string): boolean {
  return route.name === routeName
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
  },
)
</script>

<template>
  <div
    class="merchant-shell"
    :class="{
      'is-collapsed': collapsed,
      'is-mobile-open': mobileMenuOpen,
      'is-dashboard-route': route.name === 'dashboard',
    }"
  >
    <a class="skip-link" href="#merchant-main">跳到主要内容</a>
    <aside class="sidebar" aria-label="主导航">
      <div class="sidebar-brand">
        <BrandLockup
          :collapsed="collapsed && !mobileMenuOpen"
          :logo-url="brand.logoUrl"
          :nickname="brand.nickname"
        />
      </div>

      <nav class="nav-list" aria-label="业务菜单">
        <section v-for="group in navigationGroups" :key="group.id" class="nav-group">
          <p v-if="group.sectionLabel && !collapsed" class="nav-section-label">{{ group.sectionLabel }}</p>
          <div class="nav-group-items">
            <RouterLink
              v-for="item in group.items"
              :key="item.routeName"
              :to="{ name: item.routeName }"
              class="nav-item"
              :class="{ 'is-active': isActive(item.routeName) }"
              :aria-label="collapsed ? item.label : undefined"
              :aria-current="isActive(item.routeName) ? 'page' : undefined"
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
            <el-icon :size="20" aria-hidden="true">
              <Expand v-if="collapsed" />
              <Fold v-else />
            </el-icon>
          </button>
          <div class="page-heading-copy">
            <h1>{{ pageTitle === '首页' ? '工作空间' : pageTitle }}</h1>
            <el-icon class="workspace-chevron" aria-hidden="true"><ArrowDown /></el-icon>
          </div>
        </div>

        <div v-if="appStore.account" class="account-context">
          <span class="company-name">
            <el-icon aria-hidden="true"><OfficeBuilding /></el-icon>
            {{ appStore.account.companyName }}
            <el-icon class="company-chevron" aria-hidden="true"><ArrowDown /></el-icon>
          </span>
          <span class="account-status" :data-status="appStore.account.status">
            <span class="status-dot" aria-hidden="true" />
            {{ statusLabel }}
          </span>
          <span class="account-profile">
            <span class="account-avatar" aria-hidden="true">{{ appStore.account.username.slice(0, 1).toUpperCase() }}</span>
            <span class="account-profile-copy">
              <strong>{{ appStore.account.username }}</strong>
              <small>到期时间：{{ appStore.account.expiresAt }}</small>
            </span>
          </span>
          <button type="button" class="logout-button" title="退出登录" aria-label="退出登录" @click="handleLogout">
            <el-icon :size="18" aria-hidden="true"><SwitchButton /></el-icon>
            <span class="sr-only">退出登录</span>
          </button>
        </div>

        <div v-else class="account-loading" aria-label="账户信息加载中">
          <span /><span /><span />
        </div>
      </header>

      <main id="merchant-main" class="page-content" tabindex="-1">
        <RouterView v-slot="{ Component, route: currentRoute }">
          <Transition name="page-route" mode="out-in">
            <component :is="Component" :key="currentRoute.fullPath" />
          </Transition>
        </RouterView>
      </main>
    </section>
  </div>
</template>

<style scoped>
/* ==========================================================================
   全局布局 · 内容增长控制台
   深色导航舱 + 冷灰工作画布 + 低干扰顶栏
   ========================================================================== */

.merchant-shell {
  display: grid;
  min-height: 100vh;
  background:
    linear-gradient(rgba(22, 75, 142, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(22, 75, 142, 0.025) 1px, transparent 1px),
    radial-gradient(circle at 88% 0%, rgba(40, 126, 239, 0.1), transparent 30%),
    var(--color-canvas);
  background-size: 32px 32px, 32px 32px, auto, auto;
  grid-template-columns: 252px minmax(0, 1fr);
  transition: grid-template-columns var(--transition-base);
}

.merchant-shell.is-collapsed {
  grid-template-columns: 82px minmax(0, 1fr);
}

.skip-link {
  position: fixed;
  z-index: 3000;
  top: 10px;
  left: 12px;
  padding: 9px 13px;
  border: 1px solid #b8cff2;
  border-radius: 9px;
  color: var(--color-primary-strong);
  background: #ffffff;
  box-shadow: var(--shadow-panel-hover);
  font-size: 14px;
  font-weight: 700;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-12px);
  transition: opacity var(--transition-fast), transform var(--transition-fast);
}

.skip-link:focus-visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.sidebar,
.workspace {
  min-width: 0;
}

/* ---------------- 侧栏 ---------------- */

.sidebar {
  position: sticky;
  top: 0;
  display: grid;
  height: 100vh;
  overflow: hidden;
  border-right: 1px solid rgba(139, 171, 214, 0.14);
  color: #aebdd0;
  background:
    radial-gradient(circle at 10% 2%, rgba(45, 126, 255, 0.24), transparent 26%),
    linear-gradient(180deg, #08182f 0%, #071429 56%, #061225 100%);
  box-shadow: 18px 0 48px rgba(4, 17, 36, 0.16);
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.sidebar-brand {
  display: flex;
  min-height: 78px;
  align-items: center;
  padding: 0 22px;
  border-bottom: 1px solid rgba(155, 188, 228, 0.12);
  color: #ffffff;
}

.is-collapsed .sidebar-brand {
  justify-content: center;
  padding: 0 10px;
}

.nav-list {
  padding: 22px 14px 20px;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(118, 143, 178, 0.3) transparent;
}

.nav-list::-webkit-scrollbar {
  width: 5px;
}

.nav-list::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(118, 143, 178, 0.3);
}

.nav-group + .nav-group {
  margin-top: 22px;
}

.nav-section-label {
  margin: 0 0 6px;
  padding: 0 11px;
  color: #7187a3;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.09em;
}

.nav-item,
.collapse-button,
.menu-trigger,
.logout-button {
  border: 0;
  font: inherit;
}

.nav-item {
  position: relative;
  display: flex;
  width: 100%;
  min-height: 46px;
  align-items: center;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 11px;
  color: #aabbd0;
  background: transparent;
  font-size: 15px;
  font-weight: 580;
  gap: 10px;
  transition:
    color var(--transition-fast),
    background var(--transition-fast),
    transform var(--transition-fast);
}

.nav-item:hover {
  color: #ffffff;
  background: rgba(91, 145, 226, 0.1);
  transform: translateX(2px);
}

.nav-item.is-active {
  border-color: rgba(101, 164, 255, 0.28);
  color: #ffffff;
  background: linear-gradient(104deg, rgba(37, 99, 235, 0.34), rgba(25, 184, 220, 0.13));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 22px rgba(0, 11, 31, 0.18);
  font-weight: 680;
}

.nav-item.is-active::before {
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: 0;
  width: 2px;
  border-radius: 99px;
  background: #4acfff;
  box-shadow: 0 0 12px rgba(74, 207, 255, 0.8);
  content: '';
}

.nav-item .el-icon {
  color: #7189a7;
  transition: color var(--transition-fast);
}

.nav-item:hover .el-icon,
.nav-item.is-active .el-icon {
  color: #72c9ff;
}

.nav-group-items {
  display: grid;
  margin-top: 2px;
  gap: 4px;
}

.is-collapsed .nav-section-label {
  display: none;
}

.is-collapsed .nav-item {
  justify-content: center;
  min-height: 42px;
  padding: 0;
}

.is-collapsed .nav-item.is-active::before {
  top: 11px;
  bottom: 11px;
}

.sidebar-footer {
  padding: 14px;
  border-top: 1px solid rgba(155, 188, 228, 0.12);
}

.collapse-button {
  display: flex;
  width: 100%;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(155, 188, 228, 0.16);
  border-radius: 10px;
  color: #8fa3bc;
  background: rgba(255, 255, 255, 0.035);
  cursor: pointer;
  gap: 8px;
  transition:
    color var(--transition-fast),
    border-color var(--transition-fast),
    background var(--transition-fast);
}

.collapse-button:hover {
  border-color: rgba(112, 175, 255, 0.38);
  color: #ffffff;
  background: rgba(59, 122, 211, 0.12);
}

/* ---------------- 工作区与顶栏 ---------------- */

.workspace {
  display: grid;
  min-height: 100vh;
  grid-template-rows: 78px minmax(0, 1fr);
}

.topbar {
  position: sticky;
  z-index: 30;
  top: 0;
  display: flex;
  min-width: 0;
  min-height: 78px;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px 0 24px;
  border-bottom: 1px solid var(--color-border);
  background: rgba(246, 249, 253, 0.88);
  box-shadow: 0 10px 32px rgba(28, 58, 98, 0.045);
  backdrop-filter: blur(20px) saturate(135%);
  gap: 16px;
}

.page-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.page-heading-copy {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.page-heading-copy > span {
  overflow: hidden;
  color: #71829a;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-heading h1 {
  margin: 0;
  overflow: hidden;
  color: var(--color-text);
  font-size: 23px;
  font-weight: 740;
  letter-spacing: -0.035em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-trigger {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 11px;
  color: #46617f;
  background: rgba(255, 255, 255, 0.82);
  cursor: pointer;
  transition:
    color var(--transition-fast),
    border-color var(--transition-fast),
    background var(--transition-fast);
}

.menu-trigger:hover {
  border-color: #9ab9e4;
  color: #155bdd;
  background: #ffffff;
}

.account-context {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  color: var(--color-text-secondary);
  font-size: 15px;
  gap: 12px;
}

.company-name {
  max-width: 220px;
  overflow: hidden;
  color: var(--color-text);
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-status {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid #d9eae2;
  border-radius: 999px;
  background: #f3faf6;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  gap: 6px;
}

.account-status[data-status='active'] {
  color: var(--color-success);
}

.account-status[data-status='expired'],
.account-status[data-status='disabled'] {
  border-color: #f2d4da;
  color: var(--color-danger);
  background: #fdf3f5;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.account-profile {
  display: flex;
  min-width: 0;
  align-items: center;
  padding-left: 2px;
  gap: 10px;
}

.account-avatar {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 12px;
  color: #ffffff;
  background: linear-gradient(145deg, #155bdd, #1d8de5);
  box-shadow: 0 8px 18px rgba(29, 99, 233, 0.2);
  font-size: 15px;
  font-weight: 700;
}

.account-profile-copy {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.account-profile-copy strong {
  color: var(--color-text);
  font-size: 15px;
  font-weight: 650;
}

.account-profile-copy small {
  display: inline-flex;
  align-items: center;
  color: var(--color-text-muted);
  font-size: 14px;
  white-space: nowrap;
  gap: 4px;
}

.logout-button {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  color: var(--color-text-muted);
  background: #ffffff;
  cursor: pointer;
  transition:
    color var(--transition-fast),
    border-color var(--transition-fast),
    background var(--transition-fast);
}

.logout-button:hover {
  border-color: #f2cbd3;
  color: var(--color-danger);
  background: #fff5f7;
}

.nav-item:active,
.collapse-button:active,
.menu-trigger:active,
.logout-button:active {
  transform: scale(0.985);
}

.account-loading {
  display: flex;
  align-items: center;
  gap: 7px;
}

.account-loading span {
  display: block;
  width: 34px;
  height: 8px;
  border-radius: 99px;
  background: linear-gradient(90deg, #eef3fa, #e2ebf7, #eef3fa);
  background-size: 220% 100%;
  animation: shell-shimmer 1.4s linear infinite;
}

.page-content {
  min-width: 0;
  padding: 26px clamp(22px, 2vw, 34px) 48px;
}

.mobile-backdrop {
  display: none;
}

@keyframes shell-shimmer {
  to { background-position: -220% 0; }
}

/* ---------------- 响应式 ---------------- */

@media (max-width: 1280px) {
  .company-name {
    display: none;
  }
}

@media (max-width: 1120px) {
  .merchant-shell {
    grid-template-columns: 224px minmax(0, 1fr);
  }

  .merchant-shell.is-collapsed {
    grid-template-columns: 72px minmax(0, 1fr);
  }
}

@media (max-width: 760px) {
  .merchant-shell,
  .merchant-shell.is-collapsed {
    display: block;
    min-height: 100vh;
  }

  .sidebar {
    position: fixed;
    z-index: 80;
    top: 0;
    bottom: 0;
    left: 0;
    width: min(280px, calc(100vw - 44px));
    height: 100vh;
    border-right: 1px solid rgba(139, 171, 214, 0.2);
    box-shadow: 24px 0 60px rgba(17, 35, 66, 0.12);
    animation: none !important;
    transform: translateX(calc(-100% - 12px));
    transition: transform var(--transition-base);
  }

  .is-mobile-open .sidebar {
    transform: translateX(0);
  }

  .is-collapsed .sidebar-brand {
    justify-content: flex-start;
    padding: 0 18px;
  }

  .is-collapsed .nav-section-label {
    display: block;
  }

  .is-collapsed .nav-item {
    justify-content: flex-start;
    min-height: 38px;
    padding: 0 10px;
  }

  .is-collapsed .nav-item.is-active::before {
    top: 9px;
    bottom: 9px;
  }

  .workspace {
    min-height: 100vh;
    grid-template-rows: 60px minmax(0, 1fr);
  }

  .topbar {
    min-height: 60px;
    padding: 0 12px;
  }

  .page-heading-copy > span,
  .account-profile-copy,
  .account-status {
    display: none;
  }

  .page-heading h1 {
    font-size: 16px;
  }

  .account-context {
    gap: 8px;
  }

  .mobile-backdrop {
    position: fixed;
    z-index: 70;
    display: block;
    top: 0;
    right: 0;
    bottom: 0;
    left: min(280px, calc(100vw - 44px));
    border: 0;
    background: rgba(23, 38, 60, 0.34);
    backdrop-filter: blur(3px);
  }

  .page-content {
    padding: 18px 14px 28px;
  }
}

@media (max-width: 430px) {
  .page-content {
    padding: 12px 10px 22px;
  }
}

@media (hover: hover) and (pointer: fine) {
  .nav-item:hover,
  .collapse-button:hover,
  .menu-trigger:hover,
  .logout-button:hover {
    will-change: transform;
  }
}
</style>

<style scoped src="@/styles/merchant-shell-reference.css"></style>
