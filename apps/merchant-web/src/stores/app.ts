import type { BootstrapResponse } from '@doubaohk/api-contract'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { getBootstrap } from '@/services/merchant.service'

export const useAppStore = defineStore('app', () => {
  const bootstrap = ref<BootstrapResponse | null>(null)
  const loading = ref(false)
  const errorMessage = ref('')

  const brand = computed(() => bootstrap.value?.brand ?? null)
  const account = computed(() => bootstrap.value?.account ?? null)

  async function loadBootstrap(force = false): Promise<void> {
    if (bootstrap.value && !force) {
      return
    }

    loading.value = true
    errorMessage.value = ''

    try {
      bootstrap.value = await getBootstrap()
      document.title = bootstrap.value.brand.nickname
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '账户信息加载失败'
      throw error
    } finally {
      loading.value = false
    }
  }

  function reset(): void {
    bootstrap.value = null
    errorMessage.value = ''
  }

  return { account, brand, bootstrap, errorMessage, loadBootstrap, loading, reset }
})

