<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { DesktopState, DesktopTaskStatus } from '../../shared/task-machine'
import type { DesktopUpdateStatus, UpdatePhase } from '../../shared/update-policy'
import brandMark from './assets/brand-mark.svg'

type TaskPreview = { id: string; platform: 'toutiao'|'douyin'; article: { version: number; title: string; content: string; imageCount: number; galleryImageIds: string[] }; images: { requiredCount: number; availability: 'not_required'|'legacy_snapshot_missing'|'source_missing'|'ready'; images: Array<{ id: string; fileName: string; mimeType: string }>; missingImageIds: string[] } }
type PublisherSession = { connected: boolean; activeWorkspaceId: string | null; username: string | null; expiresAt: string | null; protectionAvailable: boolean; requiresWorkspaceSelection: boolean; workspaces: Array<{ workspaceId: string; username: string; expiresAt: string }> }
const emptyPublisherSession = (): PublisherSession => ({ connected: false, activeWorkspaceId: null, username: null, expiresAt: null, protectionAvailable: false, requiresWorkspaceSelection: false, workspaces: [] })
const active = ref('任务队列')
const appVersion = ref('—')
const deviceProtection = ref<{ available: boolean; initialized: boolean } | null>(null)
const publisherSession = ref<PublisherSession>(emptyPublisherSession())
const loginUsername = ref('')
const loginPassword = ref('')
const loginBusy = ref(false)
const loginError = ref('')
const addingAccount = ref(false)
const pendingTarget = ref<'media' | 'tasks' | null>(null)
const newMediaPlatform = ref<'toutiao' | 'douyin'>('toutiao')
const newMediaLabel = ref('')
const mediaConnectBusy = ref(false)
const selected = ref('')
const state = ref<DesktopState | null>(null)
const taskPreview = ref<TaskPreview | null>(null)
const taskPreviewBusy = ref(false)
const resolvePublishedUrl = ref('')
const resolvePublishedBusy = ref(false)
const resolvePublishedError = ref('')
const updateStatus = ref<DesktopUpdateStatus | null>(null)
const updateBusy = ref(false)

const tasks = computed(() => state.value?.tasks ?? [])
const paused = computed(() => state.value?.queuePaused ?? false)
const logs = computed(() => state.value?.logs ?? [])
const accounts = computed(() => state.value?.accounts ?? [])
const settings = computed(() => state.value?.settings)
const current = computed(() => tasks.value.find((task) => task.id === selected.value) ?? tasks.value[0])

const platform = (value: string) => value === 'toutiao' ? '今日头条' : '抖音'
const status = (value: DesktopTaskStatus) => ({ queued: '排队中', running: '执行中', paused: '已暂停', succeeded: '已成功', failed: '失败', stopped: '已停止', attention: '需处理' }[value])
const updatePhaseLabel = (value: UpdatePhase) => ({ not_configured: '未配置', checking: '检查中', up_to_date: '已是最新', available: '可下载', downloading: '下载中', ready_to_install: '待安装', blocked: '已阻断', failed: '检查失败' }[value])

async function pause() { state.value = await window.publisherDesktop.togglePause() }
async function connect() { const label = newMediaLabel.value.trim(); if (!label || mediaConnectBusy.value) return; mediaConnectBusy.value = true; try { state.value = await window.publisherDesktop.requestConnect(newMediaPlatform.value, label); if (state.value) newMediaLabel.value = '' } finally { mediaConnectBusy.value = false } }
async function confirmConnect(localReferenceId: string) { state.value = await window.publisherDesktop.confirmConnect(localReferenceId) }
async function openPublisher(localReferenceId: string) { state.value = await window.publisherDesktop.openPublisher(localReferenceId) }
function previewText(content: string) { if (typeof DOMParser === 'undefined') return content; return new DOMParser().parseFromString(content, 'text/html').body.textContent?.trim() ?? '' }
function imageAvailability(value: TaskPreview['images']['availability']) { return ({ not_required: '无需配图', ready: '配图快照完整', source_missing: '原图缺失', legacy_snapshot_missing: '旧文章无快照' })[value] }
async function loadTaskPreview() { if (!current.value || !publisherSession.value.connected) return; taskPreviewBusy.value = true; try { taskPreview.value = await window.publisherDesktop.taskPreview(current.value.id) } finally { taskPreviewBusy.value = false } }

function applyPendingTarget() { if (!publisherSession.value.connected || !pendingTarget.value) return; active.value = pendingTarget.value === 'media' ? '媒体账号' : '任务队列'; pendingTarget.value = null }
async function login() { loginError.value = ''; loginBusy.value = true; try { const result = await window.publisherDesktop.publisherLogin(loginUsername.value.trim(), loginPassword.value); if (!result.ok) { loginError.value = result.message ?? '登录失败'; return } publisherSession.value = result.session ?? publisherSession.value; state.value = result.state ?? await window.publisherDesktop.getState(); loginPassword.value = ''; loginUsername.value = ''; addingAccount.value = false; applyPendingTarget(); await sync() } finally { loginBusy.value = false } }
async function selectWorkspace(workspaceId: string) { loginError.value = ''; const result = await window.publisherDesktop.selectWorkspace(workspaceId); if (!result) { loginError.value = '工作区会话已失效，请重新登录'; return } publisherSession.value = result.session; state.value = result.state; addingAccount.value = false; applyPendingTarget(); await sync() }
async function showWorkspaceChooser(addAccount = false) { const next = await window.publisherDesktop.showWorkspaceChooser(); if (next) publisherSession.value = next; state.value = null; addingAccount.value = addAccount; loginUsername.value = ''; loginPassword.value = ''; loginError.value = '' }
async function logout() { publisherSession.value = (await window.publisherDesktop.publisherLogout()) ?? emptyPublisherSession(); loginUsername.value = ''; loginPassword.value = ''; loginError.value = ''; state.value = publisherSession.value.connected ? await window.publisherDesktop.getState() : null; if (publisherSession.value.connected) await sync() }
async function sync() { const next = await window.publisherDesktop.publisherSync(); if (next) state.value = next }
async function checkUpdate() { updateBusy.value = true; try { updateStatus.value = await window.publisherDesktop.checkUpdate() } finally { updateBusy.value = false } }
async function downloadUpdate() { updateBusy.value = true; try { updateStatus.value = await window.publisherDesktop.downloadUpdate() } finally { updateBusy.value = false } }
async function installUpdate() { updateBusy.value = true; try { updateStatus.value = await window.publisherDesktop.installUpdate() } finally { updateBusy.value = false } }
async function resolvePublished() {
  if (!current.value?.canResolvePublished || resolvePublishedBusy.value) return
  const resultUrl = resolvePublishedUrl.value.trim()
  if (!resultUrl) { resolvePublishedError.value = '请填写平台官方公开作品链接'; return }
  if (!window.confirm('该操作只用于人工确认平台已经发布成功。确认后任务将记为成功且不能自动重发，是否继续？')) return
  resolvePublishedBusy.value = true
  resolvePublishedError.value = ''
  try {
    const result = await window.publisherDesktop.publisherResolvePublished(current.value.id, resultUrl)
    if (!result || result.message) { resolvePublishedError.value = result?.message ?? '人工核验结果提交失败'; return }
    if (result.state) state.value = result.state
    resolvePublishedUrl.value = ''
  } finally { resolvePublishedBusy.value = false }
}

let stopPageLinkListener: (() => void) | null = null
let stopStateListener: (() => void) | null = null
let stopSessionListener: (() => void) | null = null
onMounted(async () => { stopPageLinkListener = window.publisherDesktop.onOpenPage((target) => { pendingTarget.value = target; applyPendingTarget() }); stopStateListener = window.publisherDesktop.onStateUpdated((next) => { state.value = next }); stopSessionListener = window.publisherDesktop.onSessionUpdated((next) => { publisherSession.value = next; if (!next.connected) state.value = null }); await window.publisherDesktop.rendererReady(); const [info, initialUpdate] = await Promise.all([window.publisherDesktop.getStatus(), window.publisherDesktop.getUpdateStatus()]); appVersion.value = info?.version ?? '—'; deviceProtection.value = info?.deviceProtection ?? null; publisherSession.value = info?.publisherSession ?? publisherSession.value; updateStatus.value = initialUpdate; if (publisherSession.value.connected) { state.value = await window.publisherDesktop.getState(); applyPendingTarget(); await sync() } })
onBeforeUnmount(() => { stopPageLinkListener?.(); stopStateListener?.(); stopSessionListener?.() })
</script>

<template>
  <main v-if="publisherSession.connected">
    <aside>
      <div class="brand"><img :src="brandMark" alt="豆包获客" style="display:block;width:31px;height:31px" /><div><strong>豆包获客</strong><span>发布助手</span></div></div>
      <nav><button v-for="item in ['任务队列', '媒体账号', '执行日志', '设置']" :key="item" :class="{ active: active === item }" @click="active = item">{{ item }}</button></nav>
      <section class="local"><span>ENCRYPTED SESSION VAULT</span><strong>会话加密托管</strong><p>可移植会话包经平台密钥加密后备份；二维码和账号密码不上传。</p></section>
      <footer>桌面端 V{{ appVersion }}</footer>
    </aside>
    <section class="content">
      <header>
        <div><span>WINDOWS LOCAL EXECUTOR</span><h1>{{ active }}</h1></div>
        <div class="head-actions">
          <b>当前商户：{{ publisherSession.username }}</b><button class="sync" @click="sync">同步任务</button><button v-if="publisherSession.workspaces.length > 1" class="secondary" @click="showWorkspaceChooser(false)">切换商户</button><button class="secondary" @click="showWorkspaceChooser(true)">添加商户</button><button class="secondary" @click="logout">退出此账号</button>
          <b :class="paused ? 'paused' : ''">{{ paused ? '已暂停' : '本地助手在线' }}</b><button @click="pause">{{ paused ? '恢复轮询' : '人工暂停' }}</button>
        </div>
        <p v-if="loginError" class="login-error">{{ loginError }}</p>
      </header>
      <template v-if="active === '任务队列'">
        <section class="overview"><article><span>等待执行</span><strong>{{ tasks.filter((task) => task.status === 'queued').length }}</strong><small>自动逐条领取</small></article><article><span>正在执行</span><strong>{{ tasks.filter((task) => task.status === 'running').length }}</strong><small>自动上传并发布</small></article><article><span>需人工处理</span><strong>{{ tasks.filter((task) => task.status === 'attention').length }}</strong><small>仅验证码或异常</small></article></section>
        <section class="board">
          <div class="queue"><header><strong>发布队列</strong><span>{{ tasks.length }} 条真实任务</span></header><button v-for="task in tasks" :key="task.id" :class="['task', { selected: task.id === selected }]" @click="selected = task.id; taskPreview = null; resolvePublishedUrl = ''; resolvePublishedError = ''"><i>{{ platform(task.platform) }}</i><div><strong>{{ task.title }}</strong><small>{{ new Date(task.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</small></div><b :class="task.status">{{ status(task.status) }}</b></button></div>
          <article v-if="current" class="detail">
            <span>LOCAL EXECUTION DETAIL</span><h2>{{ current.title }}</h2><div class="badges"><b>{{ platform(current.platform) }}</b><b :class="current.status">{{ status(current.status) }}</b></div>
            <section><strong>全自动执行</strong><p>助手按目标媒体账号逐条执行：恢复加密会话、下载版本配图、填写内容、关闭已知提示、最终发布并回传官方链接。验证码、短信、风控、页面改版或结果不明时才停止并转人工。</p></section>
            <section v-if="current.status === 'attention'" class="attention-card"><strong>需要人工处理</strong><p>{{ current.failureReason || '未记录异常原因，禁止自动续发。' }}</p><small v-if="current.canResume">请仅在已打开的平台窗口完成登录或安全验证；验证通过后助手会自动恢复当前任务，无需再次点击。</small><small v-else-if="current.canResolvePublished">请先到平台作品列表核验。若已发布，填写同平台官方公开链接确认成功；若未找到，仍禁止直接重发。</small><small v-else>为防止重复发布，该任务不允许自动续发；请修改文章后新建任务或联系运营处理。</small><div v-if="current.canResolvePublished" class="published-evidence"><input v-model="resolvePublishedUrl" type="url" maxlength="2000" placeholder="https://www.toutiao.com/... 或 https://www.douyin.com/..."><button :disabled="resolvePublishedBusy" @click="resolvePublished">{{ resolvePublishedBusy ? '正在核验…' : '确认平台已发布' }}</button></div><em v-if="resolvePublishedError" class="completion-error">{{ resolvePublishedError }}</em></section>
            <section v-if="taskPreview && taskPreview.id === current.id" class="task-preview"><strong>文章与配图快照（只读）</strong><p>V{{ taskPreview.article.version }} · {{ taskPreview.article.title }}</p><pre>{{ previewText(taskPreview.article.content) }}</pre><div><b :class="taskPreview.images.availability === 'ready' || taskPreview.images.availability === 'not_required' ? 'snapshot-ready' : 'snapshot-missing'">{{ imageAvailability(taskPreview.images.availability) }}</b><small>要求 {{ taskPreview.images.requiredCount }} 张，已读取 {{ taskPreview.images.images.length }} 张</small></div><ul v-if="taskPreview.images.images.length"><li v-for="image in taskPreview.images.images" :key="image.id">{{ image.fileName }} · {{ image.mimeType }}</li></ul><em v-if="taskPreview.images.missingImageIds.length">缺失 {{ taskPreview.images.missingImageIds.length }} 张原图；不可领取发布。</em><small class="preview-note">快照仅供核对；不提供人工复制、填写、领取或成功回传入口。正常发布由助手自动执行。</small></section>
            <div class="buttons"><button class="secondary" :disabled="!publisherSession.connected || taskPreviewBusy" @click="loadTaskPreview">{{ taskPreviewBusy ? '读取快照中…' : '核对文章与配图' }}</button></div>
          </article>
          <article v-else class="detail"><span>REAL TASKS ONLY</span><h2>暂无可执行任务</h2><section><strong>请先连接任务服务并同步</strong><p>这里不展示演示任务，也不能在本机伪造发布成功、失败或重试记录。</p></section></article>
        </section>
      </template>
      <template v-else-if="active === '媒体账号'">
        <section class="accounts-toolbar"><div><span>ADD MEDIA ACCOUNT</span><strong>添加独立发布账号</strong><p>同一平台可添加多个账号，每个账号使用独立浏览器资料目录。</p></div><select v-model="newMediaPlatform"><option value="toutiao">今日头条</option><option value="douyin">抖音</option></select><input v-model="newMediaLabel" maxlength="50" placeholder="账号备注，例如：头条主号" @keyup.enter="connect"><button :disabled="!newMediaLabel.trim() || mediaConnectBusy" @click="connect">{{ mediaConnectBusy ? '正在打开…' : '添加并扫码' }}</button></section>
        <section class="accounts"><article v-for="account in accounts" :key="account.localReferenceId"><header><strong>{{ platform(account.platform) }} · {{ account.maskedName }}</strong><b :class="account.status">{{ account.status === 'connected' ? '发布页已验证' : account.status === 'verification_required' ? '需验证' : '等待扫码' }}</b></header><p>独立资料 {{ account.localReferenceId.slice(0, 8) }}</p><small>最近校验：{{ account.checkedAt ? new Date(account.checkedAt).toLocaleString('zh-CN') : '—' }}</small><small>云端会话：{{ account.backupAvailable ? `已加密备份${account.backupCapturedAt ? ` · ${new Date(account.backupCapturedAt).toLocaleString('zh-CN')}` : ''}` : '等待自动验证后备份' }}</small><em v-if="account.reason">{{ account.reason }}</em><div class="account-actions"><button class="secondary" :disabled="account.status === 'connected'" @click="confirmConnect(account.localReferenceId)">重新校验</button><button class="secondary" :disabled="account.status !== 'connected'" @click="openPublisher(account.localReferenceId)">打开发布页</button></div></article><div v-if="!accounts.length" class="account-empty">尚未添加媒体账号。扫码完成后系统会自动验证发布页并生成加密会话备份。</div></section>
      </template>
      <template v-else-if="active === '执行日志'"><section class="log-panel"><p v-for="line in logs" :key="line">{{ line }}</p><small>完整调试日志默认仅保存在本机，不会上传后台。</small></section></template>
      <template v-else><section class="settings"><article><span>任务服务连接</span><strong>{{ publisherSession.connected ? `已连接：${publisherSession.username}` : '未连接' }}</strong><p>令牌只保存于当前 Windows 用户安全存储，渲染界面不会读取令牌。</p></article><article><span>最终发布模式</span><strong>全自动提交</strong><p>正常任务自动上传、填写、最终发布和回传；仅验证码、风控、页面改版或结果不明时转人工。</p></article><article><span>跨电脑会话</span><strong>平台密钥加密托管</strong><p>Cookie、LocalStorage、SessionStorage 和必要 IndexedDB 组成可移植会话包；二维码、账号密码和完整浏览器目录不上传。</p></article><article><span>任务同步</span><strong>{{ settings?.pollIntervalSeconds || '—' }} 秒</strong><p>连接后按上述间隔自动同步；也可手动同步。执行中的任务由设备租约心跳自动保活。</p></article><article><span>本地日志保留</span><strong>最多 100 条</strong><p>本地状态仅保留最近 100 条摘要日志，不会上传后台。</p></article><article><span>本机身份保护</span><strong>{{ deviceProtection?.available && deviceProtection?.initialized ? 'Windows 已保护' : '当前不可用' }}</strong><p>仅保存随机安装标识；登录后会与后台设备记录安全关联。</p></article><article class="update-card"><span>在线更新</span><strong :class="`update-${updateStatus?.phase ?? 'not_configured'}`">{{ updatePhaseLabel(updateStatus?.phase ?? 'not_configured') }}</strong><p>{{ updateStatus?.message ?? '仅在已安装版本中手动检查；开发环境和非 HTTPS 更新源均会被阻断。' }}</p><small v-if="updateStatus?.version">目标版本：{{ updateStatus.version }}</small><small v-if="updateStatus?.releaseNotes">{{ updateStatus.releaseNotes }}</small><div class="update-actions"><button :disabled="updateBusy || !publisherSession.connected" @click="checkUpdate">{{ updateBusy && updateStatus?.phase === 'checking' ? '检查中…' : '检查更新' }}</button><button v-if="updateStatus?.phase === 'available'" class="secondary" :disabled="updateBusy" @click="downloadUpdate">下载更新</button><button v-if="updateStatus?.phase === 'ready_to_install'" class="secondary" :disabled="updateBusy" @click="installUpdate">重启并安装</button></div></article></section></template>
    </section>
    <section class="logs"><header><strong>实时执行日志</strong><span>只保存在本机</span></header><p v-for="line in logs" :key="line">{{ line }}</p></section>
  </main>
  <section v-else class="auth-shell">
    <div class="auth-brand"><img :src="brandMark" alt="豆包获客"><div><span>WINDOWS LOCAL EXECUTOR</span><h1>豆包获客发布助手</h1><p>每个商户、平台和媒体账号相互隔离；登录后可恢复该账号的云端加密会话。</p></div></div>
    <article v-if="publisherSession.workspaces.length && !addingAccount" class="workspace-gate">
      <header><span>SELECT WORKSPACE</span><h2>选择商户工作区</h2><p>检测到多个已保存账号，请选择本次需要操作的商户。</p></header>
      <button v-for="workspace in publisherSession.workspaces" :key="workspace.workspaceId" class="workspace-option" @click="selectWorkspace(workspace.workspaceId)"><i>{{ workspace.username.slice(0, 1).toUpperCase() }}</i><div><strong>{{ workspace.username }}</strong><small>会话有效至 {{ new Date(workspace.expiresAt).toLocaleString('zh-CN') }}</small></div><b>进入工作区 →</b></button>
      <button class="add-workspace" @click="addingAccount = true">＋ 添加另一个商户账号</button>
    </article>
    <article v-else class="login-gate">
      <header><span>SECURE SIGN IN</span><h2>{{ publisherSession.workspaces.length ? '添加商户账号' : '登录发布助手' }}</h2><p>使用与网页客户端相同的商户账号和密码登录一次。</p></header>
      <label>商户账号<input v-model="loginUsername" maxlength="12" autocomplete="username" placeholder="6-12 位英文或数字" @keyup.enter="login"></label>
      <label>商户密码<input v-model="loginPassword" maxlength="12" autocomplete="current-password" type="password" placeholder="6-12 位英文或数字" @keyup.enter="login"></label>
      <p v-if="loginError" class="login-error">{{ loginError }}</p>
      <button class="login-submit" :disabled="loginBusy" @click="login">{{ loginBusy ? '正在安全登录…' : '登录并进入工作区' }}</button>
      <button v-if="publisherSession.workspaces.length" class="login-back" @click="addingAccount = false">返回工作区选择</button>
      <small>登录令牌由 Windows 当前用户安全存储保护；可移植平台会话经独立托管密钥加密后备份，二维码和账号密码不会上传。</small>
    </article>
    <footer>桌面端 V{{ appVersion }} · 本地安全边界</footer>
  </section>
</template>

<style scoped>
.attention-card{border-left-color:#efad4d!important}.attention-card small{display:block;margin-top:8px;color:#9eb0c8;line-height:1.55}.attention-card button{min-height:36px;margin-top:12px;padding:0 13px;border:1px solid #d99b43;border-radius:7px;color:#fff3dd;background:#5a3d17;cursor:pointer}.attention-card button:disabled{opacity:.55;cursor:not-allowed}
.published-evidence{display:grid;grid-template-columns:minmax(0,1fr) auto;margin-top:12px;gap:8px}.published-evidence input{min-height:38px;padding:0 11px;border:1px solid #365071;border-radius:7px;color:#e8f0ff;background:#07162a;outline:none}.published-evidence input:focus{border-color:#d99b43}.published-evidence button{margin-top:0;white-space:nowrap}
.success-confirm { border-left-color: #37c99b !important; }
.success-confirm input { display: block; width: 100%; min-height: 36px; margin-top: 12px; padding: 0 10px; border: 1px solid #456a94; border-radius: 6px; color: #e9eefb; background: #081a31; }
.success-confirm button { min-height: 35px; margin-top: 10px; padding: 0 12px; border: 1px solid #40b991; border-radius: 7px; color: #dffcf3; background: #123c35; cursor: pointer; }
.success-confirm button:disabled { opacity: .55; cursor: not-allowed; }
.completion-error { display: block; margin-top: 8px; color: #f0a1aa; font-size: 11px; font-style: normal; }
.completion-success { margin: 14px 0 -2px; padding: 10px 12px; border: 1px solid #2c8d72; border-radius: 8px; color: #81e5bd; background: #102f2a; font-size: 12px; }
.auto-fill { border-left-color: #7f6bff !important; }
.auto-fill button { min-height: 35px; margin-top: 10px; padding: 0 12px; border: 1px solid #7e70ff; border-radius: 7px; color: #f1efff; background: #312b71; cursor: pointer; }
.auto-fill button:disabled { opacity: .55; cursor: not-allowed; }
.auth-shell{display:grid;min-height:100vh;padding:58px;place-content:center;background:radial-gradient(circle at 75% 10%,#203c78 0,#09162c 36%,#050d19 72%)}
.auth-brand{display:flex;width:min(720px,calc(100vw - 48px));align-items:center;margin-bottom:22px;gap:15px}.auth-brand img{width:48px;height:48px}.auth-brand span,.auth-shell article header span{color:#8fa1ff;font:10px ui-monospace;letter-spacing:.12em}.auth-brand h1{margin:5px 0 4px;font-size:25px}.auth-brand p,.auth-shell header p{margin:0;color:#8f9eb4;font-size:12px}.auth-shell article{width:min(720px,calc(100vw - 48px));padding:28px;border:1px solid #294567;border-radius:14px;background:linear-gradient(145deg,rgba(15,36,68,.96),rgba(7,21,41,.96));box-shadow:0 28px 80px rgba(0,0,0,.3)}.auth-shell h2{margin:7px 0;font-size:20px}.workspace-option{display:flex;width:100%;align-items:center;margin-top:12px;padding:14px;border:1px solid #2d4a70;border-radius:9px;color:#e8efff;background:#0c213e;text-align:left;gap:12px;cursor:pointer}.workspace-option:hover{border-color:#7779ff;background:#142c54}.workspace-option i{display:grid;width:36px;height:36px;place-items:center;border-radius:9px;color:#fff;background:linear-gradient(135deg,#4b7bff,#8862ff);font-style:normal}.workspace-option div{display:grid;flex:1;gap:4px}.workspace-option small{color:#8294ae}.workspace-option b{color:#aeb8ff;font-size:11px}.add-workspace,.login-back{margin-top:14px;border:0;color:#9cacf0;background:transparent;cursor:pointer}.login-gate label{display:grid;margin-top:16px;color:#aab7ca;font-size:11px;gap:7px}.login-gate input{min-height:43px;padding:0 12px;border:1px solid #35557d;border-radius:8px;color:#eef3ff;background:#081a31;outline:none}.login-gate input:focus{border-color:#7978ff;box-shadow:0 0 0 3px rgba(121,120,255,.12)}.login-submit{width:100%;min-height:44px;margin-top:18px;border:1px solid #7779ff;border-radius:8px;color:#fff;background:linear-gradient(90deg,#5150db,#8062ee);cursor:pointer}.login-submit:disabled{opacity:.55}.login-gate>small{display:block;margin-top:18px;color:#7689a3;line-height:1.6}.auth-shell>footer{margin-top:16px;color:#687a94;font-size:10px;text-align:center}
.accounts-toolbar{display:grid;grid-template-columns:minmax(240px,1fr) 130px minmax(220px,320px) auto;align-items:end;margin-top:20px;padding:17px;border:1px solid #294567;border-radius:10px;background:#0b1930;gap:12px}.accounts-toolbar div{display:grid;gap:4px}.accounts-toolbar span{color:#95a5ff;font:10px ui-monospace;letter-spacing:.09em}.accounts-toolbar strong{font-size:14px}.accounts-toolbar p{margin:0;color:#8292a9;font-size:10px}.accounts-toolbar select,.accounts-toolbar input{min-height:38px;padding:0 10px;border:1px solid #35557d;border-radius:7px;color:#e9eefb;background:#081a31}.accounts-toolbar button{min-height:38px;padding:0 14px;border:1px solid #7779ff;border-radius:7px;color:#fff;background:linear-gradient(90deg,#5150db,#8062ee);cursor:pointer}.accounts-toolbar button:disabled{opacity:.5}.account-empty{grid-column:1/-1;padding:40px;border:1px dashed #294567;border-radius:10px;color:#8292a9;text-align:center}
</style>
