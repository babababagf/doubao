import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { ElAlert, ElButton, ElDialog, ElDrawer, ElForm, ElFormItem, ElIcon, ElInput } from 'element-plus'
import 'element-plus/theme-chalk/base.css'
import 'element-plus/theme-chalk/el-alert.css'
import 'element-plus/theme-chalk/el-button.css'
import 'element-plus/theme-chalk/el-dialog.css'
import 'element-plus/theme-chalk/el-drawer.css'
import 'element-plus/theme-chalk/el-form.css'
import 'element-plus/theme-chalk/el-form-item.css'
import 'element-plus/theme-chalk/el-icon.css'
import 'element-plus/theme-chalk/el-input.css'
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-overlay.css'
import '@doubaohk/ui-tokens/tokens.css'

import App from './App.vue'
import { router } from './router'
import './styles/global.css'

async function enableMocking(): Promise<void> {
  if (!import.meta.env.DEV || import.meta.env.MODE !== 'mock' || import.meta.env.VITE_ENABLE_MSW === 'false') {
    return
  }

  const { worker } = await import('./mocks/browser')
  await worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: {
      url: '/mockServiceWorker.js',
    },
  })
}

async function bootstrap(): Promise<void> {
  await enableMocking()

  document.documentElement.classList.remove('dark')
  document.documentElement.classList.add('light-admin')
  const app = createApp(App)
  const pinia = createPinia()

  app.use(pinia)
  app.use(router)
  app.component('ElAlert', ElAlert)
  app.component('ElButton', ElButton)
  app.component('ElDialog', ElDialog)
  app.component('ElDrawer', ElDrawer)
  app.component('ElForm', ElForm)
  app.component('ElFormItem', ElFormItem)
  app.component('ElIcon', ElIcon)
  app.component('ElInput', ElInput)
  app.mount('#app')
}

void bootstrap()
