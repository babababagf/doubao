import type { LoginRequest } from '@doubaohk/api-contract'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import * as authService from '@/services/auth.service'
import { AUTH_MARKER_KEY, isRealApiMode, MOCK_SESSION_KEY } from '@/services/http'

export const useAuthStore = defineStore('auth', () => {
  const sessionId = ref<string | null>(null)
  const loading = ref(false)
  const errorMessage = ref('')
  const isAuthenticated = computed(() => Boolean(sessionId.value))

  function restore(): void {
    sessionId.value = sessionStorage.getItem(isRealApiMode ? AUTH_MARKER_KEY : MOCK_SESSION_KEY)
  }

  async function login(payload: LoginRequest): Promise<void> {
    loading.value = true
    errorMessage.value = ''

    try {
      const result = await authService.login(payload)
      const localMarker = isRealApiMode ? 'cookie-session' : result.sessionId
      sessionId.value = localMarker
      sessionStorage.setItem(isRealApiMode ? AUTH_MARKER_KEY : MOCK_SESSION_KEY, localMarker)
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '登录失败，请稍后重试'
      throw error
    } finally {
      loading.value = false
    }
  }

  async function logout(): Promise<void> {
    try {
      await authService.logout()
    } finally {
      sessionId.value = null
      sessionStorage.removeItem(isRealApiMode ? AUTH_MARKER_KEY : MOCK_SESSION_KEY)
    }
  }

  return {
    errorMessage,
    isAuthenticated,
    loading,
    login,
    logout,
    restore,
    sessionId,
  }
})
