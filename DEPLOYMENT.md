# Story2Video 部署指南（新用户）

本指南面向**零基础新用户**，带你从一台干净的电脑开始，一步步把 Story2Video 跑起来。

> 📌 看完本指南你能做到：装好环境 → 启动服务 → 注册账号 → 配置 AI Key → 开始生成内容。
> 如果你想了解各功能怎么用，请看 [USER_GUIDE.md](./USER_GUIDE.md)。

---

## 目录

- [一、选择部署方式](#一选择部署方式)
- [二、方式 A：Windows 一键部署（推荐）](#二方式-awindows-一键部署推荐)
- [三、方式 B：Linux / macOS 一键部署](#三方式-blinux--macos-一键部署)
- [四、方式 C：Docker Compose 全栈部署](#四方式-cdocker-compose-全栈部署)
- [五、方式 D：手动逐步部署](#五方式-d手动逐步部署)
- [六、首次使用：注册与配置](#六首次使用注册与配置)
- [七、服务管理与日常运维](#七服务管理与日常运维)
- [八、端口与地址速查表](#八端口与地址速查表)
- [九、常见问题排查](#九常见问题排查)

---

## 一、选择部署方式

Story2Video 需要运行四个组件：

| 组件 | 作用 | 必需性 |
|------|------|--------|
| **PostgreSQL 16** | 存储所有数据（用户、小说、任务等） | 必需 |
| **Redis 7** | 任务队列 | 必需 |
| **后端 API**（FastAPI） | 业务逻辑与接口 | 必需 |
| **前端**（Next.js） | 浏览器界面 | 必需 |

根据你的操作系统和偏好，选一种方式：

| 你的情况 | 推荐方式 | 说明 |
|----------|----------|------|
| Windows 用户，想省事 | **方式 A**（一键脚本） | 一行命令全自动 |
| Linux / macOS 用户 | **方式 B**（一键脚本） | 一行命令全自动 |
| 有 Docker，想最干净 | **方式 C**（Docker Compose） | 全部容器化，不污染本机 |
| 想完全掌控每一步 | **方式 D**（手动） | 适合学习和调试 |

> ⚠️ 无论哪种方式，都**必须先安装 [Docker](https://www.docker.com/)**。PostgreSQL 和 Redis 通过 Docker 容器运行。

---

## 二、方式 A：Windows 一键部署（推荐）

### 第 1 步：以管理员身份打开 PowerShell

在 Windows 开始菜单搜索 **PowerShell**，**右键 → 以管理员身份运行**。

> 脚本需要管理员权限来安装系统依赖（Git、Python、Node.js 等会通过 Chocolatey 自动安装）。

### 第 2 步：执行一键命令

把下面这一行**完整复制**到 PowerShell 中回车：

```powershell
git clone https://github.com/bubble0214/Story2Video.git; cd Story2Video; .\scripts\setup.ps1
```

如果遇到执行策略报错，先运行：
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```
然后再执行上面的命令。

### 第 3 步：等待自动完成

脚本会自动完成 **9 个阶段**，全程无需干预：

```
[1/9] 检查/安装 Chocolatey、Git、Python、Node.js、Docker
[2/9] 验证项目结构
[3/9] 生成 .env 配置（自动填充随机密钥）
[4/9] 生成 client/.env.local（前端 API 地址）
[5/9] 启动 PostgreSQL + Redis 容器
[6/9] 创建 Python 虚拟环境 + 安装依赖
[7/9] 运行数据库迁移（alembic upgrade head，自动建表）
[8/9] 安装前端依赖
[9/9] 启动后端 API + 前端
```

过程中可能弹出 **UAC 提示**（用户账户控制），点击「是」授权即可。

### 第 4 步：看到部署完成提示

看到绿色「部署完成！」字样即代表成功：

```
============================================
  Story2Video 部署完成！
============================================

  前端地址：http://localhost:3000
  后端 API：http://localhost:8005
  API 文档：http://localhost:8005/docs
```

> 💡 首次运行可能需要 **10–20 分钟**（取决于网速，主要是下载依赖）。后续重启只需几秒。

---

## 三、方式 B：Linux / macOS 一键部署

### 第 1 步：安装 Docker

- **macOS**：下载 [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/)
- **Linux**：参考 [Docker Engine 安装指南](https://docs.docker.com/engine/install/)

启动 Docker 后，确认它在运行：
```bash
docker info
```
如果输出 Docker 版本信息说明正常。

### 第 2 步：执行一键命令

```bash
git clone https://github.com/bubble0214/Story2Video.git
cd Story2Video
chmod +x scripts/setup.sh
./scripts/setup.sh
```

脚本会自动检测系统包管理器（apt / brew / yum）并安装 git、python3、nodejs 等依赖，然后执行和 Windows 版相同的 9 个阶段。

> 💡 如果提示 `sudo` 需要密码，请输入你的用户密码（输入时不显示字符，正常现象）。

---

## 四、方式 C：Docker Compose 全栈部署

> 适合不想在本机装 Python/Node.js，希望一切都跑在容器里的用户。

### 第 1 步：克隆并配置

```bash
git clone https://github.com/bubble0214/Story2Video.git
cd Story2Video
```

### 第 2 步：生成 .env

Windows PowerShell：
```powershell
Copy-Item .env.example .env
# 用编辑器打开 .env，把三个占位符换成强随机值
```

Linux / macOS：
```bash
cp .env.example .env
# 用编辑器打开 .env，把三个占位符换成强随机值
```

**必须修改的三个占位符**（在 `.env` 中搜索）：

| 占位符 | 含义 | 建议值 |
|--------|------|--------|
| `REPLACE_WITH_YOUR_OWN_PASSWORD_12345` | 数据库密码（出现 2 次，都要改且一致） | 32 位随机字符串 |
| `REPLACE_WITH_YOUR_OWN_JWT_SECRET_32CHARS_` | JWT 签名密钥 | 32 位随机字符串 |
| `1234...cdef`（64 位十六进制） | AES 加密密钥 | `openssl rand -hex 32` 生成 |

> ⚠️ `POSTGRES_PASSWORD` 在 `.env` 中出现 **2 次**（一次给应用读，一次给 Docker 容器初始化），**必须填相同的值**，否则数据库连不上。

### 第 3 步：配置前端地址

创建 `client/.env.local` 文件，内容为：
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api
```
> 注意：Docker 方式后端映射到 **8000** 端口，与本地开发模式的 8005 不同。

### 第 4 步：启动所有服务

```bash
docker compose up --build -d
```

这会自动构建并启动 5 个容器：postgres、redis、migrate（跑 alembic）、app（后端）、worker（Celery）。

查看启动状态：
```bash
docker compose ps
```
所有服务状态都应是 `Up` 或 `exited (0)`（migrate 是一次性任务）。

### 第 5 步：访问

- **后端 API**：http://localhost:8000
- **API 文档**：http://localhost:8000/docs

> 💡 Docker 方式默认**不启动前端开发服务器**。如需前端，在 `client/` 目录单独运行 `npm install && npm run dev`，并确保 `client/.env.local` 指向 `http://localhost:8000/api`。

---

## 五、方式 D：手动逐步部署

适合想了解每一步在做什么的用户。

### 5.1 前置条件

手动安装并确认以下工具可用：

| 工具 | 版本要求 | 验证命令 |
|------|----------|----------|
| Git | 任意 | `git --version` |
| Python | ≥ 3.12 | `python --version` |
| Node.js | ≥ 18 | `node --version` |
| Docker | 任意 | `docker --version` |

### 5.2 克隆项目

```bash
git clone https://github.com/bubble0214/Story2Video.git
cd Story2Video
```

### 5.3 启动 PostgreSQL + Redis（通过 Docker）

```bash
docker compose up -d postgres redis
```

这会在后台启动数据库容器，端口映射为：
- PostgreSQL：宿主机 **5434** → 容器 5432
- Redis：宿主机 **6383** → 容器 6379

> 💡 使用非标准端口是为了避免与本机已有的 PostgreSQL/Redis 冲突。

等待数据库就绪：
```bash
docker compose exec postgres pg_isready -U story2video
```
看到 `accepting connections` 即就绪。

### 5.4 配置 .env

```bash
cp .env.example .env
```

编辑 `.env`，替换 [方式 C 第 2 步](#第-2-步生成-env) 中提到的三个占位符。

同时生成前端配置：
```bash
# Windows
echo NEXT_PUBLIC_API_BASE_URL=http://localhost:8005/api > client\.env.local
# Linux/macOS
echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:8005/api" > client/.env.local
```

### 5.5 安装后端依赖

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate
# Linux/macOS
source .venv/bin/activate

pip install -r requirements.txt
```

### 5.6 初始化数据库

```bash
alembic upgrade head
```

这会创建所有数据表和索引。看到 `Running upgrade ... -> 0009` 即成功。

### 5.7 启动后端

```bash
python run_api.py
```

后端运行在 http://localhost:8005，API 文档在 http://localhost:8005/docs。

> 💡 也可以用标准方式启动：`uvicorn app.main:app --reload --port 8005`

### 5.8 启动前端

**新开一个终端窗口**（保持后端运行）：

```bash
cd client
npm install --legacy-peer-deps
npm run dev
```

前端运行在 http://localhost:3000。

> 💡 `--legacy-peer-deps` 是必须的，因为部分依赖的 peer dependency 版本约束较严格。

---

## 六、首次使用：注册与配置

服务启动后，按以下顺序操作（详见 [USER_GUIDE.md](./USER_GUIDE.md)）：

### 6.1 打开前端

浏览器访问 **http://localhost:3000**

### 6.2 注册账号

1. 点击 **Register**
2. 输入邮箱和密码
3. 登录

### 6.3 配置 AI API Key（关键！）

> ⚠️ **不配置 API Key，所有生成功能都无法工作。**

1. 点击右上角 **Settings**
2. 在 **API Keys** 区域，至少配置一个 LLM 提供商（如 OpenAI、DeepSeek、Qwen 等）
3. 如需使用小说搜索（Novel 工作流），还需配置 **Embedding Provider**
4. 点击 **Test Connection** 验证每个 Key 是否可用
5. 保存

支持的提供商详见 [USER_GUIDE.md 第 5 节](./USER_GUIDE.md#5-设置配置-api-key)。

### 6.4 开始使用

回到主页，点击任意工作流卡片（Novel / Script / Lyrics / Song / Image / Video）开始创作。

---

## 七、服务管理与日常运维

### 7.1 每天如何启动？

**方式 A/B（一键脚本用户）**：直接重新运行脚本即可（会自动跳过已完成的步骤，秒级启动）：
```powershell
.\scripts\setup.ps1       # Windows
```
```bash
./scripts/setup.sh        # Linux/macOS
```

**方式 D（手动部署用户）**：
```bash
# 终端 1：启动数据库
docker compose up -d postgres redis

# 终端 1：启动后端
python run_api.py

# 终端 2：启动前端
cd client && npm run dev
```

### 7.2 如何停止？

```bash
# 停止数据库容器（保留数据）
docker compose down

# 如果用 Docker 全栈（方式 C）启动了所有服务
docker compose down
```

> 💡 `docker compose down` 只停容器，**不会删除数据**。数据持久化在 Docker volume 中。

### 7.3 如何彻底清除重来？

```bash
# ⚠️ 危险：删除所有数据库数据！
docker compose down -v
rm .env client/.env.local
```

### 7.4 如何查看日志？

```bash
# 数据库日志
docker compose logs postgres

# 后端日志（Docker 方式）
docker compose logs app

# 实时跟踪
docker compose logs -f app
```

---

## 八、端口与地址速查表

| 服务 | 本地开发模式 | Docker 全栈模式 |
|------|-------------|----------------|
| 前端 | http://localhost:3000 | （需单独启动前端）|
| 后端 API | http://localhost:8005 | http://localhost:8000 |
| API 文档 | http://localhost:8005/docs | http://localhost:8000/docs |
| PostgreSQL | localhost:5434 | （仅容器内访问）|
| Redis | localhost:6383 | （仅容器内访问）|

> 💡 前端通过 `client/.env.local` 中的 `NEXT_PUBLIC_API_BASE_URL` 知道后端地址。
> 本地开发用 `8005`，Docker 全栈用 `8000`，**切换模式时记得改这个值**。

---

## 九、常见问题排查

### Q1: PowerShell 提示「无法加载脚本，因为在此系统上禁止运行脚本」

执行策略限制。运行：
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```
这仅对当前窗口生效，安全。

### Q2: 提示「docker: command not found」或「Docker 守护进程未运行」

- 确认已安装 [Docker Desktop](https://www.docker.com/)
- Windows/macOS：打开 Docker Desktop 应用，等图标变为运行状态
- Linux：运行 `sudo systemctl start docker`
- 验证：`docker info` 应输出版本信息

### Q3: 端口被占用（如「port is already allocated」）

某个端口已被其他程序占用。

```bash
# Windows：查看占用进程
netstat -ano | findstr :3000

# Linux/macOS
lsof -i :3000
```

关闭占用进程，或修改 `docker-compose.yml` 中的端口映射。

### Q4: 数据库迁移失败（alembic 报错）

常见原因：
1. **`.env` 中 `POSTGRES_PASSWORD` 两处不一致**（出现 2 次，必须相同）
2. **PostgreSQL 容器未就绪**：等待几秒后重试 `alembic upgrade head`
3. **端口错误**：本地开发模式连 `localhost:5434`，不是默认的 5432

检查数据库是否可连：
```bash
docker compose exec postgres psql -U story2video -c '\dt'
```

### Q5: 前端打开是空白页 / 一直 loading

检查浏览器控制台（F12）：
- **跨域错误（CORS）**：确认 `.env` 中 `CORS_ORIGINS` 包含 `http://localhost:3000`
- **网络错误**：确认后端在运行，访问 http://localhost:8005/docs 能打开
- **API 地址错误**：检查 `client/.env.local` 的 `NEXT_PUBLIC_API_BASE_URL` 与后端实际端口一致

### Q6: API Key 测试失败（Connection failed）

- 确认 Key 输入正确，无多余空格
- 确认网络能访问该提供商的服务器（国内可能需要代理）
- **Custom 类型**：确认 Base URL 以 `/v1` 结尾，如 `https://api.example.com/v1`

### Q7: 「No embedding provider configured」错误

进入 **Settings** → **Embedding Provider**，配置一个嵌入模型提供商（OpenAI / DeepSeek / Qwen 任选），并 Test 通过。

### Q8: 生成任务卡住不动

1. 打开任务的 **View Progress Details** 查看具体卡在哪一步
2. 通常是该步骤需要的 AI 提供商 Key 未配置或已失效
3. 检查后端日志：`docker compose logs app` 或查看终端输出

### Q9: Docker Compose 提示 .env 文件找不到 / 变量为空

确认 `.env` 文件存在且 `POSTGRES_PASSWORD` 已被替换为真实密码（不是占位符）：
```bash
# Linux/macOS
grep POSTGRES_PASSWORD .env
```
两个 `POSTGRES_PASSWORD` 行的值必须相同。

### Q10: npm install 失败

- 确认 Node.js 版本 ≥ 18：`node --version`
- 必须加 `--legacy-peer-deps` 参数
- 网络问题可换源：`npm config set registry https://registry.npmmirror.com`

---

## 📚 相关文档

| 文档 | 内容 |
|------|------|
| [README.md](./README.md) | 项目概览、技术栈、API 端点列表 |
| [USER_GUIDE.md](./USER_GUIDE.md) | 功能详细使用说明、工作流操作、API Key 配置 |
| **本文件** | 面向新用户的部署指南 |

---

**部署遇到问题？** 请按 [第九节 常见问题](#九常见问题排查) 排查，大多数问题都覆盖在内。
