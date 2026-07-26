"""One-command deploy: pull latest, rebuild containers, restart."""
import paramiko, time, sys

HOST = "103.233.253.246"
USER = "root"
PASSWORD = "xtgbKJUD0671"

def run(cmd, timeout=120):
    """Run a command on the server and return stdout."""
    import select as _sel
    stdin, stdout, stderr = c.exec_command(cmd)
    out_parts, err_parts = [], []
    deadline = time.time() + timeout
    while time.time() < deadline:
        if stdout.channel.exit_status_ready():
            break
        if stdout.channel.recv_ready():
            out_parts.append(stdout.channel.recv(4096))
        if stdout.channel.recv_stderr_ready():
            err_parts.append(stdout.channel.recv_stderr(4096))
        time.sleep(0.5)
    # Final read
    while stdout.channel.recv_ready():
        out_parts.append(stdout.channel.recv(4096))
    while stdout.channel.recv_stderr_ready():
        err_parts.append(stdout.channel.recv_stderr(4096))
    return b"".join(out_parts).decode(errors="replace"), b"".join(err_parts).decode(errors="replace")

print("=" * 50)
print("Story2Video Deploy Script")
print("=" * 50)

# 1. Connect
print("\n[1/6] Connecting to server...")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
print("  OK")

# 2. Git pull
print("\n[2/6] Pulling latest code...")
out, err = run("cd /root/Story2Video && git stash && git pull")
for line in out.split("\n"):
    if line.strip() and "Saved" not in line:
        print(f"  {line.strip()}")
if err.strip():
    print(f"  (stderr: {err.strip()[:200]})")

# 3. Rebuild app image
print("\n[3/6] Rebuilding app image...")
out, err = run("cd /root/Story2Video && docker compose build app 2>&1 | tail -3", timeout=300)
for line in out.split("\n"):
    if line.strip():
        print(f"  {line.strip()}")

# 4. Restart app container
print("\n[4/6] Restarting app container...")
out, err = run("cd /root/Story2Video && docker compose up -d app 2>&1 | tail -5", timeout=60)
for line in out.split("\n"):
    if line.strip():
        print(f"  {line.strip()}")

# 5. Rebuild frontend image
print("\n[5/6] Rebuilding frontend image...")
out, err = run("cd /root/Story2Video && docker compose build frontend 2>&1 | tail -3", timeout=300)
for line in out.split("\n"):
    if line.strip():
        print(f"  {line.strip()}")

# 6. Restart frontend
print("\n[6/6] Restarting frontend container...")
out, err = run("cd /root/Story2Video && docker compose up -d frontend 2>&1 | tail -5", timeout=60)
for line in out.split("\n"):
    if line.strip():
        print(f"  {line.strip()}")

c.close()
print("\n" + "=" * 50)
print("Deploy complete!")
print("=" * 50)
