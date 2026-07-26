import urllib.request, json, sys

data = json.dumps({"keywords": ["sci-fi", "time travel"]}).encode()
req = urllib.request.Request(
    'http://localhost:8000/api/v1/novels/search',
    data=data,
    headers={'Content-Type': 'application/json'},
    method='POST')
try:
    with urllib.request.urlopen(req, timeout=90) as resp:
        print(f"Status: {resp.status}")
        body = resp.read().decode()
        print(f"Body: {body[:500]}")
except urllib.error.HTTPError as e:
    print(f"Status: {e.code}")
    print(f"Body: {e.read().decode()[:500]}")
