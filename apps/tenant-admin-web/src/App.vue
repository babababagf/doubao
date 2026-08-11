<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import {
  ApiError,
  bootstrap,
  createAgent,
  createDoubaoCheck,
  createMerchant,
  createProviderConfig,
  getObjectStorageConfig,
  listAgents,
  listDoubaoChecks,
  listDoubaoCheckFailures,
  listMerchants,
  listProviderConfigs,
  login,
  logout,
  removeObjectStorageConfig,
  removeProviderConfig,
  saveObjectStorageConfig,
  setObjectStorageEnabled,
  setProviderEnabled,
  retryDoubaoCheckFailures,
  testObjectStorageConfig,
  testProviderConfig,
  updateChildStatus,
  updateProviderConfig,
  type AgentForm,
  type Bootstrap,
  type ChildAccount,
  type DoubaoCheckBatch,
  type DoubaoCheckFailure,
  type MerchantForm,
  type ObjectStorageConfig,
  type ObjectStorageForm,
  type ProviderConfig,
  type ProviderForm,
} from "./services/tenant-admin";

type Screen =
  | "overview"
  | "agents"
  | "merchants"
  | "create-agent"
  | "create-merchant"
  | "providers"
  | "storage"
  | "doubao-checks";
const authenticated = ref(
  sessionStorage.getItem("doubao.tenant.authenticated") === "1",
);
const loading = ref(false);
const saving = ref(false);
const activeScreen = ref<Screen>("overview");
const error = ref("");
const notice = ref("");
const data = ref<Bootstrap | null>(null);
const agents = ref<ChildAccount[]>([]);
const merchants = ref<ChildAccount[]>([]);
const providers = ref<ProviderConfig[]>([]);
const storage = ref<ObjectStorageConfig | null>(null);
const doubaoChecks = ref<DoubaoCheckBatch[]>([]);
const selectedDoubaoFailures = ref<DoubaoCheckFailure[]>([]);
const selectedDoubaoFailureBatchId = ref<string | null>(null);
const doubaoFailureBusyId = ref<string | null>(null);
const doubaoRetryBusyId = ref<string | null>(null);
const statusBusyId = ref<string | null>(null);
const providerBusyId = ref<string | null>(null);
const editingProviderId = ref<string | null>(null);
const loginForm = reactive({ username: "", password: "" });
const agentForm = reactive<AgentForm>({
  username: "",
  password: "",
  companyName: "",
  merchantLimit: 10,
  computePoints: 1000,
  writingLimit: 30,
  primaryDomain: "",
  expiresAt: "2027-08-07T00:00",
});
const merchantForm = reactive<MerchantForm>({
  username: "",
  password: "",
  companyName: "",
  keywordLimit: 50,
  computePoints: 1000,
  writingLimit: 30,
  primaryDomain: "",
  expiresAt: "2027-08-07T00:00",
});
const providerForm = reactive<ProviderForm>({
  alias: "",
  platform: "deepseek",
  protocol: "chat_completions",
  baseUrl: "",
  modelName: "",
  apiKey: "",
  supportsWriting: true,
  supportsDoubaoCheck: false,
  supportsWebSearch: false,
});
const storageForm = reactive<ObjectStorageForm>({
  region: "oss-cn-hangzhou",
  bucket: "",
  cdnBaseUrl: "",
  accessKeyId: "",
  accessKeySecret: "",
});
const doubaoForm = reactive({
  scope: "single" as "single" | "all",
  merchantId: "",
});

const isWhiteLabel = computed(() => data.value?.account.role === "white_label");
const title = computed(() => data.value?.brand.nickname ?? "豆包获客");
const brandLogo = computed(() => data.value?.brand.logoUrl.trim() || "/brand-mark.svg");
const accountRole = computed(() =>
  isWhiteLabel.value ? "贴牌管理端" : "代理管理端",
);
const currentList = computed(() =>
  activeScreen.value === "agents" ? agents.value : merchants.value,
);
function readableError(reason: unknown): string {
  return reason instanceof ApiError
    ? reason.message
    : "网络或服务暂不可用，请稍后重试";
}
function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
function quotaPercent(used: number, limit: number): string {
  return `${Math.min(limit ? (used / limit) * 100 : 0, 100)}%`;
}
function rowStatus(item: ChildAccount): string {
  return item.status === "active"
    ? "正常"
    : item.status === "disabled"
      ? "已停用"
      : "已到期";
}
function providerTestHint(item: ProviderConfig): string | null {
  if (item.lastTestStatus !== "failed") return null;
  if (item.lastTestError === "WEB_SEARCH_TOOL_NOT_OPEN")
    return "联网搜索插件未开通，请在方舟控制台开通后重新测试。";
  if (item.lastTestError === "RESPONSE_TEXT_MISSING")
    return "模型未返回可用正文，请检查模型能力和接口配置。";
  if (item.lastTestError === "WEB_SEARCH_NOT_USED")
    return "模型未实际执行联网搜索，不能用于豆包检测。";
  if (item.lastTestError === "WEB_SEARCH_SOURCE_MISSING")
    return "模型未返回可核验来源，不能用于豆包检测。";
  return item.lastTestError
    ? `测试错误：${item.lastTestError}`
    : "测试失败，请检查模型、密钥和网络配置。";
}

async function refresh(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    const boot = await bootstrap();
    data.value = boot;
    const [merchantRows, agentRows, providerRows, storageRow, checkRows] =
      await Promise.all([
        listMerchants(),
        boot.capabilities.canCreateAgent ? listAgents() : Promise.resolve([]),
        boot.capabilities.canManageProviders
          ? listProviderConfigs()
          : Promise.resolve([]),
        boot.capabilities.canManageObjectStorage
          ? getObjectStorageConfig()
          : Promise.resolve(null),
        boot.capabilities.canRunDoubaoChecks
          ? listDoubaoChecks()
          : Promise.resolve([]),
      ]);
    merchants.value = merchantRows;
    agents.value = agentRows;
    providers.value = providerRows;
    storage.value = storageRow;
    doubaoChecks.value = checkRows;
    document.title = `${boot.brand.nickname} · ${boot.account.role === "white_label" ? "贴牌管理端" : "代理管理端"}`;
  } catch (reason) {
    error.value = readableError(reason);
    if (reason instanceof ApiError && reason.status === 401)
      authenticated.value = false;
  } finally {
    loading.value = false;
  }
}

async function submitLogin(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    await login(loginForm.username, loginForm.password);
    authenticated.value = true;
    sessionStorage.setItem("doubao.tenant.authenticated", "1");
    await refresh();
  } catch (reason) {
    error.value = readableError(reason);
  } finally {
    loading.value = false;
  }
}
function validCredentials(username: string, password: string): boolean {
  return (
    /^[a-zA-Z0-9]{6,12}$/.test(username) && /^[a-zA-Z0-9]{6,12}$/.test(password)
  );
}
async function submitAgent(): Promise<void> {
  if (!validCredentials(agentForm.username, agentForm.password)) {
    error.value = "账号和密码必须为 6-12 位英文或数字";
    return;
  }
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    await createAgent({ ...agentForm });
    notice.value = "代理账户已开通，额度和商户席位已从贴牌可用资源中划拨。";
    Object.assign(agentForm, {
      username: "",
      password: "",
      companyName: "",
      merchantLimit: 10,
      computePoints: 1000,
      writingLimit: 30,
      primaryDomain: "",
      expiresAt: "2027-08-07T00:00",
    });
    activeScreen.value = "agents";
    await refresh();
  } catch (reason) {
    error.value = readableError(reason);
  } finally {
    saving.value = false;
  }
}
async function submitMerchant(): Promise<void> {
  if (!validCredentials(merchantForm.username, merchantForm.password)) {
    error.value = "账号和密码必须为 6-12 位英文或数字";
    return;
  }
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    await createMerchant({ ...merchantForm });
    notice.value = "普通商户已开通，域名如已填写将保持待验证状态。";
    Object.assign(merchantForm, {
      username: "",
      password: "",
      companyName: "",
      keywordLimit: 50,
      computePoints: 1000,
      writingLimit: 30,
      primaryDomain: "",
      expiresAt: "2027-08-07T00:00",
    });
    activeScreen.value = "merchants";
    await refresh();
  } catch (reason) {
    error.value = readableError(reason);
  } finally {
    saving.value = false;
  }
}
async function toggleStatus(item: ChildAccount): Promise<void> {
  if (item.status === "expired") return;
  const next = item.status === "active" ? "disabled" : "active";
  const message =
    next === "disabled"
      ? `停用“${item.companyName}”会撤销该账户及其下级会话，不会返还额度。确定继续吗？`
      : `重新启用“${item.companyName}”后，用户仍需重新登录。确定继续吗？`;
  if (!window.confirm(message)) return;
  statusBusyId.value = item.id;
  error.value = "";
  notice.value = "";
  try {
    await updateChildStatus(item.id, next);
    notice.value =
      next === "disabled"
        ? "账户已停用，相关会话已撤销。"
        : "账户已重新启用，用户需要重新登录。";
    await refresh();
  } catch (reason) {
    error.value = readableError(reason);
  } finally {
    statusBusyId.value = null;
  }
}
function resetProviderForm(): void {
  editingProviderId.value = null;
  Object.assign(providerForm, {
    alias: "",
    platform: "deepseek",
    protocol: "chat_completions",
    baseUrl: "",
    modelName: "",
    apiKey: "",
    supportsWriting: true,
    supportsDoubaoCheck: false,
    supportsWebSearch: false,
  });
}
function editProvider(item: ProviderConfig): void {
  editingProviderId.value = item.id;
  Object.assign(providerForm, {
    alias: item.alias,
    platform: item.platform as ProviderForm["platform"],
    protocol: item.protocol as ProviderForm["protocol"],
    baseUrl: item.baseUrl,
    modelName: item.modelName,
    apiKey: "",
    supportsWriting: item.supportsWriting,
    supportsDoubaoCheck: item.supportsDoubaoCheck,
    supportsWebSearch: item.supportsWebSearch,
  });
  error.value = "";
  notice.value = "";
}
async function submitProvider(): Promise<void> {
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    if (editingProviderId.value) {
      await updateProviderConfig(editingProviderId.value, { ...providerForm });
      notice.value = "模型配置已更新并停用，请重新测试成功后再启用。";
    } else {
      await createProviderConfig({ ...providerForm });
      notice.value = "模型配置已加密保存，请先执行测试，成功后才能启用。";
    }
    resetProviderForm();
    await refresh();
  } catch (reason) {
    error.value = readableError(reason);
  } finally {
    saving.value = false;
  }
}
async function runProviderAction(
  item: ProviderConfig,
  action: "test" | "toggle" | "remove",
): Promise<void> {
  if (
    action === "remove" &&
    !window.confirm(
      `删除“${item.alias}”将移除保存的加密凭证，无法恢复。确定继续吗？`,
    )
  )
    return;
  providerBusyId.value = item.id;
  error.value = "";
  notice.value = "";
  try {
    if (action === "test") {
      await testProviderConfig(item.id);
      notice.value = "测试完成，请查看结果状态。";
    } else if (action === "toggle") {
      await setProviderEnabled(item.id, !item.enabled);
      notice.value = item.enabled ? "配置已停用。" : "配置已启用。";
    } else {
      await removeProviderConfig(item.id);
      notice.value = "配置已删除。";
    }
    await refresh();
  } catch (reason) {
    error.value = readableError(reason);
  } finally {
    providerBusyId.value = null;
  }
}
async function submitStorage(): Promise<void> {
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    await saveObjectStorageConfig({ ...storageForm });
    notice.value = "OSS 配置已加密保存，旧配置已停用，请先执行测试。";
    Object.assign(storageForm, {
      region: storageForm.region,
      bucket: "",
      cdnBaseUrl: "",
      accessKeyId: "",
      accessKeySecret: "",
    });
    await refresh();
  } catch (reason) {
    error.value = readableError(reason);
  } finally {
    saving.value = false;
  }
}
async function runStorageAction(
  action: "test" | "toggle" | "remove",
): Promise<void> {
  if (!storage.value) return;
  if (
    action === "remove" &&
    !window.confirm("删除 OSS 配置会移除保存的加密凭证，无法恢复。确定继续吗？")
  )
    return;
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    if (action === "test") {
      await testObjectStorageConfig();
      notice.value = "测试完成，请查看结果状态。";
    } else if (action === "toggle") {
      await setObjectStorageEnabled(!storage.value.enabled);
      notice.value = storage.value.enabled
        ? "OSS 配置已停用。"
        : "OSS 配置已启用。";
    } else {
      await removeObjectStorageConfig();
      notice.value = "OSS 配置已删除。";
    }
    await refresh();
  } catch (reason) {
    error.value = readableError(reason);
  } finally {
    saving.value = false;
  }
}
async function submitDoubaoCheck(): Promise<void> {
  if (doubaoForm.scope === "single" && !doubaoForm.merchantId) {
    error.value = "请选择需要检测的普通商户";
    return;
  }
  if (
    doubaoForm.scope === "all" &&
    !window.confirm(
      "将检测全部有效商户的启用问题词，并由本贴牌承担第三方接口费用。确认继续吗？",
    )
  )
    return;
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    const task = await createDoubaoCheck(
      doubaoForm.scope === "all"
        ? { all: true, confirmedAll: true }
        : { merchantId: doubaoForm.merchantId },
    );
    notice.value = `检测批次已创建，共 ${task.totalCount} 个问题词，正在后台执行。`;
    await refresh();
  } catch (reason) {
    error.value = readableError(reason);
  } finally {
    saving.value = false;
  }
}
async function toggleDoubaoFailures(item: DoubaoCheckBatch): Promise<void> {
  if (selectedDoubaoFailureBatchId.value === item.id) {
    selectedDoubaoFailureBatchId.value = null;
    selectedDoubaoFailures.value = [];
    return;
  }
  doubaoFailureBusyId.value = item.id;
  error.value = "";
  try {
    selectedDoubaoFailures.value = await listDoubaoCheckFailures(item.id);
    selectedDoubaoFailureBatchId.value = item.id;
  } catch (reason) {
    error.value = readableError(reason);
  } finally {
    doubaoFailureBusyId.value = null;
  }
}
async function retryDoubaoFailures(item: DoubaoCheckBatch): Promise<void> {
  if (
    !window.confirm(
      `将创建一个新批次，仅重试当前批次失败的 ${item.failedCount} 个问题词，并使用当前已启用的检测模型。确认继续吗？`,
    )
  )
    return;
  doubaoRetryBusyId.value = item.id;
  error.value = "";
  notice.value = "";
  try {
    const batch = await retryDoubaoCheckFailures(item.id);
    notice.value = `失败项重试批次已创建，共 ${batch.totalCount} 个问题词，正在后台执行。`;
    selectedDoubaoFailureBatchId.value = null;
    selectedDoubaoFailures.value = [];
    await refresh();
  } catch (reason) {
    error.value = readableError(reason);
  } finally {
    doubaoRetryBusyId.value = null;
  }
}
async function signOut(): Promise<void> {
  await logout().catch(() => undefined);
  authenticated.value = false;
  loginForm.username = "";
  loginForm.password = "";
  error.value = "";
  notice.value = "";
  data.value = null;
  agents.value = [];
  merchants.value = [];
  providers.value = [];
  storage.value = null;
  sessionStorage.removeItem("doubao.tenant.authenticated");
}
function navigate(screen: Screen): void {
  activeScreen.value = screen;
  error.value = "";
  notice.value = "";
}
function fallbackBrandLogo(event: Event): void {
  const image = event.currentTarget;
  if (!(image instanceof HTMLImageElement) || image.getAttribute("src") === "/brand-mark.svg") return;
  image.src = "/brand-mark.svg";
}
onMounted(() => {
  if (authenticated.value) void refresh();
});
</script>

<template>
  <main v-if="!authenticated" class="login-shell">
    <section class="login-card" aria-labelledby="login-title">
      <div class="brand"><img class="brand-logo" src="/brand-mark.svg" alt="" /> 豆包获客</div>
      <p class="eyebrow">TENANT ADMINISTRATION</p>
      <h1 id="login-title">贴牌 / 代理管理端</h1>
      <p>使用贴牌或代理账户登录；系统根据权限自动展示可操作菜单。</p>
      <form @submit.prevent="submitLogin">
        <label
          >账号<input
            v-model.trim="loginForm.username"
            autocomplete="username"
            placeholder="6-12 位英文或数字"
            required /></label
        ><label
          >密码<input
            v-model="loginForm.password"
            type="password"
            autocomplete="current-password"
            placeholder="6-12 位英文或数字"
            required
        /></label>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="primary" :disabled="loading">
          {{ loading ? "正在验证…" : "安全登录" }}
        </button>
      </form>
    </section>
  </main>

  <main v-else class="shell">
    <aside class="sidebar">
      <div class="brand"><img class="brand-logo" :src="brandLogo" alt="" @error="fallbackBrandLogo" /> {{ title }}</div>
      <p class="role-tag"><i></i> {{ accountRole }}</p>
      <nav aria-label="管理端导航">
        <button
          :class="{ active: activeScreen === 'overview' }"
          @click="navigate('overview')"
        >
          控制台</button
        ><button
          v-if="isWhiteLabel"
          :class="{ active: activeScreen === 'agents' }"
          @click="navigate('agents')"
        >
          代理账户</button
        ><button
          :class="{ active: activeScreen === 'merchants' }"
          @click="navigate('merchants')"
        >
          普通商户</button
        ><button
          v-if="isWhiteLabel"
          :class="{ active: activeScreen === 'create-agent' }"
          @click="navigate('create-agent')"
        >
          开通代理</button
        ><button
          :class="{ active: activeScreen === 'create-merchant' }"
          @click="navigate('create-merchant')"
        >
          开通商户</button
        ><button
          v-if="isWhiteLabel"
          :class="{ active: activeScreen === 'providers' }"
          @click="navigate('providers')"
        >
          大模型 API</button
        ><button
          v-if="isWhiteLabel"
          :class="{ active: activeScreen === 'storage' }"
          @click="navigate('storage')"
        >
          云存储配置</button
        ><button
          v-if="isWhiteLabel"
          :class="{ active: activeScreen === 'doubao-checks' }"
          @click="navigate('doubao-checks')"
        >
          豆包检测
        </button>
      </nav>
      <div class="side-account">
        <b>{{ data?.account.companyName }}</b
        ><span>到期 {{ data ? formatDate(data.account.expiresAt) : "—" }}</span
        ><button @click="signOut">退出登录</button>
      </div>
    </aside>

    <section class="workspace" :aria-busy="loading">
      <header class="topbar">
        <div>
          <p class="eyebrow">
            {{ isWhiteLabel ? "WHITE LABEL OPERATIONS" : "AGENT OPERATIONS" }}
          </p>
          <h1>
            {{
              activeScreen === "overview"
                ? "资源控制台"
                : activeScreen === "agents"
                  ? "代理账户"
                  : activeScreen === "merchants"
                    ? "普通商户"
                    : activeScreen === "create-agent"
                      ? "开通代理"
                      : activeScreen === "create-merchant"
                        ? "开通普通商户"
                        : activeScreen === "providers"
                          ? "大模型 API"
                          : activeScreen === "storage"
                            ? "云存储配置"
                            : "豆包检测"
            }}
          </h1>
        </div>
        <button class="ghost" :disabled="loading" @click="refresh">
          {{ loading ? "刷新中…" : "刷新数据" }}
        </button>
      </header>
      <p v-if="error" class="banner error" role="alert">{{ error }}</p>
      <p v-if="notice" class="banner success">{{ notice }}</p>

      <template v-if="activeScreen === 'overview' && data">
        <section class="metrics">
          <article>
            <span>可用算力点</span
            ><strong>{{
              data.entitlements.computePoints.toLocaleString()
            }}</strong
            ><small>向下分配后实时减少</small>
          </article>
          <article>
            <span>剩余写作篇数</span
            ><strong>{{ data.entitlements.writingRemaining }}</strong
            ><small>成功生成文章时扣减</small>
          </article>
          <article>
            <span>已开通商户</span
            ><strong
              >{{ data.entitlements.merchantUsage }} /
              {{ data.entitlements.merchantLimit }}</strong
            ><small>已预留 {{ data.entitlements.merchantReserved }} 席位</small>
          </article>
          <article v-if="isWhiteLabel">
            <span>代理席位</span
            ><strong
              >{{ data.entitlements.agentUsage }} /
              {{ data.entitlements.agentLimit }}</strong
            ><small>仅贴牌可开代理</small>
          </article>
        </section>
        <section class="allocation-panel">
          <div>
            <p class="eyebrow">ALLOCATION STATUS</p>
            <h2>可分配资源</h2>
            <p>
              商户数按真实开户统计；进度条按已预留容量统计。开户时服务端会二次校验席位、算力、写作篇数和到期时间。
            </p>
          </div>
          <div class="bars">
            <label
              >商户已预留
              <b
                >{{ data.entitlements.merchantReserved }} /
                {{ data.entitlements.merchantLimit }}</b
              ><i
                ><em
                  :style="{
                    width: quotaPercent(
                      data.entitlements.merchantReserved,
                      data.entitlements.merchantLimit,
                    ),
                  }"
                ></em></i></label
            ><label v-if="isWhiteLabel"
              >代理席位
              <b
                >{{ data.entitlements.agentUsage }} /
                {{ data.entitlements.agentLimit }}</b
              ><i class="violet"
                ><em
                  :style="{
                    width: quotaPercent(
                      data.entitlements.agentUsage,
                      data.entitlements.agentLimit,
                    ),
                  }"
                ></em></i
            ></label>
          </div>
        </section>
        <section class="quick-actions">
          <button
            v-if="isWhiteLabel"
            class="action-card"
            @click="navigate('create-agent')"
          >
            <b>01</b><span>开通代理</span
            ><small>划拨商户席位、算力与写作篇数</small></button
          ><button class="action-card" @click="navigate('create-merchant')">
            <b>02</b><span>开通普通商户</span
            ><small>设置关键词、算力、写作篇数与期限</small></button
          ><button class="action-card" @click="navigate('merchants')">
            <b>03</b><span>查看商户</span><small>查看下级账户与启停状态</small>
          </button>
        </section>
      </template>

      <template
        v-else-if="activeScreen === 'agents' || activeScreen === 'merchants'"
      >
        <section class="list-head">
          <p>
            {{
              activeScreen === "agents"
                ? "贴牌可创建和管理直属代理；代理端不具备该功能。"
                : isWhiteLabel
                  ? "显示本贴牌直属及代理名下商户；代理仅显示自己创建的商户。"
                  : "仅显示并管理自己创建的普通商户。"
            }}
          </p>
          <button
            class="primary"
            @click="
              navigate(
                activeScreen === 'agents' ? 'create-agent' : 'create-merchant',
              )
            "
          >
            {{ activeScreen === "agents" ? "开通代理" : "开通商户" }}
          </button>
        </section>
        <section class="account-list">
          <div v-if="!loading && currentList.length === 0" class="empty">
            暂无账户。
          </div>
          <article
            v-for="item in currentList"
            :key="item.id"
            class="account-row"
          >
            <div class="account-title">
              <span :class="['kind', item.kind]">{{
                item.kind === "agent" ? "代理" : "商户"
              }}</span>
              <div>
                <h3>{{ item.companyName }}</h3>
                <p>
                  {{ item.username }} · 到期 {{ formatDate(item.expiresAt) }}
                </p>
              </div>
            </div>
            <div>
              <span>上级</span><b>{{ item.parentName }}</b>
            </div>
            <div>
              <span>算力 / 写作</span
              ><b
                >{{ item.computePoints.toLocaleString() }} /
                {{ item.writingRemaining }}</b
              >
            </div>
            <div v-if="item.kind === 'merchant'">
              <span>关键词上限</span><b>{{ item.keywordLimit }}</b>
            </div>
            <div v-if="item.kind === 'merchant'">
              <span>检测 / 收录</span><b>{{ item.doubaoCheckedCount }} / {{ item.doubaoIncludedCount }}</b><small v-if="item.latestDoubaoCheckedAt">最新 {{ formatDate(item.latestDoubaoCheckedAt) }}</small>
            </div>
            <div class="status">
              <b :class="item.status">{{ rowStatus(item) }}</b
              ><button
                v-if="item.status !== 'expired'"
                class="text-button"
                :disabled="statusBusyId === item.id"
                @click="toggleStatus(item)"
              >
                {{
                  statusBusyId === item.id
                    ? "处理中…"
                    : item.status === "active"
                      ? "停用"
                      : "启用"
                }}
              </button>
            </div>
          </article>
        </section>
      </template>

      <section v-else-if="activeScreen === 'providers'" class="providers-panel">
        <div class="provider-intro">
          <p class="eyebrow">ENCRYPTED PROVIDERS</p>
          <h2>贴牌自备模型接口</h2>
          <p>
            保存后只显示掩码。测试成功才能启用；代理和商户仅继承可用状态，不会得到永久
            Key。启用新配置时，系统会停用用途重叠的旧配置。
          </p>
        </div>
        <section class="provider-list">
          <div v-if="providers.length === 0" class="empty">暂无模型配置。</div>
          <article
            v-for="item in providers"
            :key="item.id"
            class="provider-row"
          >
            <div>
              <h3>{{ item.alias }}</h3>
              <p>
                {{ item.platform }} · {{ item.protocol }} · {{ item.modelName }}
              </p>
            </div>
            <div>
              <span>Key 掩码</span><b>{{ item.keyMask }}</b>
            </div>
            <div>
              <span>测试状态</span
              ><b :class="item.lastTestStatus">{{
                item.lastTestStatus === "succeeded"
                  ? "成功"
                  : item.lastTestStatus === "failed"
                    ? "失败"
                    : "未测试"
              }}</b>
              <small v-if="providerTestHint(item)" class="provider-test-error">{{
                providerTestHint(item)
              }}</small>
            </div>
            <div>
              <span>启用状态</span
              ><b :class="{ enabled: item.enabled }">{{
                item.enabled ? "已启用" : "未启用"
              }}</b>
            </div>
            <div class="provider-actions">
              <button
                class="ghost"
                :disabled="providerBusyId === item.id"
                @click="editProvider(item)"
              >
                编辑
              </button>
              <button
                class="ghost"
                :disabled="providerBusyId === item.id"
                @click="runProviderAction(item, 'test')"
              >
                测试</button
              ><button
                class="ghost"
                :disabled="providerBusyId === item.id"
                @click="runProviderAction(item, 'toggle')"
              >
                {{ item.enabled ? "停用" : "启用" }}</button
              ><button
                class="danger"
                :disabled="providerBusyId === item.id"
                @click="runProviderAction(item, 'remove')"
              >
                删除
              </button>
            </div>
          </article>
        </section>
        <form class="provider-form" @submit.prevent="submitProvider">
          <p v-if="editingProviderId" class="form-tip wide">
            正在编辑配置。API Key 留空将保留现有加密密钥；保存后配置会停用并要求重新测试。
          </p>
          <label
            >别名<input
              v-model.trim="providerForm.alias"
              maxlength="40"
              required /></label
          ><label
            >平台<select v-model="providerForm.platform">
              <option value="deepseek">DeepSeek 官方</option>
              <option value="volcengine_ark">火山方舟</option>
              <option value="custom_openai">自定义 OpenAI 兼容</option>
            </select></label
          ><label
            >协议<select v-model="providerForm.protocol">
              <option value="chat_completions">Chat Completions</option>
              <option value="responses">Responses API</option>
            </select></label
          ><label
            >模型名称<input
              v-model.trim="providerForm.modelName"
              required /></label
          ><label v-if="providerForm.platform === 'custom_openai'" class="wide"
            >自定义 HTTPS 地址<input
              v-model.trim="providerForm.baseUrl"
              placeholder="https://api.example.com/v1"
              required /></label
          ><label class="wide"
            >API Key<input
              v-model="providerForm.apiKey"
              type="password"
              autocomplete="off"
              :placeholder="editingProviderId ? '留空保留当前密钥；填写则替换' : ''"
              :required="!editingProviderId" /></label
          ><label class="switch"
            ><input v-model="providerForm.supportsWriting" type="checkbox" />
            问题拓展 / 文章写作</label
          ><label class="switch"
            ><input
              v-model="providerForm.supportsDoubaoCheck"
              type="checkbox"
            />
            豆包检测</label
          ><label class="switch"
            ><input v-model="providerForm.supportsWebSearch" type="checkbox" />
            联网搜索能力</label
          >
          <div class="form-actions">
            <button
              v-if="editingProviderId"
              class="ghost"
              type="button"
              :disabled="saving"
              @click="resetProviderForm"
            >
              取消编辑
            </button>
            <button class="primary" :disabled="saving">
              {{
                saving
                  ? "保存中…"
                  : editingProviderId
                    ? "保存并重新测试"
                    : "加密保存配置"
              }}
            </button>
          </div>
        </form>
      </section>
      <section v-else-if="activeScreen === 'storage'" class="providers-panel">
        <div class="provider-intro">
          <p class="eyebrow">ENCRYPTED OBJECT STORAGE</p>
          <h2>贴牌自备阿里云 OSS</h2>
          <p>
            AccessKey
            仅加密保存在服务端。保存新凭证会停用旧配置；测试通过后才能启用。代理和商户仅通过短时授权使用，无法查看永久凭证。
          </p>
        </div>
        <section v-if="storage" class="provider-list">
          <article class="provider-row storage-row">
            <div>
              <h3>{{ storage.bucket }}</h3>
              <p>{{ storage.provider }} · {{ storage.region }}</p>
            </div>
            <div>
              <span>AccessKey 掩码</span><b>{{ storage.accessKeyIdMask }}</b>
            </div>
            <div>
              <span>测试状态</span
              ><b :class="storage.lastTestStatus">{{
                storage.lastTestStatus === "succeeded"
                  ? "成功"
                  : storage.lastTestStatus === "failed"
                    ? "失败"
                    : "未测试"
              }}</b>
            </div>
            <div>
              <span>启用状态</span
              ><b :class="{ enabled: storage.enabled }">{{
                storage.enabled ? "已启用" : "未启用"
              }}</b>
            </div>
            <div class="provider-actions">
              <button
                class="ghost"
                :disabled="saving"
                @click="runStorageAction('test')"
              >
                测试</button
              ><button
                class="ghost"
                :disabled="saving"
                @click="runStorageAction('toggle')"
              >
                {{ storage.enabled ? "停用" : "启用" }}</button
              ><button
                class="danger"
                :disabled="saving"
                @click="runStorageAction('remove')"
              >
                删除
              </button>
            </div>
          </article>
        </section>
        <div v-else class="empty">
          尚未配置对象存储。保存后可执行一次 Bucket 权限测试。
        </div>
        <form class="provider-form" @submit.prevent="submitStorage">
          <label
            >OSS Region<input
              v-model.trim="storageForm.region"
              placeholder="oss-cn-hangzhou"
              required /></label
          ><label
            >Bucket<input
              v-model.trim="storageForm.bucket"
              placeholder="example-bucket"
              required /></label
          ><label class="wide"
            >CDN HTTPS 地址（可选）<input
              v-model.trim="storageForm.cdnBaseUrl"
              placeholder="https://cdn.example.com" /></label
          ><label class="wide"
            >AccessKey ID<input
              v-model.trim="storageForm.accessKeyId"
              type="password"
              autocomplete="off"
              required /></label
          ><label class="wide"
            >AccessKey Secret<input
              v-model="storageForm.accessKeySecret"
              type="password"
              autocomplete="off"
              required
          /></label>
          <div class="form-actions">
            <button class="primary" :disabled="saving">
              {{ saving ? "保存中…" : "加密保存 OSS 配置" }}
            </button>
          </div>
        </form>
      </section>
      <section
        v-else-if="activeScreen === 'doubao-checks'"
        class="providers-panel"
      >
        <div class="provider-intro">
          <p class="eyebrow">DOUBAO WEB SEARCH CHECK</p>
          <h2>豆包收录检测</h2>
          <p>
            逐个问题调用贴牌已启用的联网搜索模型，保存回答后再以企业全称或简称做本地精确匹配。该结果不是豆包
            App 的官方索引数据，第三方接口费用由贴牌承担。
          </p>
        </div>
        <form class="provider-form" @submit.prevent="submitDoubaoCheck">
          <label
            >检测范围<select v-model="doubaoForm.scope">
              <option value="single">单个普通商户</option>
              <option value="all">全部有效商户</option>
            </select></label
          ><label v-if="doubaoForm.scope === 'single'"
            >选择商户<select v-model="doubaoForm.merchantId" required>
              <option value="">请选择</option>
              <option
                v-for="merchant in merchants"
                :key="merchant.id"
                :value="merchant.id"
              >
                {{ merchant.companyName }}（{{ merchant.username }}）
              </option>
            </select></label
          >
          <p class="wide form-tip">
            {{
              doubaoForm.scope === "all"
                ? "提交后会二次确认；系统按有效商户的启用问题词逐题执行，失败项不会计入未命中。"
                : "只查询所选商户的启用问题词；商户端仅可查看结果。"
            }}
          </p>
          <div class="form-actions">
            <button class="primary" :disabled="saving">
              {{ saving ? "创建中…" : "创建检测批次" }}
            </button>
          </div>
        </form>
        <section class="provider-list">
          <div v-if="doubaoChecks.length === 0" class="empty">
            暂无检测批次。请先配置并启用支持联网搜索的检测模型。
          </div>
          <template v-for="item in doubaoChecks" :key="item.id">
            <article class="provider-row">
              <div>
                <h3>
                  {{
                    item.scope === "all_merchants" ? "全部有效商户" : "单商户检测"
                  }}
                </h3>
                <p>
                  {{ item.providerAlias }} · {{ item.providerModel }} ·
                  {{ formatDate(item.createdAt) }}
                </p>
              </div>
              <div>
                <span>进度</span
                ><b>{{ item.completedCount }} / {{ item.totalCount }}</b>
              </div>
              <div>
                <span>成功 / 失败</span
                ><b>{{ item.successfulCount }} / {{ item.failedCount }}</b>
              </div>
              <div>
                <span>名称命中</span><b>{{ item.matchedCount }}</b>
              </div>
              <div>
                <span>状态</span
                ><b :class="item.status">{{
                  item.status === "succeeded"
                    ? "完成"
                    : item.status === "partially_failed"
                      ? "部分失败"
                      : item.status === "failed"
                        ? "失败"
                        : item.status === "running"
                          ? "执行中"
                          : "排队中"
                }}</b
                ><small v-if="item.failureReason">{{ item.failureReason }}</small>
                <div v-if="item.failedCount > 0" class="doubao-actions">
                  <button
                    class="text-button"
                    :disabled="doubaoFailureBusyId === item.id"
                    @click="toggleDoubaoFailures(item)"
                  >
                    {{
                      selectedDoubaoFailureBatchId === item.id
                        ? "收起失败明细"
                        : doubaoFailureBusyId === item.id
                          ? "加载中…"
                          : "查看失败明细"
                    }}
                  </button>
                  <button
                    v-if="['succeeded', 'partially_failed', 'failed'].includes(item.status)"
                    class="text-button"
                    :disabled="doubaoRetryBusyId === item.id"
                    @click="retryDoubaoFailures(item)"
                  >
                    {{ doubaoRetryBusyId === item.id ? "重试创建中…" : "仅重试失败项" }}
                  </button>
                </div>
              </div>
            </article>
            <section
              v-if="selectedDoubaoFailureBatchId === item.id"
              class="doubao-failures"
            >
              <p v-if="selectedDoubaoFailures.length === 0" class="empty">
                当前批次未读取到可展示的失败明细。
              </p>
              <article
                v-for="failure in selectedDoubaoFailures"
                :key="failure.id"
                class="doubao-failure-row"
              >
                <div><span>商户</span><b>{{ failure.merchantName }}</b></div>
                <div><span>问题词</span><b>{{ failure.question }}</b></div>
                <div><span>失败原因</span><b>{{ failure.failureReason }}</b></div>
                <div v-if="failure.checkedAt"><span>检测时间</span><b>{{ formatDate(failure.checkedAt) }}</b></div>
              </article>
            </section>
          </template>
        </section>
      </section>
      <section v-else class="form-panel">
        <div class="form-intro">
          <p class="eyebrow">
            {{ activeScreen === "create-agent" ? "NEW AGENT" : "NEW MERCHANT" }}
          </p>
          <h2>
            {{
              activeScreen === "create-agent" ? "开通代理账户" : "开通普通商户"
            }}
          </h2>
          <p>
            {{
              activeScreen === "create-agent"
                ? "代理只能创建普通商户，且只能继承当前贴牌的品牌、API、对象存储与域名策略。"
                : "商户不会看到上级 API 密钥；主域名留空时，后续由上级已启用域名分发。"
            }}
          </p>
        </div>
        <form
          v-if="activeScreen === 'create-agent'"
          class="provision-form"
          @submit.prevent="submitAgent"
        >
          <label
            >账号<input
            v-model.trim="agentForm.username"
            autocomplete="off"
            maxlength="12"
              placeholder="6-12 位英文或数字"
              required /></label
          ><label
            >密码<input
              v-model="agentForm.password"
              type="password"
              autocomplete="new-password"
              maxlength="12"
              placeholder="6-12 位英文或数字"
              required /></label
          ><label class="wide"
            >公司名<input
              v-model.trim="agentForm.companyName"
              maxlength="120"
              required /></label
          ><label
            >可开用户数<input
              v-model.number="agentForm.merchantLimit"
              type="number"
              min="0"
              required /></label
          ><label
            >算力点数<input
              v-model.number="agentForm.computePoints"
              type="number"
              min="0"
              required /></label
          ><label
            >写作篇数<input
              v-model.number="agentForm.writingLimit"
              type="number"
              min="0"
              required /></label
          ><label
            >到期时间<input
              v-model="agentForm.expiresAt"
              type="datetime-local"
              required /></label
          ><label class="wide"
            >主域名（可选）<input
              v-model.trim="agentForm.primaryDomain"
              placeholder="如 example.com，不含 http:// 或 https://"
          /></label>
          <div class="form-actions">
            <button class="ghost" type="button" @click="navigate('agents')">
              取消</button
            ><button class="primary" :disabled="saving">
              {{ saving ? "开通中…" : "确认开通代理" }}
            </button>
          </div>
        </form>
        <form v-else class="provision-form" @submit.prevent="submitMerchant">
          <label
            >账号<input
            v-model.trim="merchantForm.username"
            autocomplete="off"
            maxlength="12"
              placeholder="6-12 位英文或数字"
              required /></label
          ><label
            >密码<input
              v-model="merchantForm.password"
              type="password"
              autocomplete="new-password"
              maxlength="12"
              placeholder="6-12 位英文或数字"
              required /></label
          ><label class="wide"
            >企业名<input
              v-model.trim="merchantForm.companyName"
              maxlength="120"
              required /></label
          ><label
            >关键词数量<input
              v-model.number="merchantForm.keywordLimit"
              type="number"
              min="0"
              required /></label
          ><label
            >算力点数<input
              v-model.number="merchantForm.computePoints"
              type="number"
              min="0"
              required /></label
          ><label
            >写作篇数<input
              v-model.number="merchantForm.writingLimit"
              type="number"
              min="0"
              required /></label
          ><label
            >到期时间<input
              v-model="merchantForm.expiresAt"
              type="datetime-local"
              required /></label
          ><label class="wide"
            >主域名（可选）<input
              v-model.trim="merchantForm.primaryDomain"
              placeholder="如 example.com，不含 http:// 或 https://"
          /></label>
          <div class="form-actions">
            <button class="ghost" type="button" @click="navigate('merchants')">
              取消</button
            ><button class="primary" :disabled="saving">
              {{ saving ? "开通中…" : "确认开通商户" }}
            </button>
          </div>
        </form>
      </section>
    </section>
  </main>
</template>
