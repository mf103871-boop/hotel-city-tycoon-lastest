import { expect, test } from '@playwright/test';

test('opens the manually running game', async ({ page }) => {
  await page.goto('http://127.0.0.1:5000');
  await expect(page.locator('body')).toBeVisible();
});