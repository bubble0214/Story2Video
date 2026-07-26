from playwright.sync_api import sync_playwright
import time

BASE_URL = "http://103.233.253.246:3000"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})

    # 1. Login
    page.goto(f"{BASE_URL}/auth/login")
    page.wait_for_load_state("networkidle")
    time.sleep(1)

    page.get_by_label('邮箱').fill('test@test.com')
    page.get_by_label('密码').fill('1qaz2xsw')
    page.locator('button[type="submit"]').click()
    time.sleep(3)
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    print(f"[LOGIN] URL: {page.url}")

    # 2. Navigate to novel workflow
    page.goto(f"{BASE_URL}/workflow/novel")
    page.wait_for_load_state("networkidle")
    time.sleep(2)
    print(f"[NOVEL] URL: {page.url}")

    # 3. Screenshot for debugging
    page.screenshot(path='novel_page.png', full_page=True)
    print("[SCREENSHOT] novel_page.png saved")

    # 4. Inspect page elements
    inputs = page.locator('input, textarea').all()
    print(f"[INPUTS] Found {len(inputs)} inputs")
    for inp in inputs:
        ph = inp.get_attribute('placeholder') or ''
        type_ = inp.get_attribute('type') or ''
        tag = inp.evaluate('el => el.tagName').lower()
        visible = inp.is_visible()
        print(f"  {tag} type={type_} placeholder='{ph}' visible={visible}")

    buttons = page.locator('button').all()
    btn_texts = []
    for btn in buttons:
        text = (btn.text_content() or '').strip()
        visible = btn.is_visible()
        btn_texts.append((text, visible))
        print(f"  button '{text}' visible={visible}")

    # 5. Try to find keyword input and search button
    keyword_input = page.get_by_placeholder('keywords') or page.locator('input[placeholder*="关键词"]')
    print(f"\n[KEYWORD] found: {keyword_input.count()}")

    # Inspect the model selector
    selectors = page.locator('select').all()
    print(f"[SELECTS] Found {len(selectors)}")
    for sel in selectors:
        print(f"  select visible={sel.is_visible()}")

    browser.close()
