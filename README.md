# Story2Video

生产级 FastAPI 项目，基于 DDD 架构。

## 技术栈

- Python 3.12
- FastAPI
- PostgreSQL
- SQLAlchemy 2.0
- Alembic
- Redis
- JWT (PyJWT)
- Docker & Docker Compose

## 快速开始

### 1. 克隆并进入项目

```bash
git clone <repo-url> && cd Story2Video
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

按需编辑 `.env` 中的配置。

### 3. 使用 Docker Compose 启动（推荐）

```bash
docker compose up --build
```

服务将运行在：http://localhost:8000

API 文档：http://localhost:8000/api/v1/docs

### 4. 本地开发

```bash
python -m venv .venv
.venv\Scripts\activate   # Windows
# source .venv/bin/activate  # Linux/Mac
pip install -r requirements.txt

# 启动数据库
docker compose up postgres redis -d

# 运行迁移
alembic upgrade head

# 启动服务
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 项目结构

```
app/
├── api/           # 路由层
│   └── v1/        # API v1 路由
├── core/          # 核心配置（安全、配置、依赖）
├── domain/        # 领域实体与业务规则
├── repositories/  # 数据访问层
├── services/      # 业务逻辑层
├── models/        # SQLAlchemy ORM 模型
├── schemas/       # Pydantic 请求/响应 Schema
├── utils/         # 工具函数
└── main.py        # 应用入口
```

## API 端点

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | /api/v1/auth/register | 用户注册 | 否 |
| POST | /api/v1/auth/login | 用户登录 | 否 |
| POST | /api/v1/auth/refresh | 刷新令牌 | 否 |
| POST | /api/v1/auth/change-password | 修改密码 | 是 |
| GET  | /api/v1/users/me | 获取当前用户 | 是 |
