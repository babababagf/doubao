<script setup lang="ts">
import { Lock, Right, User } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import BrandLockup from '@/components/BrandLockup.vue'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const formRef = ref<FormInstance>()
const form = reactive({ username: '', password: '' })

const accountPattern = /^[A-Za-z0-9]{6,12}$/
const rules = reactive<FormRules>({
  username: [
    { required: true, message: '请输入账号', trigger: 'blur' },
    { pattern: accountPattern, message: '账号应为 6～12 位英文或数字', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { pattern: accountPattern, message: '密码应为 6～12 位英文或数字', trigger: 'blur' },
  ],
})

const redirectPath = computed(() =>
  typeof route.query.redirect === 'string' ? route.query.redirect : '/',
)
// 默认开发和生产构建均走真实 API；只有显式 mock 模式才显示演示环境。
const isRealApiMode = import.meta.env.MODE !== 'mock'
const showLocalDemoNote = import.meta.env.DEV

async function submit(): Promise<void> {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  try {
    await authStore.login(form)
    await router.replace(redirectPath.value)
  } catch {
    // Store 已提供对用户安全且可行动的错误文本。
  }
}
</script>

<template>
  <main class="login-page">
    <section class="brand-story" aria-label="产品介绍">
      <BrandLockup logo-url="/brand-mark.svg" nickname="豆包获客" />
      <div class="story-copy">
        <p class="eyebrow">ENTERPRISE CONTENT GROWTH</p>
        <h1>让企业内容<br />形成可验证的增长闭环</h1>
        <p>
          从企业资料、问题词、内容生产，到媒体发布与豆包检测，所有动作围绕同一份真实企业信息展开。
        </p>
      </div>

      <div class="signal-panel">
        <div class="signal-header">
          <span>内容运营原则</span>
          <strong>真实数据优先</strong>
        </div>
        <div class="signal-principles"><span>企业事实统一</span><span>内容版本可追溯</span><span>异常场景人工接管</span></div>
      </div>
    </section>

    <section class="login-card-wrap">
      <div class="login-card">
        <p class="card-kicker">普通商户网页客户端</p>
        <h2>欢迎回来</h2>
        <p class="card-description">请输入商户账号继续访问工作台</p>

        <el-alert
          v-if="authStore.errorMessage"
          :title="authStore.errorMessage"
          type="error"
          show-icon
          :closable="false"
          class="login-alert"
        />

        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
          <el-form-item label="账号" prop="username">
            <el-input v-model="form.username" size="large" autocomplete="username" placeholder="6～12 位英文或数字">
              <template #prefix><el-icon><User /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input v-model="form.password" size="large" type="password" show-password autocomplete="current-password" placeholder="6～12 位英文或数字">
              <template #prefix><el-icon><Lock /></el-icon></template>
            </el-input>
          </el-form-item>

          <el-button native-type="submit" type="primary" size="large" :loading="authStore.loading" class="login-button">
            进入工作台
            <el-icon class="el-icon--right"><Right /></el-icon>
          </el-button>
        </el-form>

        <div v-if="showLocalDemoNote" class="mock-note">
          <span>{{ isRealApiMode ? '本地真实 API' : '本地 Mock' }}</span>
          {{ isRealApiMode ? '演示账号 demo001 / demo123，数据仅保存在本机 PostgreSQL' : '演示账号 demo001 / demo123，不连接真实服务器' }}
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  min-height: 100vh;
  padding: clamp(20px, 3vw, 48px);
  grid-template-columns: minmax(0, 1.15fr) minmax(380px, 0.85fr);
  gap: clamp(24px, 5vw, 96px);
}

.brand-story {
  position: relative;
  display: flex;
  min-height: calc(100vh - 96px);
  flex-direction: column;
  overflow: hidden;
  padding: clamp(28px, 4vw, 64px);
  border: 1px solid var(--color-border);
  border-radius: 24px;
  background:
    radial-gradient(circle at 74% 14%, rgba(95, 95, 255, 0.26), transparent 27%),
    linear-gradient(145deg, rgba(14, 31, 59, 0.96), rgba(4, 13, 29, 0.94));
  box-shadow: var(--shadow-panel);
}

.brand-story::after {
  position: absolute;
  right: -160px;
  bottom: -180px;
  width: 520px;
  height: 520px;
  border: 1px solid rgba(105, 116, 255, 0.25);
  border-radius: 50%;
  box-shadow: 0 0 0 56px rgba(88, 100, 238, 0.035), 0 0 0 112px rgba(88, 100, 238, 0.025);
  content: '';
}

.story-copy {
  position: relative;
  z-index: 1;
  max-width: 690px;
  margin-top: clamp(80px, 14vh, 150px);
}

.eyebrow,
.card-kicker {
  margin: 0 0 18px;
  color: #8c97ff;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.15em;
}

.story-copy h1 {
  margin: 0;
  font-size: clamp(42px, 5vw, 72px);
  font-weight: 660;
  line-height: 1.14;
  letter-spacing: -0.055em;
}

.story-copy > p:last-child {
  max-width: 610px;
  margin: 28px 0 0;
  color: var(--color-text-secondary);
  font-size: 17px;
  line-height: 1.9;
}

.signal-panel {
  position: relative;
  z-index: 1;
  width: min(650px, 92%);
  margin-top: auto;
  padding: 22px 22px 2px;
  border: 1px solid rgba(143, 161, 212, 0.2);
  border-radius: var(--radius-lg);
  background: rgba(7, 17, 38, 0.56);
  backdrop-filter: blur(12px);
}

.signal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--color-text-secondary);
}

.signal-header strong {
  color: var(--color-success);
  font-size: 13px;
}

.signal-principles { display: flex; flex-wrap: wrap; margin-top: 20px; gap: 10px; }
.signal-principles span { padding: 7px 9px; border: 1px solid rgba(133, 149, 223, .28); border-radius: 999px; color: var(--color-text-secondary); background: rgba(74, 88, 176, .12); font-size: 12px; }

.login-card-wrap {
  display: grid;
  place-items: center;
}

.login-card {
  width: min(440px, 100%);
  padding: clamp(30px, 4vw, 48px);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  background: rgba(9, 21, 41, 0.86);
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(18px);
}

.login-card h2 {
  margin: 0;
  font-size: 34px;
  font-weight: 650;
  letter-spacing: -0.035em;
}

.card-description {
  margin: 10px 0 30px;
  color: var(--color-text-secondary);
}

.login-alert {
  margin-bottom: 20px;
}

.login-button {
  width: 100%;
  min-height: 46px;
  margin-top: 8px;
  border: 0;
  background: var(--gradient-primary);
  box-shadow: 0 12px 30px rgba(82, 91, 235, 0.24);
}

.mock-note {
  margin-top: 26px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.7;
}

.mock-note span {
  margin-right: 8px;
  padding: 3px 7px;
  border: 1px solid rgba(91, 99, 255, 0.3);
  border-radius: 5px;
  color: #aeb3ff;
  background: rgba(91, 99, 255, 0.1);
}

:deep(.el-form-item__label) {
  color: var(--color-text-secondary);
}

:deep(.el-input__wrapper) {
  min-height: 46px;
  border: 1px solid var(--color-border);
  background: rgba(4, 12, 27, 0.72);
  box-shadow: none;
}

:deep(.el-input__wrapper.is-focus) {
  border-color: rgba(111, 121, 255, 0.8);
  box-shadow: var(--shadow-focus);
}

@media (max-width: 980px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .brand-story {
    min-height: 460px;
  }

  .story-copy {
    margin-top: 70px;
  }

  .signal-panel {
    display: none;
  }
}

@media (max-width: 560px) {
  .login-page {
    padding: 12px;
  }

  .brand-story {
    min-height: 340px;
    padding: 26px;
  }

  .story-copy {
    margin-top: 52px;
  }

  .story-copy h1 {
    font-size: 38px;
  }
}

/* 与商户后台一致的浅色蓝紫登录入口。 */
.login-page {
  padding: clamp(18px, 3vw, 42px);
  background: #f1f4f9;
}

.brand-story {
  border: 0;
  border-radius: 12px;
  color: #ffffff;
  background:
    radial-gradient(circle at 78% 18%, rgba(255, 255, 255, 0.18), transparent 28%),
    linear-gradient(140deg, #6f67e8 0%, #4c73ef 100%);
  box-shadow: 0 16px 42px rgba(74, 90, 184, 0.18);
}

.brand-story::after {
  border-color: rgba(255, 255, 255, 0.17);
  box-shadow: 0 0 0 56px rgba(255, 255, 255, 0.035), 0 0 0 112px rgba(255, 255, 255, 0.025);
}

.brand-story .eyebrow,
.story-copy > p:last-child,
.signal-header,
.signal-principles span {
  color: rgba(255, 255, 255, 0.84);
}

.signal-panel {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.1);
}

.signal-header strong {
  color: #d7ffef;
}

.signal-principles span {
  border-color: rgba(255, 255, 255, 0.24);
  background: rgba(255, 255, 255, 0.08);
}

.login-card {
  border-color: #e3e7ef;
  border-radius: 12px;
  color: var(--color-text);
  background: #ffffff;
  box-shadow: 0 12px 36px rgba(34, 48, 78, 0.1);
  backdrop-filter: none;
}

.card-kicker {
  color: #6671df;
}

.mock-note span {
  border-color: #d9ddfa;
  color: #626bda;
  background: #f1f3ff;
}

:deep(.el-form-item__label) {
  color: #4f5969;
}

:deep(.el-input__wrapper) {
  border-color: #dfe3eb;
  background: #ffffff;
}

:deep(.el-input__wrapper.is-focus) {
  border-color: #6e7aed;
}
</style>
