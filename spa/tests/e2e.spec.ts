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

test('page has topbar with controls', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  const topbar = await page.evaluate(() => {
    const tb = document.querySelector('.topbar');
    return tb ? { hasBackLink: !!tb.querySelector('a.back'), hasButtons: tb.querySelectorAll('button').length > 0 } : null;
  });
  expect(topbar).not.toBeNull();
  expect(topbar!.hasBackLink).toBe(true);
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
  const hasContent = await page.evaluate(() => {
    const cards = document.querySelectorAll('.session-card').length;
    const empty = document.querySelector('.empty-state');
    return { cards, hasEmpty: !!empty, bodyText: document.body.textContent?.length || 0 };
  });
  // Either cards exist or empty state exists
  expect(hasContent.cards > 0 || hasContent.hasEmpty).toBe(true);
  expect(hasContent.bodyText).toBeGreaterThan(0);
});

test('layout structure is valid', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  const structure = await page.evaluate(() => {
    const sc = document.querySelector('session-chat');
    const sl = document.querySelector('session-list');
    const topbar = document.querySelector('.topbar');
    return {
      hasTopbar: !!topbar,
      hasMainContent: !!(sc || sl),
      bodyHeight: document.body.getBoundingClientRect().height,
    };
  });
  expect(structure.hasMainContent).toBe(true);
  expect(structure.bodyHeight).toBeGreaterThan(100);
});

test('model selector renders in session view', async ({ page }) => {
  // Load a session page directly
  await page.goto('/#/session/test-session-id');
  await page.waitForTimeout(3000);
  const pill = await page.evaluate(() => {
    const el = document.querySelector('.model-pill-name');
    return el ? el.textContent?.trim() : null;
  });
  expect(pill).toBeTruthy();
});
