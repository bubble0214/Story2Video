@echo off
chcp 65001 >nul
title Story2Video Launcher

echo ========================================
echo   Story2Video - 一键启动
echo ========================================
echo.

:: 设置项目根目录
set ROOT_DIR=%~dp0
cd /d "%ROOT_DIR%"

:: ========================================
:: Step 1: 启动基础设施 (PostgreSQL + Redis)
:: ========================================
echo [1/4] 启动 PostgreSQL 和 Redis...
docker compose up postgres redis -d
if %errorlevel% neq 0 (
    echo [!] Docker 启动失败，请确保 Docker Desktop 正在运行
    pause
    exit /b 1
)
echo [+] PostgreSQL (port 5434) + Redis (port 6383) 已启动
echo.

:: 等待数据库就绪
echo [.] 等待数据库就绪...
:wait_db
docker compose exec postgres pg_isready -U story2video >nul 2>&1
if %errorlevel% neq 0 (
    timeout /t 2 /nobreak >nul
    goto wait_db
)
echo [+] 数据库就绪
echo.

:: ========================================
:: Step 2: 运行数据库迁移
:: ========================================
echo [2/4] 运行数据库迁移...
docker compose run --rm migrate
if %errorlevel% neq 0 (
    echo [!] 迁移失败，请检查日志
    pause
    exit /b 1
)
echo [+] 数据库迁移完成
echo.

:: ========================================
:: Step 3: 启动后端和 Celery Worker
:: ========================================
echo [3/4] 启动后端 API (port 8000) + Celery Worker...

:: 激活虚拟环境（如果存在）
if exist "%ROOT_DIR%.venv\Scripts\activate.bat" (
    call "%ROOT_DIR%.venv\Scripts\activate.bat"
) else (
    echo [!] 未找到虚拟环境，尝试使用系统 Python
)

:: 启动后端 (uvicorn) — 后台运行
start "Story2Video-API" cmd /c "uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 2>&1"

:: 启动 Celery Worker — 后台运行
start "Story2Video-Worker" cmd /c "celery -A app.core.celery:celery_app worker --loglevel=info --queues=default,novel_generation,lyrics_generation,music_generation,video_generation,dead_letter 2>&1"

echo [+] 后端 API 和 Worker 已启动
echo.

:: ========================================
:: Step 4: 启动前端
:: ========================================
echo [4/4] 启动前端 (port 3000)...
cd /d "%ROOT_DIR%client"

:: 检查 node_modules
if not exist "node_modules" (
    echo [.] 安装前端依赖...
    call npm install
)

:: 启动前端 — 后台运行
start "Story2Video-Frontend" cmd /c "npm run dev 2>&1"
echo [+] 前端已启动
echo.

:: ========================================
:: 完成
:: ========================================
echo ========================================
echo   所有服务已启动！
echo.
echo   前端:    http://localhost:3000
echo   后端:    http://localhost:8000
echo   API 文档: http://localhost:8000/api/v1/docs
echo.
echo   按任意键关闭此窗口（服务仍在后台运行）
echo ========================================
pause >nul
