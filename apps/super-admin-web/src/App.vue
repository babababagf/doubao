<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import {
  ApiError,
  createWhiteLabel,
  getPlatformDomains,
  getPublisherUpdatePolicy,
  getTaskOperations,
  issueDomainVerificationToken,
  listAuditLogs,
  listDomains,
  listTenants,
  listWhiteLabels,
  login,
  logout,
  savePlatformDomains,
  savePublisherUpdatePolicy,
  updateDomainStatus,
  updateTenantStatus,
  updateWhiteLabelBrand,
  verifyDomainDns,
  type ManagedAuditLog,
  type ManagedDomain,
  type ManagedTenant,
  type PlatformDomains,
  type PlatformTaskOperations,
  type PublisherUpdatePolicy,
  type WhiteLabel,
  type WhiteLabelForm,
} from "./services/super-admin";

const authenticated = ref(
  sessionStorage.getItem("doubao.super.authenticated") === "1",
);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const notice = ref("");
const whiteLabels = ref<WhiteLabel[]>([]);
const domains = ref<ManagedDomain[]>([]);
const tenants = ref<ManagedTenant[]>([]);
const auditLogs = ref<ManagedAuditLog[]>([]);
const taskOperations = ref<PlatformTaskOperations | null>(null);
const updatePolicy = ref<PublisherUpdatePolicy | null>(null);
const platformDomains = ref<PlatformDomains | null>(null);
const editingBrandId = ref<string | null>(null);
const brandSaving = ref(false);
const domainBusyId = ref<string | null>(null);
const tenantBusyId = ref<string | null>(null);
const updatePolicySaving = ref(false);
const platformDomainsSaving = ref(false);
const loginForm = reactive({ username: "", password: "" });
const form = reactive<WhiteLabelForm>({
  username: "",
  password: "",
  companyName: "",
  agentLimit: 5,
  merchantLimit: 50,
  computePoints: 10000,
  writingLimit: 100,
  primaryDomain: "",
  expiresAt: "2027-08-07T00:00",
});
const brandForm = reactive({ nickname: "", logoUrl: "" });
const updatePolicyForm = reactive({
  enabled: false,
  feedUrl: "",
  minimumVersion: "",
  releaseNotes: "",
});
const platformDomainsForm = reactive({
  superAdminHostname: "",
  tenantAdminHostname: "",
  merchantWebHostname: "",
  contentRootHostname: "",
});

const overview = computed(() => ({
  whiteLabels: whiteLabels.value.length,
  agents: whiteLabels.value.reduce((total, item) => total + item.agentUsage, 0),
  merchants: whiteLabels.value.reduce(
    (total, item) => total + item.merchantUsage,
    0,
  ),
  compute: whiteLabels.value.reduce(
    (total, item) => total + item.computePoints,
    0,
  ),
}));

function readableError(reason: unknown): string {
  return reason instanceof ApiError
    ? reason.message
    : "网络或服务暂不可用，请稍后重试";
}
function resourceWidth(used: number, limit: number): string {
  return `${Math.min(limit ? (used / limit) * 100 : 0, 100)}%`;
}
function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
function taskCategoryText(category: NonNullable<PlatformTaskOperations>["items"][number]["category"]): string {
  return {
    ai_question_expansion: "问题词拓展",
    ai_article_writing: "AI 写作",
    doubao_check: "豆包检测",
    publish: "内容发布",
  }[category];
}
function taskStatusText(status: string): string {
  return {
    queued: "排队中",
    running: "执行中",
    attention: "待人工处理",
    succeeded: "已完成",
    partially_failed: "部分失败",
    failed: "失败",
    stopped: "已停止",
  }[status] ?? status;
}

async function refresh(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    const [
      labels,
      managedDomains,
      managedTenants,
      logs,
      tasks,
      policy,
      configuredDomains,
    ] = await Promise.all([
      listWhiteLabels(),
      listDomains(),
      listTenants(),
      listAuditLogs(),
      getTaskOperations(),
      getPublisherUpdatePolicy(),
      getPlatformDomains(),
    ]);
    whiteLabels.value = labels;
    domains.value = managedDomains;
    tenants.value = managedTenants;
    auditLogs.value = logs;
    taskOperations.value = tasks;
    updatePolicy.value = policy;
    platformDomains.value = configuredDomains;
    Object.assign(updatePolicyForm, {
      enabled: policy.enabled,
      feedUrl: policy.feedUrl ?? "",
      minimumVersion: policy.minimumVersion ?? "",
      releaseNotes: policy.releaseNotes,
    });
    Object.assign(platformDomainsForm, {
      superAdminHostname: configuredDomains.superAdminHostname ?? "",
      tenantAdminHostname: configuredDomains.tenantAdminHostname ?? "",
      merchantWebHostname: configuredDomains.merchantWebHostname ?? "",
      contentRootHostname: configuredDomains.contentRootHostname ?? "",
    });
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
    sessionStorage.setItem("doubao.super.authenticated", "1");
    await refresh();
  } catch (reason) {
    error.value = readableError(reason);
  } finally {
    loading.value = false;
  }
}

async function submitCreate(): Promise<void> {
  if (
    !/^[a-zA-Z0-9]{6,12}$/.test(form.username) ||
    !/^[a-zA-Z0-9]{6,12}$/.test(form.password)
  ) {
    error.value = "账号和密码必须为 6-12 位英文或数字";
    return;
  }
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    await createWhiteLabel({ ...form });
    notice.value = "贴牌已开通，域名如已填写则处于待验证状态。";
    Object.assign(form, {
      username: "",
      password: "",
      companyName: "",
      agentLimit: 5,
      merchantLimit: 50,
      computePoints: 10000,
      writingLimit: 100,
      primaryDomain: "",
      expiresAt: "2027-08-07T00:00",
    });
    await refresh();
  } catch (reason) {
    error.value = readableError(reason);
  } finally {
    saving.value = false;
  }
}

function editBrand(item: WhiteLabel): void {
  editingBrandId.value = item.id;
  brandForm.nickname = item.brand.nickname;
  brandForm.logoUrl = item.brand.logoUrl;
  error.value = "";
  notice.value = "";
}
async function submitBrand(item: WhiteLabel): Promise<void> {
  brandSaving.value = true;
  error.value = "";
  notice.value = "";
  try {
    await updateWhiteLabelBrand(item.id, { ...brandForm });
    notice.value = `“${item.companyName}” 的系统昵称与 Logo 已更新，版本将在下级刷新时生效。`;
    editingBrandId.value = null;
    await refresh();
  } catch (reason) {
    error.value = readableError(reason);
  } finally {
    brandSaving.value = false;
  }
}
function domainStatusText(domain: ManagedDomain): string {
  if (domain.ownershipStatus === "active") return "已启用";
  if (domain.ownershipStatus === "disabled") return "已停用";
  if (domain.ownershipStatus === "ownership_verified_waiting_certificate")
    return "所有权已验证，等待证书";
  if (domain.ownershipStatus === "pending_dns") return "等待 DNS TXT 验证";
  return "尚未生成验证记录";
}
async function requestDomainToken(domain: ManagedDomain): Promise<void> {
  domainBusyId.value = domain.id;
  error.value = "";
  notice.value = "";
  try {
    await issueDomainVerificationToken(domain.id);
    notice.value = `已生成 ${domain.hostname} 的 DNS 验证记录。`;
    await refresh();
  } catch (reason) {
    error.value = readableError(reason);
  } finally {
    domainBusyId.value = null;
  }
}
async function checkDomainDns(domain: ManagedDomain): Promise<void> {
  domainBusyId.value = domain.id;
  error.value = "";
  notice.value = "";
  try {
    await verifyDomainDns(domain.id);
    notice.value = `${domain.hostname} 已确认 DNS 所有权，仍需证书与站点发布后才能启用。`;
    await refresh();
  } catch (reason) {
    error.value = readableError(reason);
  } finally {
    domainBusyId.value = null;
  }
}
async function toggleDomainStatus(domain: ManagedDomain): Promise<void> {
  const next = domain.status === "active" ? "disabled" : "active";
  const warning =
    next === "active"
      ? `启用“${domain.hostname}”前，请确认 DNS、HTTPS 证书、网关路由和站点文件均已由人工验收；启用后新生成网站将使用该域名作为规范链接。确定继续吗？`
      : `停用“${domain.hostname}”后，后续生成的网站将不再使用该域名。确定继续吗？`;
  if (!window.confirm(warning)) return;
  domainBusyId.value = domain.id;
  error.value = "";
  notice.value = "";
  try {
    await updateDomainStatus(domain.id, next);
    notice.value =
      next === "active"
        ? "域名已启用。若该域名用于内容站，请重新生成相关商户网站以更新 canonical、robots 和 sitemap。"
        : "域名已停用；后续重新生成网站将回退至有效上级域名或本地预览地址。";
    await refresh();
  } catch (reason) {
    error.value = readableError(reason);
  } finally {
    domainBusyId.value = null;
  }
}
function tenantKindText(kind: ManagedTenant["kind"]): string {
  return kind === "white_label"
    ? "贴牌"
    : kind === "agent"
      ? "代理"
      : "普通商户";
}
async function toggleTenantStatus(tenant: ManagedTenant): Promise<void> {
  const next = tenant.status === "active" ? "disabled" : "active";
  const warning =
    next === "disabled"
      ? `停用“${tenant.companyName}”将同时撤销其下级账户的现有会话，但不会释放席位和额度。确定继续吗？`
      : `重新启用“${tenant.companyName}”后，用户仍需重新登录。确定继续吗？`;
  if (!window.confirm(warning)) return;
  tenantBusyId.value = tenant.id;
  error.value = "";
  notice.value = "";
  try {
    await updateTenantStatus(tenant.id, next);
    notice.value =
      next === "disabled"
        ? "账户已停用，下级会话已撤销。"
        : "账户已重新启用，用户需重新登录。";
    await refresh();
  } catch (reason) {
    error.value = readableError(reason);
  } finally {
    tenantBusyId.value = null;
  }
}

function auditActionText(action: string): string {
  return (
    {
      "white_label.brand.updated": "更新贴牌品牌",
      "tenant.status.updated": "更新账户状态",
      "domain.verification.requested": "生成域名验证记录",
      "domain.ownership.verified": "验证域名所有权",
      "domain.status.updated": "更新域名状态",
      "provider_config.created": "新增模型配置",
      "provider_config.tested": "测试模型配置",
      "object_storage_config.saved": "保存对象存储配置",
    }[action] ?? action
  );
}
function auditDetail(detail: unknown): string {
  try {
    return JSON.stringify(detail);
  } catch {
    return "—";
  }
}
async function submitUpdatePolicy(): Promise<void> {
  updatePolicySaving.value = true;
  error.value = "";
  notice.value = "";
  try {
    const policy = await savePublisherUpdatePolicy({ ...updatePolicyForm });
    updatePolicy.value = policy;
    Object.assign(updatePolicyForm, {
      enabled: policy.enabled,
      feedUrl: policy.feedUrl ?? "",
      minimumVersion: policy.minimumVersion ?? "",
      releaseNotes: policy.releaseNotes,
    });
    notice.value = policy.enabled
      ? "发布助手更新策略已保存；客户端仍需由用户主动检查和确认安装。"
      : "发布助手在线更新已关闭。";
  } catch (reason) {
    error.value = readableError(reason);
  } finally {
    updatePolicySaving.value = false;
  }
}
async function submitPlatformDomains(): Promise<void> {
  platformDomainsSaving.value = true;
  error.value = "";
  notice.value = "";
  try {
    const saved = await savePlatformDomains({ ...platformDomainsForm });
    platformDomains.value = saved;
    Object.assign(platformDomainsForm, {
      superAdminHostname: saved.superAdminHostname ?? "",
      tenantAdminHostname: saved.tenantAdminHostname ?? "",
      merchantWebHostname: saved.merchantWebHostname ?? "",
      contentRootHostname: saved.contentRootHostname ?? "",
    });
    notice.value =
      "平台入口域名配置已保存；仅已完成 DNS、证书和路由部署的域名可对外启用。";
  } catch (reason) {
    error.value = readableError(reason);
  } finally {
    platformDomainsSaving.value = false;
  }
}
async function signOut(): Promise<void> {
  await logout().catch(() => undefined);
  authenticated.value = false;
  loginForm.username = "";
  loginForm.password = "";
  error.value = "";
  sessionStorage.removeItem("doubao.super.authenticated");
  whiteLabels.value = [];
  domains.value = [];
  tenants.value = [];
  auditLogs.value = [];
  taskOperations.value = null;
  updatePolicy.value = null;
  platformDomains.value = null;
}
onMounted(() => {
  if (authenticated.value) void refresh();
});
</script>

<template>
  <main v-if="!authenticated" class="login-shell">
    <section class="login-card" aria-labelledby="login-title">
      <div class="brand-mark"><span>◐</span> 豆包获客</div>
      <p class="eyebrow">PLATFORM OPERATIONS</p>
      <h1 id="login-title">总后台</h1>
      <p class="login-copy">管理贴牌额度、账户体系与平台级资源配置。</p>
      <form @submit.prevent="submitLogin">
        <label
          >账号<input
            v-model.trim="loginForm.username"
            autocomplete="username"
            placeholder="6-12 位英文或数字"
            required
        /></label>
        <label
          >密码<input
            v-model="loginForm.password"
            type="password"
            autocomplete="current-password"
            placeholder="6-12 位英文或数字"
            required
        /></label>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="primary-button" :disabled="loading">
          {{ loading ? "正在验证…" : "安全登录" }}
        </button>
      </form>
    </section>
  </main>

  <main v-else class="shell">
    <aside class="sidebar">
      <div class="brand-mark"><span>◐</span> 豆包获客</div>
      <div class="platform-tag"><i></i> PLATFORM CONSOLE</div>
      <nav aria-label="总后台导航">
        <a class="active" href="#white-labels">贴牌管理</a
        ><a href="#domains">域名审核</a><a href="#accounts">全部账户</a
        ><a href="#tasks">任务运维</a><a href="#audit">审计日志</a><a href="#system">系统设置</a
        ><a href="#create">开通贴牌</a>
      </nav>
      <div class="sidebar-footer">
        本地开发环境<br /><button @click="signOut">退出登录</button>
      </div>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div>
          <p class="eyebrow">PLATFORM CONTROL</p>
          <h1>贴牌资源总览</h1>
        </div>
        <div class="topbar-status">
          <span class="live-dot"></span> 本地开发环境
        </div>
      </header>
      <p v-if="error" class="banner error" role="alert">{{ error }}</p>
      <p v-if="notice" class="banner success">{{ notice }}</p>

      <section class="metrics" aria-label="平台数据概览">
        <article>
          <span>贴牌客户</span><strong>{{ overview.whiteLabels }}</strong
          ><small>已开通账户</small>
        </article>
        <article>
          <span>代理席位使用</span><strong>{{ overview.agents }}</strong
          ><small>由贴牌分配</small>
        </article>
        <article>
          <span>已开通商户</span><strong>{{ overview.merchants }}</strong
          ><small>不含代理预留容量</small>
        </article>
        <article>
          <span>剩余算力点</span
          ><strong>{{ overview.compute.toLocaleString() }}</strong
          ><small>下发后实时扣减</small>
        </article>
      </section>

      <section id="tasks" class="section-head accounts-head">
        <div>
          <p class="eyebrow">GLOBAL TASK OPERATIONS</p>
          <h2>全局任务运维</h2>
          <p>只读查看跨贴牌的任务状态和脱敏失败原因；总后台不在此页替商户改写、重试或发布内容。</p>
        </div>
      </section>
      <section class="task-overview" :aria-busy="loading">
        <div class="task-summary-grid">
          <article><span>排队任务</span><strong>{{ taskOperations?.summary.queued ?? 0 }}</strong><small>等待 Worker 或发布助手领取</small></article>
          <article><span>执行中</span><strong>{{ taskOperations?.summary.running ?? 0 }}</strong><small>AI 创作、检测或本地执行</small></article>
          <article><span>待人工处理</span><strong>{{ taskOperations?.summary.attention ?? 0 }}</strong><small>需本机登录、验证码或发布确认</small></article>
          <article><span>异常任务</span><strong>{{ taskOperations?.summary.failed ?? 0 }}</strong><small>失败、部分失败或已停止</small></article>
        </div>
        <div v-if="!loading && taskOperations?.items.length === 0" class="empty-state">当前没有可展示的近期任务。</div>
        <article v-for="task in taskOperations?.items ?? []" :key="`${task.category}:${task.id}`" class="task-row">
          <div><span class="task-category">{{ taskCategoryText(task.category) }}</span><strong>{{ task.tenantName }}</strong><small>更新于 {{ formatDateTime(task.updatedAt) }}</small></div>
          <div class="task-progress"><b>{{ task.completedCount }} / {{ task.totalCount }}</b><span>完成进度</span></div>
          <div class="task-status"><b :class="task.status">{{ taskStatusText(task.status) }}</b><small v-if="task.failedCount">失败 {{ task.failedCount }}</small></div>
          <p>{{ task.failureReason ?? "未记录异常" }}</p>
        </article>
      </section>

      <section id="white-labels" class="section-head">
        <div>
          <p class="eyebrow">WHITE LABELS</p>
          <h2>贴牌账户</h2>
        </div>
        <button class="ghost-button" :disabled="loading" @click="refresh">
          {{ loading ? "刷新中…" : "刷新列表" }}
        </button>
      </section>
      <section class="tenant-list" :aria-busy="loading">
        <div v-if="!loading && whiteLabels.length === 0" class="empty-state">
          尚未开通贴牌。请先通过下方表单创建第一个贴牌账户。
        </div>
        <template v-for="item in whiteLabels" :key="item.id">
          <article class="tenant-row">
            <div class="tenant-identity">
              <span class="avatar">{{ item.companyName.slice(0, 1) }}</span>
              <div>
                <h3>{{ item.companyName }}</h3>
                <p>
                  {{ item.username }} · 到期 {{ formatDate(item.expiresAt) }}
                </p>
              </div>
            </div>
            <div class="resource">
              <label
                >代理
                <b>{{ item.agentUsage }} / {{ item.agentLimit }}</b></label
              >
              <div class="track">
                <i
                  :style="{
                    width: resourceWidth(item.agentUsage, item.agentLimit),
                  }"
                ></i>
              </div>
            </div>
            <div class="resource">
              <label
                >商户已开通
                <b
                  >{{ item.merchantUsage }} / {{ item.merchantLimit }}</b
                ></label
              ><small>已预留 {{ item.merchantReserved }} 席位</small>
              <div class="track violet">
                <i
                  :style="{
                    width: resourceWidth(
                      item.merchantReserved,
                      item.merchantLimit,
                    ),
                  }"
                ></i>
              </div>
            </div>
            <div class="tenant-meta">
              <b>{{ item.computePoints.toLocaleString() }}</b
              ><span>剩余算力</span>
            </div>
            <div class="tenant-meta">
              <b>{{ item.writingRemaining }}</b
              ><span>写作篇数</span>
            </div>
            <div class="domain">
              <b>{{ item.primaryDomain ?? "使用平台默认域名" }}</b
              ><span :class="item.domainStatus ? 'pending' : ''">{{
                item.domainStatus === "pending_verification"
                  ? "待验证"
                  : item.domainStatus === "active"
                    ? "已生效"
                    : item.domainStatus === "disabled"
                      ? "已停用"
                      : "默认"
              }}</span
              ><button class="text-button" @click="editBrand(item)">
                品牌设置
              </button>
            </div>
          </article>
          <form
            v-if="editingBrandId === item.id"
            class="brand-editor"
            @submit.prevent="submitBrand(item)"
          >
            <div>
              <p class="eyebrow">
                BRAND INHERITANCE · V{{ item.brand.version }}
              </p>
              <strong>贴牌 / 代理 / 商户共用此品牌</strong>
            </div>
            <label
              >系统昵称<input
                v-model.trim="brandForm.nickname"
                maxlength="32"
                required
            /></label>
            <label
              >Logo HTTPS 地址（可留空）<input
                v-model.trim="brandForm.logoUrl"
                placeholder="https://cdn.example.com/logo.png"
            /></label>
            <div class="editor-actions">
              <button
                class="ghost-button"
                type="button"
                @click="editingBrandId = null"
              >
                取消</button
              ><button class="primary-button" :disabled="brandSaving">
                {{ brandSaving ? "保存中…" : "保存品牌设置" }}
              </button>
            </div>
          </form>
        </template>
      </section>

      <section id="domains" class="section-head domain-head">
        <div>
          <p class="eyebrow">DOMAIN VERIFICATION</p>
          <h2>域名绑定审核</h2>
          <p>TXT 验证只确认域名所有权，不等同于网站可访问或 HTTPS 已启用。</p>
        </div>
      </section>
      <section class="domain-list" :aria-busy="loading">
        <div v-if="!loading && domains.length === 0" class="empty-state">
          暂未提交自定义域名；未填主域名的账户将沿用平台或上级域名。
        </div>
        <article v-for="domain in domains" :key="domain.id" class="domain-row">
          <div class="domain-name">
            <h3>{{ domain.hostname }}</h3>
            <p>
              {{ domain.tenant.name }} ·
              {{
                domain.tenant.kind === "white_label"
                  ? "贴牌"
                  : domain.tenant.kind === "agent"
                    ? "代理"
                    : "商户"
              }}
            </p>
          </div>
          <div class="ownership">
            <b
              :class="{
                verified:
                  domain.ownershipStatus ===
                    'ownership_verified_waiting_certificate' ||
                  domain.ownershipStatus === 'active',
              }"
              >{{ domainStatusText(domain) }}</b
            ><span v-if="domain.ownershipVerifiedAt"
              >验证于 {{ formatDate(domain.ownershipVerifiedAt) }}</span
            >
          </div>
          <div
            v-if="domain.dnsRecordName && domain.dnsRecordValue"
            class="dns-record"
          >
            <span>主机记录 {{ domain.dnsRecordName }}</span
            ><code>{{ domain.dnsRecordValue }}</code>
          </div>
          <div v-else class="dns-record muted">尚未生成 TXT 验证记录</div>
          <div v-if="domain.status !== 'disabled'" class="domain-actions">
            <button
              class="ghost-button"
              :disabled="domainBusyId === domain.id"
              @click="requestDomainToken(domain)"
            >
              {{
                domain.dnsRecordName ? "刷新验证记录" : "生成验证记录"
              }}</button
            ><button
              class="primary-button"
              :disabled="domainBusyId === domain.id || !domain.dnsRecordName"
              @click="checkDomainDns(domain)"
            >
              {{ domainBusyId === domain.id ? "检查中…" : "检查 DNS" }}
            </button>
            <button
              v-if="
                domain.ownershipStatus ===
                  'ownership_verified_waiting_certificate' ||
                domain.ownershipStatus === 'active'
              "
              class="ghost-button"
              :disabled="domainBusyId === domain.id"
              @click="toggleDomainStatus(domain)"
            >
              {{ domain.status === "active" ? "停用域名" : "人工验收后启用" }}
            </button>
          </div>
          <div v-else class="domain-actions">
            <button
              class="primary-button"
              :disabled="
                domainBusyId === domain.id || !domain.ownershipVerifiedAt
              "
              @click="toggleDomainStatus(domain)"
            >
              {{ domainBusyId === domain.id ? "处理中…" : "重新启用" }}
            </button>
          </div>
        </article>
      </section>

      <section id="accounts" class="section-head accounts-head">
        <div>
          <p class="eyebrow">ALL TENANTS</p>
          <h2>全部账户</h2>
          <p>
            总后台可查看贴牌、代理与普通商户；停用会撤销目标及其下级现有会话，不会删除数据或返还席位。
          </p>
        </div>
      </section>
      <section class="accounts-list" :aria-busy="loading">
        <div v-if="!loading && tenants.length === 0" class="empty-state">
          暂无账户数据。
        </div>
        <article v-for="tenant in tenants" :key="tenant.id" class="account-row">
          <div class="account-name">
            <span class="kind-badge" :class="tenant.kind">{{
              tenantKindText(tenant.kind)
            }}</span>
            <div>
              <h3>{{ tenant.companyName }}</h3>
              <p>
                {{ tenant.username }} · 到期 {{ formatDate(tenant.expiresAt) }}
              </p>
            </div>
          </div>
          <div class="account-parent">
            <span>上级账户</span
            ><b>{{ tenant.parent?.name ?? "平台总后台" }}</b>
          </div>
          <div class="account-status">
            <b :class="tenant.status">{{
              tenant.status === "active"
                ? "正常"
                : tenant.status === "disabled"
                  ? "已停用"
                  : "已到期"
            }}</b
            ><span>{{
              tenant.status === "active" ? "可使用" : "不可登录/执行任务"
            }}</span>
          </div>
          <button
            v-if="tenant.status !== 'expired'"
            class="ghost-button account-action"
            :disabled="tenantBusyId === tenant.id"
            @click="toggleTenantStatus(tenant)"
          >
            {{
              tenantBusyId === tenant.id
                ? "处理中…"
                : tenant.status === "active"
                  ? "停用账户"
                  : "重新启用"
            }}
          </button>
        </article>
      </section>

      <section id="audit" class="section-head accounts-head">
        <div>
          <p class="eyebrow">AUDIT TRAIL</p>
          <h2>审计日志</h2>
          <p>
            仅总后台可查看最近 100 条平台操作；敏感字段会在服务端脱敏后返回。
          </p>
        </div>
      </section>
      <section class="audit-list" :aria-busy="loading">
        <div v-if="!loading && auditLogs.length === 0" class="empty-state">
          暂无可显示的审计日志。
        </div>
        <article v-for="log in auditLogs" :key="log.id" class="audit-row">
          <time>{{ formatDate(log.createdAt) }}</time>
          <div>
            <b>{{ auditActionText(log.action) }}</b
            ><small
              >{{ log.tenantName ?? "平台系统" }} ·
              {{
                log.actorScope === "system" ? "系统操作" : "租户管理员操作"
              }}</small
            >
          </div>
          <span>{{ log.entityType }}</span
          ><code>{{ auditDetail(log.detail) }}</code>
        </article>
      </section>

      <section id="system" class="section-head accounts-head">
        <div>
          <p class="eyebrow">SYSTEM SETTINGS</p>
          <h2>发布助手更新策略</h2>
          <p>
            仅总后台可配置平台统一 HTTPS
            更新源。贴牌、代理和商户不能修改；客户端默认不下载、不安装，须由用户主动确认。
          </p>
        </div>
      </section>
      <form class="update-policy-panel" @submit.prevent="submitUpdatePolicy">
        <label class="update-enabled"
          ><input
            v-model="updatePolicyForm.enabled"
            type="checkbox"
          />允许已授权客户端检查更新</label
        >
        <label
          >HTTPS 更新根地址<input
            v-model.trim="updatePolicyForm.feedUrl"
            :disabled="!updatePolicyForm.enabled"
            type="url"
            placeholder="https://updates.example.com/publisher/win"
        /></label>
        <label
          >最低支持版本（可选）<input
            v-model.trim="updatePolicyForm.minimumVersion"
            maxlength="40"
            placeholder="如 0.1.6（x.y.z）"
        /></label>
        <label class="wide"
          >更新说明（可选）<textarea
            v-model.trim="updatePolicyForm.releaseNotes"
            maxlength="2000"
            placeholder="仅展示给发布助手用户，不包含下载地址或敏感信息。"
          />
        </label>
        <div class="update-foot">
          <span>{{
            updatePolicy?.enabled
              ? "当前策略：已启用"
              : "当前策略：未配置或已关闭"
          }}</span
          ><button class="primary-button" :disabled="updatePolicySaving">
            {{ updatePolicySaving ? "保存中…" : "保存更新策略" }}
          </button>
        </div>
      </form>

      <section class="section-head accounts-head">
        <div>
          <p class="eyebrow">ENTRYPOINT ROUTING</p>
          <h2>平台入口域名</h2>
          <p>
            配置四类入口的目标主机名，不包含 http:// 或
            https://。保存配置不会自动开通
            DNS、证书或网关路由；未完成部署的域名不得对外启用。
          </p>
        </div>
      </section>
      <form class="update-policy-panel" @submit.prevent="submitPlatformDomains">
        <label
          >总后台入口<input
            v-model.trim="platformDomainsForm.superAdminHostname"
            autocomplete="off"
            maxlength="253"
            placeholder="admin.example.com"
        /></label>
        <label
          >贴牌 / 代理后台入口<input
            v-model.trim="platformDomainsForm.tenantAdminHostname"
            autocomplete="off"
            maxlength="253"
            placeholder="console.example.com"
        /></label>
        <label
          >普通商户客户端入口<input
            v-model.trim="platformDomainsForm.merchantWebHostname"
            autocomplete="off"
            maxlength="253"
            placeholder="client.example.com"
        /></label>
        <label
          >企业内容站根域名<input
            v-model.trim="platformDomainsForm.contentRootHostname"
            autocomplete="off"
            maxlength="253"
            placeholder="content.example.com"
        /></label>
        <div class="update-foot">
          <span>{{
            platformDomains?.updatedAt
              ? `最近保存：${formatDate(platformDomains.updatedAt)}`
              : "尚未配置平台入口域名"
          }}</span
          ><button class="primary-button" :disabled="platformDomainsSaving">
            {{ platformDomainsSaving ? "保存中…" : "保存入口域名" }}
          </button>
        </div>
      </form>

      <section id="create" class="create-panel">
        <div class="create-heading">
          <p class="eyebrow">NEW WHITE LABEL</p>
          <h2>开通贴牌账户</h2>
          <p>总后台唯一可创建贴牌。系统昵称与 Logo 后续仍仅由总后台配置。</p>
        </div>
        <form class="provision-form" @submit.prevent="submitCreate">
          <label
            >账号<input
            v-model.trim="form.username"
            autocomplete="off"
            maxlength="12"
              placeholder="6-12 位英文或数字"
              required
          /></label>
          <label
            >密码<input
              v-model="form.password"
              type="password"
              autocomplete="new-password"
              maxlength="12"
              placeholder="6-12 位英文或数字"
              required
          /></label>
          <label class="wide"
            >企业名<input
              v-model.trim="form.companyName"
              maxlength="120"
              placeholder="贴牌公司名称"
              required
          /></label>
          <label
            >可开代理数<input
              v-model.number="form.agentLimit"
              type="number"
              min="0"
              required
          /></label>
          <label
            >可开用户数<input
              v-model.number="form.merchantLimit"
              type="number"
              min="0"
              required
          /></label>
          <label
            >算力点数<input
              v-model.number="form.computePoints"
              type="number"
              min="0"
              required
          /></label>
          <label
            >写作篇数<input
              v-model.number="form.writingLimit"
              type="number"
              min="0"
              required
          /></label>
          <label class="wide"
            >主域名（可选）<input
              v-model.trim="form.primaryDomain"
              placeholder="如 example.com，不要填写 http:// 或 https://"
          /></label>
          <label
            >到期时间<input
              v-model="form.expiresAt"
              type="datetime-local"
              required
          /></label>
          <div class="submit-cell">
            <button class="primary-button" :disabled="saving">
              {{ saving ? "正在开通…" : "确认开通贴牌" }}
            </button>
          </div>
        </form>
      </section>
    </section>
  </main>
</template>

<style scoped>
.task-overview { display: grid; gap: 9px; }
.task-summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 8px; }
.task-summary-grid article { min-height: 104px; padding: 16px 18px; border: 1px solid rgba(145, 168, 205, 0.17); border-radius: 13px; background: linear-gradient(145deg, rgba(15, 30, 58, 0.82), rgba(8, 19, 36, 0.72)); }
.task-summary-grid span, .task-summary-grid small { display: block; color: var(--color-text-muted); font-size: 11px; }
.task-summary-grid strong { display: block; margin: 8px 0 4px; color: #e8edff; font-size: 27px; letter-spacing: -.05em; }
.task-row { display: grid; grid-template-columns: minmax(210px, 1.1fr) 110px 130px minmax(220px, 1fr); align-items: center; gap: 18px; padding: 15px 20px; border: 1px solid rgba(145, 168, 205, 0.17); border-radius: 13px; background: rgba(11, 25, 47, 0.64); }
.task-row strong, .task-progress b { display: block; color: #e4eaf7; font-size: 13px; }
.task-row small, .task-progress span { display: block; margin-top: 3px; color: var(--color-text-muted); font-size: 11px; }
.task-category { display: inline-block; margin: 0 0 6px; padding: 3px 6px; border-radius: 5px; color: #b8c6ff; background: rgba(96, 105, 230, .14); font: 10px var(--font-mono); }
.task-status b { display: inline-block; padding: 4px 7px; border-radius: 5px; color: #aeb7ff; background: rgba(99, 90, 255, .13); font-size: 10px; }
.task-status b.succeeded { color: #70d6aa; background: rgba(72, 198, 137, .1); }
.task-status b.failed, .task-status b.partially_failed, .task-status b.stopped { color: #e98b98; background: rgba(243, 111, 128, .1); }
.task-status b.attention { color: #e4b46d; background: rgba(222, 161, 66, .1); }
.task-row p { overflow: hidden; margin: 0; color: var(--color-text-secondary); font-size: 12px; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
.audit-list {
  display: grid;
  gap: 9px;
}
.audit-row {
  display: grid;
  grid-template-columns: 110px minmax(190px, 0.8fr) 130px minmax(0, 1.4fr);
  align-items: center;
  gap: 16px;
  padding: 15px 20px;
  border: 1px solid rgba(145, 168, 205, 0.17);
  border-radius: 13px;
  background: rgba(11, 25, 47, 0.64);
}
.audit-row time,
.audit-row small {
  display: block;
  color: var(--color-text-muted);
  font-size: 11px;
}
.audit-row b {
  display: block;
  color: #e4eaf7;
  font-size: 13px;
}
.audit-row small {
  margin-top: 4px;
}
.audit-row > span {
  color: #aeb9ff;
  font: 11px var(--font-mono);
}
.audit-row code {
  overflow: hidden;
  color: #aab7cb;
  font: 11px/1.5 var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.update-policy-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  padding: 22px;
  border: 1px solid rgba(126, 137, 255, 0.25);
  border-radius: 13px;
  background: linear-gradient(
    130deg,
    rgba(21, 31, 75, 0.36),
    rgba(8, 20, 38, 0.85)
  );
}
.update-policy-panel label {
  display: grid;
  gap: 7px;
  color: var(--color-text-secondary);
  font-size: 12px;
}
.update-policy-panel label.wide {
  grid-column: 1/-1;
}
.update-policy-panel textarea {
  min-height: 92px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  outline: 0;
  resize: vertical;
  color: var(--color-text);
  background: rgba(6, 16, 32, 0.82);
  font: inherit;
}
.update-policy-panel textarea:focus {
  border-color: #7b75ff;
  box-shadow: var(--shadow-focus);
}
.update-policy-panel .update-enabled {
  display: flex;
  grid-column: 1/-1;
  align-items: center;
  color: #c9d1e5;
  gap: 9px;
}
.update-enabled input {
  width: 16px;
  min-height: 16px;
  padding: 0;
  accent-color: #7776ff;
}
.update-foot {
  display: flex;
  grid-column: 1/-1;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--color-text-muted);
  font-size: 11px;
}
.update-foot .primary-button {
  padding: 0 18px;
}
@media (max-width: 700px) {
  .task-summary-grid { grid-template-columns: 1fr 1fr; }
  .task-row { grid-template-columns: 1fr; gap: 8px; }
  .task-row p { white-space: normal; }
  .audit-row {
    grid-template-columns: 1fr;
    gap: 7px;
  }
  .audit-row code {
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .update-policy-panel {
    grid-template-columns: 1fr;
  }
  .update-foot {
    align-items: stretch;
    flex-direction: column;
  }
  .update-foot .primary-button {
    width: 100%;
  }
}
</style>
