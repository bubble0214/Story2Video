<#
.SYNOPSIS
  Story2Video 快速启动脚本 (PowerShell)
  仅启动服务，不含安装步骤。首次使用请先以管理员身份运行 setup.ps1。
#>

#Requires -RunAsAdministrator

# ── 配置 ──────────────────────────────────────────────────
$API_PORT      = 8005
$FRONTEND_PORT = 3000

# ── 颜色输出 ──────────────────────────────────────────────
function Write-Info($msg)  { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "[ OK ] $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "[ERR ] $msg" -ForegroundColor Red }

function Test-Command($name) {
    return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

# ═══════════════════════════════════════════════════════════
# 阶段 0：确认管理员权限 + 定位项目目录
# ═══════════════════════════════════════════════════════════
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "  Story2Video 快速启动" -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

Set-Location $projectRoot
Write-Ok "工作目录: $projectRoot"

# ═══════════════════════════════════════════════════════════
# 阶段 1：前置检查 — 确认已执行过 setup.ps1
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "--- [1/7] 前置检查 ---------------------------" -ForegroundColor Yellow

$missingFiles = @()
if (-not (Test-Path (Join-Path $projectRoot "docker-compose.yml"))) { $missingFiles += "docker-compose.yml" }
if (-not (Test-Path (Join-Path $projectRoot ".env"))) { $missingFiles += ".env" }

$venvPath = Join-Path $projectRoot ".venv"
$pythonExe = Join-Path $venvPath "Scripts\python.exe"
if (-not (Test-Path $pythonExe)) { $missingFiles += "Python 虚拟环境 (.venv)" }

$clientDir = Join-Path $projectRoot "client"
$nodeModules = Join-Path $clientDir "node_modules"
if (-not (Test-Path $nodeModules)) { $missingFiles += "前端依赖 (client/node_modules)" }

if ($missingFiles.Count -gt 0) {
    Write-Err "缺少必需文件或依赖，请先以管理员身份运行 setup.ps1 完成首次安装："
    foreach ($f in $missingFiles) { Write-Host "  - $f" }
    Write-Host ""
    Write-Info "  .\scripts\setup.ps1"
    exit 1
}
Write-Ok "前置检查通过。"

# ═══════════════════════════════════════════════════════════
# 阶段 2：启动 Docker (PostgreSQL + Redis + Celery Worker)
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "--- [2/7] 启动 PostgreSQL + Redis + Worker ----" -ForegroundColor Yellow

if (-not (Test-Command "docker")) {
    Write-Err "Docker 未安装。请先运行 setup.ps1 完成安装。"
    exit 1
}

$dockerReady = $false
for ($i = 0; $i -lt 30; $i++) {
    $null = docker info 2>&1
    if ($LASTEXITCODE -eq 0) { $dockerReady = $true; break }
    Write-Host "  等待 Docker 守护进程启动 ..."
    Start-Sleep 2
}
if (-not $dockerReady) {
    Write-Err "Docker 守护进程未运行。请启动 Docker Desktop 后重试。"
    exit 1
}
Write-Ok "Docker 运行中。"

# 导入 .env 变量
$envContent = Get-Content (Join-Path $projectRoot ".env") -Raw
foreach ($line in $envContent -split "`n") {
    if ($line -match "^\s*([A-Z_]+)=(.*)$") {
        $key = $matches[1]
        $val = $matches[2].Trim()
        if ($val -match '^"(.*)"$') { $val = $matches[1] }
        Set-Item -Path "env:$key" -Value $val -ErrorAction SilentlyContinue
    }
}

docker compose up -d postgres redis worker
if ($LASTEXITCODE -ne 0) {
    Write-Err "容器启动失败。请检查 Docker 日志。"
    exit 1
}
Write-Ok "PostgreSQL & Redis & Worker 已启动。"

# 等待 PostgreSQL 就绪
Write-Info "等待 PostgreSQL 就绪 ..."
$pgReady = $false
for ($i = 0; $i -lt 20; $i++) {
    $null = docker compose exec -T postgres pg_isready -U story2video 2>&1
    if ($LASTEXITCODE -eq 0) { $pgReady = $true; break }
    Start-Sleep 2
}
if (-not $pgReady) {
    Write-Err "PostgreSQL 未能就绪。请检查容器日志。"
    exit 1
}
Write-Ok "PostgreSQL 就绪。"

# ═══════════════════════════════════════════════════════════
# 阶段 3：运行数据库迁移
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "--- [3/7] 运行数据库迁移 ---------------------" -ForegroundColor Yellow

Write-Info "执行 alembic upgrade head ..."
& $pythonExe -m alembic upgrade head
if ($LASTEXITCODE -ne 0) {
    Write-Err "数据库迁移失败。"
    exit 1
}
Write-Ok "数据库迁移完成。"

# ═══════════════════════════════════════════════════════════
# 阶段 4：启动后端 API
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "--- [4/7] 启动后端 API -----------------------" -ForegroundColor Yellow

# 停止占用端口的旧进程
$oldApi = Get-NetTCPConnection -LocalPort $API_PORT -ErrorAction SilentlyContinue | Select-Object -First 1
if ($oldApi) {
    Write-Info "停止旧的后端进程 (PID $($oldApi.OwningProcess)) ..."
    Stop-Process -Id $oldApi.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep 1
}

Write-Info "启动后端 API (http://localhost:$API_PORT) ..."
Start-Process -FilePath $pythonExe -ArgumentList "run_api.py" -WorkingDirectory $projectRoot
Start-Sleep 3

# 验证 API
$apiUp = $false
for ($i = 0; $i -lt 10; $i++) {
    try {
        $req = Invoke-WebRequest -Uri "http://localhost:$API_PORT/api/v1/docs" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($req.StatusCode -eq 200) { $apiUp = $true; break }
    } catch {
        # ignore, retry
    }
    Start-Sleep 2
}
if ($apiUp) {
    Write-Ok "后端 API 已启动。"
} else {
    Write-Warn "后端 API 启动可能较慢，请稍后访问 http://localhost:$API_PORT/docs 确认。"
}

# ═══════════════════════════════════════════════════════════
# 阶段 5：启动前端
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "--- [5/7] 启动前端 ---------------------------" -ForegroundColor Yellow

$oldFront = Get-NetTCPConnection -LocalPort $FRONTEND_PORT -ErrorAction SilentlyContinue | Select-Object -First 1
if ($oldFront) {
    Write-Info "停止旧的前端进程 (PID $($oldFront.OwningProcess)) ..."
    Stop-Process -Id $oldFront.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep 1
}

Write-Info "启动前端 (http://localhost:$FRONTEND_PORT) ..."
$npmExe = (Get-Command "npm").Source
Start-Process -FilePath $npmExe -ArgumentList "run dev -- -H 0.0.0.0" -WorkingDirectory $clientDir

Write-Ok "前端已启动。"

# ═══════════════════════════════════════════════════════════
# 阶段 6：输出信息
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Story2Video 启动完成！" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  前端地址：http://localhost:$FRONTEND_PORT" -ForegroundColor Cyan
Write-Host "  后端 API：http://localhost:$API_PORT" -ForegroundColor Cyan
Write-Host "  API 文档：http://localhost:$API_PORT/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "  停止服务：" -ForegroundColor Yellow
Write-Host "    docker compose down" -ForegroundColor Yellow
Write-Host "  再次启动：" -ForegroundColor Yellow
Write-Host "    重新运行此脚本即可" -ForegroundColor Yellow
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

if ($Host.Name -eq "ConsoleHost") {
    Write-Host "按任意键退出（服务将在后台继续运行）..." -NoNewline
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
