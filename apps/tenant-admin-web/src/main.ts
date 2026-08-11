import { createApp } from 'vue'
import '@doubaohk/ui-tokens/tokens.css'
import './styles.css'
import App from './App.vue'

document.documentElement.classList.add('dark')
createApp(App).mount('#app')
