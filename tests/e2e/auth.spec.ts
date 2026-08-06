import { expect, test } from '@playwright/test';

test('an unauthenticated visitor is sent to the sign-in gate', async ({ page }) => {
  await page.goto('/fitness');
  await expect(page).toHaveURL(/\/signin/);
  await expect(page.getByRole('button', { name: /enter cannon/i })).toBeVisible();
});

test('the agent API refuses an unauthenticated request', async ({ request }) => {
  const response = await request.post('/api/agents/fitness/chat', {
    data: { messages: [] },
  });
  expect(response.status()).toBe(401);
});

test('health reports which backends are live', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { capabilities: Record<string, string> };
  expect(body.capabilities.inference).toBe('simulated');
  expect(body.capabilities.storage).toBe('memory');
});

test('signing in lands on the fitness desk and signing out closes it again', async ({ page }) => {
  await page.goto('/signin');
  await page.getByLabel('Email').fill('demo@cannon.dev');
  await page.getByRole('button', { name: /enter cannon/i }).click();

  await expect(page).toHaveURL(/\/fitness/);
  await expect(page.getByRole('heading', { level: 1, name: 'Fitness Agent' })).toBeVisible();

  await page
    .getByRole('button', { name: /sign out/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/signin/);
});
