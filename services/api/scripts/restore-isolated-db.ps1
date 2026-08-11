param(
  [Parameter(Mandatory = $true)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
  [string]$BackupFile,
  [switch]$ConfirmIsolatedRestore,
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$containerName = 'doubaohk-postgres'
$databaseName = 'doubaohk_isolated_test'
$databaseUser = 'doubaohk'

if (-not $ConfirmIsolatedRestore) { throw '恢复会覆盖 doubaohk_isolated_test，必须显式传入 -ConfirmIsolatedRestore' }
if (-not (Get-Command docker.exe -ErrorAction SilentlyContinue)) { throw '未找到 Docker Desktop CLI，不能恢复隔离数据库' }
$containerState = (& docker.exe inspect --format '{{.State.Running}}' $containerName 2>$null).Trim()
if ($containerState -ne 'true') { throw "PostgreSQL 容器 $containerName 未运行，不能恢复" }

$absoluteBackup = (Resolve-Path -LiteralPath $BackupFile).Path
$backupName = "restore-$([guid]::NewGuid().ToString('N')).dump"
$containerPath = "/tmp/$backupName"

if ($WhatIf) { [pscustomobject]@{ database = $databaseName; restoreFrom = $absoluteBackup; wouldRestore = $true }; return }
if (Get-NetTCPConnection -State Listen -LocalPort 3011 -ErrorAction SilentlyContinue) { throw '3011 隔离 API 仍在运行。请先停止隔离 API 后再恢复，避免连接中的数据不一致。' }
$backupScript = Join-Path $PSScriptRoot 'backup-isolated-db.ps1'
$preRestoreBackup = & $backupScript
if ($LASTEXITCODE -ne 0 -or -not $preRestoreBackup) { throw '恢复前自动备份失败，已拒绝覆盖隔离数据库' }
try {
  & docker.exe cp $absoluteBackup "${containerName}:$containerPath"
  if ($LASTEXITCODE -ne 0) { throw '无法将备份文件复制到 PostgreSQL 容器' }
  & docker.exe exec $containerName pg_restore --list $containerPath | Out-Null
  if ($LASTEXITCODE -ne 0) { throw '备份文件校验失败，未开始恢复' }
  & docker.exe exec $containerName pg_restore --clean --if-exists --no-owner --exit-on-error -U $databaseUser -d $databaseName $containerPath
  if ($LASTEXITCODE -ne 0) { throw '隔离数据库恢复失败；请使用恢复前自动备份排查' }
  [pscustomobject]@{ database = $databaseName; restoredFrom = $absoluteBackup; safetyBackup = $preRestoreBackup.backup; restored = $true }
} finally {
  & docker.exe exec $containerName rm -f -- $containerPath 2>$null | Out-Null
}
