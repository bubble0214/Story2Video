import httpx, asyncio

novels = [
    {"title": "The Three-Body Problem", "author": "Liu Cixin", "tags": "sci-fi, alien, science fiction", "summary": "During the Cultural Revolution, astrophysicist Ye Wenjie secretly sends a signal into space. The signal reaches the Trisolaran civilization four light-years away, which decides to invade Earth. Humanity faces an unprecedented crisis."},
    {"title": "Foundation", "author": "Isaac Asimov", "tags": "sci-fi, empire, future", "summary": "Hari Seldon creates psychohistory and predicts the fall of the Galactic Empire. To shorten the coming dark age, he establishes the Foundation to preserve knowledge and civilization."},
    {"title": "Dune", "author": "Frank Herbert", "tags": "sci-fi, adventure, desert", "summary": "In a distant future where a feudal empire rules the universe, young Paul Atreides travels to the desert planet Arrakis, source of the universe's most precious substance - spice. Paul's destiny becomes intertwined with Arrakis."},
    {"title": "One Hundred Years of Solitude", "author": "Gabriel Garcia Marquez", "tags": "magical realism, classic, family saga", "summary": "The legendary story of the Buendia family across seven generations in the town of Macondo, blending myth, folklore, and reality to depict the rich tapestry of Latin American history and culture."},
    {"title": "The Da Vinci Code", "author": "Dan Brown", "tags": "mystery, thriller, adventure", "summary": "A Louvre curator is murdered, leaving a series of cryptic clues. Professor Robert Langdon and cryptologist Sophie Neveu uncover a secret society's ancient conspiracy involving the Holy Grail."},
]

async def main():
    async with httpx.AsyncClient() as client:
        # Login
        r = await client.post("http://localhost:8000/api/v1/auth/login", json={"email": "test@example.com", "password": "test123456"})
        token = r.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        for novel in novels:
            r = await client.post("http://localhost:8000/api/v1/novels/import", json=novel, headers=headers)
            if r.status_code == 201:
                print(f"OK: {novel['title']}")
            else:
                print(f"FAIL: {novel['title']} -> {r.status_code} {r.text}")

asyncio.run(main())
