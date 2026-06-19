@echo off
chcp 65001 >nul
title Story2Video - 停止所有服务

echo ========================================
echo   Story2Video - 停止所有服务
echo ========================================
echo.

:: 杀掉后台 Node/Python/Celery 进程
echo [.] 停止前端 (Next.js)...
taskkill /f /fi "WINDOWTITLE eq Story2Video-Frontend" 2>nul

echo [.] 停止后端 (Uvicorn)...
taskkill /f /fi "WINDOWTITLE eq Story2Video-API" 2>nul

echo [.] 停止 Worker (Celery)...
taskkill /f /fi "WINDOWTITLE eq Story2Video-Worker" 2>nul

:: 停掉 Docker 容器
echo [.] 停止 Docker 容器...
docker compose down

echo.
echo [+] 所有服务已停止
echo.

pause
