import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The three looks (light, dark, blue), the library layouts, search from the library icon, and the Activity tab.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const SAMPLE = '# Field notes\n\nThe first paragraph explains the idea. It has two sentences.\n\n## Part two\n\nA second section follows here with more words to read aloud.';
const LOOKS = ['Light', 'Dark', 'Blue'] as const;

async function addSample(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add a document' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'sample.md', mimeType: 'text/markdown', buffer: Buffer.from(SAMPLE) });
  await expect(page.getByText('We found')).toBeVisible();
  await page.getByRole('button', { name: 'Add to library' }).click();
  await page.getByRole('button', { name: 'Back to library' }).click();
}
async function pickLook(page: Page, look: (typeof LOOKS)[number]) {
  await page.getByRole('button', { name: 'You', exact: true }).last().click();
  await page.getByRole('radio', { name: look }).click(); // the setting is saved first, so the page follows a moment later
  await expect(page.locator('html')).toHaveAttribute('data-look', look.toLowerCase());
}
const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);

test('the tabs are Library, Wells, Activity and You, with no Search tab', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' }).last();
  await expect(nav.getByRole('button')).toHaveText(['Library', 'Wells', 'Activity', 'You']);
});

test('search opens from the icon on the library screen and closes back to it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByLabel('Search your library')).toBeFocused();
  await page.getByRole('button', { name: 'Close search' }).click();
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
});

test('the library can be shown as a shelf, a grid or a list, and the choice is kept', async ({ page }) => {
  await addSample(page);
  await expect(page.locator('ul.tiles.shelf')).toBeVisible();
  await page.getByRole('button', { name: 'Grid view' }).click();
  await expect(page.locator('ul.tiles.grid')).toBeVisible();
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(page.locator('ul.list-rows')).toBeVisible();
  await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('ul.list-rows')).toBeVisible();
  await page.getByRole('button', { name: 'Shelf view' }).click();
  await expect(page.locator('ul.tiles.shelf')).toBeVisible();
});

test('the look can be switched between light, dark and blue', async ({ page }) => {
  await page.goto('/');
  for (const look of LOOKS) {
    await pickLook(page, look);
    await expect(page.locator('html')).toHaveAttribute('data-theme', look.toLowerCase());
  }
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-look', 'blue'); // the choice is kept
});

test('Activity shows the streak, the week and the goal', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Activity' }).last().click();
  await expect(page.getByRole('heading', { name: 'day streak' })).toBeVisible();
  await expect(page.getByLabel('This week')).toBeVisible();
  await page.getByLabel('Days to listen each week').selectOption('3');
  await expect(page.getByText('0 of 3 days so far.')).toBeVisible();
});

for (const look of LOOKS) {
  test(`no detectable accessibility problems in the ${look} look`, async ({ page }) => {
    await addSample(page);
    await pickLook(page, look);
    expect(await axe(page), 'profile').toEqual([]);
    await page.getByRole('button', { name: 'Activity' }).last().click();
    expect(await axe(page), 'activity').toEqual([]);
    await page.getByRole('button', { name: 'Library' }).last().click();
    for (const layout of ['Shelf view', 'Grid view', 'List view']) {
      await page.getByRole('button', { name: layout }).click();
      expect(await axe(page), `library ${layout}`).toEqual([]);
    }
    await page.getByText('Field notes').first().click();
    await expect(page.getByRole('region', { name: 'Player' })).toBeVisible();
    expect(await axe(page), 'reader').toEqual([]);
  });
}
