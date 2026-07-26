"""Test: reproduce user's actual flow — AI分析 → 套用模板 → 生成大纲, check title."""
from playwright.sync_api import sync_playwright
import time
import os

BASE_URL = "http://103.233.253.246:3000"
EMAIL = "test@test.com"
PASSWORD = "1qaz2swx"
SCREENSHOT_DIR = os.path.dirname(os.path.abspath(__file__))


def save_screenshot(page, name):
    path = os.path.join(SCREENSHOT_DIR, name)
    page.screenshot(path=path, full_page=True)
    print(f"  截图: {name}")
    return path


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 720})
        page = ctx.new_page()
        page.set_default_timeout(15000)

        # ── Login ──
        page.goto(f"{BASE_URL}/auth/login")
        page.wait_for_load_state("networkidle")
        page.get_by_label("邮箱").fill(EMAIL)
        page.get_by_label("密码").fill(PASSWORD)
        page.locator('button[type="submit"]').click()
        time.sleep(3)
        page.wait_for_load_state("networkidle")

        # ── Novel page ──
        page.goto(f"{BASE_URL}/workflow/novel")
        page.wait_for_load_state("networkidle")
        time.sleep(2)

        # ── Search ──
        kw_input = page.locator('input[placeholder*="例如"]').first
        kw_input.fill("科幻, 时间旅行")
        time.sleep(0.5)
        page.locator('button:has-text("搜索")').first.click()

        deadline = time.time() + 120
        results = False
        while time.time() < deadline:
            page.wait_for_load_state("networkidle")
            cards = page.locator("h3.font-semibold").all()
            if any(c.is_visible() for c in cards):
                print(f"搜索结果: {len(cards)} 个")
                results = True
                break
            time.sleep(2)
        if not results:
            print("搜索失败"); browser.close(); return

        # ── AI分析 ──
        time.sleep(1)
        save_screenshot(page, "title_test_01_search_done.png")
        title1 = page.locator("h1.text-2xl.font-bold").first.inner_text()
        print(f"Step1 - 搜索后标题: \"{title1}\"")

        analyze_btn = page.locator('button:has-text("AI 分析")').first
        if analyze_btn.is_visible():
            analyze_btn.click()
            print("等待AI分析...")
            time.sleep(15)
            page.wait_for_load_state("networkidle")
            save_screenshot(page, "title_test_02_analysis.png")

        # ── 套用模板 ──
        apply_btn = page.locator('button:has-text("生成创作提示")')
        if apply_btn.count() > 0 and apply_btn.is_visible():
            apply_btn.click()
            time.sleep(2)
            print("已套用创作模板")
            save_screenshot(page, "title_test_03_template_applied.png")

            # Check textarea content
            textarea = page.locator("textarea").first
            ta_val = textarea.input_value()
            print(f"模板内容前100字: {ta_val[:100]}")
            print(f"模板首行: {ta_val.split(chr(10))[0]}")
        else:
            print("未找到生成创作提示按钮")
            # Fallback: fill prompt manually
            textarea = page.locator("textarea").first
            textarea.fill("写一部民国穿越题材的言情小说，先输出完整大纲。")
            time.sleep(0.5)

        # ── 生成大纲 ──
        title2 = page.locator("h1.text-2xl.font-bold").first.inner_text()
        print(f"Step2 - 生成大纲前标题: \"{title2}\"")

        gen_btn = page.locator('button:has-text("生成大纲")')
        page.wait_for_timeout(1000)
        if gen_btn.is_disabled():
            print("生成大纲按钮被禁用! 检查原因...")
            save_screenshot(page, "title_test_04_btn_disabled.png")
            browser.close()
            return

        gen_btn.click()
        print("生成大纲中...")

        # ── Wait for result ──
        deadline = time.time() + 300
        while time.time() < deadline:
            time.sleep(3)
            page.wait_for_load_state("networkidle")
            tab = page.locator('button[role="tab"]:has-text("小说大纲")')
            if tab.count() > 0 and tab.get_attribute("data-state") == "active":
                for ota in page.locator("textarea").all():
                    val = ota.input_value()
                    if len(val.strip()) > 50:
                        first_line = val.strip().split("\n")[0]
                        print(f"大纲首行: \"{first_line}\"")
                        time.sleep(1)
                        new_title = page.locator("h1.text-2xl.font-bold").first.inner_text()
                        print(f"最终标题: \"{new_title}\"")
                        if new_title != "未命名":
                            print("=== PASS: 标题已自动更新 ===")
                        else:
                            print("=== FAIL: 标题仍为未命名 ===")
                        save_screenshot(page, "title_test_05_result.png")
                        browser.close()
                        return
            print("  等待...")
        print("超时")
        save_screenshot(page, "title_test_05_timeout.png")
        browser.close()


if __name__ == "__main__":
    main()
