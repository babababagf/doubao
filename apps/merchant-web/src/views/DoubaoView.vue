<script setup lang="ts">
import type { DoubaoCheckResult } from '@doubaohk/api-contract'
import { InfoFilled, RefreshRight, Search } from '@element-plus/icons-vue'
import { computed, onMounted, ref } from 'vue'

import { listDoubaoResults } from '@/services/merchant.service'
import { formatDateTime } from '@/utils/format'

const results = ref<DoubaoCheckResult[]>([])
const loading = ref(true)
const errorMessage = ref('')
const query = ref('')
const filter = ref<'all' | 'matched' | 'unmatched'>('all')
const visible = computed(() => results.value.filter((item) => (filter.value === 'all' || item.matched === (filter.value === 'matched')) && (!query.value.trim() || `${item.question}${item.answer}`.includes(query.value.trim()))))
const matchedCount = computed(() => results.value.filter((item) => item.matched).length)
async function load(): Promise<void> { loading.value=true; errorMessage.value=''; try { results.value=await listDoubaoResults() } catch(error) { errorMessage.value=error instanceof Error?error.message:'检测结果加载失败' } finally { loading.value=false } }
onMounted(()=>{void load()})
</script>
<template><div class="doubao-page"><header class="page-intro"><div><span class="eyebrow">DOUBAO NAME-MATCH REPORT</span><h2>豆包检测</h2><p>只读查看最近检测结果；“豆包收录数”是回答中命中企业全称或简称的问题数，不代表豆包官方索引收录。</p></div><button class="secondary" :disabled="loading" @click="load"><el-icon><RefreshRight /></el-icon>刷新结果</button></header><section class="notice surface-panel"><el-icon><InfoFilled /></el-icon><p>检测与重试仅由贴牌后台创建。商户端不能调用豆包 API，也不会扣除商户算力点数。</p></section><section class="summary surface-panel"><div><span>已成功检测</span><strong>{{ results.filter(item => item.apiStatus === 'succeeded').length }}</strong></div><div><span>豆包收录数</span><strong>{{ matchedCount }}</strong></div><div><span>名称命中率</span><strong>{{ results.filter(item => item.apiStatus === 'succeeded').length ? Math.round(matchedCount/results.filter(item => item.apiStatus === 'succeeded').length*100) : 0 }}%</strong></div><small>实时读取贴牌检测任务结果</small></section><section v-if="errorMessage" class="error surface-panel"><strong>检测结果无法加载</strong><p>{{ errorMessage }}</p></section><section v-else class="result-panel surface-panel"><header><div class="search"><el-icon><Search /></el-icon><input v-model="query" placeholder="搜索问题或回答" /></div><select v-model="filter"><option value="all">全部结果</option><option value="matched">已命中</option><option value="unmatched">未命中</option></select></header><div v-if="loading" class="loading">正在加载检测结果…</div><article v-for="item in visible" v-else :key="item.id" class="result"><div class="result-top"><span :class="item.matched?'matched':'unmatched'">{{ item.apiStatus === 'pending' ? '等待检测' : item.apiStatus === 'running' ? '正在检测' : item.matched?'名称已命中':'未命中名称' }}</span><small>{{ item.checkedAt ? formatDateTime(item.checkedAt) : '尚未完成' }}</small></div><h3>{{ item.question }}</h3><p>{{ item.answer || item.failureReason || '检测任务等待处理。' }}</p><div v-if="item.sources.length" class="sources"><span>检索来源：</span><a v-for="source in item.sources" :key="source.url" :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }}</a></div><footer><span>命中名称：{{ item.matchedName || '—' }}</span><span>接口状态：{{ item.apiStatus==='succeeded'?'成功':item.apiStatus==='failed'?'失败':item.apiStatus==='running'?'进行中':'排队中' }}</span></footer></article><div v-if="!loading&&!visible.length" class="loading">没有符合条件的检测结果</div></section></div></template>
<style scoped>.doubao-page{display:grid;max-width:1500px;margin:0 auto;gap:16px}.page-intro,.notice,.summary,.result-panel header,.search,.result-top,.result footer,.sources{display:flex;align-items:center}.page-intro{justify-content:space-between;gap:20px}.eyebrow{display:block;margin-bottom:5px;color:var(--color-champagne);font-family:var(--font-mono);font-size:10px;letter-spacing:.13em}h2,h3,p{margin:0}h2{font-size:26px;letter-spacing:-.035em}.page-intro p{margin-top:5px;color:var(--color-text-secondary)}.secondary{display:inline-flex;min-height:38px;align-items:center;padding:0 14px;border:1px solid var(--color-border-strong);border-radius:8px;color:var(--color-text-secondary);background:rgba(13,28,52,.68);cursor:pointer;gap:7px}.notice{padding:13px 16px;border-color:rgba(102,203,221,.24);align-items:flex-start;color:var(--color-text-secondary);gap:10px}.notice .el-icon{margin-top:1px;color:#61d2e8}.notice p{font-size:12px;line-height:1.65}.summary{padding:16px;gap:38px}.summary div{display:grid;gap:5px}.summary span,.summary small{color:var(--color-text-muted);font-size:11px}.summary strong{font-family:var(--font-mono);font-size:24px}.summary small{margin-left:auto}.result-panel{padding:18px}.result-panel header{justify-content:space-between;padding-bottom:14px;border-bottom:1px solid var(--color-border);gap:10px}.search{min-width:0;flex:1;padding:0 10px;border:1px solid rgba(145,168,205,.22);border-radius:7px;color:var(--color-text-muted);gap:7px}.search input,select{border:0;outline:0;color:var(--color-text);background:transparent;font:inherit}.search input{min-width:0;flex:1;height:35px}select{height:35px;padding:0 8px;border:1px solid rgba(145,168,205,.22);border-radius:7px}.result{padding:15px 2px;border-bottom:1px solid var(--color-border)}.result-top{justify-content:space-between}.result-top span{padding:3px 7px;border-radius:4px;font-size:10px}.matched{color:#6dd9ac;background:rgba(68,195,135,.11)}.unmatched{color:#e4b46d;background:rgba(222,161,66,.1)}.result-top small,.result footer{color:var(--color-text-muted);font-size:10px}.result h3{margin-top:9px;font-size:14px}.result p{margin-top:7px;color:var(--color-text-secondary);font-size:12px;line-height:1.65}.sources{flex-wrap:wrap;margin-top:9px;color:var(--color-text-muted);font-size:10px;gap:6px}.sources a{max-width:220px;overflow:hidden;color:#74dcea;text-decoration:none;text-overflow:ellipsis;white-space:nowrap}.sources a:hover{text-decoration:underline}.result footer{margin-top:10px;gap:16px}.loading,.error{padding:35px;color:var(--color-text-muted);text-align:center}.error p{margin-top:6px}@media(max-width:680px){.page-intro{align-items:flex-start;flex-direction:column}.summary{display:grid;grid-template-columns:1fr 1fr;gap:16px}.summary small{margin-left:0}.result-panel header{align-items:stretch;flex-direction:column}}</style>

<style scoped>
/* 检测状态、命中依据和时间均属于业务信息，统一提升可读性。 */
.summary span,
.summary small,
.result-top span,
.result-top small,
.result footer,
.sources {
  font-size: 14px;
}

.result h3 {
  font-size: 16px;
}

.result p {
  font-size: 15px;
}
</style>
