from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.core.dependencies import CurrentUserId
from app.providers.llm import LLMFactory
from app.repositories.api_key import ApiKeyRepository
from app.services.volume_review import parse_review_chapter_revisions
from app.utils.database import async_session_factory
from app.utils.encryption import decrypt_to_plaintext

router = APIRouter()

_OPTIMIZE_SYSTEM_PROMPT = (
    "You are a prompt engineering expert. Improve the user's prompt to be more "
    "detailed, specific, and effective for an AI creative writing assistant. "
    "Keep the original intent but make it clearer about genre, tone, structure, "
    "and what the AI should focus on. Output ONLY the improved prompt, no explanations."
)


class OptimizePromptReq(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=5000)


class OptimizePromptResp(BaseModel):
    optimized: str


async def _get_user_llm_key(user_id: UUID) -> tuple[str, str, str | None, str | None]:
    """Get the user's first available LLM key (same logic as worker)."""
    llm_providers = {"openai", "claude", "gemini", "deepseek", "qwen", "glm", "custom"}
    async with async_session_factory() as session:
        repo = ApiKeyRepository(session)
        all_keys = await repo.list_by_user(user_id)
        for key_obj in all_keys:
            if key_obj.provider in llm_providers and key_obj.encrypted_key:
                return (
                    decrypt_to_plaintext(key_obj.encrypted_key),
                    key_obj.provider,
                    key_obj.base_url,
                    key_obj.model_name,
                )
    raise ValueError(
        "No LLM API key configured. Please go to Settings and add at least one "
        "LLM provider API key."
    )


@router.post(
    "/optimize",
    response_model=OptimizePromptResp,
    summary="Optimize a prompt using the user's LLM",
)
async def optimize_prompt(
    body: OptimizePromptReq,
    user_id: CurrentUserId,
) -> OptimizePromptResp:
    """Send a raw prompt to the LLM and return an improved version."""
    try:
        llm_key, llm_provider, base_url, model = await _get_user_llm_key(UUID(user_id))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)

    messages = [
        {"role": "system", "content": _OPTIMIZE_SYSTEM_PROMPT},
        {"role": "user", "content": body.prompt},
    ]

    try:
        content = await provider.chat(messages)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to optimize prompt: {e!s}",
        )

    return OptimizePromptResp(optimized=content.strip())


class NovelInfo(BaseModel):
    title: str
    author: str
    tags: str = ""
    summary: str = ""


class AnalyzeNovelsReq(BaseModel):
    novels: list[NovelInfo] = Field(..., min_length=1, max_length=5)


class AnalyzeNovelsResp(BaseModel):
    analysis: str


_ANALYZE_SYSTEM_PROMPT = (
    "You are a professional novel analyst. The user wants to write an original "
    "novel and needs you to analyze reference novels. For each novel, summarize "
    "its core appeal: worldbuilding/special ability hook, character relationship "
    "hook, and the reader's most addictive satisfaction/pain point. Output in Chinese."
)


@router.post(
    "/analyze-novels",
    response_model=AnalyzeNovelsResp,
    summary="Analyze reference novels using the user's LLM",
)
async def analyze_novels(
    body: AnalyzeNovelsReq,
    user_id: CurrentUserId,
) -> AnalyzeNovelsResp:
    """Send reference novels to the LLM for structural analysis."""
    try:
        llm_key, llm_provider, base_url, model = await _get_user_llm_key(UUID(user_id))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)

    refs_text = "\n\n".join(
        f"作品{i + 1}：《{n.title}》（作者：{n.author}）\n标签：{n.tags}\n摘要：{n.summary}"
        for i, n in enumerate(body.novels)
    )

    user_content = (
        f"我准备写一部原创小说，想参考这三部作品的核心魅力，请帮我对每部作品进行拆解：\n\n"
        f"{refs_text}\n\n"
        "你需要用一两句话概括出每部作品最核心的\"世界观金手指\"\"人物关系钩子\""
        "\"读者最上瘾的爽点/虐点\"，格式为：\n"
        "1. 书名 — 核心梗概：……\n"
        "   - 钩子1（关系）：……\n"
        "   - 钩子2（设定）：……\n"
        "   - 爽点模式：……\n\n"
        "我会根据你的分析，再请你进行原创融合创作。"
    )

    messages = [
        {"role": "system", "content": _ANALYZE_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]

    try:
        content = await provider.chat(messages)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to analyze novels: {e!s}",
        )

    return AnalyzeNovelsResp(analysis=content.strip())


class ChapterInfo(BaseModel):
    title: str
    content: str


class AnalyzeChaptersReq(BaseModel):
    chapters: list[ChapterInfo] = Field(..., min_length=1, max_length=30)
    chapter_count: int = Field(..., description="Total chapters generated so far, e.g. 10, 20, or 30")


class AnalyzeChaptersResp(BaseModel):
    report: str
    revisions: list[dict] = Field(
        default_factory=list,
        description="Parsed chapter revisions from 【第X章修改】 markers. "
                    "Each entry: {chapter_index: int, title: str, content: str}",
    )
    revisions_summary: str = Field(
        default="",
        description="Brief human-readable summary of which chapters have revisions",
    )


_ANALYZE_CHAPTERS_SYSTEM_PROMPT = (
    "你是一名资深小说编辑，负责阶段性复盘检查。严格按检查项逐一分析，按格式输出修改。"
)


@router.post(
    "/analyze-chapters",
    response_model=AnalyzeChaptersResp,
    summary="Analyze generated chapters for quality (timeline, character arcs, pacing)",
)
async def analyze_chapters(
    body: AnalyzeChaptersReq,
    user_id: CurrentUserId,
) -> AnalyzeChaptersResp:
    """Send completed chapters to the LLM for a batch quality review.

    Returns a report plus any parsed chapter revisions for user confirmation.
    """
    try:
        llm_key, llm_provider, base_url, model = await _get_user_llm_key(UUID(user_id))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)

    accumulated = "\n\n".join(f"第{i+1}章：{ch.title}\n\n{ch.content}" for i, ch in enumerate(body.chapters))
    chapter_num = body.chapter_count

    review_prompt = (
        f"请阅读已完成的第1-{chapter_num}章正文，做以下检查：\n"
        f"1. **时间线**：所有事件发生的先后顺序有无矛盾？列出时间轴。\n"
        f"2. **人物轨迹**：主角目前手握几条线索？各推进到什么程度？有无遗漏的伏笔？\n"
        f"3. **能力系统**：主角能力的强弱表现是否前后一致？如有波动，请指出并给出修改建议。\n"
        f"4. **节奏报告**：用★标出{chapter_num}章中的情绪高点，用—标出拖沓段落，给出后续章节的节奏调整建议。\n\n"
        f"【修改要求】如果发现某章节需要修改，请用【第X章修改】作为标记（X为章节数字），"
        f"然后输出该章的完整修改版本。无需修改的章节不要输出。"
    )

    messages = [
        {"role": "system", "content": _ANALYZE_CHAPTERS_SYSTEM_PROMPT},
        {"role": "user", "content": f"已完成章节（第1-{chapter_num}章）：\n\n{accumulated}\n\n{review_prompt}"},
    ]

    try:
        content = await provider.chat(messages)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to analyze chapters: {e!s}",
        )

    raw_report = content.strip()

    # Parse 【第X章修改】 markers into structured revisions
    revisions_raw = parse_review_chapter_revisions(raw_report)
    revisions_list: list[dict] = []
    for ch_idx, revised_text in revisions_raw.items():
        if 0 <= ch_idx < len(body.chapters):
            original = body.chapters[ch_idx]
            revisions_list.append({
                "chapter_index": ch_idx,
                "title": original.title,
                "content": revised_text,
            })

    revision_chapter_numbers = sorted(r["chapter_index"] + 1 for r in revisions_list)
    revisions_summary = (
        f"第{'、'.join(str(n) for n in revision_chapter_numbers)}章建议修改"
        if revision_chapter_numbers else ""
    )

    return AnalyzeChaptersResp(
        report=raw_report,
        revisions=revisions_list,
        revisions_summary=revisions_summary,
    )
