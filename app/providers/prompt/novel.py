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
        "You are a professional Chinese lyricist (词人). Write original, literary theme song "
        "lyrics based on the provided script analysis, structure plan, and style requirements. "
        "The lyrics should be poetic, emotionally resonant, and match the requested style."
    )

    def build(
        self,
        theme: str = "",
        genre: str = "",
        structure: str = "",
        mood: str = "",
        language: str = "Chinese",
        core_analysis: str = "",
        lyrics_structure: str = "",
        style_prompt: str = "",
        **kwargs,
    ) -> list[dict]:
        """Build a chat message list for lyrics generation.

        When ``core_analysis`` and ``lyrics_structure`` are provided, a rich
        professional template is used.  Otherwise falls back to the simple
        theme/genre/structure/mood params.
        """
        if core_analysis or lyrics_structure:
            return self._build_rich(core_analysis, lyrics_structure, style_prompt, language)

        # Fallback: simple parameter-based prompt
        parts = [
            f"# Theme\n{theme or 'Untitled'}",
        ]
        if genre:
            parts.append(f"# Genre\n{genre}")
        if structure:
            parts.append(f"# Structure\n{structure}")
        if mood:
            parts.append(f"# Mood\n{mood}")
        parts.append(f"# Language\n{language}")
        parts.append("\nPlease write the lyrics below:")

        return [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user", "content": "\n\n".join(parts)},
        ]

    def _build_rich(
        self,
        core_analysis: str,
        lyrics_structure: str,
        style_prompt: str,
        language: str,
    ) -> list[dict]:
        """Build the rich prompt template described in the feature spec."""
        # Parse core_analysis for structured fields (heuristic — may be free text)
        sections = self._parse_core_sections(core_analysis)

        style_lines = [
            "- 语感注重意境和留白，避免直白的网络用语，用词需有文学感",
            "- 每行字数大致控制在 8-12 个字，朗朗上口",
            "- 必须押韵，韵脚统一或每段转韵",
        ]
        if style_prompt:
            style_lines.append(f"- 额外要求：{style_prompt}")

        user_content = (
            "请作为专业词人，为以下剧本创作一首主题曲歌词。\n\n"
            "【剧本核心信息】\n"
            f"- 主题：{sections['theme']}\n"
            f"- 情感基调：{sections['mood']}\n"
            f"- 关键意象：{sections['imagery']}\n"
            f"- 人物视角：{sections['perspective']}\n"
            f"- 故事背景简述：{sections['background']}\n\n"
            "【歌词结构要求】\n"
            f"{lyrics_structure}\n\n"
            "【风格要求】\n"
            + "\n".join(style_lines) +
            "\n\n请先以【歌曲名称】开头给出歌曲名（4-8个字），然后给出完整歌词。段落名统一使用英文标签：[Intro]、[Verse 1]、[Chorus]、[Verse 2]、[Bridge]、[Outro]，不要使用【主歌1】【副歌】等中文标签。"
        )

        # Include raw core_analysis for extra context not captured by parsing
        if core_analysis.strip():
            user_content += f"\n\n【完整内核分析参考】\n{core_analysis.strip()}"

        return [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ]

    @staticmethod
    def _parse_core_sections(text: str) -> dict:
        """Heuristically extract structured fields from the core analysis text.

        Falls back to generic descriptions when a section cannot be found.
        """
        result = {
            "theme": "未指定",
            "mood": "未指定",
            "imagery": "未指定",
            "perspective": "未指定",
            "background": "未指定",
        }
        if not text:
            return result

        label_map = {
            "theme": ["核心主题"],
            "mood": ["情感基调"],
            "imagery": ["关键意象"],
            "perspective": ["演唱视角"],
            "background": ["故事背景"],
        }

        lines = text.split("\n")
        current_key = None
        current_value: list[str] = []

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            # Check if this line starts a known section
            matched_key = None
            for key, labels in label_map.items():
                if any(stripped.startswith(f"【{l}】") or stripped.startswith(l) for l in labels):
                    matched_key = key
                    break
            if matched_key:
                # Save previous section
                if current_key and current_value:
                    result[current_key] = " ".join(current_value)
                current_key = matched_key
                # Extract content after the label
                for label in label_map[matched_key]:
                    prefix_options = [f"【{label}】", label]
                    for prefix in prefix_options:
                        if stripped.startswith(prefix):
                            content_after = stripped[len(prefix):].strip()
                            current_value = [content_after] if content_after else []
                            break
                    else:
                        continue
                    break
                else:
                    current_value = []
            elif current_key:
                current_value.append(stripped)

        # Flush last section
        if current_key and current_value:
            result[current_key] = " ".join(current_value)

        return result


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

【故事背景】
（一句话概括故事设定的时代、地点或世界观）
"""

    def build(self, script_content: str, **kwargs) -> list[dict]:
        user_prompt = (
            "我正在为我的剧本创作一首主题曲。请仔细阅读以下剧本内容，并提炼出以下信息：\n\n"
            "1. 核心主题（用1-2句话概括）\n"
            "2. 情感基调（如：悲壮但充满希望、黑暗悬疑、青春伤感等）\n"
            "3. 三个最关键的意象或画面（剧本里反复出现的物品、场景、颜色等）\n"
            "4. 主角的心路历程或核心矛盾\n"
            "5. 如果有特定人物视角，是以谁的视角来唱？或者以第三人称旁观者视角？\n"
            "6. 故事背景简述：一句话概括故事设定的时代、地点或世界观\n\n"
            f"剧本内容：\n```\n{script_content}\n```\n\n"
            f"{self.OUTPUT_FORMAT}"
        )

        return [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]


class LyricsStructurePromptBuilder(BasePromptBuilder):
    """Build prompts for planning lyrics structure based on extracted core elements."""

    SYSTEM_PROMPT = (
        "You are a professional lyricist and music producer. Your job is to design the "
        "structure and content outline for a theme song based on the script's core elements. "
        "Do NOT write the actual lyrics — only plan the structure and describe what each "
        "section should express."
    )

    OUTPUT_FORMAT = """
请按以下格式输出歌词结构方案：

【整体风格建议】
（曲风、节奏、乐器等简要建议）

【歌词结构】

[Intro]
(2-4行)
内容概要：开场应表达的内容

[Verse 1]
(4-6行)
内容概要：第一段主歌应表达的内容

[Chorus]
(4行)
内容概要：副歌应表达的内容（记忆点）

[Verse 2]
(4-6行)
内容概要：第二段主歌应表达的内容

[Chorus]
(4行)
内容概要：重复副歌，可微调

[Bridge]
(2-4行)
内容概要：桥段应表达的情感转折

[Chorus]
(4行)
内容概要：最终副歌，情感升华

[Outro]
(2-4行)
内容概要：结尾应表达的内容

【押韵方案】
（建议的韵脚和押韵模式）
"""

    def build(self, core_analysis: str, **kwargs) -> list[dict]:
        user_prompt = (
            "请根据以上提炼出的剧本核心，为我规划一首主题曲的歌词结构。\n\n"
            "要求：\n"
            "- 格式：需严格遵循 [Intro] - [Verse 1] - [Chorus] - [Verse 2] - [Chorus] - [Bridge] - [Chorus] - [Outro] 的格式，方括号内标注英文段落标签，段落之间用空行分隔，每一行歌词末尾不使用标点符号\n"
            "- Verse 每段4-6行，Chorus 4行，Bridge 2-4行\n"
            "- 整体押韵，有记忆点，适合谱曲\n"
            "- 给出每个段落应着重表达的内容概要，但先不要写具体歌词\n\n"
            f"剧本核心分析：\n```\n{core_analysis}\n```\n\n"
            f"{self.OUTPUT_FORMAT}"
        )

        return [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]


class MusicStylePromptBuilder(BasePromptBuilder):
    """Build prompts for generating music style prompts for minimax music-2.6."""

    SYSTEM_PROMPT = (
        "你是一位专业的音乐制作人和AI音乐生成工程师，擅长为minimax music-2.6编写精准的风格提示词（Style Prompt）。"
        "请根据以下信息，生成三种截然不同的谱曲风格方案。"
    )

    OUTPUT_FORMAT = """
【输出格式】
请严格按照以下格式输出三种方案：

---
方案1：现代国风电子
Style Prompt：（40-60字，中文为主，可适当夹杂意象词）
组合解释：（为什么这样组合）
结构建议：（如：主歌用稀疏配器，副歌加入弦乐推进）
参考艺术家：（1-2个）
---
方案2：极简钢琴+弦乐室内乐
Style Prompt：（40-60字）
组合解释：
结构建议：
参考艺术家：
---
方案3：独立民谣摇滚
Style Prompt：（40-60字）
组合解释：
结构建议：
参考艺术家：
---
"""

    def build(
        self,
        lyrics_content: str = "",
        story_background: str = "",
        user_feedback: str = "",
    ) -> list[dict]:
        parts = [
            "【已知信息】",
            f"- 歌词内容：\n{lyrics_content}",
            f"- 剧本核心情绪与故事背景：\n{story_background}",
            "",
            "【输出要求】",
            '1. 生成一个中文为主、可适当夹杂意象词的“风格提示词”（Style Prompt），长度在40-60字内，适合minimax music-2.6大模型识别。',
            "2. 这个提示词需包含：曲风流派、人声特征、乐器配置、情绪氛围、节奏速度的暗示。",
            "3. 请同时给出解释，说明你为什么这样组合，以及这首歌的结构建议。",
            "4. 推荐类似参考艺术家或歌曲，请列出1-2个。",
            "",
            "请生成三种截然不同的谱曲风格方案：",
            "- 方案1：现代国风电子",
            "- 方案2：极简钢琴+弦乐室内乐",
            "- 方案3：独立民谣摇滚",
        ]

        if user_feedback:
            parts.extend([
                "",
                "【用户修改意见】",
                user_feedback,
                "请根据以上修改意见，重新调整三种风格方案。",
            ])

        parts.append("")
        parts.append(self.OUTPUT_FORMAT)

        user_prompt = "\n".join(parts)

        return [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]