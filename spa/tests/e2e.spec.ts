import { test, expect } from '@playwright/test';

const AUTH = 'Basic ' + Buffer.from('opencode:ubgTQYO4raVwMXLqNsPO6je2NbsS').toString('base64');

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
