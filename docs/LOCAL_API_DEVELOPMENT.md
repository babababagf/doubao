# 本地 API 开发说明

当前 API 是真实 NestJS + Fastify + Prisma 服务，不与网页 Mock 混用。

## 本地依赖

- Docker Desktop 已启动。
- Node.js 22.12 以上、pnpm 11.7。
- 从 `services/api/.env.example` 复制为 `services/api/.env.local`；示例仅用于本机 Docker，不可用于正式环境。

## 启动顺序

```powershell
docker compose -f infra/docker/compose.yaml up -d postgres redis
pnpm db:generate
pnpm --filter @doubaohk/api db:migrate -- --name initial_identity
pnpm --filter @doubaohk/api db:seed
pnpm dev:api
```

健康检查：`http://127.0.0.1:3010/api/health/live`。

当前已接入真实数据库的端点：

- `POST /api/auth/login`、`POST /api/auth/logout`：商户受众；认证凭证只放 HTTP-only Cookie。
- `POST /api/publisher/auth/login`：发布助手独立受众，返回仅供本机受保护存储的短期 Bearer 令牌，不设置网页 Cookie。
- `GET /api/publisher/update-policy`：发布助手经 Bearer 鉴权读取平台下发的受控更新策略；未启用时不会下发更新地址。
- `GET /api/publisher/bootstrap`、`GET /api/publisher/tasks`、`POST /api/publisher/tasks/:taskId/claim`、`POST /api/publisher/tasks/:taskId/heartbeat`、`POST /api/publisher/tasks/:taskId/attention`、`POST /api/publisher/tasks/:taskId/complete`、`POST /api/publisher/tasks/:taskId/resolve-published`、`POST /api/publisher/media-accounts/:platform/state`：仅供 EXE 主进程使用。领取会绑定当前注册设备并建立 10 分钟租约；EXE 每 60 秒续租，其他设备不能读取其执行中任务或改变其状态。租约过期仅转人工处理。正常任务由 EXE 自动填写、上传、提交并取得官方链接后调用 `complete`；该接口本身不执行平台点击。`resolve-published` 仅用于最终提交结果不明后的人工作品核验，不能用于重发。会话备份接口只接收受限加密会话包，网页和后台不返回其内容。
- `POST /api/super/auth/login`、`POST /api/super/auth/logout`：总后台受众，使用独立 HTTP-only Cookie。
- `POST /api/tenant/auth/login`、`POST /api/tenant/auth/logout`：贴牌/代理管理端受众，使用独立 HTTP-only Cookie。
- `GET/POST /api/super/white-labels`：总后台查看/开通贴牌；创建请求必须携带 8-100 位 `Idempotency-Key`。
- `GET /api/super/tenants`、`PATCH /api/super/tenants/:tenantId/status`：总后台查看和启停全部贴牌、代理、商户。停用会撤销目标及其下级的现有会话，不删除数据或返还席位。
- `GET/PUT /api/super/publisher-update-policy`：仅总后台可配置发布助手更新源；启用时只接受公网 HTTPS，拒绝 HTTP、IP、localhost、`.local` 和 URL 凭据，变更写入审计日志。
- `GET /api/super/domains`、`POST /api/super/domains/:domainId/verification-token`、`POST /api/super/domains/:domainId/verify-dns`：总后台查看域名、生成 TXT 所有权验证记录及读取公开 DNS 结果；DNS 成功不自动启用域名。
- `POST /api/tenant/agents`：仅贴牌可开通代理；必须携带 `Idempotency-Key`。
- `POST /api/tenant/merchants`：贴牌或代理可开通普通商户；必须携带 `Idempotency-Key`。
- `GET/POST /api/tenant/provider-configs`：仅贴牌可查看摘要或加密新增自备模型配置；Key 绝不回传。自定义 OpenAI 兼容接口同样可受控测试和实际调用，但必须通过 HTTPS、DNS 与私网/重定向安全校验。
- `POST /api/tenant/provider-configs/:providerId/test`、`PATCH /api/tenant/provider-configs/:providerId/enabled`、`DELETE /api/tenant/provider-configs/:providerId`：贴牌测试、启用/停用或删除模型配置。测试会产生一次贴牌账户侧的低额度调用；自定义 OpenAI 兼容地址只有在通过出站安全校验后才允许测试。
- `GET/PUT/DELETE /api/tenant/object-storage`、`POST /api/tenant/object-storage/test`、`PATCH /api/tenant/object-storage/enabled`：仅贴牌可加密保存、测试、启用/停用或删除一套阿里云 OSS 配置。保存阶段只做 HTTPS 根地址格式校验，不依赖外网 DNS；测试会读取 Bucket 信息，并在固定 `__doubaohk_storage_probe__/` 隔离前缀下随机写入、读取、校验和删除探针对象，再从实际 OSS/CDN 公共 URL 读取同一对象。自定义 CDN 在测试阶段必须解析到公网地址；保存或更新凭证会强制停用，需测试成功后再启用。
- `GET/POST /api/tenant/doubao-checks`：仅贴牌可查看或创建豆包检测批次。可提交一个有效普通商户，或提交 `all=true, confirmedAll=true` 检测全部有效商户；全部检测需要前端二次确认。任务不扣商户算力，调用费用由贴牌模型配置承担。
- `GET /api/merchant/bootstrap`
- `GET/PUT /api/merchant/profile`
- `GET/POST/PATCH/DELETE /api/merchant/keywords`
- `POST /api/merchant/keywords/:keywordId/questions/expand`：创建真实问题词拓展异步任务，必须携带 `Idempotency-Key`；成功去重入库 1 条扣 1 点，未使用预占自动退回。
- `GET/POST /api/merchant/ai-tasks`、`POST /api/merchant/ai-tasks/:taskId/stop`：查看、创建文章创作任务或停止任务。文章任务只强制启用关键词、文章方向和 1-100 篇数量；企业信息库与图库可为空，无图库时 `imageCount` 必须为0，选择图库后可为0-3。无信息库写入 `basic` 快照，模型只用公司名/简称、关键词和问题词完成场景化软文；有信息库写入 `enriched` 快照。`mixed` 会为各问题稳定轮换八类方向。成功入库才扣 30 点与 1 篇写作额度。`GET /api/merchant/ai-tasks/:taskId/retryable-questions` 与 `POST /api/merchant/ai-tasks/:taskId/retry` 仅对失败、部分失败或已停止的文章任务开放；可重试项必须仍未生成、未删除且启用，单篇或全部重试会生成一条新任务并沿用原问题的文章方向，原任务不会被覆盖。
- `GET/POST/PUT/DELETE /api/merchant/articles`：文章列表与手动新增、编辑、删除。新建文章建立 V1；标题、正文或状态有实际变化时创建递增版本。发布任务保存创建时的不可变文章版本引用，后续编辑不覆盖既有任务内容。
- `POST /api/merchant/galleries/:galleryId/images`、`POST /api/merchant/galleries/:galleryId/images/:uploadId/complete`：先获取 5 分钟 OSS PUT 直传会话，再由浏览器直传并由后端 HEAD 校验类型与大小；校验成功才登记图片与空间用量。
- `GET/PUT /api/merchant/website`、`POST /api/merchant/website/generate`：商户选择模板并生成本地静态站。生成仅使用企业资料、已发布文章和已登记公开 URL 的图库图片；三套模板分别按企业介绍、到店服务、品牌内容路径输出主页、文章页、`robots.txt`、`sitemap.xml` 与结构化数据；接口返回本地预览地址，不代表已上传或已上线。
- `GET /api/public/sites/:tenantId/index.html`、`services.html`、`questions.html`、`about.html`、`robots.txt`、`sitemap.xml`、`articles/:articleId`：本机静态站预览；固定页只在有对应真实资料时生成。`POST /api/public/sites/:tenantId/events` 只接受网页真实显示联系电话后的曝光/点击事件，并写入按日聚合统计。

初始本地种子账号为商户 `demo001 / demo123`、总后台 `admin001 / admin123`，仅用于本机开发。商户资料、关键词/问题词、信息库、图库分组、创作指令、手动文章、文章版本、网站配置、发布任务和检测结果已读写真实本地数据库；AI 问题词拓展和文章写作已具备真实任务、预占/退款和贴牌模型调用骨架，但需先由贴牌配置并测试模型、再独立启动任务执行器。图库已具备所属贴牌 OSS 的短时直传和上传后校验：需在 Bucket 配置 PUT/HEAD/DELETE 的 CORS 与最小路径权限后才可端到端使用。静态站已可在本机版本目录生成和预览，但尚未写入贴牌 OSS/CDN、绑定域名或启用公开缓存。发布助手 API 已接入独立令牌、设备注册、文章版本快照读取、原子领取、人工处理状态和只读更新策略；EXE 主进程已接入 Windows 用户级安全存储、受控 IPC 与用户主动触发的更新状态机。设备注册只保存每个商户范围内随机安装标识的 SHA-256 哈希，并把桌面会话关联到该记录；当前不限制设备数量，也没有远程解绑接口。真实平台页面验证、内容填充/人工确认和成功回传仍未完成。网页端通过 Windows 自定义协议只唤起 EXE 的媒体页，不向后端发送“连接成功”请求；正式安装包安装后才会注册该协议。豆包检测外部执行和 AI 内容审查尚未接入，接口会返回明确错误，绝不伪造成功结果。在线更新的真实源、签名、正式安装包、灰度和回退包尚未配置，本地开发包不会联网检查或下载。

网页端默认的 `pnpm dev:merchant` 与 `pnpm dev:merchant:api` 都走真实本地 API，访问 `http://127.0.0.1:5174/login`。该模式关闭 MSW，请求经 Vite 代理进入 `127.0.0.1:3010`，认证凭证只保存于 HTTP-only Cookie。只有显式运行 `pnpm dev:merchant:mock` 才加载演示夹具。

三个 Vite 开发服务器默认代理到 `3010`。需要对隔离库做浏览器写入验收时，使用 `pnpm dev:merchant:isolated`、`pnpm dev:super:isolated` 或 `pnpm dev:tenant:isolated`；`isolated` 模式固定代理 `3011`。也可通过 `API_PROXY_TARGET` 覆盖任意本地代理目标；这些设置仅作用于开发服务器，不会写入前端构建产物。

要执行已排队的 AI 或豆包检测任务，另开一个终端运行 `pnpm --filter @doubaohk/api dev:worker`。主 API 与任务执行器必须分别运行；本机 Redis 映射端口为 `6470`。豆包检测只使用贴牌启用且测试成功、声明 `Responses + 联网搜索` 能力的配置；逐题仅在实际响应同时具备联网调用、正文和至少一条可核验 HTTPS 来源时保存结果，再由系统以企业全称/简称做本地匹配。没有可用配置、来源缺失或单题调用失败时，不会伪造命中或未命中结果。

`pnpm --filter @doubaohk/api test` 只运行无外部写入的单元测试。`test:integration` 中的商户与租户开通测试会创建本地数据库记录，因此默认跳过；只有明确设置 `LOCAL_API_INTEGRATION_WRITE=true` 后才会执行，例如 PowerShell 中运行 `$env:LOCAL_API_INTEGRATION_WRITE='true'; pnpm --filter @doubaohk/api test:integration`。这类验收应使用专用测试库或在确认清理范围后进行，不能反复污染演示数据。

## 隔离写入型联调

当前本机已预置专用数据库 `doubaohk_isolated_test`，仅用于写入型集成测试，不能用于浏览器演示或业务数据。先确认 API 已完成构建，再在单独终端启动隔离实例：

```powershell
pnpm --filter @doubaohk/api start:isolated-test-api
```

它固定监听 `127.0.0.1:3011`，并只连接隔离库，同时固定使用 Redis DB 14，避免与 3010 演示环境的 BullMQ 队列相互领取。需要验证异步 AI/豆包任务时，再在另一终端启动同一隔离边界的 Worker：

```powershell
pnpm --filter @doubaohk/api start:isolated-test-worker
```

随后在另一终端执行：

```powershell
$env:LOCAL_API_INTEGRATION_WRITE='true'
$env:LOCAL_API_URL='http://127.0.0.1:3011/api'
pnpm --filter @doubaohk/api test:integration
```

该用例会真实创建关键词、问题词、文章和电话统计，用来验证不可由 Mock 覆盖的写入链路。不得改成连接 `3010` 后直接运行；如需重置隔离库，先明确确认删除范围，日常不自动重置。

发布任务不以媒体账号云端“已连接”为创建前置条件：商户可先排队，发布助手领取后在本机检查登录状态。正常页面由 EXE 自动上传、填写、最终提交并回传官方公开链接。未登录或提交前验证码时，用户仅需在已打开的平台窗口完成验证；账号强验证成功后助手自动续发，无需二次点击。平台页面变化、浏览器启动失败、提交后未知状态等保持人工处理，不能盲目重发。网页和后台均不展示原始媒体 Cookie。

所有三类登录（商户网页、贴牌/代理后台、总后台）及发布助手登录均使用 Redis 失败计数：同一登录域与账号 15 分钟内连续 5 次失败会被短时锁定 15 分钟。计数键只包含账号摘要，不保存明文账号、密码或 Cookie；登录成功会清除失败计数。登录成功、失败和触发锁定都会写入不含敏感信息的审计记录。Redis 不可用时认证会返回“登录保护暂不可用”，不会静默跳过风控。可通过 `.env.local` 的 `LOGIN_FAILURE_LIMIT`、`LOGIN_FAILURE_WINDOW_SECONDS` 与 `LOGIN_LOCK_SECONDS` 调整。

注销端点始终返回 `204 No Content`，即使浏览器未携带有效 Cookie 也保持幂等；服务端会下发过期的 HTTP-only Cookie，不会在响应体、日志或审计数据中暴露会话令牌。

2026-08-07 最新隔离核验显示：当前根目录方舟 Key 对 `doubao-seed-2-0-lite-260428` 的 Responses Web Search 请求返回 `ToolNotOpen`，即该账号尚未开通联网搜索插件。系统将配置测试标记为 `WEB_SEARCH_TOOL_NOT_OPEN` 并保持停用，运行时任务也会拒绝计入收录；必须由贴牌开通插件、重新测试成功后，才能进行单题和批量检测验收。为避免推理模型在联网搜索前截断，检测请求采用标准 400 token 受控上限；不使用方舟专有参数，以保持兼容接口可用。无论结果如何，该检测都不代表豆包 App 官方收录，也不保证头条/抖音内容被召回。

总后台为独立入口：运行 `pnpm dev:super` 后访问 `http://127.0.0.1:5175`。该页面不会保存真实会话凭证，只保存一个本地显示状态；实际鉴权始终由独立的总后台 Cookie 完成。

贴牌/代理管理端为独立入口：运行 `pnpm dev:tenant` 后访问 `http://127.0.0.1:5176`。贴牌和代理使用相同登录地址，但 API 会依据账户角色返回不同能力；不要仅依赖页面隐藏来判断权限。

## 本地数据边界

## 本地管理端演示账号

- 商户：`demo001 / demo123`；总后台：`admin001 / admin123`；贴牌：`tenant001 / demo123`；代理：`agent001 / demo123`。仅用于本机开发，不得带入生产环境。
- `tenant001` 固定关联 `seed-white-label`，可用算力 10000、写作篇数 100、可开代理 5、普通商户席位 50；`agent001` 固定关联 `seed-agent`，可用算力 1000、写作篇数 10、普通商户席位 10。`pnpm --filter @doubaohk/api db:seed` 可幂等补齐账号和缺失额度，不清理其他本地数据。

本地功能、已知限制和复现结果见 [本地验收报告](LOCAL_ACCEPTANCE_REPORT.md)；正式部署前使用 [部署前检查清单](DEPLOYMENT_CHECKLIST.md)。

- Compose 端口仅监听 `127.0.0.1`，不对局域网开放。
- PostgreSQL 使用 `127.0.0.1:5432`；Redis 暂只保留在 Docker 容器网络内，等接入 Worker 时再根据本机端口策略配置。二者均使用 Docker named volume，停止容器不会删除数据。
- 需要重置数据时必须明确执行独立的破坏性命令，日常开发不得自动重置。

## 隔离库备份与恢复

- 备份隔离库：`pnpm db:backup:isolated`。脚本固定只操作 Docker 容器中的 `doubaohk_isolated_test`，输出 PostgreSQL 自定义格式备份到 `.runtime/backups/`，并在容器内用 `pg_restore --list` 校验；不会读取、导出或修改演示库 `doubaohk`。
- 恢复隔离库：先停止 3011 隔离 API，再运行 `pnpm db:restore:isolated -- -BackupFile <绝对备份路径> -ConfirmIsolatedRestore`。恢复脚本拒绝未带确认开关的请求，只会覆盖 `doubaohk_isolated_test`，且在实际覆盖前自动生成并校验一份当前隔离库备份；`-WhatIf` 可先验证目标与参数，不会备份或写入数据库。
- 这两个命令固定由 PowerShell 7（`pwsh`）执行；不要改用旧版 Windows PowerShell 5.1，以免脚本语法和 UTF-8 输出出现兼容性差异。

## 2026-08-07：发布设备租约

发布助手任务现已实施设备租约：领取任务将绑定当前桌面设备，EXE 主进程每 60 秒调用心跳续期，10 分钟内未续期的任务自动转为人工处理。系统不会自动重领、重复发布或自动上报成功；仅允许当前设备用户填写同平台官方公开内容链接后明确确认。设备数限制和远程解绑仍等待产品规则确认。
