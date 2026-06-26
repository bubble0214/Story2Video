#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Story2Video 快速启动脚本 (Linux / macOS)
# 仅启动服务，不含安装步骤。首次使用请先运行 setup.sh。
# ──────────────────────────────────────────────────────────────
set -euo pipefail

API_PORT=8005
FRONTEND_PORT=3000

# ── 颜色输出 ────────────────────────────────────────────────
INFO()  { printf "\033[36m[INFO]\033[0m  %s\n" "$*"; }
OK()    { printf "\033[32m[ OK ]\033[0m  %s\n" "$*"; }
WARN()  { printf "\033[33m[WARN]\033[0m  %s\n" "$*"; }
ERR()   { printf "\033[31m[ERR ]\033[0m  %s\n" "$*"; }

# ═══════════════════════════════════════════════════════════
# 阶段 0：定位项目目录
# ═══════════════════════════════════════════════════════════
printf "\033[35m============================================\033[0m\n"
printf "\033[35m  Story2Video 快速启动\033[0m\n"
printf "\033[35m============================================\033[0m\n\n"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"
OK "工作目录: $PROJECT_ROOT"

# ═══════════════════════════════════════════════════════════
# 阶段 1：前置检查 — 确认已执行过 setup.sh
# ═══════════════════════════════════════════════════════════
printf "\n--- [1/7] 前置检查 ---------------------------\033[33m\033[0m\n"

MISSING=""
for f in docker-compose.yml .env; do
  [ ! -f "$f" ] && MISSING="$MISSING  - $f\n"
done

VENV_PATH=".venv"
PYTHON_EXE="$VENV_PATH/bin/python"
[ ! -d "$VENV_PATH" ] && MISSING="$MISSING  - Python 虚拟环境 (.venv)\n"

CLIENT_DIR="$PROJECT_ROOT/client"
[ ! -d "$CLIENT_DIR/node_modules" ] && MISSING="$MISSING  - 前端依赖 (client/node_modules)\n"

if [ -n "$MISSING" ]; then
    ERR "缺少必需文件或依赖，请先运行 setup.sh 完成首次安装："
    printf "$MISSING"
    echo ""
    INFO "  cd $PROJECT_ROOT && ./scripts/setup.sh"
    exit 1
fi
OK "前置检查通过。"

# ═══════════════════════════════════════════════════════════
# 阶段 2：启动 Docker (PostgreSQL + Redis + Celery Worker)
# ═══════════════════════════════════════════════════════════
printf "\n--- [2/7] 启动 PostgreSQL + Redis + Worker ----\033[33m\033[0m\n"

if ! docker info &>/dev/null; then
    ERR "Docker 守护进程未运行。请启动 Docker 后重试。"
    exit 1
fi
OK "Docker 运行中。"

docker compose up -d postgres redis worker
if [ $? -ne 0 ]; then
    ERR "容器启动失败。请检查 Docker 日志。"
    exit 1
fi
OK "PostgreSQL & Redis & Worker 已启动。"

INFO "等待 PostgreSQL 就绪 ..."
for i in $(seq 1 20); do
    if docker compose exec -T postgres pg_isready -U story2video &>/dev/null; then
        break
    fi
    sleep 2
done
if ! docker compose exec -T postgres pg_isready -U story2video &>/dev/null; then
    ERR "PostgreSQL 未能就绪。请检查容器日志。"
    exit 1
fi
OK "PostgreSQL 就绪。"

# ═══════════════════════════════════════════════════════════
# 阶段 3：运行数据库迁移
# ═══════════════════════════════════════════════════════════
printf "\n--- [3/7] 运行数据库迁移 ---------------------\033[33m\033[0m\n"

INFO "执行 alembic upgrade head ..."
"$PYTHON_EXE" -m alembic upgrade head
if [ $? -ne 0 ]; then
    ERR "数据库迁移失败。"
    exit 1
fi
OK "数据库迁移完成。"

# ═══════════════════════════════════════════════════════════
# 阶段 4：安装 git hooks
# ═══════════════════════════════════════════════════════════
printf "\n--- [4/7] 安装 git hooks ---------------------\033[33m\033[0m\n"

if [ -f "$SCRIPT_DIR/install-hooks.sh" ]; then
    bash "$SCRIPT_DIR/install-hooks.sh" 2>/dev/null && OK "Git hooks 安装完成。" || WARN "Git hooks 安装失败（非致命）。"
else
    WARN "未找到 install-hooks.sh，跳过。"
fi

# ═══════════════════════════════════════════════════════════
# 阶段 5：启动后端 API
# ═══════════════════════════════════════════════════════════
printf "\n--- [5/7] 启动后端 API -----------------------\033[33m\033[0m\n"

# 停止占用端口的旧进程
stop_port() {
    local port=$1
    local pid
    pid=$(lsof -ti :"$port" 2>/dev/null || true)
    if [ -n "$pid" ]; then
        INFO "停止占用端口 $port 的旧进程 (PID $pid) ..."
        kill "$pid" 2>/dev/null || true
        sleep 1
    fi
}
stop_port "$API_PORT"

INFO "启动后端 API (http://localhost:$API_PORT) ..."
"$PYTHON_EXE" "$PROJECT_ROOT/run_api.py" &
API_PID=$!
sleep 3

# 验证 API
API_UP=false
for i in $(seq 1 10); do
    if curl -s -o /dev/null -w '%{http_code}' "http://localhost:$API_PORT/api/v1/docs" 2>/dev/null | grep -q "200"; then
        API_UP=true
        break
    fi
    sleep 2
done
if [ "$API_UP" = true ]; then
    OK "后端 API 已启动。"
else
    WARN "后端 API 启动可能较慢，请稍后访问 http://localhost:$API_PORT/docs 确认。"
fi

# ═══════════════════════════════════════════════════════════
# 阶段 6：启动前端
# ═══════════════════════════════════════════════════════════
printf "\n--- [6/7] 启动前端 ---------------------------\033[33m\033[0m\n"

stop_port "$FRONTEND_PORT"
INFO "启动前端 (http://localhost:$FRONTEND_PORT) ..."
(cd "$CLIENT_DIR" && npm run dev) &
FRONT_PID=$!
sleep 3
OK "前端已启动。"

# ═══════════════════════════════════════════════════════════
# 阶段 7：输出信息
# ═══════════════════════════════════════════════════════════
printf "\n\033[32m============================================\033[0m\n"
printf "\033[32m  Story2Video 启动完成！\033[0m\n"
printf "\033[32m============================================\033[0m\n\n"
printf "  \033[36m前端地址：http://localhost:$FRONTEND_PORT\033[0m\n"
printf "  \033[36m后端 API：http://localhost:$API_PORT\033[0m\n"
printf "  \033[36mAPI 文档：http://localhost:$API_PORT/docs\033[0m\n\n"
printf "  \033[33m停止服务：\033[0m\n"
printf "    kill $API_PID $FRONT_PID; docker compose down\n"
printf "  \033[33m再次启动：\033[0m\n"
printf "    重新运行此脚本\n\n"
printf "\033[32m============================================\033[0m\n"

INFO "服务在后台运行中。按 Ctrl+C 退出（不会停止服务）。"
wait 2>/dev/null || true
