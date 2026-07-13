const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:3003';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Collect console logs
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({ text: msg.text(), location: msg.location() });
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push({ text: err.message, stack: err.stack });
  });

  // ── STEP 1: Login ──
  console.log('=== Step 1: Login with admin@example.com / admin123 ===');
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'canvas_node_test_01_login.png' });

  // Fill login form
  await page.fill('input[type="email"]', 'admin@example.com');
  const passwordInputs = page.locator('input[type="password"]');
  await passwordInputs.nth(0).fill('admin123');
  await page.screenshot({ path: 'canvas_node_test_02_login_filled.png' });

  // Submit login
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'canvas_node_test_03_after_login.png' });
  console.log('Current URL after login:', page.url());

  // ── STEP 2: Navigate to canvas page ──
  console.log('=== Step 2: Navigate to /canvas ===');
  // Check current URL - the app might redirect somewhere after login
  const currentUrl = page.url();
  if (!currentUrl.includes('/canvas')) {
    await page.goto(`${BASE}/canvas`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: 'canvas_node_test_04_canvas_page.png' });
  console.log('Canvas page URL:', page.url());

  // Check authentication state
  const authCheck = await page.evaluate(() => {
    const raw = localStorage.getItem('auth-storage');
    if (raw) {
      try { return JSON.parse(raw); } catch { return raw; }
    }
    return 'NOT_FOUND';
  });
  console.log('Auth state:', JSON.stringify(authCheck).substring(0, 200));

  // Check body text for any login prompts
  const bodyText = await page.locator('body').innerText();
  console.log('Body text preview:', bodyText.substring(0, 400));
  const needsLogin = bodyText.includes('Please login');
  console.log('Needs login?:', needsLogin);

  if (needsLogin) {
    console.log('Still showing Please login. Trying to inject auth token via API...');
    // Try direct API login
    const apiResult = await page.evaluate(async () => {
      try {
        const res = await fetch('http://localhost:8005/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'admin@example.com', password: 'admin123' }),
        });
        const data = await res.json();
        return { ok: res.ok, data };
      } catch (e) {
        return { error: e.message };
      }
    }, {});
    console.log('API login result:', JSON.stringify(apiResult).substring(0, 300));

    if (apiResult.ok && apiResult.data && apiResult.data.access_token) {
      await page.evaluate((result) => {
        const state = {
          state: {
            token: result.access_token,
            refreshToken: result.refresh_token,
            user: null,
            isAuthenticated: true,
          },
          version: 0,
        };
        localStorage.setItem('auth-storage', JSON.stringify(state));
      }, apiResult.data);
      console.log('Auth token injected into localStorage');

      // Reload canvas page
      await page.goto(`${BASE}/canvas`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'canvas_node_test_04b_reload.png' });
      console.log('Canvas page URL after reload:', page.url());
    }
  }

  // ── STEP 3: Add a character node ──
  console.log('=== Step 3: Add character node ===');

  // Wait for canvas to fully load
  await page.waitForTimeout(2000);

  // Check all button texts on the page
  const allButtons = await page.locator('button').allInnerTexts();
  console.log('All button texts:', allButtons.filter(b => b.trim()));

  // Find the "角色" button in the left panel (w-48 border-r div)
  // The left panel has "添加节点" header then buttons for each node type
  // Button has text "角色" and is inside the left panel
  const leftPanel = page.locator('div.w-48.border-r');
  const charButton = leftPanel.locator('button', { hasText: '角色' });
  const charBtnCount = await charButton.count();
  console.log('Character buttons found in left panel:', charBtnCount);

  if (charBtnCount > 0) {
    await charButton.first().click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'canvas_node_test_05_character_added.png' });
    console.log('Character node added!');

    // Verify node was created in store
    const storeState = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('canvas-storage');
        if (raw) {
          const parsed = JSON.parse(raw);
          const nodeCount = parsed.state?.nodes?.length || 0;
          const types = parsed.state?.nodes?.map(n => n.data?.type) || [];
          return { nodeCount, types };
        }
        return 'NOT_FOUND';
      } catch (e) {
        return { error: e.message };
      }
    });
    console.log('Canvas store state:', JSON.stringify(storeState));
  } else {
    // Try broader search for the button
    console.log('Trying broader search for 角色 button...');
    const allCharButtons = page.locator('button:has-text("角色")');
    const count = await allCharButtons.count();
    console.log('All 角色 buttons on page:', count);
    for (let i = 0; i < count; i++) {
      const text = await allCharButtons.nth(i).innerText();
      const visible = await allCharButtons.nth(i).isVisible();
      console.log(`  Button ${i}: text="${text}", visible=${visible}`);
    }
  }

  // ── STEP 4: Click the character node to select it ──
  console.log('=== Step 4: Click character node to select ===');
  await page.waitForTimeout(2000);

  let nodeCount = await page.locator('.react-flow__node').count();
  console.log('React Flow nodes found:', nodeCount);

  if (nodeCount === 0) {
    // Wait and retry
    console.log('No nodes yet, waiting...');
    await page.waitForTimeout(3000);
    nodeCount = await page.locator('.react-flow__node').count();
    console.log('React Flow nodes found (retry):', nodeCount);
  }

  if (nodeCount > 0) {
    // Click on the node to select it
    const nodeEl = page.locator('.react-flow__node').first();
    await nodeEl.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'canvas_node_test_06_node_selected.png' });

    // Check if the node has the selected class
    const hasSelectedClass = await nodeEl.evaluate(el => el.classList.contains('selected'));
    console.log('Node has selected class:', hasSelectedClass);

    // Also try clicking the center of the node more precisely
    if (!hasSelectedClass) {
      console.log('Trying to click node center...');
      const box = await nodeEl.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(1500);
        await page.screenshot({ path: 'canvas_node_test_06b_node_clicked_center.png' });
      }
    }

    // Check if NodePanel (w-64 border-l) appeared
    const rightPanel = page.locator('.w-64.border-l');
    const rightPanelCount = await rightPanel.count();
    console.log('Right panel (NodePanel) found:', rightPanelCount);

    if (rightPanelCount > 0) {
      console.log('=== STEP 5: Get NodePanel full HTML content ===');

      // The first w-64.border-l is the NodePanel (the right-side panel)
      const nodePanel = rightPanel.first();

      // Take a screenshot of the right-side panel only
      const panelBox = await nodePanel.boundingBox();
      console.log('Panel bounding box:', JSON.stringify(panelBox));

      if (panelBox) {
        await page.screenshot({
          path: 'canvas_node_test_07_right_panel_fullpage.png',
          clip: {
            x: panelBox.x,
            y: panelBox.y,
            width: Math.min(panelBox.width, 400),
            height: Math.min(panelBox.height, 2000),
          }
        });
        console.log('Right panel screenshot saved');
      }

      // Get all text content from the right panel
      const panelText = await nodePanel.innerText();
      console.log('=== RIGHT PANEL TEXT CONTENT ===');
      console.log(panelText);
      console.log('=== END RIGHT PANEL TEXT ===');

      // Get the full HTML of the right panel
      const panelHtml = await nodePanel.innerHTML();
      console.log('=== RIGHT PANEL HTML (first 5000 chars) ===');
      console.log(panelHtml.substring(0, 5000));
      console.log('... (truncated)');
      console.log('=== END RIGHT PANEL HTML ===');

      // Scroll down and get more content if needed
      console.log('=== Scrolling down the panel for more content ===');
      await nodePanel.evaluate(el => {
        const scrollContainer = el.closest('.flex-1') || el.querySelector('.flex-1') || el;
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
      });
      await page.waitForTimeout(500);

      const panelTextAfterScroll = await nodePanel.innerText();
      console.log('=== RIGHT PANEL TEXT AFTER SCROLL ===');
      console.log(panelTextAfterScroll);
      console.log('=== END RIGHT PANEL TEXT AFTER SCROLL ===');

      // Take another screenshot after scrolling
      const panelBox2 = await nodePanel.boundingBox();
      if (panelBox2) {
        await page.screenshot({
          path: 'canvas_node_test_08_right_panel_scrolled.png',
          clip: {
            x: panelBox2.x,
            y: panelBox2.y,
            width: Math.min(panelBox2.width, 400),
            height: Math.min(panelBox2.height, 2000),
          }
        });
      }

      // ✅ CHECK FOR SPECIFIC LABELS
      const labelsToCheck = [
        '角色名称', '基础形象', '出现次数', '角色描述',
        '提示词', '生成', '风格', '模型', '比例', '预设', '优化',
        'Prompt', '名称', '图片 URL', '删除节点'
      ];

      console.log('=== LABEL CHECK RESULTS ===');
      for (const label of labelsToCheck) {
        const found = panelText.includes(label) || panelTextAfterScroll.includes(label);
        console.log(`  ${found ? '✓' : '✗'} "${label}": ${found ? 'FOUND' : 'NOT FOUND'}`);
      }

      // Check for input placeholders
      console.log('=== PLACEHOLDER CHECK ===');
      const placeholders = await nodePanel.locator('input, textarea, [placeholder]').evaluateAll(elements => {
        return elements.map(el => {
          const tag = el.tagName.toLowerCase();
          const ph = el.getAttribute('placeholder') || '';
          const type = el.getAttribute('type') || '';
          const val = el.value || '';
          return { tag, type, placeholder: ph, value: val };
        });
      });
      console.log(JSON.stringify(placeholders, null, 2));

      // Check for select elements
      console.log('=== SELECT ELEMENTS ===');
      const selects = await nodePanel.locator('[role="combobox"], select, [data-slot="select-trigger"]').evaluateAll(elements => {
        return elements.map(el => {
          const text = el.textContent?.trim() || '';
          const ph = el.getAttribute('placeholder') || '';
          const ariaLabel = el.getAttribute('aria-label') || '';
          return { text, placeholder: ph, ariaLabel };
        });
      });
      console.log(JSON.stringify(selects, null, 2));

      // Check for button texts inside the panel
      console.log('=== BUTTONS IN RIGHT PANEL ===');
      const panelButtons = await nodePanel.locator('button').allInnerTexts();
      console.log(JSON.stringify(panelButtons.filter(b => b.trim()), null, 2));

    } else {
      console.log('No right panel found. Checking what is visible...');
      const allDivs = await page.locator('div.w-64').allInnerTexts();
      console.log('All w-64 divs:', allDivs);

      // Try to trigger selection via evaluate
      console.log('Trying to set selectedNodeId via store...');
      await page.evaluate(() => {
        // Try finding the zustand store
        const raw = localStorage.getItem('canvas-storage');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.state && parsed.state.nodes && parsed.state.nodes.length > 0) {
            const firstNodeId = parsed.state.nodes[0].id;
            parsed.state.selectedNodeId = firstNodeId;
            localStorage.setItem('canvas-storage', JSON.stringify(parsed));
          }
        }
      });

      // Reload the page to pick up the store change
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'canvas_node_test_09_after_store_inject.png' });

      const panelAfterInject = page.locator('.w-64.border-l');
      const panelAfterCount = await panelAfterInject.count();
      console.log('Right panel after store injection:', panelAfterCount);

      if (panelAfterCount > 0) {
        const pt = await panelAfterInject.first().innerText();
        console.log('Panel text after injection:', pt);
      }
    }
  } else {
    console.log('No React Flow nodes found.');
  }

  // ── SUMMARY ──
  console.log('=== Console Errors ===');
  if (consoleErrors.length > 0) {
    console.log(JSON.stringify(consoleErrors, null, 2));
  } else {
    console.log('No console errors found.');
  }

  await browser.close();
  console.log('=== Test Complete ===');
})();
