import { app, safeStorage } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isValidDeviceIdentity } from '../shared/device-identity'

export interface LocalDeviceProtectionStatus {
  available: boolean
  initialized: boolean
}

export class LocalDeviceIdentityStore {
  private initialized = false
  private readonly filePath = join(app.getPath('userData'), 'device-identity.bin')

  async ensure(): Promise<LocalDeviceProtectionStatus> {
    if (!safeStorage.isEncryptionAvailable()) return { available: false, initialized: false }
    try {
      const encrypted = await readFile(this.filePath)
      const identity = safeStorage.decryptString(encrypted)
      if (!isValidDeviceIdentity(identity)) throw new Error('invalid device identity')
    } catch {
      await mkdir(app.getPath('userData'), { recursive: true })
      const encrypted = safeStorage.encryptString(randomUUID())
      const temporaryFile = `${this.filePath}.tmp`
      await writeFile(temporaryFile, encrypted)
      await rename(temporaryFile, this.filePath)
    }
    this.initialized = true
    return { available: true, initialized: true }
  }

  async getIdentity(): Promise<string | null> {
    const status = await this.ensure()
    if (!status.available) return null
    try {
      const encrypted = await readFile(this.filePath)
      const identity = safeStorage.decryptString(encrypted)
      return isValidDeviceIdentity(identity) ? identity : null
    } catch {
      return null
    }
  }
}
