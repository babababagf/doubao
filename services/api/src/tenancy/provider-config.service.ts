import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";

import {
  ProviderPlatform,
  ProviderProtocol,
  ProviderTestStatus,
  UserRole,
} from "../generated/prisma/client";
import type { AdminActor } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { CredentialCryptoService } from "../security/credential-crypto.service";
import {
  OutboundUrlPolicyService,
  parsePublicHttpsBaseUrl,
} from "../security/outbound-url-policy.service";
import { doubaoCheckInput } from "../doubao/doubao-check-prompt";
import {
  hasWebSearchCall,
  responseSources,
} from "../doubao/doubao-response";

type ProviderInput = {
  alias: unknown;
  platform: unknown;
  protocol: unknown;
  baseUrl?: unknown;
  modelName: unknown;
  apiKey: unknown;
  supportsWriting: unknown;
  supportsDoubaoCheck: unknown;
  supportsWebSearch: unknown;
};
type ProviderResponsePayload = {
  output_text?: unknown;
  output?: Array<{
    type?: unknown;
    content?: Array<{ text?: unknown; annotations?: unknown }>;
  }>;
  choices?: Array<{ message?: { content?: unknown } }>;
};
type ProviderErrorPayload = { error?: { code?: unknown } };
const presets: Record<ProviderPlatform, string | null> = {
  DEEPSEEK: "https://api.deepseek.com",
  VOLCENGINE_ARK: "https://ark.cn-beijing.volces.com/api/v3",
  CUSTOM_OPENAI: null,
};

@Injectable()
export class ProviderConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CredentialCryptoService,
    private readonly outbound: OutboundUrlPolicyService,
  ) {}

  async list(actor: AdminActor) {
    const tenantId = this.whiteLabel(actor);
    const rows = await this.prisma.providerConfig.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => this.view(row));
  }

  async create(actor: AdminActor, input: ProviderInput) {
    const tenantId = this.whiteLabel(actor);
    const data = await this.input(input, true);
    const encrypted = this.crypto.encrypt(data.apiKey!);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.providerConfig.create({
        data: {
          tenantId,
          alias: data.alias,
          platform: data.platform,
          protocol: data.protocol,
          baseUrl: data.baseUrl,
          modelName: data.modelName,
          apiKeyCiphertext: encrypted.ciphertext,
          apiKeyNonce: encrypted.nonce,
          keyMask: this.mask(data.apiKey!),
          supportsWriting: data.supportsWriting,
          supportsDoubaoCheck: data.supportsDoubaoCheck,
          supportsWebSearch: data.supportsWebSearch,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: actor.userId,
          actorTenantId: tenantId,
          action: "provider_config.created",
          entityType: "ProviderConfig",
          entityId: created.id,
          detail: {
            alias: data.alias,
            platform: data.platform.toLowerCase(),
            protocol: data.protocol.toLowerCase(),
            supportsWriting: data.supportsWriting,
            supportsDoubaoCheck: data.supportsDoubaoCheck,
          },
        },
      });
      return created;
    });
    return this.view(row);
  }

  async update(actor: AdminActor, id: string, input: ProviderInput) {
    const tenantId = this.whiteLabel(actor);
    const current = await this.prisma.providerConfig.findFirst({
      where: { id, tenantId },
    });
    if (!current)
      throw new NotFoundException({
        code: "PROVIDER_NOT_FOUND",
        message: "模型配置不存在",
      });
    const data = await this.input(input, false);
    const encrypted = data.apiKey ? this.crypto.encrypt(data.apiKey) : null;
    const row = await this.prisma.$transaction(async (tx) => {
      const sameAlias = await tx.providerConfig.findFirst({
        where: { tenantId, alias: data.alias, id: { not: current.id } },
        select: { id: true },
      });
      if (sameAlias)
        throw new ConflictException({
          code: "PROVIDER_ALIAS_EXISTS",
          message: "该模型别名已存在",
        });
      const updated = await tx.providerConfig.update({
        where: { id: current.id },
        data: {
          alias: data.alias,
          platform: data.platform,
          protocol: data.protocol,
          baseUrl: data.baseUrl,
          modelName: data.modelName,
          supportsWriting: data.supportsWriting,
          supportsDoubaoCheck: data.supportsDoubaoCheck,
          supportsWebSearch: data.supportsWebSearch,
          ...(encrypted
            ? {
                apiKeyCiphertext: encrypted.ciphertext,
                apiKeyNonce: encrypted.nonce,
                keyMask: this.mask(data.apiKey!),
              }
            : {}),
          enabled: false,
          lastTestAt: null,
          lastTestStatus: ProviderTestStatus.NEVER,
          lastTestError: null,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: actor.userId,
          actorTenantId: tenantId,
          action: "provider_config.updated",
          entityType: "ProviderConfig",
          entityId: current.id,
          detail: {
            alias: data.alias,
            apiKeyReplaced: Boolean(encrypted),
            retestRequired: true,
            supportsWriting: data.supportsWriting,
            supportsDoubaoCheck: data.supportsDoubaoCheck,
          },
        },
      });
      return updated;
    });
    return this.view(row);
  }

  async test(actor: AdminActor, id: string) {
    const tenantId = this.whiteLabel(actor);
    const config = await this.prisma.providerConfig.findFirst({
      where: { id, tenantId },
    });
    if (!config)
      throw new NotFoundException({
        code: "PROVIDER_NOT_FOUND",
        message: "模型配置不存在",
      });
    const started = Date.now();
    let status: ProviderTestStatus = ProviderTestStatus.SUCCEEDED;
    let error: string | null = null;
    try {
      if (!config.supportsWriting && !config.supportsDoubaoCheck)
        throw new Error("PROVIDER_CAPABILITY_MISSING");
      const endpoint = await this.outbound.apiEndpoint(
        config.baseUrl,
        config.protocol === ProviderProtocol.RESPONSES
          ? "responses"
          : "chat/completions",
      );
      const apiKey = this.crypto.decrypt(
        config.apiKeyCiphertext,
        config.apiKeyNonce,
      );
      // 同一配置承担两种用途时，必须分别验证。联网搜索成功不能代替结构化写作验证。
      if (config.supportsWriting)
        await this.testWritingConfig(config, endpoint, apiKey);
      if (config.supportsDoubaoCheck)
        await this.testDoubaoCheckConfig(config, endpoint, apiKey);
    } catch (reason) {
      status = ProviderTestStatus.FAILED;
      error =
        reason instanceof Error ? reason.message.slice(0, 160) : "TEST_FAILED";
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.providerConfig.update({
        where: { id: config.id },
        data: {
          lastTestAt: new Date(),
          lastTestStatus: status,
          lastTestError: error,
          enabled:
            status === ProviderTestStatus.SUCCEEDED ? config.enabled : false,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: actor.userId,
          actorTenantId: tenantId,
          action: "provider_config.tested",
          entityType: "ProviderConfig",
          entityId: config.id,
          detail: {
            status: status.toLowerCase(),
            durationMs: Date.now() - started,
            error: error ? error.replace(/Bearer\s+\S+/gi, "REDACTED") : null,
          },
        },
      });
      return result;
    });
    return this.view(updated);
  }

  private async testWritingConfig(
    config: {
      protocol: ProviderProtocol;
      modelName: string;
    },
    endpoint: string,
    apiKey: string,
  ): Promise<void> {
    const body =
      config.protocol === ProviderProtocol.RESPONSES
        ? {
            model: config.modelName,
            input:
              '仅返回严格 JSON：{"title":"测试标题","content":"<p>测试正文</p>"}，不得附加解释。',
            max_output_tokens: 80,
          }
        : {
            model: config.modelName,
            messages: [
              {
                role: "user",
                content:
                  '仅返回严格 JSON：{"title":"测试标题","content":"<p>测试正文</p>"}，不得附加解释。',
              },
            ],
            max_tokens: 80,
            stream: false,
          };
    const payload = await this.callProvider(endpoint, apiKey, body, 10_000);
    const text = this.responseText(payload);
    if (!text) throw new Error("WRITING_RESPONSE_TEXT_MISSING");
    const candidate = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    try {
      const value = JSON.parse(candidate) as {
        title?: unknown;
        content?: unknown;
      };
      if (
        typeof value.title !== "string" ||
        value.title.trim().length < 2 ||
        typeof value.content !== "string" ||
        value.content.trim().length < 8
      )
        throw new Error("WRITING_RESPONSE_SCHEMA_INVALID");
    } catch (reason) {
      if (reason instanceof Error && reason.message === "WRITING_RESPONSE_SCHEMA_INVALID")
        throw reason;
      throw new Error("WRITING_RESPONSE_JSON_INVALID", { cause: reason });
    }
  }

  private async testDoubaoCheckConfig(
    config: { modelName: string },
    endpoint: string,
    apiKey: string,
  ): Promise<void> {
    const payload = await this.callProvider(
      endpoint,
      apiKey,
      {
        model: config.modelName,
        input: doubaoCheckInput("请查询今天北京的天气情况。"),
        tools: [{ type: "web_search" }],
        store: false,
        max_output_tokens: 400,
      },
      30_000,
    );
    if (!this.responseText(payload)) throw new Error("RESPONSE_TEXT_MISSING");
    if (!hasWebSearchCall(payload))
      throw new Error("WEB_SEARCH_NOT_USED");
    if (!responseSources(payload).length)
      throw new Error("WEB_SEARCH_SOURCE_MISSING");
  }

  private async callProvider(
    endpoint: string,
    apiKey: string,
    body: object,
    timeout: number,
  ): Promise<ProviderResponsePayload> {
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(timeout),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      if (await this.isWebSearchToolNotOpen(response))
        throw new Error("WEB_SEARCH_TOOL_NOT_OPEN");
      throw new Error(`HTTP_${response.status}`);
    }
    try {
      return (await response.json()) as ProviderResponsePayload;
    } catch {
      throw new Error("RESPONSE_JSON_INVALID");
    }
  }

  private async isWebSearchToolNotOpen(response: Response): Promise<boolean> {
    try {
      const payload = (await response.json()) as ProviderErrorPayload;
      return payload.error?.code === "ToolNotOpen";
    } catch {
      return false;
    }
  }

  private responseText(payload: ProviderResponsePayload): string | null {
    if (typeof payload.output_text === "string" && payload.output_text.trim())
      return payload.output_text;
    const responseText = payload.output
      ?.flatMap((item) => (item.type === "message" ? (item.content ?? []) : []))
      .map((item) => item.text)
      .find(
        (item): item is string =>
          typeof item === "string" && Boolean(item.trim()),
      );
    if (responseText) return responseText;
    const chatText = payload.choices?.[0]?.message?.content;
    return typeof chatText === "string" && chatText.trim() ? chatText : null;
  }

  async setEnabled(
    actor: AdminActor,
    id: string,
    input: { enabled?: unknown },
  ) {
    const tenantId = this.whiteLabel(actor);
    if (typeof input.enabled !== "boolean")
      throw new ConflictException({
        code: "PROVIDER_STATUS_INVALID",
        message: "enabled 必须为布尔值",
      });
    const enabled = input.enabled;
    const config = await this.prisma.providerConfig.findFirst({
      where: { id, tenantId },
    });
    if (!config)
      throw new NotFoundException({
        code: "PROVIDER_NOT_FOUND",
        message: "模型配置不存在",
      });
    if (enabled && config.lastTestStatus !== ProviderTestStatus.SUCCEEDED)
      throw new ConflictException({
        code: "PROVIDER_TEST_REQUIRED",
        message: "配置测试成功后才能启用",
      });
    const result = await this.prisma.$transaction(async (tx) => {
      const conflicts = enabled
        ? await tx.providerConfig.findMany({
            where: {
              tenantId,
              enabled: true,
              id: { not: config.id },
              OR: [
                ...(config.supportsWriting ? [{ supportsWriting: true }] : []),
                ...(config.supportsDoubaoCheck
                  ? [{ supportsDoubaoCheck: true }]
                  : []),
              ],
            },
            select: { id: true, alias: true },
          })
        : [];
      if (conflicts.length > 0) {
        await tx.providerConfig.updateMany({
          where: { id: { in: conflicts.map((item) => item.id) } },
          data: { enabled: false },
        });
        await tx.auditLog.createMany({
          data: conflicts.map((item) => ({
            tenantId,
            actorUserId: actor.userId,
            actorTenantId: tenantId,
            action: "provider_config.auto_disabled_by_conflict",
            entityType: "ProviderConfig",
            entityId: item.id,
            detail: { replacedBy: config.id, replacedByAlias: config.alias },
          })),
        });
      }
      const updated = await tx.providerConfig.update({
        where: { id: config.id },
        data: { enabled },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: actor.userId,
          actorTenantId: tenantId,
          action: "provider_config.enabled_changed",
          entityType: "ProviderConfig",
          entityId: config.id,
          detail: {
            enabled,
            displaced: conflicts.map((item) => ({
              id: item.id,
              alias: item.alias,
            })),
          },
        },
      });
      return updated;
    });
    return this.view(result);
  }

  async remove(actor: AdminActor, id: string): Promise<void> {
    const tenantId = this.whiteLabel(actor);
    const config = await this.prisma.providerConfig.findFirst({
      where: { id, tenantId },
    });
    if (!config)
      throw new NotFoundException({
        code: "PROVIDER_NOT_FOUND",
        message: "模型配置不存在",
      });
    await this.prisma.$transaction(async (tx) => {
      await tx.providerConfig.delete({ where: { id: config.id } });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: actor.userId,
          actorTenantId: tenantId,
          action: "provider_config.deleted",
          entityType: "ProviderConfig",
          entityId: config.id,
          detail: { alias: config.alias },
        },
      });
    });
  }

  private whiteLabel(actor: AdminActor): string {
    if (actor.role !== UserRole.WHITE_LABEL_ADMIN || !actor.tenantId)
      throw new UnauthorizedException({
        code: "FORBIDDEN",
        message: "只有贴牌可配置大模型 API，代理和商户仅继承",
      });
    return actor.tenantId;
  }

  private async input(input: ProviderInput, requireApiKey: boolean) {
    const alias = typeof input.alias === "string" ? input.alias.trim() : "";
    const modelName =
      typeof input.modelName === "string" ? input.modelName.trim() : "";
    const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
    const platform =
      input.platform === "deepseek"
        ? ProviderPlatform.DEEPSEEK
        : input.platform === "volcengine_ark"
          ? ProviderPlatform.VOLCENGINE_ARK
          : input.platform === "custom_openai"
            ? ProviderPlatform.CUSTOM_OPENAI
            : null;
    const protocol =
      input.protocol === "chat_completions"
        ? ProviderProtocol.CHAT_COMPLETIONS
        : input.protocol === "responses"
          ? ProviderProtocol.RESPONSES
          : null;
    const supportsWriting = input.supportsWriting === true;
    const supportsDoubaoCheck = input.supportsDoubaoCheck === true;
    const supportsWebSearch = input.supportsWebSearch === true;
    const requestedUrl =
      typeof input.baseUrl === "string"
        ? input.baseUrl.trim().replace(/\/$/, "")
        : "";
    const hasApiKey = apiKey.length > 0;
    if (
      !platform ||
      !protocol ||
      alias.length < 2 ||
      alias.length > 40 ||
      !modelName ||
      modelName.length > 160 ||
      (requireApiKey && !hasApiKey) ||
      (hasApiKey && (apiKey.length < 8 || apiKey.length > 2048)) ||
      (!supportsWriting && !supportsDoubaoCheck)
    )
      throw new ConflictException({
        code: "PROVIDER_INPUT_INVALID",
        message: "模型配置字段、用途或 API Key 不符合要求",
      });
    const baseUrl = presets[platform] ?? requestedUrl;
    if (
      !baseUrl ||
      !parsePublicHttpsBaseUrl(baseUrl) ||
      (presets[platform] && requestedUrl && requestedUrl !== baseUrl)
    )
      throw new ConflictException({
        code: "PROVIDER_BASE_URL_INVALID",
        message:
          "预设平台必须使用官方地址；自定义接口仅允许不含凭据、查询参数的 HTTPS 公网域名地址",
      });
    try {
      await this.outbound.apiEndpoint(
        baseUrl,
        protocol === ProviderProtocol.RESPONSES
          ? "responses"
          : "chat/completions",
      );
    } catch {
      throw new ConflictException({
        code: "PROVIDER_BASE_URL_UNSAFE",
        message: "模型接口域名无法解析为安全公网地址，已拒绝保存",
      });
    }
    if (
      supportsDoubaoCheck &&
      (protocol !== ProviderProtocol.RESPONSES || !supportsWebSearch)
    )
      throw new ConflictException({
        code: "DOUBAO_PROVIDER_CAPABILITY_INVALID",
        message: "豆包检测配置必须使用 Responses API 并声明联网搜索能力",
      });
    return {
      alias,
      modelName,
      apiKey: hasApiKey ? apiKey : null,
      platform,
      protocol,
      baseUrl,
      supportsWriting,
      supportsDoubaoCheck,
      supportsWebSearch,
    };
  }

  private mask(value: string): string {
    return value.length <= 8
      ? "********"
      : `${value.slice(0, 4)}…${value.slice(-4)}`;
  }
  private view(row: {
    id: string;
    alias: string;
    platform: ProviderPlatform;
    protocol: ProviderProtocol;
    baseUrl: string;
    modelName: string;
    keyMask: string;
    supportsWriting: boolean;
    supportsDoubaoCheck: boolean;
    supportsWebSearch: boolean;
    enabled: boolean;
    lastTestAt: Date | null;
    lastTestStatus: string;
    lastTestError: string | null;
  }) {
    return {
      id: row.id,
      alias: row.alias,
      platform: row.platform.toLowerCase(),
      protocol: row.protocol.toLowerCase(),
      baseUrl: row.baseUrl,
      modelName: row.modelName,
      keyMask: row.keyMask,
      supportsWriting: row.supportsWriting,
      supportsDoubaoCheck: row.supportsDoubaoCheck,
      supportsWebSearch: row.supportsWebSearch,
      enabled: row.enabled,
      lastTestAt: row.lastTestAt?.toISOString() ?? null,
      lastTestStatus: row.lastTestStatus.toLowerCase(),
      lastTestError: row.lastTestError,
    };
  }
}
