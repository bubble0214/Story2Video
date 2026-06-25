<#
.SYNOPSIS
  Story2Video 一键部署脚本 (PowerShell)
  自动安装依赖 → 生成配置 → 启动服务

.DESCRIPTION
  在 Windows 上一行命令完成 Story2Video 完整部署。
  自动检查/安装: Docker Desktop, Python, Node.js, Git
  自动生成 .env 随机密钥、启动数据库、alembic 迁移、安装 pip/npm 依赖、启动前后端服务。

  用法（管理员 PowerShell）:
    .\scripts\setup.ps1
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

# 刷新 PATH（Chocolatey 安装后 Machine PATH 可能未在当前 session 生效）
function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}

# ═══════════════════════════════════════════════════════════
# 阶段 0：确认管理员权限 + 定位项目目录
# ═══════════════════════════════════════════════════════════
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "  Story2Video 一键部署脚本 (Windows)" -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

Set-Location $projectRoot
Write-Ok "工作目录: $projectRoot"

# ═══════════════════════════════════════════════════════════
# 阶段 1：检查/安装 Chocolatey
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "--- [1/9] 检查 Chocolatey -------------------" -ForegroundColor Yellow

if (Test-Command "choco") {
    $chocoVer = choco --version 2>$null
    Write-Ok "Chocolatey $chocoVer 已安装。"
} else {
    Write-Info "安装 Chocolatey ..."
    try {
        Set-ExecutionPolicy Bypass -Scope Process -Force -ErrorAction Stop
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        $chocoInstall = (New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1')
        iex $chocoInstall
        Refresh-Path
        Import-Module "$env:ProgramData\chocolatey\helpers\chocolateyProfile.psm1" -ErrorAction SilentlyContinue
        $chocoVer = choco --version 2>$null
        Write-Ok "Chocolatey 安装完成: $chocoVer"
    } catch {
        Write-Err "Chocolatey 安装失败: $_"
        Write-Info "请手动安装 Chocolatey 后重试。"
        exit 1
    }
}

# ═══════════════════════════════════════════════════════════
# 阶段 2：检查/安装系统依赖
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "--- [2/9] 检查系统依赖 ---------------------" -ForegroundColor Yellow

# Git
if (Test-Command "git") {
    $gitVer = git --version 2>$null
    Write-Ok "Git $gitVer 已安装。"
} else {
    Write-Info "安装 Git ..."
    try {
        choco install git -y | Out-Null
        Refresh-Path
        Write-Ok "Git 安装完成。"
    } catch {
        Write-Err "Git 安装失败: $_"
    }
}

# Python
if (Test-Command "python") {
    $pyVer = python --version 2>&1
    Write-Ok "Python $pyVer 已安装。"
} else {
    Write-Info "安装 Python ..."
    try {
        choco install python -y | Out-Null
        Refresh-Path
        $pyVer = python --version 2>&1
        Write-Ok "Python $pyVer 安装完成。"
    } catch {
        Write-Err "Python 安装失败: $_"
    }
}

# Node.js
if (Test-Command "node") {
    $nodeVer = node --version 2>&1
    Write-Ok "Node.js $nodeVer 已安装。"
} else {
    Write-Info "安装 Node.js LTS ..."
    try {
        choco install nodejs-lts -y | Out-Null
        Refresh-Path
        $nodeVer = node --version 2>&1
        Write-Ok "Node.js $nodeVer 安装完成。npm: $(npm --version 2>&1)"
    } catch {
        Write-Err "Node.js 安装失败: $_"
    }
}

# Docker Desktop
if (Test-Command "docker") {
    $dockerVer = docker --version 2>&1
    Write-Ok "Docker $dockerVer 已安装。"
} else {
    Write-Warn "Docker Desktop 未安装。正在安装（可能需要确认 UAC）..."
    try {
        choco install docker-desktop -y | Out-Null
        Refresh-Path
        Write-Ok "Docker Desktop 安装完成。"
    } catch {
        Write-Err "Docker Desktop 安装失败: $_"
    }
}

# ═══════════════════════════════════════════════════════════
# 阶段 3：验证项目结构
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "--- [3/9] 验证项目结构 ---------------------" -ForegroundColor Yellow

$requiredFiles = @("docker-compose.yml", "requirements.txt", "client/package.json")
$allOk = $true
foreach ($f in $requiredFiles) {
    $path = Join-Path $projectRoot $f
    if (-not (Test-Path $path)) {
        Write-Err "缺少必需文件: $f"
        $allOk = $false
    }
}
if (-not $allOk) {
    Write-Info "请确保已在项目根目录 (Story2Video)，然后重试。"
    exit 1
}
Write-Ok "项目结构验证通过。"

# ═══════════════════════════════════════════════════════════
# 阶段 4：生成 .env + client/.env.local
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "--- [4/9] 生成配置文件 ---------------------" -ForegroundColor Yellow

$envFile = Join-Path $projectRoot ".env"
$envExample = Join-Path $projectRoot ".env.example"

if (-not (Test-Path $envFile)) {
    if (-not (Test-Path $envExample)) {
        Write-Err "缺少 .env.example 文件，无法生成配置。"
        exit 1
    }
    Copy-Item $envExample $envFile

    function New-RandomString($length) {
        $bytes = [byte[]]::new($length)
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        return ($bytes | ForEach-Object { $chars[$_ % $chars.Length] }) -join ''
    }
    function New-HexString($length) {
        $bytes = [byte[]]::new($length)
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        $result = ""
        foreach ($b in $bytes) { $result += "{0:x2}" -f $b }
        return $result
    }

    $dbPassword   = New-RandomString 32
    $jwtSecret    = New-RandomString 32
    $encryptKey   = New-HexString 64

    $content = Get-Content $envFile -Raw
    $content = $content.Replace("REPLACE_WITH_YOUR_OWN_PASSWORD_12345", $dbPassword)
    $content = $content.Replace("REPLACE_WITH_YOUR_OWN_JWT_SECRET_32CHARS_", $jwtSecret)
    $content = $content.Replace("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef", $encryptKey)
    Set-Content $envFile $content -NoNewline

    Write-Ok ".env 已生成（密钥已自动填充）。"
    Write-Info "LLM API Key 请登录后在 设置 页面配置。"
} else {
    Write-Ok ".env 已存在，跳过。"
}

# 生成前端环境变量
$clientEnvLocal = Join-Path $projectRoot "client\.env.local"
if (-not (Test-Path $clientEnvLocal)) {
    Set-Content $clientEnvLocal "NEXT_PUBLIC_API_BASE_URL=http://localhost:$API_PORT/api" -NoNewline
    Write-Ok "client/.env.local 已生成。"
} else {
    Write-Ok "client/.env.local 已存在，跳过。"
}

# ═══════════════════════════════════════════════════════════
# 阶段 5：启动 Docker (PostgreSQL + Redis)
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "--- [5/9] 启动 PostgreSQL + Redis ----------" -ForegroundColor Yellow

if (-not (Test-Command "docker")) {
    Write-Err "Docker 未安装。请安装 Docker Desktop 后重试。"
    exit 1
}

# 等待 Docker 守护进程
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

# 启动容器
docker compose up -d postgres redis
if ($LASTEXITCODE -ne 0) {
    Write-Err "容器启动失败。请检查 Docker 日志。"
    exit 1
}
Write-Ok "PostgreSQL & Redis 已启动。"

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
# 阶段 6：安装 Python 依赖
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "--- [6/9] 安装 Python 依赖 -----------------" -ForegroundColor Yellow

$venvPath = Join-Path $projectRoot ".venv"
$pythonExe = Join-Path $venvPath "Scripts\python.exe"
$pipExe = Join-Path $venvPath "Scripts\pip.exe"

if (-not (Test-Path $venvPath)) {
    Write-Info "创建 Python 虚拟环境 ..."
    python -m venv $venvPath
    if ($LASTEXITCODE -ne 0) { Write-Err "虚拟环境创建失败。"; exit 1 }
    Write-Ok "虚拟环境已创建。"
} else {
    Write-Ok "虚拟环境已存在，跳过。"
}

Write-Info "安装 pip 依赖 ..."
& $pipExe install -r (Join-Path $projectRoot "requirements.txt") --quiet 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Err "Python 依赖安装失败，请检查 requirements.txt。"
    exit 1
}
Write-Ok "Python 依赖安装完成。"

# ═══════════════════════════════════════════════════════════
# 阶段 7：运行数据库迁移 (alembic upgrade head)
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "--- [7/9] 运行数据库迁移 -------------------" -ForegroundColor Yellow

Write-Info "执行 alembic upgrade head ..."
& $pythonExe -m alembic upgrade head
if ($LASTEXITCODE -ne 0) {
    Write-Err "数据库迁移失败，请检查 .env 中的数据库连接配置。"
    exit 1
}
Write-Ok "数据库迁移完成（所有表和索引已就绪）。"

# ═══════════════════════════════════════════════════════════
# 阶段 8：安装前端依赖
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "--- [8/9] 安装前端依赖 ---------------------" -ForegroundColor Yellow

$clientDir = Join-Path $projectRoot "client"
$nodeModules = Join-Path $clientDir "node_modules"

if (-not (Test-Path $nodeModules)) {
    Write-Info "安装 npm 依赖 ..."
    Push-Location $clientDir
    npm install --legacy-peer-deps 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Err "npm install 失败，请检查网络或 Node.js 版本。"
        Pop-Location
        exit 1
    }
    Pop-Location
    Write-Ok "npm 依赖安装完成。"
} else {
    Write-Ok "node_modules 已存在，跳过。"
}

# ═══════════════════════════════════════════════════════════
# 阶段 9：启动服务
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "--- [9/9] 启动服务 -------------------------" -ForegroundColor Yellow

# 停止占用端口的旧进程
$oldApi = Get-NetTCPConnection -LocalPort $API_PORT -ErrorAction SilentlyContinue | Select-Object -First 1
if ($oldApi) {
    Write-Info "停止旧的后端进程 (PID $($oldApi.OwningProcess)) ..."
    Stop-Process -Id $oldApi.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep 1
}

$oldFront = Get-NetTCPConnection -LocalPort $FRONTEND_PORT -ErrorAction SilentlyContinue | Select-Object -First 1
if ($oldFront) {
    Write-Info "停止旧的前端进程 (PID $($oldFront.OwningProcess)) ..."
    Stop-Process -Id $oldFront.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep 1
}

# 启动后端 API
Write-Info "启动后端 API (http://localhost:$API_PORT) ..."
Start-Process -FilePath $pythonExe -ArgumentList "run_api.py" -WorkingDirectory $projectRoot
Start-Sleep 3

# 验证 API
$apiUp = $false
for ($i = 0; $i -lt 10; $i++) {
    try {
        $req = Invoke-WebRequest -Uri "http://localhost:$API_PORT/docs" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
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

# 启动前端
Write-Info "启动前端 (http://localhost:$FRONTEND_PORT) ..."
$npmExe = (Get-Command "npm").Source
Start-Process -FilePath $npmExe -ArgumentList "run dev" -WorkingDirectory $clientDir

Write-Ok "前端已启动。"

# ═══════════════════════════════════════════════════════════
# 输出信息
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Story2Video 部署完成！" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  前端地址：http://localhost:$FRONTEND_PORT" -ForegroundColor Cyan
Write-Host "  后端 API：http://localhost:$API_PORT" -ForegroundColor Cyan
Write-Host "  API 文档：http://localhost:$API_PORT/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "  首次使用：" -ForegroundColor White
Write-Host "    1. 浏览器打开 http://localhost:$FRONTEND_PORT" -ForegroundColor White
Write-Host "    2. 注册账号" -ForegroundColor White
Write-Host "    3. 进入 设置 页面配置 LLM API Key" -ForegroundColor White
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
