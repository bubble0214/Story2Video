"""Tests for volume_review parsing functions (pure functions, no DB/API needed)."""

from app.services.volume_review import parse_review_chapter_revisions, parse_decision


# ── parse_review_chapter_revisions ─────────────────────────────────────────


def test_no_revisions() -> None:
    assert parse_review_chapter_revisions("一切正常，无需修改。") == {}


def test_single_revision() -> None:
    report = "第1章不错。【第3章修改】\n修改后的第三章正文内容。"
    result = parse_review_chapter_revisions(report)
    assert result == {2: "修改后的第三章正文内容。"}  # 0-based: ch3 → index 2


def test_multiple_revisions() -> None:
    report = (
        "【第1章修改】\n第一章新内容。\n"
        "【第3章修改】\n第三章新内容。\n"
        "【第5章修改】\n第五章新内容。"
    )
    result = parse_review_chapter_revisions(report)
    assert result == {
        0: "第一章新内容。",
        2: "第三章新内容。",
        4: "第五章新内容。",
    }


def test_consecutive_revisions() -> None:
    report = "【第2章修改】\n内容A。【第3章修改】\n内容B。"
    result = parse_review_chapter_revisions(report)
    assert result == {1: "内容A。", 2: "内容B。"}


def test_revision_with_trailing_text() -> None:
    """Text after the last revision marker belongs to that revision."""
    report = "【第10章修改】\n第十章修正版。\n后面还有总结语。"
    result = parse_review_chapter_revisions(report)
    assert result == {9: "第十章修正版。\n后面还有总结语。"}


def test_revision_only_marker_no_text() -> None:
    """Marker with no following text should not produce an entry (empty → falsy)."""
    report = "【第6章修改】"
    result = parse_review_chapter_revisions(report)
    assert result == {}


def test_revision_with_whitespace_only() -> None:
    """Whitespace-only content after marker should be treated as empty."""
    report = "【第7章修改】   \n  \n"
    result = parse_review_chapter_revisions(report)
    assert result == {}


def test_out_of_order_markers() -> None:
    """Markers don't need to appear in chapter order."""
    report = "【第30章修改】\n第三十章。【第1章修改】\n第一章。"
    result = parse_review_chapter_revisions(report)
    assert result == {29: "第三十章。", 0: "第一章。"}


def test_non_chinese_revision_format() -> None:
    """Format like 【Chapter 3 fix】should NOT match (Chinese-only marker)."""
    report = "【Chapter 3 fix】\nsome text"
    assert parse_review_chapter_revisions(report) == {}


# ── parse_decision ─────────────────────────────────────────────────────────


def test_decision_continue_v2() -> None:
    assert parse_decision("分析完毕。【决策：续写第二卷】") == "续写第二卷"


def test_decision_revise() -> None:
    assert parse_decision("有一些问题。【决策：修改后继续】") == "修改后继续"


def test_decision_close() -> None:
    assert parse_decision("故事完整了。【决策：收束结局】") == "收束结局"


def test_decision_with_analysis_prefix() -> None:
    text = (
        "故事推进顺利，伏笔还有大量空间，建议续写第二卷。\n"
        "【决策：续写第二卷】\n接下来规划细纲。"
    )
    assert parse_decision(text) == "续写第二卷"


def test_decision_fallback_to_revise() -> None:
    """Unrecognized text should fall back to '修改后继续'."""
    assert parse_decision("不确定该做什么。") == "修改后继续"


def test_decision_fallback_empty() -> None:
    assert parse_decision("") == "修改后继续"


def test_decision_early_match_first_wins() -> None:
    """If multiple markers present, first match wins."""
    text = "【决策：续写第二卷】后面不小心又写了【决策：收束结局】"
    assert parse_decision(text) == "续写第二卷"


def test_decision_substring_safety() -> None:
    """'续写' in longer string should not cause false positive."""
    assert parse_decision("这里提到续写第二卷的计划不错") == "续写第二卷"


def test_decision_extra_whitespace() -> None:
    assert parse_decision("  【决策：收束结局】  ") == "收束结局"
