@echo off
chcp 65001 >nul
title Story2Video 一键部署
cd /d "%~dp0.."

echo ============================================
echo   Story2Video 一键部署脚本 (Windows)
echo ============================================
echo.

:: ── 1. .env ─────────────────────────────────────
if not exist ".env" (
  echo [1/7] 生成 .env 配置文件...

  :: 生成随机密钥
  for /f %%i in ('powershell -Command "[Convert]::ToBase64String((1..24|%%{Get-Random -Max 256})).Substring(0,32)"') do set JWT_KEY=%%i
  for /f %%i in ('powershell -Command "[Convert]::ToBase64String((1..48|%%{Get-Random -Max 256})).Substring(0,64)"') do set ENC_KEY=%%i
  for /f %%i in ('powershell -Command "[Convert]::ToBase64String((1..24|%%{Get-Random -Max 256})).Substring(0,32)"') do set DB_PWD=%%i

  copy .env.example .env >nul

  :: 替换占位密码
  powershell -Command ^
    (Get-Content .env) ^
      -replace 'REPLACE_WITH_YOUR_OWN_PASSWORD_12345','%DB_PWD%' ^
      -replace 'REPLACE_WITH_YOUR_OWN_JWT_SECRET_32CHARS_','%JWT_KEY%' ^
      -replace '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef','%ENC_KEY%' ^
    ^| Set-Content .env

  echo   .env 已生成（密钥已自动填充）。
  echo   LLM API Key 等等请登录后在 设置 页面配置。
) else (
  echo [1/7] .env 已存在，跳过。
)

:: 生成前端环境变量
if not exist "client\.env.local" (
  echo NEXT_PUBLIC_API_BASE_URL=http://localhost:8005/api> client\.env.local
  echo   client/.env.local 已生成。
) else (
  echo   client/.env.local 已存在，跳过。
)

:: ── 2. Docker ───────────────────────────────────
echo [2/7] 检查 Docker...
docker info >nul 2>&1
if %errorlevel% neq 0 (
  echo   [错误] Docker 未运行。请启动 Docker Desktop 后重试。
  pause
  exit /b
)
echo   Docker 运行中。

:: ── 3. 启动 PostgreSQL + Redis ─────────────────
echo [3/7] 启动 PostgreSQL + Redis...
docker compose up -d postgres redis
if %errorlevel% neq 0 (
  echo   [错误] 容器启动失败。
  pause
  exit /b
)
echo   PostgreSQL ^& Redis 已启动。

:: ── 4. 安装 Python 依赖 ───────────────────────
echo [4/7] 安装 Python 依赖...
if not exist ".venv\Scripts\python.exe" (
  python -m venv .venv
  if %errorlevel% neq 0 (
    echo   [错误] 虚拟环境创建失败。
    pause
    exit /b
  )
)
call .venv\Scripts\pip.exe install -r requirements.txt --quiet
if %errorlevel% neq 0 (
  echo   [错误] Python 依赖安装失败。
  pause
  exit /b
)
echo   Python 依赖安装完成。

:: ── 5. 数据库迁移 (alembic) ─────────────────────
echo [5/7] 运行数据库迁移 (alembic upgrade head)...
call .venv\Scripts\python.exe -m alembic upgrade head
if %errorlevel% neq 0 (
  echo   [错误] 数据库迁移失败，请检查 .env 连接配置。
  pause
  exit /b
)
echo   数据库迁移完成。

:: ── 6. 安装前端依赖 ─────────────────────────────
echo [6/7] 安装前端依赖...
cd client
if not exist "node_modules" (
  call npm install --legacy-peer-deps
  if %errorlevel% neq 0 (
    echo   [错误] npm install 失败。
    cd ..
    pause
    exit /b
  )
) else (
  echo   node_modules 已存在，跳过安装。
)

:: ── 7. 启动服务 ─────────────────────────────────
echo [7/7] 启动服务...
echo.

:: 启动 API（后台）
echo   启动后端 API (http://localhost:8005)...
start "Story2Video-API" /B python ..\run_api.py

:: 启动前端（后台）
echo   启动前端 (http://localhost:3000)...
start "Story2Video-Frontend" /B npm run dev

cd ..

echo.
echo ============================================
echo   部署完成！
echo.
echo   前端地址：http://localhost:3000
echo   后端 API：http://localhost:8005
echo   API 文档：http://localhost:8005/docs
echo.
echo   首次使用：
echo     1. 浏览器打开 http://localhost:3000
echo     2. 注册账号
echo     3. 进入 设置 页面配置 LLM API Key
echo.
echo   停止服务：docker compose down
echo   再次启动：重新运行此脚本
echo.
echo   按任意键退出（服务将在后台继续运行）
echo ============================================
echo.
pause >nul
