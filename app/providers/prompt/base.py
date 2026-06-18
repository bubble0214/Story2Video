from __future__ import annotations

from abc import ABC, abstractmethod


class BasePromptBuilder(ABC):
    """Abstract base for prompt builders."""

    @abstractmethod
    def build(self, **kwargs) -> list[dict]:
        """Build a message list (OpenAI-format) for the given task."""
        ...