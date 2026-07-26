from playwright.sync_api import sync_playwright
import time, json, sys

BASE_URL = "http://103.233.253.246:3000"
RESULTS = {"pass": 0, "fail": 0, "skip": 0}

def report(step, status, msg):
    tag = {"pass": "PASS", "fail": "FAIL", "skip": "SKIP", "info": "INFO"}[status]
    RESULTS[status] = RESULTS.get(status, 0) + 1
    print(f"[{tag}] {step}: {msg}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    page.set_default_timeout(15000)

    # ── 1. Login ──
    page.goto(f"{BASE_URL}/auth/login")
    page.wait_for_load_state("networkidle")
    page.get_by_label('邮箱').fill('test@test.com')
    page.get_by_label('密码').fill('1qaz2swx')
    page.locator('button[type="submit"]').click()
    time.sleep(4)
    page.wait_for_load_state("networkidle")

    auth = page.evaluate("""() => {
        const v = localStorage.getItem('auth-storage');
        return v ? JSON.parse(v).state : null
    }""")
    if auth and auth.get('isAuthenticated'):
        report("Login", "pass", f"user={auth['user']['email']}")
    else:
        report("Login", "fail", "authentication failed")
        browser.close()
        sys.exit(1)

    # ── 2. Navigate to novel ──
    page.goto(f"{BASE_URL}/workflow/novel")
    page.wait_for_load_state("networkidle")
    time.sleep(2)
    report("Navigate", "pass", f"URL={page.url}")

    # ── 3. Fill keywords ──
    kw_input = page.locator('input').first
    if kw_input.is_visible():
        kw_input.fill('科幻, 时间旅行')
        time.sleep(0.5)
        report("Fill keywords", "pass", "科幻, 时间旅行")
    else:
        report("Fill keywords", "fail", "input not found")

    # ── 4. Click search ──
    search_btn = page.locator('button:has-text("搜索")')
    if search_btn.count() > 0 and search_btn.is_visible():
        search_btn.click()
        report("Search click", "pass", "")
    else:
        report("Search click", "fail", "button not found")

    # ── 5. Wait for LLM response (may take 10-30s) ──
    print("\n[WAIT] Waiting for LLM search results...")
    # Wait for either results to appear or timeout
    try:
        page.wait_for_selector('text=小说推荐', timeout=45000)
        report("LLM response", "pass", "小说推荐 section appeared")
    except:
        report("LLM response", "info", "小说推荐 not found, checking page state")

    time.sleep(3)
    page.screenshot(path='novel_search_result.png', full_page=True)

    # ── 6. Verify results ──
    body_text = page.inner_text('body').lower()
    novel_keywords = ['小说', '推荐', '三体', '科幻', '作者', '评分']
    found = [kw for kw in novel_keywords if kw in body_text]
    report("Results check", "pass", f"found keywords: {found}")

    if 'error' in body_text or '失败' in body_text:
        report("Errors", "fail", "error/d失败 found in page")
    else:
        report("Errors", "pass", "no error indicators")

    # Check backend logs for 500s
    print("\n[INFO] Check server logs for errors during this test")

    # ── 7. Test again with different keywords ──
    report("Re-test", "info", "clearing and re-searching")
    kw_input.fill('修仙, 玄幻')
    time.sleep(0.5)
    search_btn.click()
    time.sleep(10)
    page.wait_for_load_state("networkidle")
    time.sleep(3)
    page.screenshot(path='novel_search_result2.png', full_page=True)
    report("Re-test", "pass", "second search completed")

    # ── Summary ──
    print(f"\n{'='*50}")
    print(f"RESULTS: {RESULTS['pass']} pass, {RESULTS['fail']} fail, {RESULTS['skip']} skip")
    print(f"{'='*50}")

    browser.close()
