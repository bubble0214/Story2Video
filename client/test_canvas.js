const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[CONSOLE ERROR] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(`[PAGE ERROR] ${err.message}`);
  });

  try {
    // Step 1: Navigate to the app
    console.log('=== Step 1: Navigate to http://localhost:3003 ===');
    await page.goto('http://localhost:3003', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'canvas_test_01_home.png' });
    console.log('Screenshot: canvas_test_01_home.png');

    // Check if we're on login page
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    // Step 2: Check login - look for the login page
    const loginEmailInput = page.locator('input[type="email"]');
    const loginPasswordInput = page.locator('input[type="password"]');
    const loginButton = page.locator('button[type="submit"]');

    if (await loginEmailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('=== Step 2: Login page found, logging in ===');
      await loginEmailInput.fill('test@example.com');
      await loginPasswordInput.fill('password123');
      await loginButton.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'canvas_test_02_after_login.png' });
      console.log('Screenshot: canvas_test_02_after_login.png');
    } else {
      console.log('No login page detected, already logged in or no auth required');
    }

    // Step 3: Navigate to canvas page
    console.log('=== Step 3: Navigating to /canvas ===');
    await page.goto('http://localhost:3003/canvas', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'canvas_test_03_canvas_page.png' });
    console.log('Screenshot: canvas_test_03_canvas_page.png');

    // Check if we need to authenticate first
    const canvasContent = await page.locator('body').textContent();
    if (canvasContent.includes('Please login')) {
      console.log('Need to login first via the UI');
      // Go to login
      await page.goto('http://localhost:3003/auth/login', { waitUntil: 'networkidle' });
      const emailInput = page.locator('input[type="email"]');
      await emailInput.fill('test@example.com');
      const passwordInput = page.locator('input[type="password"]');
      await passwordInput.fill('password123');
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(3000);
      // Try canvas again
      await page.goto('http://localhost:3003/canvas', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'canvas_test_03b_canvas_after_login.png' });
    }

    // Step 4: Add a character node - find the left panel and click 角色 button
    console.log('=== Step 4: Adding a character node ===');
    // The left panel has buttons with node types - look for "角色" button
    const characterButton = page.locator('button:has-text("角色")').first();
    if (await characterButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await characterButton.click();
      console.log('Clicked character button');
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'canvas_test_04_after_add_character.png' });
      console.log('Screenshot: canvas_test_04_after_add_character.png');
    } else {
      console.log('Could not find character button');
    }

    // Step 5: Click the character node on the canvas to select it
    console.log('=== Step 5: Select character node on canvas ===');
    // Look for the character node in the ReactFlow canvas area
    const characterNode = page.locator('.react-flow__node-character').first();
    if (await characterNode.isVisible({ timeout: 3000 }).catch(() => false)) {
      await characterNode.click();
      console.log('Clicked character node');
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'canvas_test_05_selected_character.png' });
      console.log('Screenshot: canvas_test_05_selected_character.png');
    } else {
      console.log('Could not find character node on canvas');
      // Try clicking on the canvas area directly to deselect and retry
      await page.mouse.click(400, 400);
      await page.waitForTimeout(500);
      // Try again - maybe the node was created at a different position
      const allNodes = page.locator('.react-flow__node');
      const count = await allNodes.count();
      console.log(`Found ${count} nodes on canvas`);
      if (count > 0) {
        await allNodes.first().click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'canvas_test_05b_clicked_first_node.png' });
      }
    }

    // Step 6: Take full screenshot of the right panel (NodePanel)
    console.log('=== Step 6: Screenshot right panel ===');
    // The NodePanel is a div with class containing border-l
    const nodePanel = page.locator('div.border-l').filter({ has: page.locator('button:has-text("删除节点")') });
    if (await nodePanel.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nodePanel.screenshot({ path: 'canvas_test_06_right_panel.png' });
      console.log('Screenshot: canvas_test_06_right_panel.png');

      // Get text content of the panel for analysis
      const panelText = await nodePanel.textContent();
      console.log('=== RIGHT PANEL CONTENT ===');
      console.log(panelText);
    } else {
      // Try to find the right-side panel more broadly
      const rightPanel = page.locator('.react-flow__panel.right, .w-64.border-l, .w-64').last();
      if (await rightPanel.isVisible({ timeout: 2000 }).catch(() => false)) {
        await page.screenshot({ path: 'canvas_test_06_alt_right_panel.png' });
        const panelText = await rightPanel.textContent();
        console.log('=== ALTERNATIVE RIGHT PANEL CONTENT ===');
        console.log(panelText);
      } else {
        console.log('Could not find right panel');
        // Take full page screenshot
        await page.screenshot({ path: 'canvas_test_06_full_page.png' });
      }
    }

    // Take an overall screenshot
    await page.screenshot({ path: 'canvas_test_07_final.png' });
    console.log('Screenshot: canvas_test_07_final.png');

    // Report console errors
    console.log('\n=== CONSOLE ERRORS ===');
    if (consoleErrors.length === 0) {
      console.log('No console errors found.');
    } else {
      consoleErrors.forEach((err) => console.log(err));
    }

  } catch (err) {
    console.error('Test failed:', err.message);
    await page.screenshot({ path: 'canvas_test_error.png' }).catch(() => {});
  } finally {
    await browser.close();
  }
})();
