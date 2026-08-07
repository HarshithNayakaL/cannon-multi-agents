import { expect, test, type Page } from '@playwright/test';

async function visitFitness(page: Page) {
  await page.goto('/fitness');
}

async function openInspector(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole('button', { name: /show prompt inspector/i }).click();
  await expect(page.getByRole('heading', { name: 'Prompt Inspector' })).toBeVisible();
}

test('the prompt inspector exposes the live prompt, tools and retrieval sources', async ({
  page,
  isMobile,
}) => {
  await visitFitness(page);
  await openInspector(page, isMobile);

  await expect(page.getByText('log_workout(exercise', { exact: false })).toBeVisible();
  await expect(page.getByText('You are the Fitness Agent', { exact: false })).toBeVisible();
  await expect(page.getByText('workout-log', { exact: false }).first()).toBeVisible();
});

test('the inspector names the provider that answered', async ({ page, isMobile }) => {
  await visitFitness(page);

  await page.getByLabel('Message the agent').fill('How is my bench press progressing?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByTestId('transcript').locator('[data-testid="tool-call"]')).toBeVisible();

  await openInspector(page, isMobile);
  await expect(page.getByText('simulated:simulated-fitness')).toBeVisible();
});

test('layout swaps between the rail and the bottom tab bar', async ({ page, isMobile }) => {
  await visitFitness(page);

  const rail = page.getByRole('navigation', { name: 'Agent rail' });
  const tabBar = page.getByRole('navigation', { name: 'Agent tabs' });

  if (isMobile) {
    await expect(tabBar).toBeVisible();
    await expect(rail).toBeHidden();
  } else {
    await expect(rail).toBeVisible();
    await expect(tabBar).toBeHidden();
  }
});

test('switching desks re-lights the accent', async ({ page }) => {
  await visitFitness(page);

  const accent = () =>
    page.evaluate(() => document.documentElement.style.getPropertyValue('--accent').trim());

  await expect.poll(accent).toBe('#FF9F0A');

  await page.goto('/work');
  await expect(page.getByRole('heading', { level: 1, name: 'Work Agent' })).toBeVisible();
  await expect.poll(accent).toBe('#0A84FF');
});

test('dark is the default theme and the toggle survives a reload', async ({ page }) => {
  await visitFitness(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page
    .getByRole('button', { name: /switch to light theme/i })
    .first()
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('the page never scrolls sideways at any tested width', async ({ page }) => {
  await visitFitness(page);

  for (const width of [375, 768, 1024, 1440, 2200]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(120);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
});
