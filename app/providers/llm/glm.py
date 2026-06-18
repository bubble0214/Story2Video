from app.providers.llm.openai import OpenAIProvider


class GLMProvider(OpenAIProvider):
    """Zhipu AI (GLM) LLM provider — API-compatible with OpenAI."""

    def __init__(self, api_key: str, model: str = "glm-4.7-flash") -> None:
        self._api_key = api_key
        self._model = model
        self._base_url = "https://open.bigmodel.cn/api/paas/v4"
