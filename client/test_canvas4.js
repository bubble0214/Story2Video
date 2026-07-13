const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  // Collect ALL console messages with full details
  const allMessages = [];
  page.on('console', (msg) => {
    allMessages.push({ type: msg.type(), text: msg.text(), location: msg.location() });
  });
  page.on('pageerror', (err) => {
    allMessages.push({ type: 'pageerror', text: err.message, stack: err.stack });
  });
  page.on('requestfailed', (request) => {
    allMessages.push({ type: 'requestfailed', url: request.url(), failure: request.failure() });
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      allMessages.push({ type: 'badresponse', url: response.url(), status: response.status() });
    }
  });

  try {
    await page.goto('http://localhost:3003/auth/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.locator('input[type="email"]').fill('admin@example.com');
    await page.locator('input[type="password"]').fill('admin123');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);
    await page.goto('http://localhost:3003/canvas', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Add character
    await page.locator('div.w-48 button:has-text("角色")').first().click();
    await page.waitForTimeout(1500);

    // Select node
    await page.locator('.react-flow__node-character').first().click();
    await page.waitForTimeout(1000);

    // Take final screenshot
    await page.screenshot({ path: 'canvas_final_view.png', fullPage: true });

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    console.log('\n=== ALL NETWORK ERRORS (4xx/5xx) ===');
    allMessages
      .filter(m => m.type === 'badresponse' || m.type === 'requestfailed')
      .forEach(m => {
        if (m.type === 'badresponse') console.log(`  ${m.status} ${m.url}`);
        if (m.type === 'requestfailed') console.log(`  FAILED ${m.url}: ${m.failure?.errorText}`);
      });

    console.log('\n=== CONSOLE ERRORS ===');
    allMessages
      .filter(m => m.type === 'error' || m.type === 'pageerror')
      .forEach(m => {
        if (m.type === 'pageerror') console.log(`  PAGE_ERROR: ${m.text}`);
        else console.log(`  CONSOLE_ERROR: ${m.text}`);
      });

    await browser.close();
  }
})();
