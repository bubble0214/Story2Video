import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('103.233.253.246', username='root', password='xtgbKJUD0671')
cmd = "PGPASSWORD=REPLACE_WITH_YOUR_OWN_PASSWORD_12345 docker exec story2video-postgres-1 psql -U story2video -t -A -c \"SELECT length(password_hash), substring(password_hash,1,60) FROM users WHERE email='test@test.com'\""
i, o, e = c.exec_command(cmd)
print(o.read().decode('utf-8', errors='replace'))
c.close()
