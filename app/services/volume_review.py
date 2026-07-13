"""Volume review prompts shared between batch (Celery) and interactive modes."""

import re

REVIEW_SYSTEM_PROMPT = "你是一名资深小说编辑，负责全书最终检查。"

FINAL_REVIEW_PROMPT = (
    "请通读已完成的所有30章正文，做最终检查：\n"
    "1. **时间线**：列出第1-30章的时间轴，检查有无矛盾。\n"
    "2. **人物轨迹**：所有线索是否收束或为下一卷做好准备？\n"
    "3. **能力系统**：主角能力成长曲线是否平滑合理？\n"
    "4. **节奏报告**：用★标出全书情绪高点，用—标出拖沓段落。\n\n"
    "【修改要求】如果发现某章节需要修改，请用【第X章修改】作为标记，输出完整修改版本。"
)

DECISION_SYSTEM_PROMPT = "你是一名资深小说主编，负责根据已完成内容规划后续创作方向。"

DECISION_PROMPT = (
    "请阅读以上已完成的第一卷正文，分析当前故事状态并决定下一步：\n\n"
    "1. **写得顺手，伏笔还有空间**：故事推进顺利，埋下的伏笔尚未全部回收，"
    "有明显可以延续到第二卷的线索。→ 生成第二卷细纲，继续写作。\n"
    "2. **发现一些问题需要调整**：时间线/人物/能力/节奏存在需要修改的问题。"
    "→ 修改已有章节后再继续。\n"
    "3. **故事可以收束了**：主线冲突已经或即将解决，继续写会导致注水。"
    "→ 直接写结局收束。\n\n"
    "请先简要分析故事状态，然后输出决策结果：\n"
    "如果选1，请回复【决策：续写第二卷】\n"
    "如果选2，请回复【决策：修改后继续】\n"
    "如果选3，请回复【决策：收束结局】\n\n"
    "注意：一部完整的网络小说通常在100章以上，如果当前只完成了30章，"
    "且故事明显还有大量可写内容，请优先选择选项1。"
)

V2_OUTLINE_SYSTEM_PROMPT = "你是一名资深小说大纲设计师，擅长规划长篇故事的续作结构。"

V2_OUTLINE_PROMPT_TEMPLATE = (
    "你已经完成了第一卷（30章）的创作。现在请规划第二卷的章节细纲。\n\n"
    "【第一卷已有内容概要】\n{novel_content_preview}\n\n"
    "请基于第一卷已展开的线索、未回收的伏笔、人物的成长空间，规划第二卷（10章）的细纲。"
    "每章需包含：一句话梗概、情绪基调、核心冲突、伏笔植入、结尾钩子。\n\n"
    "请按以下格式输出：\n"
    "第31章：[梗概] | [情绪基调] | [核心冲突] | [伏笔] | [钩子]\n"
    "第32章：...\n"
    "（以此类推到第40章）"
)

CLOSING_ARC_NOTES = (
    "根据分析，故事已进入收束阶段。请写出第31-35章作为结局卷：\n"
    "- 第31章：最终冲突升级，所有线索汇聚\n"
    "- 第32章：高潮对决/关键转折\n"
    "- 第33章：余波与角色成长\n"
    "- 第34章：伏笔回收与主题升华\n"
    "- 第35章：结局尾声\n\n"
    "每章1800-2000字，保持前后一致。"
)


def parse_review_chapter_revisions(report: str) -> dict[int, str]:
    """Parse chapter revisions from a review report.

    Scans for markers like 【第3章修改】 and returns a dict mapping
    0-based chapter indices to revised full text (with commentary stripped).
    """
    revisions: dict[int, str] = {}
    for match in re.finditer(r"【第(\d+)章修改】", report):
        ch_idx = int(match.group(1)) - 1
        start = match.end()
        next_marker = re.search(r"【第\d+章修改】", report[start:])
        revised = (
            report[start:start + next_marker.start()].strip()
            if next_marker else report[start:].strip()
        )
        if revised:
            revisions[ch_idx] = _clean_revision_content(revised)
    return revisions


def _clean_revision_content(content: str) -> str:
    """Remove review commentary from revision content, keeping only chapter text.

    LLM output often prefixes the revised chapter with notes like:
    '修改建议：...' or '（以下是修改后的完整章节）'
    Strips everything before the first chapter heading or title.
    """
    lines = content.split('\n')
    first_heading_idx = None
    for i, line in enumerate(lines):
        stripped = line.strip()
        if re.match(r'^#{1,6}\s+', stripped) or re.match(r'^第\d+章', stripped):
            first_heading_idx = i
            break

    if first_heading_idx is not None and first_heading_idx > 0:
        before_lines = lines[:first_heading_idx]
        non_commentary = [
            l for l in before_lines
            if l.strip() and '修改' not in l and '建议' not in l and '以下' not in l
        ]
        if not non_commentary:
            content = '\n'.join(lines[first_heading_idx:])

    return content.strip()


def parse_decision(text: str) -> str:
    """Parse the LLM decision text and return the chosen option string.

    Returns one of: "续写第二卷", "修改后继续", "收束结局"
    Falls back to "修改后继续" on parse failure.
    """
    if "续写第二卷" in text:
        return "续写第二卷"
    if "收束结局" in text:
        return "收束结局"
    return "修改后继续"
