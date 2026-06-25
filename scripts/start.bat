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
  echo [1/6] 生成 .env 配置文件...

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
  echo   LLM API Key 等请登录后在 设置 页面配置。
) else (
  echo [1/6] .env 已存在，跳过。
)

:: ── 2. Docker ───────────────────────────────────
echo [2/6] 检查 Docker...
docker info >nul 2>&1
if %errorlevel% neq 0 (
  echo   [错误] Docker 未运行。请启动 Docker Desktop 后重试。
  pause
  exit /b
)
echo   Docker 运行中。

:: ── 3. 启动 PostgreSQL + Redis ─────────────────
echo [3/6] 启动 PostgreSQL + Redis...
docker compose up -d postgres redis
if %errorlevel% neq 0 (
  echo   [错误] 容器启动失败。
  pause
  exit /b
)
echo   PostgreSQL ^& Redis 已启动。

:: ── 4. 初始化数据库 ─────────────────────────────
echo [4/6] 初始化数据库表...
docker compose exec -T postgres psql -U story2video < scripts\init-db.sql
if %errorlevel% neq 0 (
  echo   [警告] 建表可能已存在（首次运行正常）。
)
echo   数据库就绪。

:: ── 5. 安装前端依赖 ─────────────────────────────
echo [5/6] 安装前端依赖...
cd client
if not exist "node_modules" (
  npm install --legacy-peer-deps
) else (
  echo    node_modules 已存在，跳过安装。
)

:: ── 6. 启动服务 ─────────────────────────────────
echo [6/6] 启动服务...
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
echo   按任意键退出（服务将在后台继续运行）
echo ============================================
echo.
pause >nul
