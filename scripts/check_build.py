"""Check frontend build error on server."""
import paramiko, time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("103.233.253.246", username="root", password="xtgbKJUD0671", timeout=30)

ch = c.get_transport().open_session()
ch.exec_command("cd /root/Story2Video && sed -n '85,170p' client/src/hooks/use-novel-generation.ts")

out = b""
while True:
    if ch.recv_ready():
        out += ch.recv(4096)
    if ch.exit_status_ready():
        break
    time.sleep(0.5)
while ch.recv_ready():
    out += ch.recv(4096)

text = out.decode("utf-8", errors="replace")
lines = text.split("\n")
print("\n".join(lines[-40:]))
c.close()
