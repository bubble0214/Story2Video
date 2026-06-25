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
  echo [1/6] 创建 .env 配置文件...
  copy .env.example .env >nul
  echo   ^> 请编辑 .env 修改密码和 API Key，然后重新运行本脚本
  echo.
  start notepad .env
  pause
  exit /b
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
echo   按任意键退出（服务将在后台继续运行）
echo ============================================
echo.
pause >nul
