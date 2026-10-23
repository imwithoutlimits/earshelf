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

// ---- Resume, import choices, editing details, and the shelf count ----
async function openDb<T>(page: Page, fn: string, arg?: unknown): Promise<T> {
  return page.evaluate(`(async (arg) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('earshelf'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const all = (st) => new Promise((res) => { const r = db.transaction([st], 'readonly').objectStore(st).getAll(); r.onsuccess = () => res(r.result); });
    const put = (st, v) => new Promise((res) => { const t = db.transaction([st], 'readwrite'); t.objectStore(st).put(v); t.oncomplete = () => res(); });
    const out = await (${fn})({ all, put }, arg);
    db.close();
    return out;
  })(${JSON.stringify(arg ?? null)})`) as Promise<T>;
}

test('Resume starts the book and shows Now playing, without opening the reader first', async ({ page }) => {
  await addSample(page);
  await openDb(page, `async ({ all, put }) => { const [d] = await all('docs'); await put('progress', { docId: d.id, index: 2, total: 10, completed: false, updatedAt: Date.now() }); }`);
  await page.reload();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('dialog', { name: 'Full player' })).toBeVisible();
  await expect(page.getByText('Now playing')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to library' })).toHaveCount(0); // the reader was never opened
});

test('the shelf lists every document, including the one in the Resume card, so the count matches', async ({ page }) => {
  await addSample(page);
  await openDb(page, `async ({ all, put }) => { const [d] = await all('docs'); await put('progress', { docId: d.id, index: 2, total: 10, completed: false, updatedAt: Date.now() }); }`);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  await expect(page.getByLabel(/1 of 5 documents on the free plan/)).toBeVisible();
  await expect(page.locator('ul.tiles li')).toHaveCount(1);
});

test('a section can be skipped on import, and every option can be ticked even when nothing was found', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add a document' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'sample.md', mimeType: 'text/markdown', buffer: Buffer.from(SAMPLE) });
  await expect(page.getByText('We found')).toBeVisible();
  // options with nothing detected are not greyed out
  const tables = page.getByLabel('Tables and their captions');
  await expect(tables).toBeEnabled();
  await tables.check();
  await page.getByText('Skip whole chapters or sections').click();
  await page.getByLabel('Part two', { exact: false }).first().check();
  await page.getByRole('button', { name: 'Add to library' }).click();
  await expect(page.getByText('The first paragraph explains the idea')).toBeVisible();
  await expect(page.getByText('A second section follows here')).toHaveCount(0);
});

test('a title that was not detected can be typed, and details can be edited afterwards', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add a document' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: '1000470870.txt', mimeType: 'text/plain', buffer: Buffer.from('Some plain words to read aloud, with no heading at all.') });
  await expect(page.getByText('We found')).toBeVisible();
  const title = page.getByLabel('Title', { exact: true });
  await expect(title).toHaveValue(''); // a phone's file number is not used as a title
  await title.fill('My typed title');
  await page.getByLabel('Author').fill('Ada');
  await page.getByRole('button', { name: 'Add to library' }).click();
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.getByRole('button', { name: 'Options for My typed title' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Renamed book');
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('Renamed book').first()).toBeVisible();
});

test('the Wells tab uses the same drop icon as Tapestry', async ({ page }) => {
  await page.goto('/');
  const d = await page.getByRole('button', { name: 'Wells' }).last().locator('svg path').first().getAttribute('d');
  expect(d).toBe('M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z');
});
