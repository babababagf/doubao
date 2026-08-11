export interface WhiteLabel {
  id: string;
  companyName: string;
  username: string;
  status: "active" | "disabled";
  expiresAt: string;
  agentUsage: number;
  agentLimit: number;
  merchantUsage: number;
  merchantReserved: number;
  merchantLimit: number;
  computePoints: number;
  writingRemaining: number;
  primaryDomain: string | null;
  domainStatus: "pending_verification" | "active" | "disabled" | null;
  brand: { nickname: string; logoUrl: string; version: number };
}

export interface WhiteLabelForm {
  username: string;
  password: string;
  companyName: string;
  agentLimit: number;
  merchantLimit: number;
  computePoints: number;
  writingLimit: number;
  primaryDomain: string;
  expiresAt: string;
}

export interface ManagedDomain {
  id: string;
  hostname: string;
  purpose: "content_root" | "content_host" | "tenant_admin" | "merchant_web";
  status: "pending_verification" | "active" | "disabled";
  ownershipStatus:
    | "not_requested"
    | "pending_dns"
    | "ownership_verified_waiting_certificate"
    | "active"
    | "disabled";
  tenant: {
    id: string;
    name: string;
    kind: "white_label" | "agent" | "merchant";
  };
  dnsRecordName: string | null;
  dnsRecordValue: string | null;
  ownershipVerifiedAt: string | null;
  createdAt: string;
}

export interface ManagedTenant {
  id: string;
  companyName: string;
  kind: "white_label" | "agent" | "merchant";
  status: "active" | "disabled" | "expired";
  expiresAt: string;
  parent: { id: string; name: string } | null;
  whiteLabelId: string | null;
  username: string;
  createdAt: string;
}

export interface ManagedAuditLog {
  id: string;
  tenantName: string | null;
  actorScope: "system" | "tenant_admin";
  action: string;
  entityType: string;
  entityId: string;
  detail: unknown;
  createdAt: string;
}

export interface PlatformTaskOperations {
  summary: { queued: number; running: number; attention: number; failed: number };
  items: Array<{
    id: string;
    category: "ai_question_expansion" | "ai_article_writing" | "doubao_check" | "publish";
    status: string;
    tenantName: string;
    totalCount: number;
    completedCount: number;
    failedCount: number;
    failureReason: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface PublisherUpdatePolicy {
  enabled: boolean;
  feedUrl: string | null;
  minimumVersion: string | null;
  releaseNotes: string;
  updatedAt: string | null;
}

export interface PlatformDomains {
  superAdminHostname: string | null;
  tenantAdminHostname: string | null;
  merchantWebHostname: string | null;
  contentRootHostname: string | null;
  updatedAt: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({
      message: "请求失败，请稍后重试",
      code: "UNKNOWN_ERROR",
    }))) as { message?: string; code?: string };
    throw new ApiError(
      response.status,
      body.code ?? "UNKNOWN_ERROR",
      body.message ?? "请求失败，请稍后重试",
    );
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}

export function login(username: string, password: string): Promise<void> {
  return api("/super/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function logout(): Promise<void> {
  return api("/super/auth/logout", { method: "POST" });
}
export function listWhiteLabels(): Promise<WhiteLabel[]> {
  return api("/super/white-labels");
}
export function createWhiteLabel(payload: WhiteLabelForm): Promise<void> {
  const { primaryDomain, ...rest } = payload;
  return api("/super/white-labels", {
    method: "POST",
    headers: { "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify({
      ...rest,
      primaryDomain: primaryDomain.trim() || undefined,
      expiresAt: new Date(payload.expiresAt).toISOString(),
    }),
  });
}

export function updateWhiteLabelBrand(
  whiteLabelId: string,
  payload: { nickname: string; logoUrl: string },
): Promise<void> {
  return api(`/super/white-labels/${whiteLabelId}/brand`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
export function listDomains(): Promise<ManagedDomain[]> {
  return api("/super/domains");
}
export function listAuditLogs(): Promise<ManagedAuditLog[]> {
  return api("/super/audit-logs");
}
export function getTaskOperations(): Promise<PlatformTaskOperations> {
  return api("/super/task-operations");
}
export function getPublisherUpdatePolicy(): Promise<PublisherUpdatePolicy> {
  return api("/super/publisher-update-policy");
}
export function savePublisherUpdatePolicy(payload: {
  enabled: boolean;
  feedUrl: string;
  minimumVersion: string;
  releaseNotes: string;
}): Promise<PublisherUpdatePolicy> {
  return api("/super/publisher-update-policy", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
export function getPlatformDomains(): Promise<PlatformDomains> {
  return api("/super/platform-domains");
}
export function savePlatformDomains(payload: {
  superAdminHostname: string;
  tenantAdminHostname: string;
  merchantWebHostname: string;
  contentRootHostname: string;
}): Promise<PlatformDomains> {
  return api("/super/platform-domains", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
export function issueDomainVerificationToken(
  domainId: string,
): Promise<ManagedDomain> {
  return api(`/super/domains/${domainId}/verification-token`, {
    method: "POST",
  });
}
export function verifyDomainDns(domainId: string): Promise<ManagedDomain> {
  return api(`/super/domains/${domainId}/verify-dns`, { method: "POST" });
}
export function updateDomainStatus(
  domainId: string,
  status: "active" | "disabled",
): Promise<ManagedDomain> {
  return api(`/super/domains/${domainId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
export function listTenants(): Promise<ManagedTenant[]> {
  return api("/super/tenants");
}
export function updateTenantStatus(
  tenantId: string,
  status: "active" | "disabled",
): Promise<ManagedTenant> {
  return api(`/super/tenants/${tenantId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
