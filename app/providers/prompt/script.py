from __future__ import annotations

from app.providers.prompt.base import BasePromptBuilder

_SCRIPT_SYSTEM_PROMPT = (
    "You are a professional screenwriter. Convert the given novel into a detailed "
    "shooting script/stage play format. Include scene headings, character actions, "
    "dialogues, and emotional cues. Output in Chinese markdown format with clear "
    "scene separators."
)


class ScriptPromptBuilder(BasePromptBuilder):
    """Build prompts for script / screenplay generation from novel content."""

    SYSTEM_PROMPT = _SCRIPT_SYSTEM_PROMPT

    def build(
        self,
        novel_content: str,
        title: str = "",
        style: str = "",
        **kwargs,
    ) -> list[dict]:
        """Build a chat message list for script generation.

        Args:
            novel_content: The full novel text to adapt into a script.
            title: Optional novel title.
            style: Optional script style (e.g. film, stage, animation).

        Returns:
            Message list compatible with BaseLLMProvider.chat().
        """
        parts = ["# Original Novel\n"]
        if title:
            parts.append(f"## Title\n{title}\n")
        parts.append(novel_content)

        if style:
            parts.append(f"\n# Style\n{style}")

        parts.append(
            "\n# Instructions\n"
            "Please adapt the above novel into a complete shooting script. "
            "Format each scene with:\n"
            "- Scene heading (INT./EXT. + location + time)\n"
            "- Character actions and descriptions\n"
            "- Dialogue with character names\n"
            "- Emotional and camera cues where appropriate"
        )

        return [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user", "content": "\n\n".join(parts)},
        ]