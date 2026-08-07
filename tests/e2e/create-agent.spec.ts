import { expect, test, type Page } from '@playwright/test';

/**
 * The whole point of the product: you type a domain that has no desk, and one
 * gets built for it.
 *
 * These run with no provider key, so the spec comes from the deterministic
 * generator. Everything else — the route, the store write, the tool loop, the
 * retrieval scope — is the production path.
 *
 * Every agent created here is deleted afterwards. The store is shared with the
 * rest of the suite, and a test that leaves a desk behind changes what the
 * other specs see in the rail.
 */

const created: string[] = [];

/** Unique per run, so a rerun against a warm server cannot collide. */
function unique(word: string): string {
  return `${word}${Date.now().toString(36).slice(-5)}`;
}

async function create(page: Page, description: string): Promise<string> {
  await page.goto('/');
  await page.getByTestId('dispatch-input').fill(description);
  await page.getByTestId('create-tile').click();

  // Generation plus an embedding write, then a navigation off the root.
  await page.waitForURL((url) => url.pathname.length > 1, { timeout: 30_000 });

  const slug = new URL(page.url()).pathname.slice(1);
  created.push(slug);
  return slug;
}

test.afterAll(async ({ request }) => {
  for (const slug of created.splice(0)) {
    await request.delete(`/api/agents/${slug}`).catch(() => undefined);
  }
});

test('builds a desk for a domain that has none, and opens it', async ({ page }) => {
  const noun = unique('orchid');
  const slug = await create(page, `track my ${noun} plants and when I water them`);

  expect(slug).toContain(noun);

  // A real desk, not a placeholder: its own header and its own transcript.
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(noun, 'i') })).toBeVisible();
  await expect(page.getByTestId('transcript')).toBeVisible();
});

test('the created agent remembers something and reads it back', async ({ page }) => {
  await create(page, `track the wine in my ${unique('cellar')} and what I thought of each bottle`);

  const composer = page.getByLabel('Message the agent');
  const transcript = page.getByTestId('transcript');

  await composer.fill('remember the Barolo was corked');
  await page.getByRole('button', { name: 'Send message' }).click();

  const written = transcript.locator('[data-testid="tool-call"][data-tool="remember"]');
  await expect(written).toBeVisible();
  await expect(written).toHaveAttribute('data-state', 'output-available');
  // Title and body carry the same sentence here, so the match is not unique.
  await expect(written.getByText('the Barolo was corked').first()).toBeVisible();

  await composer.fill('what have I recorded?');
  await page.getByRole('button', { name: 'Send message' }).click();

  // The read has to find what the write stored. That loop is the feature.
  const read = transcript.locator('[data-testid="tool-call"][data-tool="recall"]');
  await expect(read).toBeVisible();
  await expect(read.getByText('the Barolo was corked').first()).toBeVisible();
});

test('a created desk joins the rail and the routing vocabulary', async ({ page, isMobile }) => {
  const noun = unique('kiln');
  const slug = await create(page, `log my ${noun} firings, the temperature and what came out`);

  // The capture verb is stripped: "log my kiln firings" is a kiln desk.
  expect(slug).toContain(noun);

  await page.goto('/');
  // Matched by href, not by label: the generated display name is the model's
  // (or the fallback generator's) wording, not the noun that was typed.
  const nav = page.getByRole('navigation', { name: isMobile ? 'Agent tabs' : 'Agent rail' });
  await expect(nav.locator(`a[href="/${slug}"]`)).toBeVisible();

  // Its generated keywords are live routing vocabulary, not decoration.
  await page.getByTestId('dispatch-input').fill(`what happened in the last ${noun} firing?`);
  await expect(page.getByTestId('dispatch-recommendation')).toHaveAttribute('data-agent', slug);
});

test('a created desk can be deleted; a built-in one has no delete at all', async ({ page }) => {
  const slug = await create(page, `track the birds in my ${unique('aviary')} and what they eat`);

  await page.goto('/');
  const tile = page.locator(`[data-testid="agent-tile"][data-agent="${slug}"]`);
  await expect(tile).toBeVisible();

  // The four coded desks are not rows, so they are not deletable.
  await expect(
    page.locator('[data-testid="agent-tile"][data-agent="fitness"] ~ [data-testid="delete-agent"]'),
  ).toHaveCount(0);

  await tile.locator('xpath=..').getByTestId('delete-agent').click();
  await expect(tile).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator(`a[href="/${slug}"]`)).toHaveCount(0);
});

test('an id that was never created 404s rather than rendering an empty desk', async ({ page }) => {
  const response = await page.goto('/not-a-real-agent');
  expect(response?.status()).toBe(404);
});
