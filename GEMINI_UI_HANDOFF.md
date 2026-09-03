# Gemini 网页端 UI 设计交接

## 任务

在现有“星枢豆包获客”商户网页端基础上继续提升 UI 设计质量。目标是现代、专业、有高级质感的蓝色科技 SaaS，只做 PC 桌面端，不需要移动端或响应式设计。

## 可以修改

- `apps/merchant-web/src` 中的页面、布局、组件与样式。
- `apps/merchant-web/public` 中的前端静态视觉资产。
- 动画、微交互、排版、配色、层次、间距、圆角、阴影和图表呈现。

## 禁止修改

- 不修改 API 路径、请求参数、响应结构和 `packages/api-contract` 契约。
- 不修改登录鉴权、Cookie、会话、租户隔离、权限判断和路由名称。
- 不删除或弱化现有业务功能，不添加没有后端能力的假按钮、假数据或假状态。
- 不把演示数字写死到生产页面；数据必须继续来自现有 store/service/props。
- 不引入后端、数据库、服务器部署或 EXE 发布助手代码。

## 技术栈

- Vue 3 + TypeScript + Vite
- Pinia + Vue Router
- Element Plus 图标与组件
- Vitest + Vue Test Utils
- pnpm workspace

## 关键路由

- `/` 首页
- `/data-overview` 数据总览
- `/keywords` 关键词与问题
- `/knowledge` 企业信息库
- `/gallery` 企业图库
- `/instructions` 创作指令
- `/content/create` AI 文章创作
- `/articles` 文章列表
- `/website` 企业网站
- `/media` 媒体账号
- `/publish/tasks` 发布任务

## 设计要求

- 左上角保留 Logo 占位与系统名“星枢豆包获客”。
- 字体必须清晰可读，正文和辅助文字不能依赖过小字号。
- 元素尺寸、间距、边框、圆角、阴影、按钮状态和图标风格必须统一。
- 动画以 `transform`、`opacity` 为主，避免持续大幅运动；支持 `prefers-reduced-motion`。
- 首页底部指标固定为：写作数量、发布数量、豆包收录数；全零时不得伪造波动。
- 当前首页截图：`design/reference/current-home.png`。
- 视觉目标参考：`design/reference/target-home.png`。

## 交付要求

- 修改只提交到 `gemini-ui` 分支。
- 每次提交说明具体改动页面。
- 完成后运行 `pnpm typecheck`、`pnpm test` 和 `pnpm build`。
- 不要创建或提交 `.env`、密钥、账号密码、日志、缓存、构建产物或浏览器资料。
