# Story2Video 用户指南

## 目录

1. [平台概述](#1-平台概述)
2. [快速开始](#2-快速开始)
3. [工作台](#3-工作台)
4. [工作流](#4-工作流)
   - [小说推荐](#41-小说推荐-novel)
   - [剧本生成](#42-剧本生成-script)
   - [歌词生成](#43-歌词生成-lyrics)
   - [歌曲生成](#44-歌曲生成-song)
   - [图片生成](#45-图片生成-image)
   - [视频生成](#46-视频生成-video)
5. [设置：配置 API Key](#5-设置配置-api-key)
6. [资产浏览](#6-资产浏览)
7. [画布](#7-画布)
8. [查看结果](#8-查看结果)
9. [常见问题](#9-常见问题)

---

## 1. 平台概述

Story2Video 是一个 AI 驱动的故事与内容生成平台，提供从小说创作到视频生成的完整工作流。支持以下能力：

| 工作流 | 说明 | 输入 | 输出 |
|--------|------|------|------|
| Novel | 根据关键词搜索/推荐小说 | 关键词 | 小说内容 |
| Script | 根据小说生成剧本 | 小说内容 | 剧本 |
| Lyrics | 根据剧本生成歌词 | 剧本内容 | 歌词 |
| Song | 根据歌词生成音乐 | 歌词 | 音频文件 |
| Image | 根据内容生成图片 | 任意内容描述 | 图片 |
| Video | 根据内容生成数字人视频 | 任意内容 | 视频 |

支持的 AI 提供商：OpenAI、Claude (Anthropic)、Gemini (Google)、DeepSeek、Qwen (Alibaba)、GLM (Zhipu AI)、Suno、Udio、MiniMax、HeyGen、D-ID 以及任意 OpenAI 兼容接口。

---

## 2. 快速开始

### 2.1 环境要求

- Python 3.12+
- Node.js 18+
- PostgreSQL 15+
- Redis 7+

### 2.2 启动服务

**后端启动：**

```bash
cd Story2Video

# 安装依赖
pip install -r requirements.txt

# 初始化数据库
alembic upgrade head

# 启动后端
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**前端启动：**

```bash
cd client

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端默认运行在 `http://localhost:3000`，后端 API 在 `http://localhost:8000`。

Docker 方式（推荐）：

```bash
docker compose up --build
```

### 2.3 注册与登录

打开浏览器访问 `http://localhost:3000`：

1. 点击 **Register** 进入注册页面
2. 输入邮箱和密码完成注册
3. 使用刚注册的账号登录
4. 登录后自动进入工作台主页

---

## 3. 工作台

工作台是登录后的默认页面，包含三个主要区域：

### 左侧边栏

- **Workflow 列表** — Novel、Script、Lyrics、Song、Image、Video，点击进入对应工作流
- **Canvas** — 可视化画布工具
- **Assets** — 浏览已生成的所有内容
- **Recent Projects** — 显示最近生成的项目，方便快速访问

### 主页内容

- **Workflows 快捷入口** — 以卡片形式展示 6 个工作流，点击即可开始
- **Recent Projects** — 最近成功生成的项目列表，显示标题和日期，点击跳转到结果页面

### 顶部导航

- **Settings** — 进入设置页面配置 API Key

---

## 4. 工作流

### 4.1 小说推荐 (Novel)

通过关键词搜索和推荐小说。

**操作步骤：**

1. 在侧边栏或主页点击 **Novel**
2. 输入关键词（如 `sci-fi, time travel, artificial intelligence`）
3. 可选：选择模型
4. 点击 **Search**
5. 系统将基于语义搜索推荐匹配的小说
6. 推荐的小说会以卡片列表展示，点击可查看详情

**用途：** 寻找创作灵感，或获取小说作为后续剧本生成的基础素材。

### 4.2 剧本生成 (Script)

基于小说内容生成剧本。

**操作步骤：**

1. 在侧边栏或主页点击 **Script**
2. 在文本框中输入小说内容或提示词
3. 可选：选择模型
4. 点击 **Generate**
5. 系统会自动将内容转换为剧本格式（包含场景、对话、动作描述等）

**提示：** 可以先在 Novel 工作流中找到小说，然后在 Script 生成时系统会自动关联已选的小说内容。

### 4.3 歌词生成 (Lyrics)

基于剧本内容生成歌词。

**操作步骤：**

1. 在侧边栏或主页点击 **Lyrics**
2. 输入剧本内容或创作提示
3. 点击 **Generate**
4. 系统将生成结构化的歌词（包含主歌、副歌等）

### 4.4 歌曲生成 (Song)

将歌词转换为音乐。

**操作步骤：**

1. 在侧边栏或主页点击 **Song**
2. 输入歌词或创作提示
3. 点击 **Generate**
4. 系统会生成音频文件，可在结果页面播放

**提供商：** Suno、Udio、MiniMax（需在 Settings 中配置对应 API Key）

### 4.5 图片生成 (Image)

根据描述生成图片。

**操作步骤：**

1. 在侧边栏或主页点击 **Image**
2. 输入图片描述
3. 点击 **Generate**
4. 系统会生成图片，可在结果页面查看和下载

### 4.6 视频生成 (Video)

生成数字人播报视频。

**操作步骤：**

1. 在侧边栏或主页点击 **Video**
2. 输入视频脚本内容
3. 点击 **Generate**
4. 系统会生成数字人播报视频

**提供商：** HeyGen、D-ID（需在 Settings 中配置对应 API Key）

### 进度跟踪

生成任务提交后，页面会显示进度条。点击 **View Progress Details** 进入详细进度页面，查看每个步骤的执行状态。生成完成后会自动跳转到结果页面。

---

## 5. 设置：配置 API Key

在使用任何工作流之前，必须先配置 AI 提供商的 API Key。

### 5.1 配置页面

点击顶部导航的 **Settings** 进入设置页面。

### 5.2 嵌入模型 (Embedding) 配置

嵌入模型用于小说推荐中的语义搜索：

1. **选择提供商**：OpenAI (text-embedding-3-small)、DeepSeek (deepseek-embedding)、Qwen (text-embedding-v3)
2. **输入 API Key**
3. 可选：为 OpenAI 设置自定义 Base URL 和模型名
4. 点击 **Save Provider & Key**
5. 使用 **Test** 按钮验证连接

> 嵌入提供商只需配置一个，它是 Novel 工作流中搜索推荐功能的基础。

### 5.3 通用 API Key 配置

其他 AI 提供商配置：

1. **选择提供商**：从下拉列表中选择（OpenAI、Claude、DeepSeek、Gemini、Qwen、GLM、Suno、Udio、MiniMax、HeyGen、D-ID 等）
2. **输入 API Key**
3. 对于 Custom 类型，需要额外填写 Base URL 和模型名称
4. 点击 **Save** 保存
5. 使用 **Test Connection** 按钮验证连接是否正常

### 5.4 管理已保存的 Key

在 **Saved API Keys** 区域可以：

- 查看已配置的提供商列表
- 对已有 Key 执行 **Test** 测试
- 点击 **Delete** 删除不再使用的 Key

### 5.5 支持的提供商

| 提供商 | 用途 | 是否需要自定义 URL |
|--------|------|-------------------|
| OpenAI | LLM / Embedding | 可选 |
| Claude (Anthropic) | LLM | 否 |
| Gemini (Google) | LLM | 否 |
| DeepSeek | LLM / Embedding | 否 |
| Qwen (Alibaba) | LLM / Embedding | 否 |
| GLM (Zhipu AI) | LLM | 是（需设置 Base URL） |
| Suno | 音乐生成 | 否 |
| Udio | 音乐生成 | 否 |
| MiniMax | 音乐生成 | 否 |
| HeyGen | 数字人视频 | 否 |
| D-ID | 数字人视频 | 否 |
| Custom | 任意兼容 OpenAI 的接口 | 是 |

> **注意：** 系统仅使用你在 Settings 中配置的 API Key。如果某个工作流所需模型尚未配置，系统会提示你前往 Settings 配置相应模型。

---

## 6. 资产浏览

Assets 页面集中管理所有已生成的内容。

### 访问

点击侧边栏的 **Assets** 或主页的 **View all** 链接。

### 分类浏览

资产按类型分为 6 个分类卡片：

- **Novels** — 已生成的小说
- **Scripts** — 已生成的剧本
- **Lyrics** — 已生成的歌词
- **Songs** — 已生成的歌曲
- **Images** — 已生成的图片
- **Videos** — 已生成的视频

点击任意分类卡片进入该类型的项目列表，按日期倒序排列（最新在前）。每条项目显示标题和创建日期，点击可查看详情。

如果某分类下没有内容，页面会显示引导按钮，帮助你快速进入对应的生成工作流。

---

## 7. 画布

Canvas 是一个可视化创作工具，可以创建和编排内容节点。

### 功能

- **节点创建**：通过右侧节点面板添加文本块、图片块、笔记卡片等
- **拖拽编排**：在画布上自由拖拽排列节点
- **连线关联**：在节点之间建立连接关系
- **自动保存**：内容变更后自动保存（5 秒防抖）
- **多画布管理**：通过顶部的画布列表切换或创建多个画布

### 操作

1. 在侧边栏点击 **Canvas** 进入
2. 使用右侧 **Node Panel** 添加节点
3. 在画布区域拖拽节点调整位置
4. 从节点边缘拖出连线连接到其他节点
5. 顶部工具栏可撤销、重做、缩放

> 画布功能需要登录后使用。

---

## 8. 查看结果

生成任务完成后，可以通过多个入口查看结果：

### 入口

- **生成完成后自动跳转**：提交任务后，进度完成后会自动展示结果
- **Recent Projects**：主页的最近项目列表中点击
- **Assets**：在资产分类中找到并点击项目
- **Task 进度页面**：点击 **View Progress Details** 后也可以从进度页跳转

### 结果页面

结果页面使用标签页（Tabs）展示不同类型的内容：

| 标签 | 内容 |
|------|------|
| Novel | 完整小说文本 |
| Script | 格式化剧本（含场景和对话） |
| Lyrics | 结构化歌词 |
| Song | 音频播放器 |
| Image | 图片展示 |
| Video | 视频播放器 |

结果页面会根据实际生成的内容自动显示对应的标签页。例如，如果只生成了小说，则只显示 Novel 标签页。

---

## 9. 常见问题

### Q: 生成任务一直卡在 processing 状态怎么办？

检查任务的详细进度页面，查看是否有错误信息。如果是 API 调用失败，请确认对应提供商的 API Key 配置正确且在 Settings 中测试通过。如果问题持续，可以尝试重新提交任务。

### Q: 为什么 Novel 搜索没有返回结果？

首先检查 Settings 中是否配置了 Embedding Provider（嵌入模型提供商），并确保 Test 测试通过。语义搜索需要嵌入模型来将关键词转换为向量进行匹配。

### Q: 测试 API Key 时提示"Connection failed"？

- 确认 API Key 输入正确（注意不要有多余空格）
- 确认该提供商的 API 服务可用
- 对于 Custom 类型，确认 Base URL 格式正确（应以 `/v1` 结尾）
- 如果使用代理，可能需要配置网络环境

### Q: "No embedding provider configured" 错误？

进入 **Settings** → **Embedding Provider**，选择一个提供商并保存 API Key。嵌入模型是小说搜索推荐功能的必要组件。

### Q: 能否使用同一个 API Key 多个工作流？

可以。例如，OpenAI 的 API Key 可以同时用于 LLM 生成和 Embedding。在 Embedding Provider 中配置后，同一 Key 可在多个场景复用。

### Q: 生成的内容在哪里保存？

所有生成的内容持久化存储在数据库中。你可以随时通过 **Assets** 页面或主页的 **Recent Projects** 访问。

### Q: 如何更换生成模型？

在 Settings 中配置新的 API Key 时，可以指定 `model_name`（模型名称）。生成工作流页面也提供了 **Model Selector**，可在提交任务前选择使用的模型。
