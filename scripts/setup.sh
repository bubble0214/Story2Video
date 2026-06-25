#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Story2Video 一键部署脚本 (Linux / macOS)
# 自动安装依赖 → 生成配置 → 启动服务
#
# 用法:
#   chmod +x scripts/setup.sh
#   ./scripts/setup.sh
# ──────────────────────────────────────────────────────────────
set -euo pipefail

API_PORT=8005
FRONTEND_PORT=3000

# ── 颜色输出 ────────────────────────────────────────────────
INFO()  { printf "\033[36m[INFO]\033[0m  %s\n" "$*"; }
OK()    { printf "\033[32m[ OK ]\033[0m  %s\n" "$*"; }
WARN()  { printf "\033[33m[WARN]\033[0m  %s\n" "$*"; }
ERR()   { printf "\033[31m[ERR ]\033[0m  %s\n" "$*"; }

command_exists() { command -v "$1" &>/dev/null; }

# ═══════════════════════════════════════════════════════════
# 阶段 0：定位项目目录
# ═══════════════════════════════════════════════════════════
printf "\033[35m============================================\033[0m\n"
printf "\033[35m  Story2Video 一键部署脚本 (Linux/macOS)\033[0m\n"
printf "\033[35m============================================\033[0m\n\n"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"
OK "工作目录: $PROJECT_ROOT"

# ═══════════════════════════════════════════════════════════
# 阶段 1：检查/安装系统依赖
# ═══════════════════════════════════════════════════════════
printf "\n--- [1/9] 检查系统依赖 ---------------------\033[33m\033[0m\n"

detect_pkg_manager() {
    if command_exists apt-get; then
        echo "apt"
    elif command_exists brew; then
        echo "brew"
    elif command_exists yum || command_exists dnf; then
        echo "yum"
    else
        echo "unknown"
    fi
}

PKG_MGR=$(detect_pkg_manager)
INFO "包管理器: $PKG_MGR"

install_pkg_apt() {
    sudo apt-get update -qq && sudo apt-get install -y -qq "$@" 2>/dev/null
}

install_pkg_brew() {
    for pkg in "$@"; do
        brew install "$pkg" 2>/dev/null || true
    done
}

install_pkg_yum() {
    sudo yum install -y -q "$@" 2>/dev/null
}

install_pkg() {
    case "$PKG_MGR" in
        apt) install_pkg_apt "$@" ;;
        brew) install_pkg_brew "$@" ;;
        yum) install_pkg_yum "$@" ;;
        *)
            ERR "无法识别的包管理器，请手动安装: $*"
            return 1
            ;;
    esac
}

# Git
if command_exists git; then
    OK "Git $(git --version 2>&1 | awk '{print $3}') 已安装。"
else
    INFO "安装 Git ..."
    install_pkg git || WARN "Git 安装失败，请手动安装。"
fi

# Python 3
if command_exists python3; then
    OK "Python $(python3 --version 2>&1) 已安装。"
else
    INFO "安装 Python 3 ..."
    install_pkg python3 python3-pip python3-venv || WARN "Python 安装失败，请手动安装。"
fi

# Node.js
if command_exists node; then
    OK "Node.js $(node --version 2>&1) 已安装。"
else
    INFO "安装 Node.js LTS ..."
    if [ "$PKG_MGR" = "brew" ]; then
        install_pkg node || WARN "Node.js 安装失败。"
    elif [ "$PKG_MGR" = "apt" ]; then
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - 2>/dev/null
        install_pkg_apt nodejs || WARN "Node.js 安装失败。"
    else
        WARN "请手动安装 Node.js LTS: https://nodejs.org/"
    fi
fi

# Docker
if command_exists docker; then
    OK "Docker $(docker --version 2>&1 | awk '{print $3}' | tr -d ',') 已安装。"
else
    if [ "$PKG_MGR" = "apt" ]; then
        INFO "Docker 未安装。正在通过官方脚本自动安装 Docker Engine ..."
        curl -fsSL https://get.docker.com | sh 2>&1 | tail -3
        if command_exists docker; then
            sudo usermod -aG docker "$USER"
            OK "Docker Engine 安装完成。"
            WARN "用户组变更需要重新登录终端生效。继续执行脚本 ..."
        else
            ERR "Docker 自动安装失败，请手动安装: https://docs.docker.com/engine/install/ubuntu/"
            exit 1
        fi
    else
        WARN "Docker 未安装。请手动安装 Docker 后重试。"
        INFO "  macOS: https://docs.docker.com/desktop/setup/install/mac-install/"
        INFO "  Linux: https://docs.docker.com/engine/install/"
        exit 1
    fi
fi

# ═══════════════════════════════════════════════════════════
# 阶段 2：验证项目结构
# ═══════════════════════════════════════════════════════════
printf "\n--- [2/9] 验证项目结构 ---------------------\033[33m\033[0m\n"

for f in docker-compose.yml requirements.txt client/package.json; do
    if [ ! -f "$f" ]; then
        ERR "缺少必需文件: $f"
        exit 1
    fi
done
OK "项目结构验证通过。"

# ═══════════════════════════════════════════════════════════
# 阶段 3：生成 .env + client/.env.local
# ═══════════════════════════════════════════════════════════
printf "\n--- [3/9] 生成配置文件 ---------------------\033[33m\033[0m\n"

if [ ! -f ".env" ]; then
    if [ ! -f ".env.example" ]; then
        ERR "缺少 .env.example 文件，无法生成配置。"
        exit 1
    fi
    cp .env.example .env

    # 生成随机密钥
    DB_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
    JWT_SECRET=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
    ENCRYPT_KEY=$(openssl rand -hex 32)

    sed -i.bak \
        -e "s/REPLACE_WITH_YOUR_OWN_PASSWORD_12345/${DB_PASSWORD}/g" \
        -e "s/REPLACE_WITH_YOUR_OWN_JWT_SECRET_32CHARS_/${JWT_SECRET}/g" \
        -e "s/1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef/${ENCRYPT_KEY}/g" \
        .env
    rm -f .env.bak

    OK ".env 已生成（密钥已自动填充）。"
    INFO "LLM API Key 请登录后在 设置 页面配置。"
else
    OK ".env 已存在，跳过。"
fi

# 生成前端环境变量
if [ ! -f "client/.env.local" ]; then
    echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:${API_PORT}/api" > client/.env.local
    OK "client/.env.local 已生成。"
else
    OK "client/.env.local 已存在，跳过。"
fi

# ═══════════════════════════════════════════════════════════
# 阶段 4：启动 Docker (PostgreSQL + Redis)
# ═══════════════════════════════════════════════════════════
printf "\n--- [4/9] 启动 PostgreSQL + Redis ----------\033[33m\033[0m\n"

if ! docker info &>/dev/null; then
    ERR "Docker 守护进程未运行。请启动 Docker 后重试。"
    exit 1
fi
OK "Docker 运行中。"

docker compose up -d postgres redis
if [ $? -ne 0 ]; then
    ERR "容器启动失败。请检查 Docker 日志。"
    exit 1
fi
OK "PostgreSQL & Redis 已启动。"

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
# 阶段 5：安装 Python 依赖
# ═══════════════════════════════════════════════════════════
printf "\n--- [5/9] 安装 Python 依赖 -----------------\033[33m\033[0m\n"

VENV_PATH=".venv"
PYTHON_EXE="$VENV_PATH/bin/python"
PIP_EXE="$VENV_PATH/bin/pip"

if [ ! -d "$VENV_PATH" ]; then
    INFO "创建 Python 虚拟环境 ..."
    python3 -m venv "$VENV_PATH"
    OK "虚拟环境已创建。"
else
    OK "虚拟环境已存在，跳过。"
fi

INFO "安装 pip 依赖 ..."
"$PIP_EXE" install -r requirements.txt --quiet
if [ $? -ne 0 ]; then
    ERR "Python 依赖安装失败，请检查 requirements.txt。"
    exit 1
fi
OK "Python 依赖安装完成。"

# ═══════════════════════════════════════════════════════════
# 阶段 6：运行数据库迁移 (alembic upgrade head)
# ═══════════════════════════════════════════════════════════
printf "\n--- [6/9] 运行数据库迁移 -------------------\033[33m\033[0m\n"

INFO "执行 alembic upgrade head ..."
"$PYTHON_EXE" -m alembic upgrade head
if [ $? -ne 0 ]; then
    ERR "数据库迁移失败，请检查 .env 中的数据库连接配置。"
    exit 1
fi
OK "数据库迁移完成（所有表和索引已就绪）。"

# ═══════════════════════════════════════════════════════════
# 阶段 7：安装前端依赖
# ═══════════════════════════════════════════════════════════
printf "\n--- [7/9] 安装前端依赖 ---------------------\033[33m\033[0m\n"

CLIENT_DIR="$PROJECT_ROOT/client"
if [ ! -d "$CLIENT_DIR/node_modules" ]; then
    INFO "安装 npm 依赖 ..."
    (cd "$CLIENT_DIR" && npm install --legacy-peer-deps)
    if [ $? -ne 0 ]; then
        ERR "npm install 失败，请检查网络或 Node.js 版本。"
        exit 1
    fi
    OK "npm 依赖安装完成。"
else
    OK "node_modules 已存在，跳过。"
fi

# ═══════════════════════════════════════════════════════════
# 阶段 8：安装 git hooks
# ═══════════════════════════════════════════════════════════
printf "\n--- [8/9] 安装 git hooks -------------------\033[33m\033[0m\n"

if [ -f "$SCRIPT_DIR/install-hooks.sh" ]; then
    bash "$SCRIPT_DIR/install-hooks.sh" 2>/dev/null && OK "Git hooks 安装完成。" || WARN "Git hooks 安装失败（非致命）。"
else
    WARN "未找到 install-hooks.sh，跳过。"
fi

# ═══════════════════════════════════════════════════════════
# 阶段 9：启动服务
# ═══════════════════════════════════════════════════════════
printf "\n--- [9/9] 启动服务 -------------------------\033[33m\033[0m\n"

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
stop_port "$FRONTEND_PORT"

# 启动后端 API
INFO "启动后端 API (http://localhost:$API_PORT) ..."
"$PYTHON_EXE" "$PROJECT_ROOT/run_api.py" &
API_PID=$!
sleep 3

# 验证 API
API_UP=false
for i in $(seq 1 10); do
    if curl -s -o /dev/null -w '%{http_code}' "http://localhost:$API_PORT/docs" 2>/dev/null | grep -q "200"; then
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

# 启动前端
INFO "启动前端 (http://localhost:$FRONTEND_PORT) ..."
(cd "$CLIENT_DIR" && npm run dev) &
FRONT_PID=$!
OK "前端已启动。"

# ═══════════════════════════════════════════════════════════
# 输出信息
# ═══════════════════════════════════════════════════════════
printf "\n\033[32m============================================\033[0m\n"
printf "\033[32m  Story2Video 部署完成！\033[0m\n"
printf "\033[32m============================================\033[0m\n\n"
printf "  \033[36m前端地址：http://localhost:$FRONTEND_PORT\033[0m\n"
printf "  \033[36m后端 API：http://localhost:$API_PORT\033[0m\n"
printf "  \033[36mAPI 文档：http://localhost:$API_PORT/docs\033[0m\n\n"
printf "  首次使用：\n"
printf "    1. 浏览器打开 http://localhost:$FRONTEND_PORT\n"
printf "    2. 注册账号\n"
printf "    3. 进入 设置 页面配置 LLM API Key\n\n"
printf "  \033[33m停止服务：\033[0m\n"
printf "    kill $API_PID $FRONT_PID; docker compose down\n"
printf "  \033[33m再次启动：\033[0m\n"
printf "    重新运行此脚本即可\n\n"
printf "\033[32m============================================\033[0m\n"

INFO "服务在后台运行中。按 Ctrl+C 退出（不会停止服务）。"
wait 2>/dev/null || true
