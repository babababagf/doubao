<script setup lang="ts">
import type { MediaAccount } from '@doubaohk/api-contract'
import { Connection, InfoFilled, RefreshRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { onMounted, ref } from 'vue'
import { listMediaAccounts } from '@/services/merchant.service'
import { formatDateTime } from '@/utils/format'
const accounts=ref<MediaAccount[]>([]);const loading=ref(true);const opening=ref<string|null>(null);const error=ref('')
const name=(p:string)=>p==='toutiao'?'今日头条':'抖音'; const status=(s:string)=>({connected:'已连接',expired:'已过期',verification_required:'需验证',unbound:'未绑定',connection_requested:'等待本地助手'}[s]||s)
async function load(){loading.value=true;error.value='';try{accounts.value=await listMediaAccounts()}catch(e){error.value=e instanceof Error?e.message:'账号状态加载失败'}finally{loading.value=false}}
function connect(platform:'toutiao'|'douyin'){opening.value=platform;window.location.href='doubaohk-publisher://open/media';window.setTimeout(()=>{opening.value=null},900);ElMessage.info(`已尝试唤起本地发布助手，请在助手内完成${name(platform)}扫码`) }
onMounted(()=>{void load()})
</script>
<template>
  <div class="media-page">
    <header><div><span>LOCAL PUBLISH ASSISTANT</span><h2>媒体账号</h2><p>网页端显示账号状态与加密会话备份情况；真实发布仍由本地助手执行。</p></div><button @click="load"><el-icon><RefreshRight /></el-icon>刷新</button></header>
    <section class="notice surface-panel"><el-icon><InfoFilled /></el-icon><p>每个媒体账号使用独立本地资料目录。验证成功后，Cookie、LocalStorage、SessionStorage 和必要 IndexedDB 整理成可移植会话包，经平台托管密钥加密后备份；不上传账号密码、二维码或完整浏览器目录。换电脑可优先恢复，会话过期或平台风控时才需重新扫码。</p></section>
    <section v-if="error" class="surface-panel error">{{ error }}</section>
    <section v-else class="cards">
      <article v-for="item in accounts" :key="item.id||item.localReferenceId||item.platform" class="card surface-panel">
        <div class="platform"><span>{{ name(item.platform) }}</span><b :class="item.status">{{ status(item.status) }}</b></div>
        <strong>{{ item.maskedName||'尚未绑定账号' }}</strong><p>本地引用：{{ item.localReferenceId||'—' }}</p>
        <dl><div><dt>最近验证</dt><dd>{{ item.lastVerifiedAt?formatDateTime(item.lastVerifiedAt):'—' }}</dd></div><div><dt>最近心跳</dt><dd>{{ item.lastHeartbeatAt?formatDateTime(item.lastHeartbeatAt):'—' }}</dd></div><div><dt>加密会话备份</dt><dd>{{ item.backupAvailable?(item.backupCapturedAt?formatDateTime(item.backupCapturedAt):'已备份'):'暂无' }}</dd></div></dl>
        <small v-if="item.failureReason">{{ item.failureReason }}</small><button class="connect" :disabled="opening===item.platform" @click="connect(item.platform)"><el-icon><Connection /></el-icon>{{ opening===item.platform?'正在唤起…':item.status==='connected'?'打开本地助手':'打开本地助手扫码' }}</button>
      </article>
      <div v-if="loading" class="loading">正在读取媒体账号与会话备份状态…</div>
    </section>
  </div>
</template>
<style scoped>.media-page{display:grid;max-width:1500px;margin:0 auto;gap:16px}.media-page header,.notice,.platform{display:flex;align-items:center}.media-page header{justify-content:space-between}.media-page header span{color:var(--color-champagne);font:10px var(--font-mono);letter-spacing:.13em}h2,p{margin:0}h2{margin-top:5px;font-size:26px}.media-page header p{margin-top:5px;color:var(--color-text-secondary)}button{display:inline-flex;min-height:38px;align-items:center;justify-content:center;padding:0 13px;border:1px solid var(--color-border-strong);border-radius:8px;color:var(--color-text-secondary);background:rgba(13,28,52,.68);cursor:pointer;gap:7px}.notice{padding:13px 16px;align-items:flex-start;color:var(--color-text-secondary);gap:10px}.notice .el-icon{margin-top:2px;color:#61d2e8}.notice p{font-size:12px;line-height:1.65}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.card{padding:20px}.platform{justify-content:space-between}.platform span{font-size:17px;font-weight:650}.platform b{padding:4px 7px;border-radius:5px;font-size:10px}.connected{color:#70d6aa;background:rgba(72,198,137,.1)}.verification_required,.expired{color:#e4b46d;background:rgba(222,161,66,.1)}.connection_requested{color:#afb7ff;background:rgba(99,90,255,.13)}.card>strong{display:block;margin-top:22px;font-size:15px}.card>p,.card small{display:block;margin-top:5px;color:var(--color-text-muted);font:11px var(--font-mono)}dl{display:grid;margin:20px 0;gap:9px}dl div{display:flex;justify-content:space-between}dt{color:var(--color-text-muted);font-size:11px}dd{margin:0;color:var(--color-text-secondary);font-size:11px}.connect{width:100%;margin-top:16px;color:#fff;border-color:rgba(113,111,255,.62);background:var(--gradient-primary)}.loading,.error{padding:30px;color:var(--color-text-muted);text-align:center}@media(max-width:680px){.media-page header{align-items:flex-start;flex-direction:column}.cards{grid-template-columns:1fr}}</style>
