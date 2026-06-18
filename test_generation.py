import httpx, asyncio

async def main():
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "http://localhost:8000/api/v1/auth/login",
            json={"email": "test@example.com", "password": "test123456"},
        )
        if r.status_code != 200:
            print(f"Login failed: {r.status_code} {r.text}")
            return
        token = r.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        r = await client.post(
            "http://localhost:8000/api/v1/tasks/create",
            json={
                "workflow_type": "generate_novel",
                "input_params": {
                    "title": "Test Novel",
                    "author": "Test Author",
                    "tags": "sci-fi, test",
                    "summary": "A test novel for generation pipeline testing.",
                    "model": "custom::glm-4.7-flash",
                },
            },
            headers=headers,
        )
        print(f"Status: {r.status_code}")
        data = r.json()
        print(f"Response: {data}")

        if r.status_code == 201:
            task_id = data["id"]
            for i in range(60):
                await asyncio.sleep(2)
                r = await client.get(
                    f"http://localhost:8000/api/v1/tasks/{task_id}", headers=headers
                )
                data = r.json()
                st = data["status"]
                prog = data.get("progress", "?")
                step = data.get("current_step", "?")
                msg = f"[{i*2}s] status={st} progress={prog} step={step}"
                print(msg)
                if st in ("completed", "failed"):
                    if st == "failed":
                        print(f"Error: {data.get('error_message', 'none')}")
                    print(f"Result keys: {list(data.get('result', {}).keys())}")
                    break

asyncio.run(main())
