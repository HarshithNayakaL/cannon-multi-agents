import { expect, test } from '@playwright/test';

test('the root path redirects straight to the fitness desk', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/fitness/);
  await expect(page.getByRole('heading', { level: 1, name: 'Fitness Agent' })).toBeVisible();
});

test('health reports which backends are live', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { capabilities: Record<string, string> };
  expect(body.capabilities.inference).toBe('simulated');
  expect(body.capabilities.storage).toBe('memory');
});
