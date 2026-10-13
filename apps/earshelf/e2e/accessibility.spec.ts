import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Automatic accessibility checks (WCAG A and AA). They catch many problems, not all: also try the manual checks in ACCESSIBILITY.md.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

for (const [name, open] of [
  ['home', async (p: import('@playwright/test').Page) => { await p.goto('/'); }],
  ['wells', async (p: import('@playwright/test').Page) => { await p.goto('/'); await p.getByRole('button', { name: 'Wells' }).last().click(); }],
  ['search', async (p: import('@playwright/test').Page) => { await p.goto('/'); await p.getByRole('button', { name: 'Search' }).last().click(); }],
  ['profile', async (p: import('@playwright/test').Page) => { await p.goto('/'); await p.getByRole('button', { name: 'Profile' }).last().click(); }],
] as const) {
  test(`no detectable accessibility problems on ${name}`, async ({ page }) => {
    await open(page);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
  });
}

test('skip link reaches the main content and keyboard focus is visible', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});
