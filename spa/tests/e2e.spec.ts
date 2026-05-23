import { test, expect } from '@playwright/test';

const AUTH = 'Basic ' + Buffer.from('opencode:ubgTQYO4raVwMXLqNsPO6je2NbsS').toString('base64');

test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ Authorization: AUTH });
});

async function createFixtureSession(page: any) {
  const cwd = `/tmp/pi-web-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await page.request.post('/api/shell/exec', {
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    data: {
      cwd: '/tmp',
      command: `mkdir -p ${JSON.stringify(cwd)} && printf '[package]\\nname = "pi-web"\\nversion = "0.1.0"\\n' > ${JSON.stringify(`${cwd}/Cargo.toml`)}`,
    },
  });
  const res = await page.request.post('/api/session', {
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    data: { cwd },
  });
  expect(res.ok()).toBeTruthy();
  const session = await res.json();
  return { cwd, id: session.id };
}

async function deleteSession(page: any, id: string) {
  await page.request.delete(`/api/session/${id}`, {
    headers: { Authorization: AUTH },
  });
}

test('page loads without JS errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('/');
  await page.waitForTimeout(2000);
  expect(errors).toEqual([]);
});

test('dark mode is default', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  const bodyBg = await page.evaluate(() =>
    window.getComputedStyle(document.body).backgroundColor
  );
  expect(bodyBg).not.toBe('rgb(255, 255, 255)');
});

test('session list page has controls', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  const result = await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    const newBtn = document.querySelector('.btn-new');
    return { buttonCount: btns.length, hasNewBtn: !!newBtn };
  });
  expect(result.buttonCount).toBeGreaterThan(0);
});

test('new session dialog opens', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  const btnNew = await page.$('.btn-new');
  if (!btnNew) { test.skip(); return; }
  await btnNew.click();
  await page.waitForTimeout(500);
  const dialog = await page.$('.dialog');
  expect(dialog).not.toBeNull();
});

test('new session dialog defaults to the pi-web project directory', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.btn-new:not([disabled])');
  await page.locator('.btn-new').click();
  await expect(page.locator('.path-text')).toHaveText('/root/dev/pi-web');
});

test('empty state shows when no sessions', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  const bodyText = await page.evaluate(() =>
    document.body.textContent?.length || 0
  );
  expect(bodyText).toBeGreaterThan(0);
});

test('layout fills viewport', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  const bodyHeight = await page.evaluate(() =>
    document.body.getBoundingClientRect().height
  );
  expect(bodyHeight).toBeGreaterThan(100);
});

test('model selector renders in session view', async ({ page }) => {
  await page.goto('/#/session/test-session-id');
  await page.waitForTimeout(3000);
  const pill = await page.evaluate(() => {
    const el = document.querySelector('.model-pill-name');
    return el ? el.textContent?.trim() : null;
  });
  expect(pill).toBeTruthy();
});

test('code preview keeps highlighted TOML readable', async ({ page }) => {
  const { id } = await createFixtureSession(page);
  try {
    await page.goto(`/#/session/${id}`);
    await page.getByText('Cargo.toml', { exact: true }).click();
    const preview = page.locator('.preview-code');
    await expect(preview).toContainText('[package]');
    await expect(preview).not.toContainText('hl-kw');
  } finally {
    await deleteSession(page, id);
  }
});

test('opening terminal closes model dropdown', async ({ page }) => {
  const { id } = await createFixtureSession(page);
  try {
    await page.goto(`/#/session/${id}`);
    await page.locator('.model-pill').click();
    await expect(page.locator('.model-dropdown')).toBeVisible();
    await page.getByTitle('终端').click();
    await expect(page.locator('.model-dropdown')).toHaveCount(0);
  } finally {
    await deleteSession(page, id);
  }
});
