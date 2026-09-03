<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const appStore = useAppStore()
const state = ref<'checking' | 'error'>('checking')
const errorMessage = computed(() => authStore.errorMessage || '安全跳转凭证无效或已过期，请返回管理后台重新进入。')

onMounted(async () => {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? ''
  window.history.replaceState(null, document.title, '/access/handoff')
  if (!/^[a-zA-Z0-9_-]{40,100}$/.test(token)) {
    state.value = 'error'
    return
  }
  try {
    await authStore.exchangeAdminHandoff(token)
    appStore.reset()
    await router.replace({ name: 'dashboard' })
  } catch {
    state.value = 'error'
  }
})

function returnToLogin(): void {
  void router.replace({ name: 'login' })
}
</script>

<template>
  <main class="handoff-shell">
    <section class="handoff-card" aria-live="polite">
      <div class="handoff-mark" aria-hidden="true">S</div>
      <template v-if="state === 'checking'">
        <span class="handoff-spinner" aria-hidden="true" />
        <h1>正在安全进入客户后台</h1>
        <p>系统正在校验一次性凭证、管理范围与客户状态。</p>
      </template>
      <template v-else>
        <h1>无法进入客户后台</h1>
        <p>{{ errorMessage }}</p>
        <button type="button" @click="returnToLogin">返回登录页</button>
      </template>
    </section>
  </main>
</template>

<style scoped>
.handoff-shell {
  display: grid;
  min-height: 100vh;
  padding: 28px;
  place-items: center;
  background:
    radial-gradient(circle at 18% 12%, rgba(37, 99, 235, .18), transparent 32%),
    radial-gradient(circle at 85% 78%, rgba(6, 182, 212, .14), transparent 28%),
    #f3f7fd;
}

.handoff-card {
  width: min(520px, 100%);
  padding: 48px;
  border: 1px solid rgba(72, 122, 204, .22);
  border-radius: 24px;
  color: #13233f;
  background: rgba(255, 255, 255, .94);
  box-shadow: 0 28px 80px rgba(34, 76, 145, .16);
  text-align: center;
}

.handoff-mark {
  display: grid;
  width: 48px;
  height: 48px;
  margin: 0 auto 24px;
  place-items: center;
  border-radius: 14px;
  color: #fff;
  background: linear-gradient(135deg, #1768f2, #12b7dc);
  font-size: 21px;
  font-weight: 800;
  box-shadow: 0 12px 30px rgba(23, 104, 242, .25);
}

.handoff-spinner {
  display: block;
  width: 30px;
  height: 30px;
  margin: 0 auto 22px;
  border: 3px solid #dbe8fa;
  border-top-color: #1768f2;
  border-radius: 50%;
  animation: spin .8s linear infinite;
}

.handoff-kicker {
  margin: 0 0 10px;
  color: #1768f2;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .14em;
}

.handoff-kicker.is-error { color: #d13c55; }
.handoff-card h1 { margin: 0; font-size: clamp(26px, 5vw, 34px); letter-spacing: -.04em; }
.handoff-card > p:last-of-type { margin: 14px 0 0; color: #5e6f89; font-size: 15px; line-height: 1.75; }
.handoff-card button { min-height: 44px; padding: 0 22px; margin-top: 26px; border: 0; border-radius: 10px; color: #fff; background: #1768f2; font-weight: 700; cursor: pointer; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .handoff-spinner { animation: none; } }
</style>
