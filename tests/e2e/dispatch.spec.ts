import { expect, test, type Page } from '@playwright/test';

function ask(page: Page, text: string) {
  return page.getByTestId('dispatch-input').fill(text);
}

function recommendation(page: Page) {
  return page.getByTestId('dispatch-recommendation');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('recommends a desk as you type and says which words earned it', async ({ page }) => {
  await ask(page, 'spent 840 at BigBasket on groceries');

  await expect(recommendation(page)).toHaveAttribute('data-agent', 'finance');
  await expect(recommendation(page).getByText('Finance Agent')).toBeVisible();
  // Phones show the matched words on one line, wider screens in a detail row.
  await expect(recommendation(page).getByText('spent').filter({ visible: true })).toBeVisible();
});

test('re-routes when the question changes', async ({ page }) => {
  await ask(page, 'bench press 4x8 at 72.5kg');
  await expect(recommendation(page)).toHaveAttribute('data-agent', 'fitness');

  await ask(page, "what's still queued to read?");
  await expect(recommendation(page)).toHaveAttribute('data-agent', 'learning');
});

// The recommendation is a suggestion, not a gate. Overruling it has to win.
test('an explicit pick overrules the recommendation', async ({ page }) => {
  await ask(page, 'bench press 4x8 at 72.5kg');
  await expect(recommendation(page)).toHaveAttribute('data-agent', 'fitness');

  await page.locator('[data-testid="agent-tile"][data-agent="work"]').click();
  await expect(recommendation(page)).toHaveAttribute('data-agent', 'work');
  await expect(recommendation(page).getByText('Your pick')).toBeVisible();
});

test('carries the question over to the desk and sends it on arrival', async ({ page }) => {
  await ask(page, "what's slipping this week?");
  await page.getByRole('button', { name: /open the work agent/i }).click();

  await expect(page).toHaveURL(/\/work\?q=/);

  // The question is not retyped — it is already sent and already answered.
  const call = page.getByTestId('transcript').locator('[data-testid="tool-call"]');
  await expect(call.first()).toBeVisible();
  await expect(call.first()).toHaveAttribute('data-tool', 'list_tasks');
});

test('offers to build a desk when nothing owns the vocabulary', async ({ page }) => {
  await ask(page, 'zzzz qqqq vvvv');
  await expect(page.getByTestId('create-from-recommendation')).toBeVisible();
});

test('states plainly that inference is simulated rather than listing models it cannot reach', async ({
  page,
}) => {
  // Phones say it on the one-line model row, desktop in the models column;
  // whichever is on screen at this width has to say it.
  await expect(page.getByText(/no provider key is set/i).filter({ visible: true })).toBeVisible();
  await expect(page.getByTestId('model-tile')).toHaveCount(0);
});

test('every desk is reachable from the shell', async ({ page, isMobile }) => {
  for (const [name, heading] of [
    ['Fitness', 'Fitness'],
    ['Work', 'Work'],
    ['Finance', 'Finance'],
    ['Learning', 'Learning'],
  ] as const) {
    // The phone bar holds three desks; every desk is in its "All" sheet.
    if (isMobile) {
      await page.getByTestId('tabbar-all').click();
      await page
        .getByRole('dialog', { name: 'All desks' })
        .getByRole('link', { name: new RegExp(`^${name}`) })
        .click();
    } else {
      await page
        .getByRole('navigation', { name: 'Agent rail' })
        .getByRole('link', { name, exact: true })
        .click();
    }
    // The header shows the short name on a phone and the full title above it.
    await expect(
      page.getByRole('heading', { level: 1, name: new RegExp(`^${heading}`) }),
    ).toBeVisible();
  }

  await page
    .getByRole('navigation', { name: isMobile ? 'Agent tabs' : 'Agent rail' })
    .getByRole('link', { name: 'Dispatch', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'What do you need?' })).toBeVisible();
});
