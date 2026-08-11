import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'

const require = createRequire(import.meta.url)
const { parseUpdateInfo, resolveFiles } = require('electron-updater/out/providers/Provider.js')
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
const version = packageJson.version
const artifactName = `豆包获客发布助手-${version}-win-x64.exe`
const distDir = join(packageRoot, 'dist')
const artifactPath = join(distDir, artifactName)
const blockmapPath = `${artifactPath}.blockmap`
const manifestPath = join(distDir, 'latest.yml')
const checkOnly = process.argv.includes('--check')

assertVersion(version)
const [artifactStat, blockmapStat, sha512, sha256] = await Promise.all([
  stat(artifactPath),
  stat(blockmapPath),
  hashFile(artifactPath, 'sha512', 'base64'),
  hashFile(artifactPath, 'sha256', 'hex'),
])
if (!artifactStat.isFile() || artifactStat.size === 0) throw new Error(`安装包不存在或为空：${artifactName}`)
if (!blockmapStat.isFile() || blockmapStat.size === 0) throw new Error(`blockmap 不存在或为空：${artifactName}.blockmap`)

if (!checkOnly) {
  await writeFile(manifestPath, serializeManifest({
    version,
    artifactName,
    sha512,
    size: artifactStat.size,
    releaseDate: artifactStat.mtime.toISOString(),
  }), 'utf8')
}

const rawManifest = await readFile(manifestPath, 'utf8')
const manifest = parseUpdateInfo(rawManifest, 'latest.yml', new URL('https://updates.example.com/publisher/latest.yml'))
verifyManifest(manifest, { version, artifactName, sha512, size: artifactStat.size })
const resolved = resolveFiles(manifest, new URL('https://updates.example.com/publisher/'))
if (resolved.length !== 1 || resolved[0]?.url.href !== `https://updates.example.com/publisher/${encodeURI(artifactName)}`) {
  throw new Error('latest.yml 无法被 electron-updater 解析为预期安装包地址')
}

process.stdout.write(`${JSON.stringify({
  mode: checkOnly ? 'check' : 'generate',
  version,
  artifact: artifactName,
  size: artifactStat.size,
  sha256: sha256.toUpperCase(),
  sha512,
  blockmap: `${artifactName}.blockmap`,
  blockmapSize: blockmapStat.size,
  manifest: 'latest.yml',
}, null, 2)}\n`)

function assertVersion(value) {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) throw new Error('package.json version 必须为 x.y.z')
}

async function hashFile(path, algorithm, encoding) {
  const hash = createHash(algorithm)
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest(encoding)
}

function serializeManifest({ version: manifestVersion, artifactName: fileName, sha512: checksum, size, releaseDate }) {
  return [
    `version: ${quote(manifestVersion)}`,
    'files:',
    `  - url: ${quote(fileName)}`,
    `    sha512: ${quote(checksum)}`,
    `    size: ${size}`,
    `path: ${quote(fileName)}`,
    `sha512: ${quote(checksum)}`,
    `releaseDate: ${quote(releaseDate)}`,
    '',
  ].join('\n')
}

function quote(value) {
  return JSON.stringify(value)
}

function verifyManifest(manifest, expected) {
  if (!manifest || typeof manifest !== 'object') throw new Error('latest.yml 内容无效')
  if (manifest.version !== expected.version) throw new Error(`latest.yml 版本不匹配：${String(manifest.version)}`)
  if (manifest.path !== expected.artifactName || manifest.sha512 !== expected.sha512) throw new Error('latest.yml 兼容字段与安装包不匹配')
  if (!Array.isArray(manifest.files) || manifest.files.length !== 1) throw new Error('latest.yml files 必须且只能包含当前安装包')
  const file = manifest.files[0]
  if (file.url !== expected.artifactName || file.sha512 !== expected.sha512 || file.size !== expected.size) throw new Error('latest.yml 文件信息与安装包不匹配')
  if (typeof manifest.releaseDate !== 'string' || Number.isNaN(Date.parse(manifest.releaseDate))) throw new Error('latest.yml releaseDate 无效')
}
