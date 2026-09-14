import { expect, test, type Page } from '@playwright/test';

const browserReady = Boolean(process.env.E2E_DATABASE_URL && process.env.E2E_SESSION_HMAC_SECRET);
const adminReady = Boolean(
  browserReady && process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD,
);
const viewports = [
  { name: 'mobile', width: 360, height: 800 },
  { name: 'tablet', width: 768, height: 900 },
  { name: 'desktop', width: 1280, height: 900 },
] as const;

async function expectNoPageOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
}

for (const viewport of viewports) {
  test(`public shopping shell remains usable at ${viewport.name} width`, async ({ page }) => {
    test.skip(!browserReady, 'Requires an API-backed E2E environment.');
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Find your next favorite' })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
    await expectNoPageOverflow(page);
  });

  test(`Admin management shell remains usable at ${viewport.name} width`, async ({ page }) => {
    test.skip(
      !adminReady,
      'Requires an API-backed E2E environment and provisioned Admin credentials.',
    );
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/login');
    await page.getByLabel('Email address').fill(process.env.E2E_ADMIN_EMAIL ?? '');
    await page.getByLabel('Password').fill(process.env.E2E_ADMIN_PASSWORD ?? '');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();
    await expectNoPageOverflow(page);
  });
}
