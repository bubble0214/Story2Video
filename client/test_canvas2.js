const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    storageState: undefined,
  });
  const page = await context.newPage();

  // Collect console logs
  const consoleLogs = [];
  page.on('console', (msg) => {
    consoleLogs.push(`[${msg.type().toUpperCase()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    consoleLogs.push(`[PAGE_ERROR] ${err.message}`);
  });

  try {
    // Login first
    console.log('=== Logging in ===');
    await page.goto('http://localhost:3003/auth/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    // Fill login form - try common credentials
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');

    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Login form is visible');
      await emailInput.fill('admin@example.com');
      await passwordInput.fill('admin123');
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(3000);
    }

    // Navigate to canvas page
    console.log('=== Navigate to canvas ===');
    await page.goto('http://localhost:3003/canvas', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Wait for any React flow to load
    await page.waitForSelector('.react-flow', { timeout: 10000 }).catch(() => console.log('No react-flow found'));

    // Check the page content
    const bodyText = await page.locator('body').textContent();
    console.log('Page content snippet:', bodyText.substring(0, 500));

    // Check what tabs/buttons are visible
    const allButtons = page.locator('button');
    const buttonCount = await allButtons.count();
    console.log(`Found ${buttonCount} buttons on page`);
    for (let i = 0; i < Math.min(buttonCount, 30); i++) {
      const text = await allButtons.nth(i).textContent();
      const visible = await allButtons.nth(i).isVisible();
      if (text.trim()) {
        console.log(`  Button ${i}: "${text.trim()}" visible=${visible}`);
      }
    }

    // Take screenshot
    await page.screenshot({ path: 'canvas_test_full.png', fullPage: true });
    console.log('Screenshot saved');

  } catch (err) {
    console.error('Error:', err.message);
    await page.screenshot({ path: 'canvas_test_err.png' }).catch(() => {});
  } finally {
    console.log('\n=== ALL CONSOLE OUTPUT ===');
    consoleLogs.forEach(l => console.log(l));
    await browser.close();
  }
})();
