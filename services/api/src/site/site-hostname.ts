export type ContentSiteHostnameSource = {
  merchantHostname: string | null;
  agentRootHostname: string | null;
  whiteLabelRootHostname: string | null;
  platformRootHostname: string | null;
};

export function resolveContentSiteHostname(
  tenantId: string,
  source: ContentSiteHostnameSource,
): string | null {
  if (source.merchantHostname) return source.merchantHostname;
  const root =
    source.agentRootHostname ??
    source.whiteLabelRootHostname ??
    source.platformRootHostname;
  return root ? `site-${tenantId}.${root}` : null;
}
