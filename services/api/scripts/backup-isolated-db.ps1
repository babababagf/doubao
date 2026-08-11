[CmdletBinding()]
param(
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $repositoryRoot '.runtime\backups' }
$containerName = 'doubaohk-postgres'
$databaseName = 'doubaohk_isolated_test'
$databaseUser = 'doubaohk'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupName = "$databaseName-$timestamp.dump"
$containerPath = "/tmp/$backupName"

if (-not (Get-Command docker.exe -ErrorAction SilentlyContinue)) { throw '未找到 Docker Desktop CLI，不能备份隔离数据库' }
$containerState = (& docker.exe inspect --format '{{.State.Running}}' $containerName 2>$null).Trim()
if ($containerState -ne 'true') { throw "PostgreSQL 容器 $containerName 未运行，不能备份" }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$target = Join-Path $OutputDirectory $backupName

try {
  & docker.exe exec $containerName pg_dump -U $databaseUser -d $databaseName -Fc -f $containerPath
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump 执行失败' }
  & docker.exe cp "${containerName}:$containerPath" $target
  if ($LASTEXITCODE -ne 0) { throw '无法从 PostgreSQL 容器导出备份文件' }
  & docker.exe exec $containerName pg_restore --list $containerPath | Out-Null
  if ($LASTEXITCODE -ne 0) { throw '备份文件校验失败' }
  $file = Get-Item -LiteralPath $target
  if ($file.Length -lt 1024) { throw '备份文件异常过小，已拒绝交付' }
  [pscustomobject]@{ database = $databaseName; backup = $file.FullName; bytes = $file.Length; verified = $true }
} finally {
  & docker.exe exec $containerName rm -f -- $containerPath 2>$null | Out-Null
}
