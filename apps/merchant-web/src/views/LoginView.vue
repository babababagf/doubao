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

const loginUsernamePattern = /^[A-Za-z0-9]{5,12}$/
const passwordPattern = /^[A-Za-z0-9]{6,12}$/
const rules = reactive<FormRules>({
  username: [
    { required: true, message: '请输入账号', trigger: 'blur' },
    { pattern: loginUsernamePattern, message: '账号应为 5～12 位英文或数字', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { pattern: passwordPattern, message: '密码应为 6～12 位英文或数字', trigger: 'blur' },
  ],
})

const redirectPath = computed(() =>
  typeof route.query.redirect === 'string' ? route.query.redirect : '/',
)

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
      <BrandLockup logo-url="/brand-mark.svg" nickname="星枢豆包获客" />
      <div class="story-copy">
        <p class="eyebrow">企业内容与媒体发布工作台</p>
        <h1>让企业内容<br />持续转化为增长</h1>
        <p>
          从企业资料、问题词、内容生产，到媒体发布与效果追踪，所有动作围绕同一份真实企业信息展开。
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
        <p class="card-kicker">星枢豆包获客 · 企业工作台</p>
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
            <el-input v-model="form.username" aria-label="账号" size="large" autocomplete="username" placeholder="5～12 位英文或数字">
              <template #prefix><el-icon><User /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input v-model="form.password" aria-label="密码" size="large" type="password" show-password autocomplete="current-password" placeholder="6～12 位英文或数字">
              <template #prefix><el-icon><Lock /></el-icon></template>
            </el-input>
          </el-form-item>

          <el-button native-type="submit" type="primary" size="large" :loading="authStore.loading" class="login-button">
            进入工作台
            <el-icon class="el-icon--right"><Right /></el-icon>
          </el-button>
        </el-form>
        <div class="login-security" aria-label="安全说明">
          <span>登录会话安全保护</span>
          <span>企业数据独立隔离</span>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
/* ==========================================================================
   登录页 · 轻蓝专业风
   浅色品牌区（业务插画）+ 白色表单卡，表单为首要任务
   ========================================================================== */

.login-page {
  position: relative;
  display: grid;
  min-height: 100vh;
  padding: clamp(14px, 2vw, 28px);
  background:
    radial-gradient(circle at 88% -10%, rgba(37, 99, 235, 0.07), transparent 32%),
    var(--color-canvas);
  grid-template-columns: minmax(0, 1.15fr) minmax(380px, 0.85fr);
  gap: clamp(16px, 2.4vw, 36px);
}

.brand-story,
.login-card-wrap {
  position: relative;
  min-width: 0;
}

.brand-story {
  position: relative;
  display: flex;
  min-height: calc(100vh - clamp(28px, 4vw, 56px));
  flex-direction: column;
  overflow: hidden;
  padding: clamp(28px, 3.6vw, 56px);
  border: 1px solid var(--color-border);
  border-radius: 18px;
  color: var(--color-text);
  background:
    linear-gradient(100deg, rgba(255, 255, 255, 0.99) 0%, rgba(244, 249, 255, 0.94) 46%, rgba(232, 242, 254, 0.6) 76%, rgba(226, 239, 253, 0.25) 100%),
    url('/home/home-banner.png') 78% center / cover no-repeat,
    #eef4fd;
  box-shadow: var(--shadow-panel);
}

.brand-story :deep(.brand-mark) {
  border-color: rgba(255, 255, 255, 0.55);
  box-shadow: 0 6px 14px rgba(37, 99, 235, 0.22);
}

.story-copy {
  position: relative;
  max-width: 560px;
  margin-top: clamp(64px, 12vh, 128px);
}

.eyebrow,
.card-kicker {
  margin: 0 0 14px;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.05em;
}

.eyebrow {
  color: var(--color-primary);
}

.story-copy h1 {
  margin: 0;
  color: #13273f;
  font-size: clamp(32px, 3.6vw, 50px);
  font-weight: 750;
  line-height: 1.16;
  letter-spacing: -0.045em;
}

.story-copy > p:last-child {
  max-width: 520px;
  margin: 20px 0 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.85;
}

.signal-panel {
  position: relative;
  width: min(560px, 96%);
  margin-top: auto;
  padding: 14px 18px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 8px 22px rgba(43, 86, 147, 0.08);
  backdrop-filter: blur(10px);
}

.signal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.signal-header strong {
  color: var(--color-success);
  font-size: 12px;
}

.signal-principles {
  display: flex;
  flex-wrap: wrap;
  margin-top: 12px;
  gap: 8px;
}

.signal-principles span {
  padding: 5px 10px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-secondary);
  background: #ffffff;
  font-size: 11px;
}

.login-card-wrap {
  display: grid;
  place-items: center;
}

.login-card {
  width: min(430px, 100%);
  padding: clamp(30px, 3.4vw, 44px);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  color: var(--color-text);
  background: #ffffff;
  box-shadow: 0 18px 48px rgba(31, 60, 105, 0.1);
}

.card-kicker {
  color: var(--color-primary);
}

.login-card h2 {
  margin: 0;
  color: #13273f;
  font-size: 28px;
  font-weight: 730;
  letter-spacing: -0.035em;
}

.card-description {
  margin: 9px 0 26px;
  color: var(--color-text-muted);
  font-size: 13px;
}

.login-alert {
  margin-bottom: 18px;
}

.login-button {
  width: 100%;
  min-height: 46px;
  margin-top: 8px;
  border: 0;
  border-radius: 9px;
  background: var(--gradient-primary);
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.22);
  font-weight: 650;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}

.login-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 26px rgba(37, 99, 235, 0.28);
}

:deep(.el-form-item__label) {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

:deep(.el-input__wrapper) {
  min-height: 46px;
  border: 1px solid var(--color-border-strong);
  border-radius: 9px;
  background: #fbfcfe;
  box-shadow: none;
}

:deep(.el-input__wrapper.is-focus) {
  border-color: #5b93f0;
  box-shadow: var(--shadow-focus);
}

.login-security {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 20px;
  color: var(--color-text-muted);
  font-size: 11px;
  gap: 18px;
}

.login-security span {
  position: relative;
  padding-left: 12px;
}

.login-security span::before {
  position: absolute;
  top: 50%;
  left: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-success);
  content: '';
  transform: translateY(-50%);
}

@media (max-width: 980px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .brand-story {
    min-height: 380px;
  }

  .story-copy {
    margin-top: 56px;
  }

  .signal-panel {
    display: none;
  }

  .login-card-wrap {
    padding: 8px 0 32px;
  }
}

@media (max-width: 560px) {
  .login-page {
    padding: 0;
    gap: 0;
  }

  .brand-story {
    min-height: 300px;
    padding: 22px;
    border: 0;
    border-radius: 0;
  }

  .story-copy {
    margin-top: 40px;
  }

  .story-copy h1 {
    font-size: 30px;
  }

  .story-copy > p:last-child {
    margin-top: 14px;
    font-size: 12px;
    line-height: 1.7;
  }

  .login-card-wrap {
    padding: 20px 12px 30px;
  }

  .login-card {
    padding: 26px 20px;
    border-radius: 14px;
  }

  .login-security {
    align-items: flex-start;
    flex-direction: column;
    gap: 7px;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .brand-story {
    animation: login-story-enter 320ms cubic-bezier(.2, .72, .2, 1) both;
  }

  .login-card {
    animation: login-card-enter 320ms 60ms cubic-bezier(.2, .72, .2, 1) both;
  }

  @keyframes login-story-enter {
    from { opacity: 0; transform: translateX(-8px); }
    to { opacity: 1; transform: translateX(0); }
  }

  @keyframes login-card-enter {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
}
</style>
