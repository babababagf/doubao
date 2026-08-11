import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const preloadPath = resolve('out/preload/index.cjs')
const source = await readFile(preloadPath, 'utf8')
const importsElectronRuntime = /require\(["']electron["']\)/.test(source)
const bundledInstallerMarkers = ['Downloading Electron binary', 'Electron failed to install correctly', 'install-electron', 'node_modules/electron']
const bundledInstallerMarker = bundledInstallerMarkers.find((marker) => source.includes(marker))

if (!importsElectronRuntime) throw new Error('预加载构建没有通过沙箱兼容的 CommonJS 入口导入 Electron 安全桥接模块')
if (bundledInstallerMarker) throw new Error(`预加载构建错误包含 Electron 安装器代码：${bundledInstallerMarker}`)

process.stdout.write(`${JSON.stringify({ ok: true, preloadPath, format: 'commonjs', electronRuntimeExternalized: true })}\n`)
