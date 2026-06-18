import asyncio, httpx

async def test():
    # Try different model names with Zhipu API
    base = "https://open.bigmodel.cn/api/paas/v4"
    # Use the custom/deepseek key from env for zhipu test
    api_key = "test"  # Will fail but shows if path is right

    models = [
        "embedding-2",
        "text_embedding-v2",
        "text_embedding-v3",
        "BGE-Embedding-v2",
        "bge-embedding-v2",
        "BGE-Large-ZH-v1.5",
    ]

    async with httpx.AsyncClient() as c:
        for model in models:
            try:
                r = await c.post(
                    f"{base}/embeddings",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={"input": "hello", "model": model},
                )
                print(f"{model}: {r.status_code} {r.text[:200]}")
            except Exception as e:
                print(f"{model}: error {e}")

asyncio.run(test())
