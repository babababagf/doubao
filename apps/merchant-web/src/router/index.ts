import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

import MerchantLayout from '@/layouts/MerchantLayout.vue'
import { useAuthStore } from '@/stores/auth'

const moduleRoutes: RouteRecordRaw[] = [
  { path: '', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: '控制台', moduleStatus: 'ready' } },
  { path: 'company-profile', redirect: { name: 'website' } },
  { path: 'materials', redirect: { name: 'knowledge' } },
  { path: 'keywords', name: 'keywords', component: () => import('@/views/KeywordsView.vue'), meta: { title: '关键词与问题', moduleStatus: 'ready' } },
  { path: 'knowledge', name: 'knowledge', component: () => import('@/views/KnowledgeView.vue'), meta: { title: '企业信息库', moduleStatus: 'ready' } },
  { path: 'gallery', name: 'gallery', component: () => import('@/views/GalleryView.vue'), meta: { title: '企业图库', moduleStatus: 'ready' } },
  { path: 'instructions', name: 'instructions', component: () => import('@/views/InstructionsView.vue'), meta: { title: '创作指令', moduleStatus: 'ready' } },
  { path: 'content/create', name: 'content-create', component: () => import('@/views/ContentCreateView.vue'), meta: { title: 'AI文章创作', moduleStatus: 'ready' } },
  { path: 'articles', name: 'articles', component: () => import('@/views/ArticlesView.vue'), meta: { title: '文章列表', moduleStatus: 'ready' } },
  { path: 'website', name: 'website', component: () => import('@/views/WebsiteView.vue'), meta: { title: '企业网站', moduleStatus: 'ready' } },
  { path: 'doubao', name: 'doubao', component: () => import('@/views/DoubaoView.vue'), meta: { title: '豆包检测', moduleStatus: 'ready' } },
  { path: 'media', name: 'media', component: () => import('@/views/MediaView.vue'), meta: { title: '媒体账号', moduleStatus: 'ready' } },
  { path: 'publish/tasks', name: 'publish-tasks', component: () => import('@/views/PublishTasksView.vue'), meta: { title: '发布任务', moduleStatus: 'ready' } },
  { path: 'publish/tasks/new', redirect: { name: 'publish-tasks', query: { create: '1' } } },
]

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { title: '登录', guestOnly: true },
    },
    {
      path: '/',
      component: MerchantLayout,
      meta: { requiresAuth: true },
      children: moduleRoutes,
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const authStore = useAuthStore()
  authStore.restore()

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.guestOnly && authStore.isAuthenticated) {
    return { name: 'dashboard' }
  }

  return true
})
