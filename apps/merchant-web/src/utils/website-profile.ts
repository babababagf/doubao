export function truncateWebsiteText(value: string, maxLength: number): string {
  return Array.from(value.trim()).slice(0, maxLength).join('')
}

export function normalizeWebsiteList(values: string[], maxItems: number, maxLength: number): string[] {
  return [...new Set(values
    .flatMap((item) => item.split(/[\r\n,，;；]+/))
    .map((item) => truncateWebsiteText(item, maxLength))
    .filter(Boolean))].slice(0, maxItems)
}
