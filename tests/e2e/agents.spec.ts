import { expect, test, type Page } from '@playwright/test';

async function visit(page: Page, destination: string) {
  await page.goto(destination);
}

/** The inspector documents the same tool names, so assertions stay in the transcript. */
function transcript(page: Page) {
  return page.getByTestId('transcript');
}

function toolCall(page: Page, name: string) {
  return transcript(page).locator(`[data-testid="tool-call"][data-tool="${name}"]`);
}

test.describe('fitness agent', () => {
  test('logs a set through a tool call and renders it as a data card', async ({ page }) => {
    await visit(page, '/fitness');

    await page.getByLabel('Message the agent').fill('Log today: bench press 4x8 @ 72.5kg RPE 8');
    await page.getByRole('button', { name: 'Send message' }).click();

    // The tool call itself is a visible event in the transcript.
    const call = toolCall(page, 'log_workout');
    await expect(call).toBeVisible();
    await expect(call).toHaveAttribute('data-state', 'output-available');

    // …and its result is rendered as real data, not pasted JSON.
    await expect(call.getByRole('heading', { name: 'Bench Press' })).toBeVisible();
    await expect(call.getByText('4×8')).toBeVisible();
    await expect(call.getByText('72.5')).toBeVisible();
    await expect(call.getByRole('meter', { name: /perceived exertion/i })).toBeVisible();
  });

  test('offers starter prompts on first run and sends one on click', async ({ page }) => {
    await visit(page, '/fitness');

    const suggestion = transcript(page).getByRole('button', { name: /volume trend on bench/i });
    await expect(suggestion).toBeVisible();
    await suggestion.click();

    const call = toolCall(page, 'get_progress_summary');
    await expect(call).toBeVisible();
    await expect(call.getByText('Volume trend')).toBeVisible();
  });
});

test.describe('work agent', () => {
  test('reads the board and flags what is slipping', async ({ page }) => {
    await visit(page, '/work');
    // Short name on a phone, full title from `sm` up.
    await expect(page.getByRole('heading', { level: 1, name: /^Work/ })).toBeVisible();

    await page.getByLabel('Message the agent').fill("What's slipping this week?");
    await page.getByRole('button', { name: 'Send message' }).click();

    const call = toolCall(page, 'list_tasks');
    await expect(call).toBeVisible();
    await expect(call.getByRole('heading', { name: 'Board' })).toBeVisible();
    await expect(call.getByText(/slipping/i)).toBeVisible();
  });

  test('captures a task', async ({ page }) => {
    await visit(page, '/work');

    await page
      .getByLabel('Message the agent')
      .fill('Add task: record the Cannon walkthrough, high priority');
    await page.getByRole('button', { name: 'Send message' }).click();

    const call = toolCall(page, 'create_task');
    await expect(call).toBeVisible();
    await expect(call.getByText('record the Cannon walkthrough')).toBeVisible();
  });
});

test.describe('finance agent', () => {
  test('captures a spend and renders it as a data card', async ({ page }) => {
    await visit(page, '/finance');

    await page.getByLabel('Message the agent').fill('Spent 840 at BigBasket on groceries');
    await page.getByRole('button', { name: 'Send message' }).click();

    const call = toolCall(page, 'log_expense');
    await expect(call).toBeVisible();
    await expect(call).toHaveAttribute('data-state', 'output-available');
    await expect(call.getByRole('heading', { name: 'BigBasket' })).toBeVisible();
    await expect(call.getByText('food')).toBeVisible();
  });

  test('totals a window and breaks it down by category', async ({ page }) => {
    await visit(page, '/finance');

    await page.getByLabel('Message the agent').fill("What's my spend over the last 30 days?");
    await page.getByRole('button', { name: 'Send message' }).click();

    const call = toolCall(page, 'get_spending_summary');
    await expect(call).toBeVisible();
    await expect(call.getByRole('heading', { name: 'Spending' })).toBeVisible();
    await expect(call.getByText('Per day')).toBeVisible();
  });
});

test.describe('learning agent', () => {
  test('reads the queue', async ({ page }) => {
    await visit(page, '/learning');

    await page.getByLabel('Message the agent').fill("What's still queued?");
    await page.getByRole('button', { name: 'Send message' }).click();

    const call = toolCall(page, 'list_reading');
    await expect(call).toBeVisible();
    await expect(call.getByRole('heading', { name: 'Queue' })).toBeVisible();
    // The stat tile, not the several rows that also read "queued".
    await expect(call.getByText('Queued', { exact: true })).toBeVisible();
  });

  test('queues something new', async ({ page }) => {
    await visit(page, '/learning');

    await page.getByLabel('Message the agent').fill('Add the RAG survey paper to my queue');
    await page.getByRole('button', { name: 'Send message' }).click();

    const call = toolCall(page, 'add_reading');
    await expect(call).toBeVisible();
    await expect(call.getByText('RAG survey paper')).toBeVisible();
  });
});

// Retrieval is scoped inside the store query; this is the visible half of the
// same guarantee — nothing one desk logged turns up on another.
test('every desk keeps its own transcript', async ({ page }) => {
  await visit(page, '/fitness');
  await page.getByLabel('Message the agent').fill('bench press 4x8 @ 70kg RPE 7');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(toolCall(page, 'log_workout')).toBeVisible();

  for (const desk of ['/work', '/finance', '/learning']) {
    await page.goto(desk);
    await expect(transcript(page)).toBeVisible();
    await expect(transcript(page).locator('[data-testid="tool-call"]')).toHaveCount(0);
  }
});
