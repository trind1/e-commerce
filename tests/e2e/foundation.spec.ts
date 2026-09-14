import { expect, test } from '@playwright/test';

test('renders the shopping experience', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Find your next favorite' })).toBeVisible();
});
