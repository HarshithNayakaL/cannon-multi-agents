import { expect, test } from '@playwright/test';

test('the root path is the dispatch screen, not a desk', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'What do you need?' })).toBeVisible();
  // Every desk is on screen from the start — that is the point of the screen.
  await expect(page.getByTestId('agent-tile')).toHaveCount(4);
});

test('health reports which backends are live', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { capabilities: Record<string, string> };
  expect(body.capabilities.inference).toBe('simulated');
  expect(body.capabilities.storage).toBe('memory');
});
