from __future__ import annotations

from app.providers.prompt.base import BasePromptBuilder

_NOVEL_SYSTEM_PROMPT = (
    "You are a professional novelist. Write a compelling story in Chinese based on the given "
    "title, tags, and outline. The story should have vivid characters, gripping plot, and "
    "literary quality. Output the complete story in markdown format."
)


def build_chapter_messages(
    custom_prompt: str,
    references: list[dict],
    volume_outline: str,
    character_rules: str,
    chapter_num: int,
    volume_label: str = "第一卷",
    prev_chapter_summary: str = "",
) -> list[dict]:
    """Build (system_prompt, user_message) for generating a single chapter.

    Shared between the batch Celery task and the interactive per-chapter API.
    Returns a 2-element message list suitable for provider.chat().

    Args:
        volume_label: e.g. "第一卷" or "第二卷".
        prev_chapter_summary: summary of what happened in the previous chapter,
            to maintain continuity across generation calls.
    """
    # Determine which volume we are in
    vol_num = 2 if "第二卷" in volume_label else 1
    is_vol2 = vol_num >= 2

    # Build shared context block (same for every chapter)
    ctx_parts = [f"# 创作总纲\n{custom_prompt}"]
    if references:
        ref_text = "\n".join(
            f"- {r['title']} (by {r.get('author', 'unknown')}): {r['summary'][:500]}"
            for r in references
        )
        ctx_parts.append(f"# 参考小说\n{ref_text}")
    ctx_parts.append(f"# {volume_label}细纲（总览）\n{volume_outline}")
    character_rules_block = ""
    if character_rules.strip():
        ctx_parts.append(f"# 人物行为守则（必须严格遵守）\n{character_rules}")
        character_rules_block = (
            "\n【人设硬约束（必须严格遵守，违者重写）】"
            "\n- 主角的言行必须严格遵循人物守则中的性格设定、说话方式、行为模式"
            "\n- 每个出场配角也需符合各自的人物守则"
            "\n- 如果守则规定主角说话简短有力，就不能写长篇大论的台词"
            "\n- 如果守则规定某角色有特定口头禅/习惯动作，必须在章节中体现"
            "\n- 这是硬性要求：任何违背人设的描写都将被视为不合格"
        )
    shared_context = "\n\n".join(ctx_parts)

    system_prompt = (
        "你是一名专业小说作家，正在逐章创作原创小说。"
        f"你有完整的{volume_label}细纲和人物行为守则作为依据。"
        "请严格按照每章的写作指令进行创作，确保所有人物言行一致、符合设定。"
    )

    # Build continuity context for the user message
    continuity_block = ""
    if is_vol2 and prev_chapter_summary:
        continuity_block = (
            f"\n\n【前情提要】\n"
            f"这是{volume_label}的第{chapter_num}章。在进入本章之前，上一章结束时的情况是：\n"
            f"{prev_chapter_summary}\n"
            f"请在此基础上续写，不要重新开始故事。"
        )
    elif is_vol2 and not prev_chapter_summary:
        continuity_block = (
            f"\n\n【重要】这是{volume_label}，不是第一卷。"
            f"请直接延续第一卷的结尾（第10章）继续写第{chapter_num}章，不要重新开始故事。"
        )

    chapter_prompt = (
        f"【本章写作指令】\n"
        f"- 章节编号：第{chapter_num}章\n"
        f"- 本章细纲：请根据上面{volume_label}细纲中第{chapter_num}章的内容，提取该章的一句话梗概\n"
        f"- 本章情绪基调：请根据{volume_label}细纲推断本章应有的情绪基调\n"
        f"- 必须达成的任务（三项缺一不可）：\n"
        f"  1. 剧情推进——必须有具体的剧情事件发生，不能停留于描述状态或心理活动\n"
        f"  2. 伏笔安排——根据细纲中第{chapter_num}章相关的伏笔或转折点，至少埋入1个伏笔或制造1个悬念\n"
        f"  3. 结尾钩子——本章最后一段必须有强力悬念、反转或扣人心弦的结尾，让读者迫切想看下一章\n"
        f"- 字数要求：1800-2000字{character_rules_block}{continuity_block}\n\n"
        f"请开始写第{chapter_num}章正文。"
    )

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"{shared_context}\n\n{chapter_prompt}"},
    ]


class NovelPromptBuilder(BasePromptBuilder):
    """Build prompts for novel / story generation."""

    SYSTEM_PROMPT = _NOVEL_SYSTEM_PROMPT

    def build(
        self,
        title: str,
        tags: str = "",
        outline: str = "",
        style: str = "",
        word_count: int = 2000,
        **kwargs,
    ) -> list[dict]:
        """Build a chat message list for novel generation.

        Args:
            title: Novel title.
            tags: Comma-separated genre / tag hints.
            outline: Optional plot outline or key story beats.
            style: Optional writing style description.
            word_count: Target word count.

        Returns:
            Message list compatible with BaseLLMProvider.chat() / stream().
        """
        parts = [f"# Title\n{title}"]
        if tags:
            parts.append(f"# Tags\n{tags}")
        if outline:
            parts.append(f"# Outline\n{outline}")
        if style:
            parts.append(f"# Style\n{style}")
        parts.append(f"# Word Count\nApproximately {word_count} words.")
        parts.append("\nPlease write the complete novel below:")

        return [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user", "content": "\n\n".join(parts)},
        ]


class LyricsPromptBuilder(BasePromptBuilder):
    """Build prompts for lyrics / song generation."""

    SYSTEM_PROMPT = (
        "You are a professional songwriter. Write original lyrics based on the given theme, "
        "style, and structure. The lyrics should be poetic, emotionally resonant, and "
        "match the requested music genre. Output the lyrics in plain text."
    )

    def build(
        self,
        theme: str,
        genre: str = "pop",
        structure: str = "verse-chorus-verse-chorus-bridge-chorus",
        mood: str = "",
        language: str = "Chinese",
        **kwargs,
    ) -> list[dict]:
        """Build a chat message list for lyrics generation."""
        parts = [
            f"# Theme\n{theme}",
            f"# Genre\n{genre}",
            f"# Structure\n{structure}",
        ]
        if mood:
            parts.append(f"# Mood\n{mood}")
        parts.append(f"# Language\n{language}")
        parts.append("\nPlease write the lyrics below:")

        return [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user", "content": "\n\n".join(parts)},
        ]


class ExtractLyricsCorePromptBuilder(BasePromptBuilder):
    """Build prompts for extracting song core elements from a script."""

    SYSTEM_PROMPT = (
        "You are a professional music producer and lyricist. Your job is to analyze a script "
        "and extract the core elements needed to write a theme song for it. "
        "Output your analysis in a structured format."
    )

    OUTPUT_FORMAT = """
请按以下格式输出分析结果：

【核心主题】
（1-2句话概括）

【情感基调】
（如：悲壮但充满希望、黑暗悬疑、青春伤感等）

【关键意象】
- 意象1：描述
- 意象2：描述
- 意象3：描述

【主角心路历程】
（主角的核心矛盾或情感弧线）

【演唱视角】
（以谁的视角来唱，或第三人称旁观者视角）
"""

    def build(self, script_content: str, **kwargs) -> list[dict]:
        user_prompt = (
            "我正在为我的剧本创作一首主题曲。请仔细阅读以下剧本内容，并提炼出以下信息：\n\n"
            "1. 核心主题（用1-2句话概括）\n"
            "2. 情感基调（如：悲壮但充满希望、黑暗悬疑、青春伤感等）\n"
            "3. 三个最关键的意象或画面（剧本里反复出现的物品、场景、颜色等）\n"
            "4. 主角的心路历程或核心矛盾\n"
            "5. 如果有特定人物视角，是以谁的视角来唱？或者以第三人称旁观者视角？\n\n"
            f"剧本内容：\n```\n{script_content}\n```\n\n"
            f"{self.OUTPUT_FORMAT}"
        )

        return [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]