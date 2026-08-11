import { describe, expect, it } from 'vitest'
import { isValidDeviceIdentity } from './device-identity'

describe('local device identity format', () => {
  it('accepts only UUID values for the protected local identity', () => {
    expect(isValidDeviceIdentity('57e8f10e-ff47-4ae2-a4df-42de9374a7d5')).toBe(true)
    expect(isValidDeviceIdentity('machine-serial-123')).toBe(false)
    expect(isValidDeviceIdentity('')).toBe(false)
  })
})
