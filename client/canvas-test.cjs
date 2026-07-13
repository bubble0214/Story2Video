const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:3003';
const TEST_EMAIL = `test_${Date.now()}@example.com`;
const TEST_PASSWORD = 'test123456';

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

  console.log('=== Step 1: Navigate to login page ===');
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'canvas_test_01_login.png' });

  console.log('=== Step 2: Register a new user ===');
  await page.click('a[href="/auth/register"]');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'canvas_test_02_register.png' });

  // Fill in registration form
  await page.fill('input[type="email"]', TEST_EMAIL);
  const passwordInputs = page.locator('input[type="password"]');
  await passwordInputs.nth(0).fill(TEST_PASSWORD);
  await passwordInputs.nth(1).fill(TEST_PASSWORD);
  await page.screenshot({ path: 'canvas_test_03_register_filled.png' });

  // Submit registration form
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'canvas_test_04_after_register.png' });

  // Check auth state in localStorage
  const authState = await page.evaluate(() => {
    const raw = localStorage.getItem('auth-storage');
    if (raw) {
      try { return JSON.parse(raw); } catch { return raw; }
    }
    return null;
  });
  console.log('Auth state from localStorage:', JSON.stringify(authState));

  const currentUrl = page.url();
  console.log('Current URL after register:', currentUrl);

  // If not logged in, try login via API directly
  if (!authState || !authState.state || !authState.state.isAuthenticated) {
    console.log('=== Auth not set, trying API login directly ===');
    const apiResult = await page.evaluate(async (email, password) => {
      try {
        const res = await fetch('http://localhost:8005/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        return { ok: res.ok, data };
      } catch (e) {
        return { error: e.message };
      }
    }, TEST_EMAIL, TEST_PASSWORD);
    console.log('API login result:', JSON.stringify(apiResult));

    // If login failed, try registering via API directly
    if (!apiResult.ok) {
      console.log('=== Trying API register directly ===');
      const regResult = await page.evaluate(async (email, password) => {
        try {
          const res = await fetch('http://localhost:8005/api/v1/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          const data = await res.json();
          return { ok: res.ok, data };
        } catch (e) {
          return { error: e.message };
        }
      }, TEST_EMAIL, TEST_PASSWORD);
      console.log('API register result:', JSON.stringify(regResult));

      if (regResult.ok && regResult.data.access_token) {
        // Set the auth state in localStorage
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
        }, regResult.data);
        console.log('Auth state injected into localStorage');
      }
    } else if (apiResult.ok && apiResult.data.access_token) {
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
      console.log('Auth state injected into localStorage');
    }

    // Verify
    const check = await page.evaluate(() => {
      const raw = localStorage.getItem('auth-storage');
      if (raw) {
        try { return JSON.parse(raw); } catch { return raw; }
      }
      return null;
    });
    console.log('Auth state after injection:', JSON.stringify(check));
  }

  console.log('=== Step 3: Navigate to Canvas ===');
  await page.goto(`${BASE}/canvas`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'canvas_test_05_canvas_page.png' });

  // Check what text is visible on the canvas page
  const pageText = await page.locator('body').innerText();
  console.log('Canvas page text (first 500 chars):', pageText.substring(0, 500));

  // Check for the unauthenticated message
  const needsLogin = pageText.includes('Please login');
  console.log('Shows "Please login"?:', needsLogin);

  if (needsLogin) {
    console.log('Still showing "Please login". Checking auth store state...');
    const authCheck = await page.evaluate(() => {
      const raw = localStorage.getItem('auth-storage');
      if (raw) {
        try { return JSON.parse(raw); } catch { return raw; }
      }
      return 'NOT_FOUND';
    });
    console.log('Auth state on canvas page:', JSON.stringify(authCheck));

    // Let's try injecting the auth state BEFORE navigating
    console.log('=== Re-injecting auth state and reloading ===');
    await page.evaluate(() => {
      const raw = localStorage.getItem('auth-storage');
      if (raw) {
        console.log('Found auth-storage before reload:', raw);
      }
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'canvas_test_05c_reload.png' });
    const pageText2 = await page.locator('body').innerText();
    console.log('After reload page text (first 500 chars):', pageText2.substring(0, 500));
  }

  // Check what buttons exist
  const allButtons = await page.locator('button').allInnerTexts();
  console.log('All button texts:', allButtons);

  // Try clicking the 角色 button in the left panel (NOT the tab button)
  // The left panel is in a div.w-48.border-r, look inside it for the button
  // Use the section heading "添加节点" to find the right area
  const addNodeSection = page.locator('div.w-48.border-r');
  const charBtn = addNodeSection.getByRole('button', { name: /角色/i });
  const charBtnCount = await charBtn.count();
  console.log('Character button count (in left panel):', charBtnCount);

  if (charBtnCount > 0) {
    await charBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'canvas_test_06_character_added.png' });

    // Check the canvas store to see if the node was added
    const storeCheck = await page.evaluate(() => {
      try {
        // Check if Zustand store has nodes
        const canvasStoreRaw = localStorage.getItem('canvas-storage');
        const authStoreRaw = localStorage.getItem('auth-storage');
        return {
          canvasStore: canvasStoreRaw ? JSON.parse(canvasStoreRaw) : 'NOT_FOUND',
          authStore: authStoreRaw ? JSON.parse(authStoreRaw).state.isAuthenticated : 'NOT_FOUND',
        };
      } catch (e) {
        return { error: e.message };
      }
    });
    console.log('Store check after addNode:', JSON.stringify(storeCheck));

    console.log('=== Step 5: Click the character node to select it ===');
    const nodeCount = await page.locator('.react-flow__node').count();
    console.log('React Flow nodes found:', nodeCount);

    if (nodeCount > 0) {
      await page.locator('.react-flow__node').first().click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'canvas_test_07_node_selected.png' });

      console.log('=== Step 6: Screenshot the right panel (NodePanel) ===');
      // NodePanel has w-64 and border-l classes
      const rightPanelSelectors = [
        '.w-64.border-l',
        'div.w-64',
        'div.border-l',
      ];
      let rightPanel = null;
      for (const sel of rightPanelSelectors) {
        const el = page.locator(sel).last();
        const c = await el.count();
        if (c > 0) { rightPanel = el; break; }
      }
      if (rightPanel) {
        await rightPanel.screenshot({ path: 'canvas_test_08_right_panel.png' });
        console.log('Right panel screenshot saved');

        // Extract text content from the right panel to verify PromptEditor
        const panelText = await rightPanel.innerText();
        console.log('=== RIGHT PANEL TEXT CONTENT ===');
        console.log(panelText);
        console.log('=== END RIGHT PANEL TEXT ===');

        // Check for PromptEditor specific elements
        const promptEditorSection = page.locator('text=提示词编辑器');
        const promptEditorCount = await promptEditorSection.count();
        console.log('PromptEditor section header count:', promptEditorCount);

        // Check for PromptEditor components
        const promptTextarea = page.locator('textarea[placeholder="输入角色生图提示词..."]');
        const promptTextareaCount = await promptTextarea.count();
        console.log('Prompt textarea count:', promptTextareaCount);

        const styleBtn = page.locator('button', { hasText: '风格' });
        const styleBtnCount = await styleBtn.count();
        console.log('Style button count:', styleBtnCount);

        const optimizeBtn = page.locator('button', { hasText: '优化' });
        const optimizeBtnCount = await optimizeBtn.count();
        console.log('Optimize button count:', optimizeBtnCount);

        const modelSelect = page.locator('text=模型');
        const modelSelectCount = await modelSelect.count();
        console.log('Model select count:', modelSelectCount);
      } else {
        console.log('Could not find right panel');
      }

      await page.screenshot({ path: 'canvas_test_09_full_canvas.png' });
    } else {
      console.log('No React Flow nodes found after clicking button');
      await page.screenshot({ path: 'canvas_test_06_no_nodes.png' });
    }
  } else {
    console.log('Character button not found!');
    await page.screenshot({ path: 'canvas_test_06_no_char_btn.png' });
  }

  console.log('=== Console Errors ===');
  if (consoleErrors.length > 0) {
    console.log(JSON.stringify(consoleErrors, null, 2));
  } else {
    console.log('No console errors found.');
  }

  await browser.close();
  console.log('=== Done ===');
})();
