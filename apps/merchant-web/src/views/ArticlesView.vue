<script setup lang="ts">
import type { ArticleInput, GalleryImage, MerchantArticle, MerchantGallery } from "@doubaohk/api-contract";
import {
  Delete,
  DocumentAdd,
  EditPen,
  Picture,
  Plus,
  RefreshRight,
  Search,
} from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import RichTextEditor from "@/components/RichTextEditor.vue";
import { ApiError, isRealApiMode } from "@/services/http";
import {
  createArticle,
  deleteArticle,
  listArticles,
  listGalleries,
  listGalleryImages,
  updateArticle,
} from "@/services/merchant.service";
import { formatDateTime } from "@/utils/format";

const route = useRoute();
const router = useRouter();
const articles = ref<MerchantArticle[]>([]);
const selectedId = ref<string | null>(null);
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const search = ref("");
const sourceFilter = ref<"all" | MerchantArticle["source"]>("all");
const statusFilter = ref<"all" | MerchantArticle["status"]>("all");
const galleries = ref<MerchantGallery[]>([]);
const galleryImages = ref<GalleryImage[]>([]);
const loadingImages = ref(false);
const form = reactive<ArticleInput>({
  title: "",
  content: "",
  status: "draft",
  galleryId: null,
  galleryImageIds: [],
});

const selectedArticle = computed(
  () =>
    articles.value.find((article) => article.id === selectedId.value) ?? null,
);
const visibleArticles = computed(() => {
  const searchText = search.value.trim().toLocaleLowerCase("zh-CN");
  return articles.value.filter((article) => {
    const matchedSearch =
      !searchText ||
      `${article.title}\n${article.content}`
        .toLocaleLowerCase("zh-CN")
        .includes(searchText);
    const matchedSource =
      sourceFilter.value === "all" || article.source === sourceFilter.value;
    const matchedStatus =
      statusFilter.value === "all" || article.status === statusFilter.value;
    return matchedSearch && matchedSource && matchedStatus;
  });
});
const selectedGallery = computed(() => galleries.value.find((gallery) => gallery.id === form.galleryId) ?? null);

function contentText(content: string): string {
  const node = document.createElement("div");
  node.innerHTML = content;
  return (node.textContent ?? "").replace(/\s+/g, " ").trim();
}

function articleExcerpt(article: MerchantArticle): string {
  return contentText(article.content);
}

function statusLabel(status: MerchantArticle["status"]): string {
  return {
    draft: "草稿",
    pending_review: "待审核",
    publishable: "可发布",
    disabled: "停用",
  }[status];
}

function clearForm(): void {
  selectedId.value = null;
  form.title = "";
  form.content = "";
  form.status = "draft";
  form.galleryId = null;
  form.galleryImageIds = [];
  galleryImages.value = [];
}

function selectArticle(article: MerchantArticle): void {
  selectedId.value = article.id;
  form.title = article.title;
  form.content = article.content;
  form.status = article.status;
  form.galleryId = article.galleryId;
  form.galleryImageIds = [...article.galleryImageIds];
  void loadGalleryImages(article.galleryId);
}

async function loadGalleries(): Promise<void> {
  try {
    galleries.value = await listGalleries();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "图库列表加载失败");
  }
}

async function loadGalleryImages(galleryId: string | null): Promise<void> {
  if (!galleryId) {
    galleryImages.value = [];
    form.galleryImageIds = [];
    return;
  }
  loadingImages.value = true;
  const requestedGalleryId = galleryId;
  try {
    const result = await listGalleryImages(galleryId);
    if (form.galleryId !== requestedGalleryId) return;
    galleryImages.value = result;
    const validIds = new Set(result.map((image) => image.id));
    form.galleryImageIds = form.galleryImageIds.filter((id) => validIds.has(id));
  } catch (error) {
    if (form.galleryId === requestedGalleryId) galleryImages.value = [];
    ElMessage.error(error instanceof Error ? error.message : "图库图片加载失败");
  } finally {
    if (form.galleryId === requestedGalleryId) loadingImages.value = false;
  }
}

function handleGalleryChange(): void {
  form.galleryImageIds = [];
  void loadGalleryImages(form.galleryId);
}

function toggleImage(imageId: string): void {
  const index = form.galleryImageIds.indexOf(imageId);
  if (index >= 0) {
    form.galleryImageIds.splice(index, 1);
    return;
  }
  if (form.galleryImageIds.length >= 3) {
    ElMessage.warning("每篇文章最多选择 3 张配图");
    return;
  }
  form.galleryImageIds.push(imageId);
}

async function loadArticles(preferredId?: string): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  try {
    const result = await listArticles();
    articles.value = result;
    const target =
      result.find(
        (article) => article.id === (preferredId ?? selectedId.value),
      ) ?? result[0];
    if (target) selectArticle(target);
    else clearForm();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "文章列表加载失败";
  } finally {
    loading.value = false;
  }
}

async function saveArticle(): Promise<void> {
  if (form.title.trim().length < 2 || contentText(form.content).length < 20) {
    ElMessage.warning("文章标题至少 2 个字符，正文至少 20 个字符");
    return;
  }
  if (form.content.length > 30000) {
    ElMessage.warning("文章 HTML 内容不能超过 30000 个字符");
    return;
  }
  saving.value = true;
  const articleId = selectedId.value;
  try {
    const input = {
      title: form.title.trim(),
      content: form.content.trim(),
      status: form.status,
      galleryId: form.galleryId,
      galleryImageIds: [...form.galleryImageIds],
    };
    const result = articleId
      ? await updateArticle(articleId, input)
      : await createArticle(input);
    await loadArticles(result.id);
    ElMessage.success(articleId ? "文章已更新" : "手动文章已创建");
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : "文章保存失败");
  } finally {
    saving.value = false;
  }
}

async function removeArticle(): Promise<void> {
  const article = selectedArticle.value;
  if (!article || !window.confirm(`确认删除文章“${article.title}”吗？`)) return;
  saving.value = true;
  try {
    await deleteArticle(article.id);
    await loadArticles();
    ElMessage.success("文章已删除");
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : "文章删除失败");
  } finally {
    saving.value = false;
  }
}

function goToCreate(): void {
  void router.push({ name: "content-create" });
}

onMounted(() => {
  void Promise.all([loadGalleries(), loadArticles()]);
  const created = Number(route.query.created);
  if (!isRealApiMode && Number.isInteger(created) && created > 0)
    ElMessage.success(`已新增 ${created} 篇本地 Mock 草稿`);
});
</script>

<template>
  <div class="articles-page">
    <header class="page-intro">
      <div>
        <span class="eyebrow">CONTENT ASSET REGISTER</span>
        <h2>文章列表</h2>
        <p>
          统一查看 AI
          创作文章和手动文章；AI 成功生成后直接进入可发布状态，每次实际编辑保留新版本。发布任务固定使用创建时的版本，编辑原文不会重置去重；如需发布新内容，请手动新建一篇独立文章。
        </p>
      </div>
      <div class="intro-actions">
        <button
          class="secondary-button"
          type="button"
          :disabled="loading"
          @click="() => loadArticles()"
        >
          <el-icon><RefreshRight /></el-icon>刷新</button
        ><button class="primary-button" type="button" @click="goToCreate">
          <el-icon><DocumentAdd /></el-icon>AI 创作</button
        ><button class="secondary-button" type="button" @click="clearForm">
          <el-icon><Plus /></el-icon>手动新增
        </button>
      </div>
    </header>
    <section class="mock-notice surface-panel">
      <template v-if="isRealApiMode"
        >AI 生成文章来自后台异步任务；<strong
          >请在发布前核验事实、联系方式与合规表述。</strong
        ></template
      ><template v-else
        >当前文章数据为本地 Mock；<strong
          >AI Mock 草稿不代表已调用模型，也不代表已扣算力或写作篇数。</strong
        ></template
      >
    </section>
    <section v-if="errorMessage" class="error-panel surface-panel">
      <strong>文章暂时无法加载</strong>
      <p>{{ errorMessage }}</p>
      <button
        class="secondary-button"
        type="button"
        @click="() => loadArticles()"
      >
        重新加载
      </button>
    </section>
    <section v-else class="workspace">
      <aside class="article-list surface-panel">
        <header class="list-header">
          <div class="search-box">
            <el-icon><Search /></el-icon
            ><input v-model="search" placeholder="搜索标题或正文" />
          </div>
          <select v-model="sourceFilter">
            <option value="all">全部来源</option>
            <option value="ai_generated">AI 生成</option>
            <option value="ai_mock">AI Mock</option>
            <option value="manual">手动新增</option></select
          ><select v-model="statusFilter">
            <option value="all">全部状态</option>
            <option value="draft">草稿</option>
            <option value="publishable">可发布</option>
            <option value="disabled">停用</option>
          </select>
        </header>
        <div v-if="loading" class="skeleton">
          <span v-for="index in 4" :key="index" />
        </div>
        <div v-else-if="visibleArticles.length" class="article-items">
          <button
            v-for="article in visibleArticles"
            :key="article.id"
            class="article-item"
            :class="{ 'is-selected': article.id === selectedId }"
            type="button"
            @click="selectArticle(article)"
          >
            <div class="article-top">
              <span :class="['source-tag', article.source]">{{
                article.source === "ai_generated"
                  ? "AI 生成"
                  : article.source === "ai_mock"
                    ? "AI Mock"
                    : "手动"
              }}</span
              ><span :class="['status-tag', article.status]">{{
                statusLabel(article.status)
              }}</span>
            </div>
            <strong>{{ article.title }}</strong>
            <p>{{ articleExcerpt(article) }}</p>
            <small
              >V{{ article.currentVersion }} ·
              {{ formatDateTime(article.updatedAt) }} ·
              {{ article.imageCount }} 张配图</small
            >
          </button>
        </div>
        <div v-else class="empty">
          <el-icon><Search /></el-icon><span>没有匹配的文章</span>
        </div>
      </aside>
      <main class="editor surface-panel">
        <header class="editor-heading">
          <div>
            <span class="panel-kicker">{{
              selectedArticle
                ? selectedArticle.source === "ai_generated"
                  ? "AI GENERATED ARTICLE"
                  : selectedArticle.source === "ai_mock"
                    ? "AI MOCK DRAFT"
                    : "MANUAL ARTICLE"
                : "NEW MANUAL ARTICLE"
            }}</span>
            <h3>{{ selectedArticle ? "编辑文章" : "手动新增文章" }}</h3>
          </div>
          <div class="editor-actions">
            <button
              v-if="selectedArticle"
              class="compact-button danger"
              type="button"
              :disabled="saving"
              aria-label="删除当前文章"
              @click="removeArticle"
            >
              <el-icon><Delete /></el-icon></button
            ><button
              class="primary-button"
              type="button"
              :disabled="saving"
              @click="saveArticle"
            >
              <el-icon><EditPen /></el-icon
              >{{ saving ? "保存中…" : "保存文章" }}
            </button>
          </div>
        </header>
        <div v-if="selectedArticle" class="article-meta">
          <span>当前版本：V{{ selectedArticle.currentVersion }}</span
          ><span
            >来源：{{
              selectedArticle.source === "ai_generated"
                ? "AI 生成"
                : selectedArticle.source === "ai_mock"
                  ? "本地 AI Mock"
                  : "手动新增"
            }}</span
          ><span>关键词：{{ selectedArticle.keywordId || "未关联" }}</span
          ><span>配图：{{ selectedArticle.imageCount }} 张</span>
        </div>
        <div class="editor-form">
          <label class="field"
            ><span>文章标题 <i>*</i></span
            ><input
              v-model="form.title"
              maxlength="150"
              placeholder="输入文章标题" /></label
          ><label class="field"
            ><span>正文 <i>*</i></span>
            <RichTextEditor v-model="form.content" :disabled="saving" placeholder="输入已核验的文章正文；可使用小标题、列表和重点加粗" />
          </label>
          <section class="asset-picker">
            <div class="asset-heading">
              <div><span class="panel-kicker">ARTICLE VISUALS</span><strong>文章配图</strong><p>从企业图库选择 0–3 张，保存时固定到新的文章版本。</p></div>
              <span class="asset-count">{{ form.galleryImageIds.length }} / 3</span>
            </div>
            <label class="field gallery-field"><span>素材图库</span><select v-model="form.galleryId" :disabled="saving" @change="handleGalleryChange"><option :value="null">不使用配图</option><option v-for="gallery in galleries" :key="gallery.id" :value="gallery.id">{{ gallery.name }} · {{ gallery.imageCount }} 张</option></select></label>
            <div v-if="loadingImages" class="asset-loading"><span v-for="index in 3" :key="index" /></div>
            <div v-else-if="galleryImages.length" class="asset-grid">
              <button v-for="image in galleryImages" :key="image.id" class="asset-card" :class="{ 'is-selected': form.galleryImageIds.includes(image.id) }" type="button" :disabled="saving" @click="toggleImage(image.id)">
                <span class="asset-preview"><img v-if="image.url" :src="image.url" :alt="image.fileName" /><el-icon v-else><Picture /></el-icon><b>{{ form.galleryImageIds.indexOf(image.id) + 1 || '' }}</b></span>
                <span class="asset-name">{{ image.fileName }}</span>
              </button>
            </div>
            <div v-else class="asset-empty"><el-icon><Picture /></el-icon><span>{{ selectedGallery ? '当前图库没有可用图片' : '不使用图库时文章将保存为无图文章' }}</span></div>
          </section>
          <label class="field status-field"
            ><span>文章状态</span
            ><select v-model="form.status">
              <option value="draft">草稿</option>
              <option value="publishable">可发布</option>
              <option value="disabled">停用</option></select
            ><small
              >“可发布”才可生成网站页面和媒体发布任务；保存实际变更会生成新版本，不会自动同步到媒体平台。</small
            ></label
          >
        </div>
      </main>
    </section>
  </div>
</template>

<style scoped>
.articles-page {
  display: grid;
  max-width: 1500px;
  margin: 0 auto;
  gap: 16px;
}
.page-intro,
.intro-actions,
.list-header,
.search-box,
.editor-heading,
.editor-actions,
.article-top {
  display: flex;
  align-items: center;
}
.page-intro {
  justify-content: space-between;
  gap: 24px;
}
.eyebrow,
.panel-kicker {
  display: block;
  color: var(--color-champagne);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.13em;
}
.eyebrow {
  margin-bottom: 5px;
}
h2,
h3,
p {
  margin: 0;
}
h2 {
  font-size: 26px;
  font-weight: 670;
  letter-spacing: -0.035em;
}
.page-intro p {
  margin-top: 5px;
  color: var(--color-text-secondary);
}
.intro-actions {
  gap: 8px;
}
.secondary-button,
.primary-button,
.compact-button {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  padding: 0 13px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  color: var(--color-text-secondary);
  background: rgba(13, 28, 52, 0.68);
  cursor: pointer;
  gap: 7px;
  white-space: nowrap;
}
.primary-button {
  border-color: rgba(113, 111, 255, 0.62);
  color: #fff;
  background: var(--gradient-primary);
}
.compact-button {
  width: 38px;
  padding: 0;
}
.danger {
  color: #e77d8e;
  border-color: rgba(251, 113, 133, 0.22);
  background: rgba(251, 113, 133, 0.05);
}
.secondary-button:disabled,
.primary-button:disabled,
.compact-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.mock-notice {
  padding: 12px 16px;
  border-color: rgba(102, 203, 221, 0.24);
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.workspace {
  display: grid;
  grid-template-columns: minmax(350px, 0.9fr) minmax(0, 1.5fr);
  align-items: start;
  gap: 16px;
}
.article-list,
.editor {
  min-width: 0;
  padding: 22px;
}
.list-header {
  padding-bottom: 15px;
  border-bottom: 1px solid var(--color-border);
  gap: 8px;
}
.search-box {
  min-width: 0;
  flex: 1;
  padding: 0 9px;
  border: 1px solid rgba(145, 168, 205, 0.22);
  border-radius: 7px;
  color: var(--color-text-muted);
  gap: 7px;
}
.list-header select {
  width: 88px;
}
.search-box input,
.list-header select,
input,
textarea,
.status-field select {
  border: 0;
  outline: 0;
  color: var(--color-text);
  background: transparent;
  font: inherit;
}
.search-box input {
  min-width: 0;
  flex: 1;
  height: 34px;
}
.list-header select {
  height: 34px;
  padding: 0 4px;
  border: 1px solid rgba(145, 168, 205, 0.22);
  border-radius: 7px;
  font-size: 11px;
}
.article-items {
  display: grid;
  margin-top: 13px;
  gap: 8px;
}
.article-item {
  width: 100%;
  padding: 12px;
  border: 1px solid rgba(145, 168, 205, 0.14);
  border-radius: 9px;
  color: inherit;
  background: rgba(9, 22, 42, 0.34);
  cursor: pointer;
  text-align: left;
}
.article-item:hover,
.article-item.is-selected {
  border-color: rgba(112, 124, 255, 0.52);
  background: rgba(70, 83, 174, 0.13);
}
.article-top {
  justify-content: space-between;
  margin-bottom: 7px;
}
.source-tag,
.status-tag {
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 10px;
}
.source-tag.ai_mock {
  color: #b9b8ff;
  background: rgba(99, 90, 255, 0.13);
}
.source-tag.manual {
  color: #6bd5d1;
  background: rgba(47, 200, 193, 0.1);
}
.status-tag.draft {
  color: #dfb46e;
  background: rgba(222, 161, 66, 0.1);
}
.source-tag.ai_generated,
.status-tag.publishable {
  color: #70d6aa;
  background: rgba(72, 198, 137, 0.1);
}
.status-tag.pending_review {
  color: #d8b277;
  background: rgba(222, 161, 66, 0.1);
}
.status-tag.disabled {
  color: #9ba8bf;
  background: rgba(137, 151, 177, 0.1);
}
.status-tag.published {
  color: #70d6aa;
  background: rgba(72, 198, 137, 0.1);
}
.article-item strong {
  display: block;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.article-item p {
  display: -webkit-box;
  overflow: hidden;
  margin-top: 5px;
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.article-item small {
  display: block;
  margin-top: 8px;
  color: #718097;
  font-family: var(--font-mono);
  font-size: 10px;
}
.editor-heading {
  justify-content: space-between;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-border);
  gap: 16px;
}
.panel-kicker {
  margin-bottom: 4px;
  color: var(--color-text-muted);
}
h3 {
  font-size: 17px;
  font-weight: 650;
}
.editor-actions {
  gap: 8px;
}
.article-meta {
  display: flex;
  margin-top: 15px;
  gap: 7px;
  flex-wrap: wrap;
}
.article-meta span {
  padding: 4px 7px;
  border: 1px solid rgba(121, 139, 185, 0.18);
  border-radius: 5px;
  color: var(--color-text-muted);
  font-size: 10px;
}
.editor-form {
  display: grid;
  margin-top: 18px;
  gap: 15px;
}
.field {
  display: grid;
  gap: 7px;
}
.field > span {
  color: var(--color-text-secondary);
  font-size: 12px;
}
.field i {
  color: var(--color-danger);
  font-style: normal;
}
input,
textarea,
.status-field select {
  width: 100%;
  border: 1px solid rgba(145, 168, 205, 0.25);
  border-radius: 8px;
  color: var(--color-text);
  background: rgba(4, 15, 31, 0.48);
  font: inherit;
}
input,
.status-field select {
  min-height: 40px;
  padding: 0 12px;
}
textarea {
  min-height: 300px;
  padding: 11px 12px;
  line-height: 1.65;
  resize: vertical;
}
input:focus,
textarea:focus,
.status-field select:focus {
  border-color: rgba(115, 125, 255, 0.76);
  box-shadow: var(--shadow-focus);
}
.field small {
  justify-self: end;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
}
.status-field {
  max-width: 310px;
}
.status-field small {
  justify-self: start;
  font-family: inherit;
}
.asset-picker{padding:16px;border:1px solid rgba(125,137,255,.22);border-radius:10px;background:linear-gradient(135deg,rgba(79,75,191,.1),rgba(5,20,40,.32))}.asset-heading{display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:13px;border-bottom:1px solid rgba(145,168,205,.13);gap:16px}.asset-heading strong{display:block;margin-top:3px;font-size:14px}.asset-heading p{margin-top:3px;color:var(--color-text-muted);font-size:11px}.asset-count{display:grid;min-width:46px;height:28px;place-items:center;border:1px solid rgba(113,124,255,.4);border-radius:999px;color:#c3c8ff;background:rgba(87,83,203,.13);font-family:var(--font-mono);font-size:10px}.gallery-field{max-width:420px;margin-top:14px}.gallery-field select{width:100%;min-height:39px;padding:0 11px;border:1px solid rgba(145,168,205,.25);border-radius:8px;outline:0;color:var(--color-text);background:rgba(4,15,31,.62);font:inherit}.asset-grid,.asset-loading{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:13px;gap:9px}.asset-card{overflow:hidden;padding:0;border:1px solid rgba(145,168,205,.18);border-radius:8px;color:inherit;background:rgba(6,20,39,.58);cursor:pointer;text-align:left;transition:.16s ease}.asset-card:hover,.asset-card.is-selected{border-color:rgba(113,124,255,.7);box-shadow:0 0 0 1px rgba(113,124,255,.16)}.asset-preview{position:relative;display:grid;height:105px;place-items:center;color:#8f9fff;background:radial-gradient(circle at 30% 20%,rgba(91,100,225,.27),rgba(12,29,55,.78))}.asset-preview img{width:100%;height:100%;object-fit:cover}.asset-preview b{position:absolute;top:7px;right:7px;display:none;width:23px;height:23px;place-items:center;border-radius:50%;color:white;background:#6767e9;font-family:var(--font-mono);font-size:10px}.asset-card.is-selected .asset-preview b{display:grid}.asset-name{display:block;overflow:hidden;padding:8px 9px;color:var(--color-text-secondary);font-size:10px;text-overflow:ellipsis;white-space:nowrap}.asset-empty{display:flex;min-height:82px;align-items:center;justify-content:center;margin-top:13px;border:1px dashed rgba(145,168,205,.18);border-radius:8px;color:var(--color-text-muted);gap:8px;font-size:11px}.asset-empty .el-icon{color:#8f9fff;font-size:18px}.asset-loading span{height:140px;border-radius:8px;background:linear-gradient(90deg,rgba(120,143,182,.08),rgba(120,143,182,.18),rgba(120,143,182,.08));background-size:220% 100%;animation:shimmer 1.4s ease-in-out infinite}
.skeleton {
  display: grid;
  margin-top: 14px;
  gap: 9px;
}
.skeleton span {
  height: 100px;
  border-radius: 9px;
  background: linear-gradient(
    90deg,
    rgba(120, 143, 182, 0.08),
    rgba(120, 143, 182, 0.18),
    rgba(120, 143, 182, 0.08)
  );
  background-size: 220% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}
.empty {
  display: grid;
  min-height: 260px;
  place-items: center;
  align-content: center;
  color: var(--color-text-muted);
  gap: 8px;
}
.empty .el-icon {
  font-size: 26px;
  color: #909dff;
}
.error-panel {
  display: grid;
  min-height: 230px;
  place-items: center;
  align-content: center;
  padding: 30px;
  text-align: center;
  gap: 8px;
}
.error-panel p {
  color: var(--color-text-muted);
}
@keyframes shimmer {
  to {
    background-position: -220% 0;
  }
}
@media (max-width: 1050px) {
  .workspace {
    grid-template-columns: 1fr;
  }
  .article-list {
    max-height: none;
  }
  .article-items {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 680px) {
  .page-intro {
    align-items: flex-start;
    flex-direction: column;
  }
  .intro-actions {
    display: grid;
    width: 100%;
    grid-template-columns: 1fr 1fr;
  }
  .intro-actions button:last-child {
    grid-column: span 2;
  }
  .article-list,
  .editor {
    padding: 18px;
  }
  .list-header {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .search-box {
    grid-column: span 2;
  }
  .list-header select {
    width: 100%;
  }
  .article-items {
    grid-template-columns: 1fr;
  }
  .editor-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .editor-actions {
    width: 100%;
  }
  .editor-actions .primary-button {
    flex: 1;
  }
  .asset-grid,
  .asset-loading {
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
}
</style>
