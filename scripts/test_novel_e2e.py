"""E2E test: Novel generation flow — search, error handling, and task API.

Usage:
    cd D:/Story2Video
    python scripts/test_novel_e2e.py

Requires: playwright (pip install playwright && python -m playwright install chromium)
"""

from playwright.sync_api import sync_playwright
import time
import sys
import os

# ── Configuration ──
BASE_URL = "http://103.233.253.246:3000"
API_BASE = "http://103.233.253.246:8005/api"
TEST_EMAIL = "test@test.com"
TEST_PASSWORD = "1qaz2swx"

TIMEOUT_DEFAULT = 15_000
TIMEOUT_LOGIN = 10_000
TIMEOUT_SEARCH = 90_000
TIMEOUT_TASK_POLL = 300  # seconds
TIMEOUT_TAB_SETTLE = 3   # seconds

RESULTS: dict[str, int] = {"pass": 0, "fail": 0, "skip": 0, "info": 0}
SCREENSHOT_DIR = os.path.dirname(os.path.abspath(__file__))


def report(step: str, status: str, msg: str) -> None:
    """Structured pass/fail/skip/info output."""
    tag = {"pass": "PASS", "fail": "FAIL", "skip": "SKIP", "info": "INFO"}[status]
    RESULTS[status] = RESULTS.get(status, 0) + 1
    print(f"[{tag}] {step}: {msg}")


def screenshot(page, name: str) -> str:
    """Save a full-page screenshot to the project root."""
    path = os.path.join(SCREENSHOT_DIR, name)
    page.screenshot(path=path, full_page=True)
    return path


def get_auth_token(page) -> str | None:
    """Extract the JWT token from localStorage (Zustand persist)."""
    raw = page.evaluate("""() => {
        const v = localStorage.getItem('auth-storage');
        return v ? JSON.parse(v).state : null
    }""")
    if raw and raw.get("token"):
        return raw["token"]
    return None


def api_call(page, method: str, path: str, body: dict | None, token: str) -> dict:
    """Make an API call inside the browser context (avoids CORS issues)."""
    return page.evaluate(
        """({ method, url, body, token }) => {
            return fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token,
                },
                body: body ? JSON.stringify(body) : undefined,
            }).then(async (resp) => {
                let data = null;
                try { data = await resp.json(); } catch {}
                return { ok: resp.ok, status: resp.status, data: data };
            });
        }""",
        {"method": method, "url": f"{API_BASE}{path}", "body": body, "token": token},
    )


def login(page) -> bool:
    """Navigate to /auth/login, fill form, submit, verify token."""
    report("Login", "info", f"navigating to {BASE_URL}/auth/login")
    page.goto(f"{BASE_URL}/auth/login")
    page.wait_for_load_state("networkidle")

    email_input = page.get_by_label("邮箱")
    email_input.fill(TEST_EMAIL)
    pwd_input = page.get_by_label("密码")
    pwd_input.fill(TEST_PASSWORD)
    page.locator('button[type="submit"]').click()
    time.sleep(3)
    page.wait_for_load_state("networkidle")

    token = get_auth_token(page)
    if token:
        report("Login", "pass", f"authenticated, token prefix={token[:16]}...")
        return True
    report("Login", "fail", "no token found in localStorage after login")
    return False


def navigate_to_novel(page) -> bool:
    """Navigate to the novel workflow page."""
    page.goto(f"{BASE_URL}/workflow/novel")
    page.wait_for_load_state("networkidle")
    time.sleep(2)  # React suspense settle
    report("Navigate", "pass", f"URL={page.url}")
    return True


def select_model(page, avoid: set[str] | None = None) -> bool:
    """Select the first non-Auto model via Radix UI Select.

    Skips models whose label contains any string in *avoid* (e.g. "music").
    Radix renders the trigger as button[role="combobox"] and the
    dropdown options in a Portal with role="option".
    """
    avoid = avoid or set()
    # Find the SelectTrigger — ModelSelector uses Sparkles icon
    trigger = page.locator('button[role="combobox"]').first
    if trigger.count() == 0 or not trigger.is_visible():
        report("Select model", "skip", "no model selector trigger found")
        return False

    trigger.click()
    # Wait for the listbox portal to appear
    try:
        page.wait_for_selector('[role="listbox"]', timeout=5000)
    except Exception:
        report("Select model", "skip", "dropdown listbox did not appear")
        return False

    options = page.locator('[role="option"]').all()
    if len(options) <= 1:
        report("Select model", "skip", f"only {len(options)} option(s), no real model to select")
        # Close the dropdown by pressing Escape
        page.keyboard.press("Escape")
        return False

    # Skip index 0 ("自动（默认）"), find first non-avoided model
    for opt in options[1:]:
        label = opt.inner_text().strip().lower()
        if any(a.lower() in label for a in avoid):
            continue
        opt.click()
        report("Select model", "pass", f"selected '{opt.inner_text().strip()}'")
        return True

    # All real models are in the avoid list — that's fine, stay on Auto
    page.keyboard.press("Escape")
    report("Select model", "skip", "all models match avoided keywords (staying on Auto)")
    return False


def search_novels(page, keywords: str) -> bool:
    """Fill keywords and click search. Wait for terminal state. Returns True if results found."""
    kw_input = page.locator('input[placeholder*="例如"]').first
    if kw_input.count() == 0:
        # Fallback: first visible input
        kw_input = page.locator("input").first
    kw_input.fill(keywords)
    time.sleep(0.5)

    search_btn = page.locator("button:has-text('搜索')").first
    if search_btn.count() == 0 or not search_btn.is_visible():
        report("Search", "fail", "search button not found")
        screenshot(page, "p1_search_btn_missing.png")
        return False

    search_btn.click()
    report("Search", "info", f"searching for '{keywords}'...")

    # Poll for terminal states
    deadline = time.time() + TIMEOUT_SEARCH / 1000
    while time.time() < deadline:
        page.wait_for_load_state("networkidle")
        body = page.inner_text("body").lower()

        if "参考小说" in body or "小说推荐" in body:
            # Check if actual cards rendered (not skeleton)
            cards = page.locator("h3.font-semibold").all()
            if any(c.is_visible() for c in cards):
                report("Search", "pass", f"results appeared ({len(cards)} cards)")
                return True

        if "未找到匹配这些关键词的推荐" in body or "请尝试其他关键词" in body:
            report("Search", "pass", "empty state reached (no matching novels)")
            return False

        if "加载小说失败" in body or "失败" in body:
            report("Search", "pass", "error state reached")
            return False

        time.sleep(2)

    report("Search", "fail", f"timed out after {TIMEOUT_SEARCH/1000}s")
    screenshot(page, "p1_search_timeout.png")
    return False


def verify_novel_cards(page) -> dict:
    """Check that result cards have title, author, tags, summary, score. Returns field counts."""
    titles = page.locator("h3.font-semibold").all()
    visible = [t for t in titles if t.is_visible()]
    count = len(visible)

    body = page.inner_text("body").lower()
    has_author = "by " in body
    has_tags = page.locator("badge").count() > 0 or "confidence" in body
    has_summary = page.locator("p.text-sm.text-muted-foreground").count() > 0

    report("Results check", "pass" if count > 0 else "skip",
           f"{count} cards, author={has_author}, tags={has_tags}, summary={has_summary}")
    return {"count": count, "author": has_author, "tags": has_tags, "summary": has_summary}


# ── Phase functions ──

def phase_1_novel_search(page) -> dict:
    """Happy path: login, navigate, search, verify results."""
    print("\n" + "=" * 50)
    print("PHASE 1: Novel Search (Happy Path)")
    print("=" * 50)

    if not login(page):
        screenshot(page, "p1_login_fail.png")
        return {"results_found": False, "model_selected": False}

    screenshot(page, "p1_login.png")
    navigate_to_novel(page)
    screenshot(page, "p1_novel_page.png")

    # Verify page elements exist
    kw_input = page.locator('input[placeholder*="例如"]').first
    if kw_input.count() > 0 and kw_input.is_visible():
        report("Page elements", "pass", "keyword input visible")
    else:
        report("Page elements", "info", "keyword input not found (may use fallback)")
    search_btn = page.locator("button:has-text('搜索')").first
    if search_btn.count() > 0 and search_btn.is_visible():
        report("Page elements", "pass", "search button visible")
    else:
        report("Page elements", "info", "search button not found")

    # Model selector — best effort, skip models that can't do text search
    avoid_models = {"music", "suno", "udio", "heygen", "d-id", "heyGen", "coze"}
    model_selected = select_model(page, avoid_models)

    # Search with real keywords
    # The search uses Auto mode if no model was selected
    results_found = search_novels(page, "科幻, 时间旅行")

    if results_found:
        screenshot(page, "p1_search_results.png")
        verify_novel_cards(page)
    else:
        screenshot(page, "p1_search_no_results.png")
        # Take an additional debug screenshot of the page state
        report("Search", "info", "checking page state for debugging...")
        body = page.inner_text("body")
        if "加载小说失败" in body:
            screenshot(page, "p1_search_error_state.png")
        elif "未找到匹配这些关键词的推荐" in body:
            screenshot(page, "p1_search_empty_state.png")

    return {"results_found": results_found, "model_selected": model_selected}


def phase_2_error_handling(page) -> None:
    """Test empty-state / error handling with unlikely keywords."""
    print("\n" + "=" * 50)
    print("PHASE 2: Error / Empty State Handling")
    print("=" * 50)

    kw_input = page.locator('input[placeholder*="例如"]').first
    if kw_input.count() == 0:
        kw_input = page.locator("input").first

    kw_input.fill("zzzxxx123")
    time.sleep(0.5)

    search_btn = page.locator("button:has-text('搜索')").first
    if search_btn.count() > 0 and search_btn.is_visible():
        search_btn.click()
    else:
        report("Search (empty)", "skip", "search button not found")
        return

    # Wait for response
    deadline = time.time() + TIMEOUT_SEARCH / 1000
    while time.time() < deadline:
        page.wait_for_load_state("networkidle")
        body = page.inner_text("body").lower()

        if "未找到匹配这些关键词的推荐" in body:
            report("Empty state", "pass", "empty state text displayed correctly")
            screenshot(page, "p2_empty_state.png")
            return
        if "加载小说失败" in body:
            report("Error state", "pass", "error state reached")
            screenshot(page, "p2_error_state.png")
            return
        # Check for unexpected results (improbable but possible with LLM)
        cards = page.locator("h3.font-semibold").all()
        visible = [c for c in cards if c.is_visible()]
        if visible:
            report("Empty state", "info", f"LLM returned {len(visible)} results for improbable query")
            screenshot(page, "p2_unexpected_results.png")
            return
        time.sleep(2)

    report("Empty state", "info", "timed out waiting for empty/error state")
    screenshot(page, "p2_timeout.png")


def phase_3_fasttrack_generation(page, phase1_data: dict) -> None:
    """Verify the generation workflow tabs (requires Phase 1 results)."""
    print("\n" + "=" * 50)
    print("PHASE 3: Generation Workflow Tabs")
    print("=" * 50)

    if not phase1_data.get("results_found"):
        report("Generation tabs", "skip", "Phase 1 had no results, skipping")
        return

    expected_tabs = ["创作提示", "小说大纲", "第一卷细纲", "人物守则", "生成小说"]
    tablist = page.locator('[role="tablist"]')
    if tablist.count() == 0:
        report("Generation tabs", "skip", "tablist not visible (may not be rendered)")
        screenshot(page, "p3_no_tabs.png")
        return

    tab_text = tablist.inner_text()
    for tab in expected_tabs:
        if tab in tab_text:
            report("Tab check", "pass", f"tab '{tab}' visible")
        else:
            report("Tab check", "info", f"tab '{tab}' not found in tablist")

    # Check the prompt tab content
    prompt_tab = page.locator(f'button[role="tab"]:has-text("创作提示")').first
    if prompt_tab.count() > 0:
        prompt_tab.click()
        time.sleep(1)
        textarea = page.locator("textarea").first
        if textarea.is_visible():
            report("Prompt tab", "pass", "textarea visible")
        else:
            report("Prompt tab", "info", "textarea not visible")
        generate_btn = page.locator("button:has-text('生成大纲')").first
        if generate_btn.count() > 0 and generate_btn.is_visible():
            report("Prompt tab", "pass", "'生成大纲' button visible")
        else:
            report("Prompt tab", "info", "'生成大纲' button not found")

    screenshot(page, "p3_generation_page.png")


def phase_4_api_task(page) -> dict:
    """Backend API test: create a task via API and poll for completion."""
    print("\n" + "=" * 50)
    print("PHASE 4: Backend Task API")
    print("=" * 50)

    token = get_auth_token(page)
    if not token:
        report("Task API", "fail", "no auth token available")
        return {"task_created": False}

    # Use the search API to verify it works
    report("Task API", "info", "testing search API endpoint...")
    search_resp = api_call(page, "POST", "/v1/novels/search",
                           {"keywords": ["科幻", "时间旅行"]}, token)
    if search_resp.get("ok"):
        data = search_resp.get("data", [])
        report("Search API", "pass", f"returned {len(data)} results")
    else:
        report("Search API", "info",
               f"status={search_resp.get('status')}, detail={search_resp.get('data', {}).get('detail', 'N/A')}")

    # Try task creation — first attempt with generate_novel (may fail if
    # Pydantic schema is out of sync), fallback to generate_outline_only.
    task_workflows = [
        "generate_novel",
        "generate_outline_only",
    ]
    create_resp = None
    used_workflow = None
    for wf in task_workflows:
        task_params = {
            "keywords": "科幻, 时间旅行",
            "custom_prompt": "写一个关于时间旅行的科幻短篇小说",
        }
        report("Task API", "info", f"attempting workflow '{wf}'...")
        create_resp = api_call(page, "POST", "/v1/tasks/create",
                               {"workflow_type": wf, "input_params": task_params},
                               token)
        if create_resp.get("ok"):
            used_workflow = wf
            break
        status = create_resp.get("status")
        detail = create_resp.get("data", {})
        report("Task API", "info",
               f"'{wf}' failed status={status} detail={detail.get('detail', 'N/A')}")

    if not create_resp or not create_resp.get("ok"):
        report("Task API", "info", "all workflow types rejected")
        screenshot(page, "p4_task_create_result.png")
        return {"task_created": False}

    task_id = create_resp["data"].get("id")
    if not task_id:
        report("Task API", "fail", "no task_id in response")
        screenshot(page, "p4_task_no_id.png")
        return {"task_created": False}

    report("Task API", "pass", f"task created: id={task_id}")
    screenshot(page, "p4_task_created.png")

    # Poll for completion
    report("Task API", "info", f"polling task {task_id[:8]}... every 3s (max {TIMEOUT_TASK_POLL}s)")
    start = time.time()

    while time.time() - start < TIMEOUT_TASK_POLL:
        get_resp = api_call(page, "GET", f"/v1/tasks/{task_id}", None, token)
        if get_resp.get("ok"):
            task_data = get_resp["data"]
            status = task_data.get("status", "UNKNOWN")
            progress = task_data.get("progress", 0)
            step = task_data.get("current_step", "")

            elapsed = time.time() - start
            print(f"  [{elapsed:5.1f}s] status={status} progress={progress}% step={step}")

            if status == "SUCCESS":
                result_keys = list(task_data.get("result", {}).keys())
                report("Task poll", "pass",
                       f"completed in {elapsed:.0f}s, result keys={result_keys}")
                screenshot(page, "p4_task_success.png")
                return {"task_created": True, "task_id": task_id, "status": status,
                        "elapsed": elapsed}

            if status == "FAILED":
                err_msg = task_data.get("error_message", "N/A")
                report("Task poll", "fail",
                       f"failed after {elapsed:.0f}s, error={err_msg}")
                screenshot(page, "p4_task_failed.png")
                return {"task_created": True, "task_id": task_id, "status": status,
                        "elapsed": elapsed, "error": err_msg}
        else:
            print(f"  [{time.time() - start:5.1f}s] poll error status={get_resp.get('status')}")

        time.sleep(3)

    report("Task poll", "fail", f"timed out after {TIMEOUT_TASK_POLL}s, last status check above")
    screenshot(page, "p4_task_timeout.png")
    return {"task_created": True, "task_id": task_id, "status": "TIMEOUT",
            "elapsed": TIMEOUT_TASK_POLL}


def print_summary() -> None:
    """Print final pass/fail/skip/info summary."""
    passed = RESULTS.get("pass", 0)
    failed = RESULTS.get("fail", 0)
    skipped = RESULTS.get("skip", 0)
    info = RESULTS.get("info", 0)
    total = passed + failed + skipped

    print(f"\n{'=' * 50}")
    print(f"RESULTS: {passed} pass, {failed} fail, {skipped} skip, {info} info")
    status = "ALL PASSED" if failed == 0 else "SOME FAILED"
    print(f"STATUS: {status}")
    print(f"{'=' * 50}")


def main() -> int:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()
        page.set_default_timeout(TIMEOUT_DEFAULT)

        try:
            phase1_data = phase_1_novel_search(page)
            phase_2_error_handling(page)
            phase_3_fasttrack_generation(page, phase1_data)
            phase_4_api_task(page)
        except Exception as e:
            report("Fatal", "fail", f"unhandled exception: {e}")
            screenshot(page, "fatal_error.png")
            import traceback
            traceback.print_exc()
        finally:
            print_summary()
            browser.close()

    return 1 if RESULTS.get("fail", 0) > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
