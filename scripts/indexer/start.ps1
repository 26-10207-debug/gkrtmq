$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Join-Path $PSScriptRoot '..\..')
$indexerNode = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $indexerNode) {
  $indexerNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $indexerNode)) { throw 'Node.js 22.13 이상을 설치한 뒤 다시 실행해 주세요.' }
& $indexerNode scripts/indexer/run.mjs run
