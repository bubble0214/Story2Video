<#
.SYNOPSIS
  Story2Video 一键部署脚本 (PowerShell)
  自动安装依赖 → 生成配置 → 启动服务

.DESCRIPTION
  在 Windows 上一行命令完成 Story2Video 完整部署。
  自动检查/安装: Docker Desktop, Python, Node.js, Git
  自动生成 .env 随机密钥、启动数据库、初始化表、安装 pip/npm 依赖、启动前后端服务。

  用法（管理员 PowerShell）:
    .\scripts\setup.ps1

  或从远程直接运行（仅限公开仓库）:
    iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/bubble0214/Story2Video/main/scripts/setup.ps1'))
#>

#Requires -RunAsAdministrator

# ── 配置 ──────────────────────────────────────────────────
$PROJECT_URL       = "https://github.com/bubble0214/Story2Video.git"
$REQUIRED_PYTHON   = "3.10"
$REQUIRED_NODE     = "18"

# ── 颜色输出 ──────────────────────────────────────────────
function Write-Info($msg)  { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "[ OK ] $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "[ERR ] $msg" -ForegroundColor Red }

# ── 辅助函数 ──────────────────────────────────────────────
function Test-Command($name) {
    return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Get-VersionString($cmd) {
    try { return (& $cmd 2>&1)[0] } catch { return "" }
}

function Wait-While($condition, $timeoutSeconds, $message) {
    $elapsed = 0
    while (& $condition) {
        if ($elapsed -ge $timeoutSeconds) { return $false }
        Write-Host "  $message ..." -NoNewline
        Start-Sleep 2; $elapsed += 2
    }
    return $true
}

# ═══════════════════════════════════════════════════════════
# 阶段 0：确认管理员权限
# ═══════════════════════════════════════════════════════════
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "  Story2Video 一键部署脚本 (Windows)" -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta
Write-Host ""

# 检查是否 git clone 了项目
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

if (-not (Test-Path (Join-Path $projectRoot "docker-compose.yml"))) {
    Write-Warn "当前目录 ($projectRoot) 未检测到项目文件。"
    $choice = Read-Host "是否克隆项目到当前目录？(Y/n)"
    if ($choice -ne "n") {
        if (-not (Test-Command "git")) {
            Write-Err "Git 未安装，请先安装 Git 或手动 clone 项目。"
            Write-Host "手动执行: git clone $PROJECT_URL"
            exit 1
        }
        git clone $PROJECT_URL (Join-Path $projectRoot "Story2Video")
        $projectRoot = Join-Path $projectRoot "Story2Video"
        $scriptDir = Join-Path $projectRoot "scripts"
        Set-Location $projectRoot
    }
}
Set-Location $projectRoot
Write-Ok "工作目录: $projectRoot"

# ═══════════════════════════════════════════════════════════
# 阶段 1：检查/安装 Chocolatey
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "─── [1/9] 检查 Chocolatey ───────────────────" -ForegroundColor Yellow

if (Test-Command "choco") {
    Write-Ok "Chocolatey $(choco --version 2>$null) 已安装。"
} else {
    Write-Info "安装 Chocolatey ..."
    try {
        Set-ExecutionPolicy Bypass -Scope Process -Force -ErrorAction Stop
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        $chocoInstall = (New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1')
        # 使用 Invoke-Expression 在内存中执行安装脚本
        iex $chocoInstall
        # 刷新环境变量
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
        # 重新导入 Chocolatey 模块
        Import-Module "$env:ProgramData\chocolatey\helpers\chocolateyProfile.psm1" -ErrorAction SilentlyContinue
        Write-Ok "Chocolatey 安装完成: $(choco --version 2>$null)"
    } catch {
        Write-Err "Chocolatey 安装失败: $_"
        Write-Info "请手动以管理员身份运行 CMD 安装 Chocolatey:"
        Write-Host '  @"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -InputFormat None -ExecutionPolicy Bypass -Command "[System.Net.ServicePointManager]::SecurityProtocol = 3072; iex ((New-Object System.Net.WebClient).DownloadString(''https://community.chocolatey.org/install.ps1''))" && SET "PATH=%PATH%;%ALLUSERSPROFILE%\chocolatey\shim"'
        exit 1
    }
}

# ═══════════════════════════════════════════════════════════
# 阶段 2：检查/安装系统依赖
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "─── [2/9] 检查系统依赖 ─────────────────────" -ForegroundColor Yellow

# --- Git ---
if (Test-Command "git") {
    $gitVer = git --version 2>$null
    Write-Ok "Git $gitVer 已安装。"
} else {
    Write-Info "安装 Git ..."
    try { choco install git -y | Out-Null; Write-Ok "Git 安装完成。"; $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User") } catch { Write-Err "Git 安装失败: $_" }
}

# --- Python ---
if (Test-Command "python") {
    $pyVer = python --version 2>&1
    Write-Ok "Python $pyVer 已安装。"
} else {
    Write-Info "安装 Python ..."
    try {
        choco install python -y | Out-Null
        # 刷新 PATH 让 python 命令可用
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
        Write-Ok "Python $(python --version 2>&1) 安装完成。"
    } catch { Write-Err "Python 安装失败: $_" }
}

# --- Node.js ---
if (Test-Command "node") {
    $nodeVer = node --version 2>&1
    Write-Ok "Node.js $nodeVer 已安装。"
} else {
    Write-Info "安装 Node.js LTS ..."
    try {
        choco install nodejs-lts -y --params="/InstallDir:$env:ProgramFiles\nodejs" | Out-Null
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
        # node 可能需要刷新
        $nodeRetries = 0; do { Start-Sleep 1; $nodeRetries++ } while (-not (Test-Command "node") -and $nodeRetries -lt 10)
        Write-Ok "Node.js $(node --version 2>&1) 安装完成。npm: $(npm --version 2>&1)"
    } catch { Write-Err "Node.js 安装失败: $_" }
}

# --- Docker Desktop ---
if (Test-Command "docker") {
    $dockerVer = docker --version 2>&1
    Write-Ok "Docker $dockerVer 已安装。"
} else {
    Write-Warn "Docker Desktop 未安装。正在安装 ..."
    Write-Warn "注意: 安装过程中可能需要确认 UAC，安装后可能需要重启系统。"
    try {
        choco install docker-desktop -y | Out-Null
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
        Write-Ok "Docker Desktop 安装完成。请手动重启系统或启动 Docker Desktop。"
    } catch { Write-Err "Docker Desktop 安装失败: $_" }
}

# ═══════════════════════════════════════════════════════════
# 阶段 3：确保在项目根目录
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "─── [3/9] 验证项目结构 ─────────────────────" -ForegroundColor Yellow

$requiredFiles = @("docker-compose.yml", "requirements.txt", "client/package.json")
foreach ($f in $requiredFiles) {
    $path = Join-Path $projectRoot $f
    if (-not (Test-Path $path)) {
        Write-Err "缺少必需文件: $f (路径: $path)"
        Write-Info "请确保在项目根目录运行此脚本。"
        exit 1
    }
}
Write-Ok "项目结构验证通过。"

# ═══════════════════════════════════════════════════════════
# 阶段 4：生成 .env
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "─── [4/9] 生成 .env 配置文件 ────────────────" -ForegroundColor Yellow

$envFile = Join-Path $projectRoot ".env"
$envExample = Join-Path $projectRoot ".env.example"

if (-not (Test-Path $envFile)) {
    if (-not (Test-Path $envExample)) {
        Write-Err "缺少 .env.example 文件，无法生成配置。"
        exit 1
    }
    Copy-Item $envExample $envFile

    # 生成随机密钥
    function New-RandomString($length) {
        $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        return -join ((1..$length) | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
    }
    function New-HexString($length) {
        $bytes = [byte[]]::new($length)
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        return -join ($bytes | ForEach-Object { "{0:x2}" -f $_ })
    }

    $dbPassword   = New-RandomString 32
    $jwtSecret    = New-RandomString 32
    $encryptKey   = New-HexString 64  # 64 hex chars = 32 bytes

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

# ═══════════════════════════════════════════════════════════
# 阶段 5：启动 Docker
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "─── [5/9] 启动 PostgreSQL + Redis ──────────" -ForegroundColor Yellow

if (-not (Test-Command "docker")) {
    Write-Err "Docker 未安装或不在 PATH 中。请安装 Docker Desktop 后重试。"
    Write-Info "下载地址: https://www.docker.com/products/docker-desktop/"
    exit 1
}

# 等待 Docker 守护进程就绪
$dockerReady = $false
for ($i = 0; $i -lt 30; $i++) {
    $result = docker info 2>&1
    if ($LASTEXITCODE -eq 0) { $dockerReady = $true; break }
    Write-Host "  等待 Docker 守护进程启动 ..." -NoNewline
    Start-Sleep 2
}
if (-not $dockerReady) {
    Write-Err "Docker 守护进程未运行。请启动 Docker Desktop 后重试。"
    Write-Info "提示: 在开始菜单找到 Docker Desktop 并启动，然后重新运行此脚本。"
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
    $ready = docker compose exec -T postgres pg_isready -U story2video 2>&1
    if ($LASTEXITCODE -eq 0) { $pgReady = $true; break }
    Start-Sleep 2
}
if (-not $pgReady) {
    Write-Err "PostgreSQL 未能就绪。请检查容器日志 (docker compose logs postgres)"
    exit 1
}
Write-Ok "PostgreSQL 就绪。"

# 初始化数据库
Write-Info "初始化数据库表 ..."
$initSql = Join-Path $scriptDir "init-db.sql"
if (Test-Path $initSql) {
    Get-Content $initSql | docker compose exec -T postgres psql -U story2video 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "数据库表初始化完成。"
    } else {
        Write-Warn "建表可能已存在（首次运行正常现象）。"
    }
} else {
    Write-Warn "未找到 init-db.sql，跳过数据库初始化。"
}

# ═══════════════════════════════════════════════════════════
# 阶段 6：安装 Python 依赖
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "─── [6/9] 安装 Python 依赖 ─────────────────" -ForegroundColor Yellow

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
if ($LASTEXITCODE -eq 0) {
    Write-Ok "Python 依赖安装完成。"
} else {
    Write-Warn "部分依赖安装可能出错，请检查 pip 日志。"
}

# ═══════════════════════════════════════════════════════════
# 阶段 7：安装前端依赖
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "─── [7/9] 安装前端依赖 ─────────────────────" -ForegroundColor Yellow

$clientDir = Join-Path $projectRoot "client"
$nodeModules = Join-Path $clientDir "node_modules"

if (-not (Test-Path $nodeModules)) {
    Write-Info "安装 npm 依赖 ..."
    Push-Location $clientDir
    npm install --legacy-peer-deps 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "npm 依赖安装完成。"
    } else {
        Write-Warn "npm install 可能出错，请检查日志。"
    }
    Pop-Location
} else {
    Write-Ok "node_modules 已存在，跳过。"
}

# ═══════════════════════════════════════════════════════════
# 阶段 8：启动服务
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "─── [8/9] 启动服务 ─────────────────────────" -ForegroundColor Yellow

# 停止已存在的旧进程
Get-Process -Name "python" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "run_api" } | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "next dev" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 1

# 启动后端 API
Write-Info "启动后端 API (http://localhost:8005) ..."
Start-Process -NoNewWindow -WindowStyle Hidden -FilePath $pythonExe -ArgumentList "run_api.py" -WorkingDirectory $projectRoot
Start-Sleep 2

# 验证 API 是否启动成功
$apiUp = $false
for ($i = 0; $i -lt 10; $i++) {
    try {
        $req = Invoke-WebRequest -Uri "http://localhost:8005/docs" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($req.StatusCode -eq 200) { $apiUp = $true; break }
    } catch {}
    Start-Sleep 2
}
if ($apiUp) {
    Write-Ok "后端 API 已启动。"
} else {
    Write-Warn "后端 API 启动可能较慢，请稍后访问 http://localhost:8005/docs 确认。"
}

# 启动前端
Write-Info "启动前端 (http://localhost:3000) ..."
Push-Location $clientDir
$npmExe = (Get-Command "npm").Source
Start-Process -NoNewWindow -WindowStyle Hidden -FilePath $npmExe -ArgumentList "run dev" -WorkingDirectory $clientDir
Pop-Location

Write-Ok "前端已启动。"

# ═══════════════════════════════════════════════════════════
# 阶段 9：输出信息
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Story2Video 部署完成！" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  前端地址：http://localhost:3000" -ForegroundColor Cyan
Write-Host "  后端 API：http://localhost:8005" -ForegroundColor Cyan
Write-Host "  API 文档：http://localhost:8005/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "  首次使用：" -ForegroundColor White
Write-Host "    1. 浏览器打开 http://localhost:3000" -ForegroundColor White
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

# 保持窗口打开（双击运行时有用）
if ($Host.Name -eq "ConsoleHost") {
    Write-Host "按任意键退出（服务将在后台继续运行）..." -NoNewline
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
