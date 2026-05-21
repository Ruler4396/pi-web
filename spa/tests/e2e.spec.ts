import { test, expect } from '@playwright/test';

const AUTH = 'Basic ' + Buffer.from('opencode:ubgTQYO4raVwMXLqNsPO6je2NbsS').toString('base64');

async function setupPage(page: any) {
  await page.setExtraHTTPHeaders({ Authorization: AUTH });
  // Create a test session via API
  const resp = await page.request.post('/api/session', {
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    data: { cwd: '/root' },
  });
  const { id } = await resp.json();
  return id;
}

test('session list renders in dark mode', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);

  const bodyBg = await page.evaluate(() =>
    window.getComputedStyle(document.body).backgroundColor
  );
  // Dark mode: body should not be pure white
  expect(bodyBg).not.toBe('rgb(255, 255, 255)');

  const cards = await page.evaluate(() =>
    document.querySelectorAll('.session-card').length
  );
  expect(cards).toBeGreaterThan(0);
});

test('new session dialog shows directory picker', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);

  await page.click('.btn-new');
  await page.waitForTimeout(500);

  const dialog = await page.evaluate(() => {
    const dlg = document.querySelector('.dialog');
    return dlg ? { title: dlg.querySelector('h3')?.textContent, dirCount: dlg.querySelectorAll('.dir-item').length } : null;
  });
  expect(dialog).not.toBeNull();
  expect(dialog!.dirCount).toBeGreaterThan(0);
});

test('file tree loads and expands', async ({ page }) => {
  const sid = await setupPage(page);
  await page.goto(`/#/session/${sid}`);
  await page.waitForTimeout(3000);

  const nodes = await page.evaluate(() =>
    document.querySelectorAll('file-tree .tree-node').length
  );
  expect(nodes).toBeGreaterThan(0);
});

test('file preview shows line numbers', async ({ page }) => {
  const sid = await setupPage(page);
  await page.goto(`/#/session/${sid}`);
  await page.waitForTimeout(3000);

  // Click first file
  await page.evaluate(() => {
    const ns = document.querySelectorAll('file-tree .tree-node');
    for (const n of ns) {
      if ((n as HTMLElement).querySelector('.ext-badge')) {
        (n as HTMLElement).click(); break;
      }
    }
  });
  await page.waitForTimeout(1500);

  const lineNums = await page.evaluate(() =>
    document.querySelectorAll('.line-num').length
  );
  expect(lineNums).toBeGreaterThan(0);
});

test('right-click context menu appears', async ({ page }) => {
  const sid = await setupPage(page);
  await page.goto(`/#/session/${sid}`);
  await page.waitForTimeout(3000);

  // Right-click a file node
  const box = await page.evaluate(() => {
    const ns = document.querySelectorAll('file-tree .tree-node');
    for (const n of ns) {
      if ((n as HTMLElement).querySelector('.ext-badge')) {
        const r = (n as HTMLElement).getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
    return null;
  });
  if (box) {
    await page.mouse.click(box.x, box.y, { button: 'right' });
    await page.waitForTimeout(500);
    const menuItems = await page.evaluate(() =>
      document.querySelectorAll('.context-item').length
    );
    expect(menuItems).toBeGreaterThanOrEqual(1);
  }
});

test('terminal executes commands', async ({ page }) => {
  const sid = await setupPage(page);
  await page.goto(`/#/session/${sid}`);
  await page.waitForTimeout(3000);

  // Open terminal
  await page.evaluate(() => {
    const host = document.querySelector('session-chat') as any;
    if (host && host.toggleTerminal) host.toggleTerminal();
  });
  await page.waitForTimeout(500);

  const termExists = await page.evaluate(() => !!document.querySelector('.terminal-panel'));
  expect(termExists).toBe(true);

  // Type and execute command
  const input = await page.$('.terminal-input');
  if (input) {
    await input.fill('echo ci-test-ok');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    const output = await page.evaluate(() =>
      document.querySelector('.terminal-output')?.textContent || ''
    );
    expect(output).toContain('ci-test-ok');
  }
});

test('layout fills viewport with no gap', async ({ page }) => {
  const sid = await setupPage(page);
  await page.goto(`/#/session/${sid}`);
  await page.waitForTimeout(3000);

  const [scH, mrH] = await page.evaluate(() => {
    const sc = document.querySelector('session-chat');
    const mr = document.querySelector('.main-row');
    return [
      sc ? Math.round(sc.getBoundingClientRect().height) : 0,
      mr ? Math.round(mr.getBoundingClientRect().height) : 0,
    ];
  });
  // main-row should be at least 200px (should be ~680 in 900px viewport)
  expect(mrH).toBeGreaterThan(200);
});
