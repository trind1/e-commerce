import { expect, test } from '@playwright/test';

test('renders the shopping experience', async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/session') {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required' } }),
      });
      return;
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 }),
    });
  });

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Find your next favorite' })).toBeVisible();
});
