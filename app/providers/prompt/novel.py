from __future__ import annotations

from app.providers.prompt.base import BasePromptBuilder

_NOVEL_SYSTEM_PROMPT = (
    "You are a professional novelist. Write a compelling story in Chinese based on the given "
    "title, tags, and outline. The story should have vivid characters, gripping plot, and "
    "literary quality. Output the complete story in markdown format."
)


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
        """Build a chat message list for lyrics generation.

        Args:
            theme: Core theme or subject of the song.
            genre: Music genre (pop, rock, R&B, hip-hop, etc.).
            structure: Song structure description.
            mood: Emotional mood.
            language: Output language.

        Returns:
            Message list compatible with BaseLLMProvider.chat() / stream().
        """
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