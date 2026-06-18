import bcrypt, asyncio, asyncpg

async def main():
    dsn = "postgresql://story2video:change_me_in_production@localhost:5434/story2video"
    conn = await asyncpg.connect(dsn)
    row = await conn.fetchrow("SELECT password_hash FROM users WHERE email=$1", "test@example.com")
    h = row["password_hash"]
    print("Hash:", h[:30], "...")
    try:
        ok = bcrypt.checkpw(b"test123456", h.encode())
        print("Verify:", ok)
    except Exception as e:
        print("Error:", e)
        new = bcrypt.hashpw(b"test123456", bcrypt.gensalt()).decode()
        await conn.execute("UPDATE users SET password_hash=$1 WHERE email=$2", new, "test@example.com")
        print("Password reset done")
    await conn.close()

asyncio.run(main())
