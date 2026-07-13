const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[ERROR] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(`[PAGE_ERROR] ${err.message}`);
  });

  try {
    // Step 1: Login
    console.log('=== Step 1: Login ===');
    await page.goto('http://localhost:3003/auth/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.locator('input[type="email"]').fill('admin@example.com');
    await page.locator('input[type="password"]').fill('admin123');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);

    // Step 2: Navigate to canvas
    console.log('=== Step 2: Navigate to Canvas ===');
    await page.goto('http://localhost:3003/canvas', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Wait for ReactFlow to render
    await page.waitForSelector('.react-flow', { timeout: 10000 });
    console.log('ReactFlow rendered');

    // Step 3: Click the left panel "角色" button to add a character node
    // Look for the button in the left panel that says 角色
    console.log('=== Step 3: Add character node ===');
    const leftPanelButtons = page.locator('div.w-48 button:has-text("角色")');
    const leftPanelBtnCount = await leftPanelButtons.count();
    console.log(`Found ${leftPanelBtnCount} left-panel character buttons`);

    // Click the first 角色 button in the left panel
    if (leftPanelBtnCount > 0) {
      await leftPanelButtons.first().click();
      console.log('Clicked 角色 button');
    } else {
      // Try the sidebar or tab bar character button
      const allCharBtns = page.locator('button:has-text("角色")');
      const count = await allCharBtns.count();
      console.log(`All 角色 buttons: ${count}`);
      for (let i = 0; i < count; i++) {
        const text = await allCharBtns.nth(i).textContent();
        const visible = await allCharBtns.nth(i).isVisible();
        console.log(`  Button ${i}: "${text}" visible=${visible}`);
      }
    }
    await page.waitForTimeout(1500);

    // Check if a node was created
    let charNodes = page.locator('.react-flow__node-character');
    let charNodeCount = await charNodes.count();
    console.log(`Character nodes on canvas: ${charNodeCount}`);

    if (charNodeCount === 0) {
      console.log('No character node found, checking all flow nodes...');
      const allFlowNodes = page.locator('.react-flow__node');
      const flowNodeCount = await allFlowNodes.count();
      console.log(`Total flow nodes: ${flowNodeCount}`);

      // Try clicking on different areas and adding a node again
      // Maybe we need to click the tab for 画布 first
      const canvasTab = page.locator('button:has-text("画布")').first();
      console.log('Canvas tab text:', await canvasTab.textContent());
      await canvasTab.click();
      await page.waitForTimeout(500);

      // Try adding again
      const charBtnLeft = page.locator('div.w-48 button:has-text("角色")').first();
      if (await charBtnLeft.isVisible()) {
        await charBtnLeft.click();
        console.log('Clicked 角色 button again after tab switch');
        await page.waitForTimeout(1500);
      }

      charNodes = page.locator('.react-flow__node-character');
      charNodeCount = await charNodes.count();
      console.log(`Character nodes now: ${charNodeCount}`);

      const allFlowNodes2 = page.locator('.react-flow__node');
      const flowNodeCount2 = await allFlowNodes2.count();
      console.log(`Total flow nodes now: ${flowNodeCount2}`);

      // Get node types
      for (let i = 0; i < flowNodeCount2; i++) {
        const className = await allFlowNodes2.nth(i).getAttribute('class');
        console.log(`  Node ${i} class: ${className}`);
      }
    }

    // Step 4: Click the character node to select it
    console.log('=== Step 4: Select character node ===');
    if (charNodeCount > 0) {
      await charNodes.first().click();
      console.log('Clicked character node');
      await page.waitForTimeout(1000);

      // Check if the right panel now shows
      const rightPanel = page.locator('.w-64.border-l');
      const isRightPanelVisible = await rightPanel.isVisible();
      console.log(`Right panel visible: ${isRightPanelVisible}`);

      if (isRightPanelVisible) {
        // Take screenshot of the right panel
        await rightPanel.screenshot({ path: 'canvas_test_node_panel.png' });
        console.log('Screenshot: canvas_test_node_panel.png');

        // Get the full text of the right panel
        const panelText = await rightPanel.textContent();
        console.log('\n=== RIGHT PANEL TEXT CONTENT ===');
        console.log(panelText);

        // Check for specific elements
        const expectedFields = [
          '角色名称',
          '基础形象',
          '出现次数',
          '角色描述',
          '提示词',
          '生成',
          '图片 URL',
          '删除节点',
        ];

        console.log('\n=== FIELD VERIFICATION ===');
        for (const field of expectedFields) {
          const exists = panelText.includes(field);
          console.log(`  ${field}: ${exists ? 'FOUND' : 'MISSING'}`);
        }

        // Check if the toolbar buttons exist
        const toolbarChecks = [
          'atMention', '@',
          'style', '风格',
          'model', '模型',
          'ratio', '比例',
          'preset', '预设',
          'optimize', '优化',
        ];
        console.log('\n=== TOOLBAR VERIFICATION ===');
        for (const item of toolbarChecks) {
          const exists = panelText.includes(item);
          if (exists) console.log(`  "${item}": FOUND`);
        }
      } else {
        console.log('Right panel NOT visible after clicking node');
        // Full page screenshot
        await page.screenshot({ path: 'canvas_test_no_panel.png', fullPage: true });
      }
    } else {
      console.log('No character node to click - adding failed');
    }

    // Take final full page screenshot
    await page.screenshot({ path: 'canvas_test_final.png', fullPage: true });
    console.log('\nFinal screenshot taken');

    // Console errors
    console.log('\n=== CONSOLE ERRORS ===');
    if (consoleErrors.length === 0) {
      console.log('No console errors found.');
    } else {
      consoleErrors.forEach(e => console.log(e));
    }

  } catch (err) {
    console.error('Test FAILED:', err.message);
    await page.screenshot({ path: 'canvas_test_error.png' }).catch(() => {});
  } finally {
    await browser.close();
  }
})();
