const ACCOUNT_PATTERN = /^[A-Za-z0-9]{6,12}$/

export function isValidAccountText(value: string): boolean {
  return ACCOUNT_PATTERN.test(value)
}

export function normalizeUsername(value: string): string {
  return value.toLowerCase()
}
