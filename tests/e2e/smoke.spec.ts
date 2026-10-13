// Smoke test: upload the sample workbook as admin, publish, and check the spec section 10 numbers on the dashboard.
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const SAMPLE = path.resolve(__dirname, '../../reference/rasa industry catering (1).xlsx');

async function login(page: Page, email: string, password: string, from = '/') {
  await page.goto(from);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled(); // hydrated
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function signIn(page: Page) {
  await login(page, 'admin@e2e.test', 'e2e-admin-password', '/admin');
  await expect(page.getByRole('heading', { name: 'Upload weekly workbook' })).toBeVisible();
}

const kpi = (page: Page, container: string, label: string) =>
  page.locator(`#${container} .kpi`).filter({ has: page.locator('.l', { hasText: label }) });

test('upload → preview → publish → dashboard numbers', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push(e.message));

  await signIn(page);

  // ---- upload + preview ----
  await page.locator('[data-testid=file-input][data-ready]').setInputFiles(SAMPLE);
  await expect(page.getByRole('heading', { name: 'Preview · Week of Oct 5 – Oct 11, 2026' })).toBeVisible({ timeout: 60_000 });
  const card = (l: string) => page.locator('.kpi').filter({ has: page.locator('.l', { hasText: new RegExp(`^${l}$`) }) });
  await expect(card('YTD orders').locator('.v')).toHaveText('514');
  await expect(card('YTD orders').locator('.n')).toHaveText('415 identified · 67 personal · 32 unclassifiable');
  await expect(card('Orders this week').locator('.v')).toHaveText('9');
  await expect(card('Dials').locator('.v')).toHaveText('2,919');
  await expect(card('Dials').locator('.n')).toHaveText('2,530 unique contacts');
  await expect(card('Connected').locator('.n')).toContainText('2,629 No Answer');
  await expect(page.getByText('Reconciliation mismatches')).toHaveCount(0);

  // ---- publish ----
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByRole('heading', { name: 'Published' })).toBeVisible();

  // ---- dashboard ----
  await page.goto('/?week=2026-10-05');
  await expect(page.locator('h1')).toHaveText('RASA Weekly — Dials, Targeting & Demand');
  await expect(page.getByRole('img', { name: 'Kutlerri' })).toBeVisible();
  await expect(page.locator('#week')).toHaveValue('2026-10-05');

  await expect(kpi(page, 'kpis', 'Total dials').locator('.v')).toHaveText('2,919');
  await expect(kpi(page, 'kpis', 'Unique contacts dialled').locator('.v')).toHaveText('2,530');
  await expect(kpi(page, 'kpis', 'Conversations').locator('.v')).toHaveText('237');
  await expect(kpi(page, 'kpis', 'Connected').locator('.v')).toHaveText('282');
  await expect(kpi(page, 'kpis', 'Connected').locator('.n')).toHaveText('9.7% of dials');

  const tvdHint = '514 orders YTD: 415 from identified organisations, 67 personal/individual, 32 unclassifiable. Dial side = dials.';
  await expect(page.locator('#tvd-hint')).toHaveText(tvdHint);

  // Order share denominator = 415
  const top = page.locator('#tvd tbody tr').first();
  const topOrders = Number(await top.locator('td').nth(1).innerText());
  await expect(top.locator('td').nth(2)).toHaveText(((100 * topOrders) / 415).toFixed(1) + '%');

  // Persona counts (all agents)
  const personas: Record<string, string> = {
    'Executive Assistant': '690', 'Office Manager / Admin': '673', 'Admin Support': '280', 'Chief of Staff': '168', Events: '88',
    'HR / People Ops': '68', Other: '47', 'Facilities / Operations': '19', 'Leadership / Director': '12', 'No title on file': '2', 'Not in database': '872',
  };
  for (const [p, n] of Object.entries(personas)) {
    await expect(page.locator('#tPersona tr', { has: page.locator('td', { hasText: new RegExp(`^${p.replace(/[/]/g, '\\/')}$`) }) }).locator('td').nth(1)).toHaveText(n);
  }
  await expect(page.locator('#tStore tr', { hasText: 'Not in database' }).locator('td').nth(1)).toHaveText('872');

  // This week's orders: 9, $3,738
  await expect(kpi(page, 'kWeek', 'Orders this week').locator('.v')).toHaveText('9');
  await expect(kpi(page, 'kWeek', 'Order value').locator('.v')).toHaveText('$3,738');
  await expect(kpi(page, 'kYtd', 'Orders (YTD)').locator('.v')).toHaveText('514');

  // ---- drawer: TvD row totals equal the row's Orders and Dials ----
  const row = page.locator('#tvd tbody tr').first();
  const [rowOrders, rowDials] = [await row.locator('td').nth(1).innerText(), await row.locator('td').nth(3).innerText()];
  await row.click();
  const drawer = page.locator('#drawer');
  await expect(drawer).toHaveClass(/open/);
  await expect(drawer.locator('.dtitle')).toContainText('— orders vs dials');
  const totals = drawer.locator('tr.tot');
  await expect(totals).toHaveCount(2);
  await expect(totals.nth(0).locator('td').nth(2)).toHaveText(rowOrders);
  await expect(totals.nth(1).locator('td').nth(2)).toHaveText(rowDials);
  await page.keyboard.press('Escape');
  await expect(drawer).not.toHaveClass(/open/);

  // ---- agent filter: dial side changes, order side does not ----
  const weekValue = await kpi(page, 'kWeek', 'Order value').locator('.v').innerText();
  const ytdValue = await kpi(page, 'kYtd', 'Order value').locator('.v').innerText();
  const firstOrderShare = await top.locator('td').nth(2).innerText();
  await page.locator('#agent').selectOption('Nia A');
  await expect(kpi(page, 'kpis', 'Total dials').locator('.v')).toHaveText('929');
  await expect(kpi(page, 'kpis', 'Total dials').locator('.n')).toHaveText('across 1 agent');
  await expect(page.locator('#tvd-hint')).toHaveText(tvdHint);
  await expect(kpi(page, 'kWeek', 'Order value').locator('.v')).toHaveText(weekValue);
  await expect(kpi(page, 'kYtd', 'Order value').locator('.v')).toHaveText(ytdValue);
  await expect(page.locator('#tvd tbody tr').first().locator('td').nth(2)).toHaveText(firstOrderShare);

  // ---- theme toggle re-renders without errors ----
  await page.locator('#theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', /light|dark/);

  // ---- history lists the published week ----
  await page.goto('/admin/history');
  await expect(page.locator('tbody tr').first()).toContainText('Week of Oct 5');
  await expect(page.locator('tbody tr').first()).toContainText('published');

  expect(consoleErrors).toEqual([]);
});

test('mobile layout stacks the two-column grids', async ({ page }) => {
  await login(page, 'viewer@e2e.test', 'e2e-viewer-password');
  await expect(page.locator('#kpis .kpi').first()).toBeVisible();
  await page.setViewportSize({ width: 400, height: 860 });
  await page.goto('/');
  const cols = await page.locator('.grid2').first().evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(cols).toBe(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('settings recompute, re-upload versioning, archive / re-publish', async ({ page }) => {
  await signIn(page);
  const connected = () => kpi(page, 'kpis', 'Connected').locator('.v');

  // Settings: reclassify "Not Interested" (96 dials) as not connected → 282 − 96 = 186
  await page.goto('/admin/settings');
  const row = page.locator('tr', { has: page.locator('input[value="Not Interested"]') });
  await row.getByLabel('Counts as').selectOption('false');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toContainText('Recomputed 1 stored week');
  await page.goto('/');
  await expect(connected()).toHaveText('186');

  await page.goto('/admin/settings');
  await page.locator('tr', { has: page.locator('input[value="Not Interested"]') }).getByLabel('Counts as').selectOption('true');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toContainText('Recomputed');
  await page.goto('/');
  await expect(connected()).toHaveText('282');

  // Re-upload the same week → asks to replace, publishes v2, v1 archived
  await page.goto('/admin');
  await page.locator('[data-testid=file-input][data-ready]').setInputFiles(SAMPLE);
  await expect(page.getByRole('heading', { name: /^Preview/ })).toBeVisible({ timeout: 60_000 });
  // week override round-trip
  await page.getByLabel('Week start (Monday)').fill('2026-10-08');
  await page.getByRole('button', { name: 'Apply week' }).click();
  await expect(page.getByLabel('Week start (Monday)')).toHaveValue('2026-10-05'); // snapped to Monday
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Replace Week of Oct 5? The current version will be archived.')).toBeVisible();
  await page.getByRole('button', { name: 'Replace and publish' }).click();
  await expect(page.getByText('is live as version 2')).toBeVisible();

  await page.goto('/admin/history');
  const v1 = page.locator('tbody tr').filter({ hasText: 'archived' });
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await v1.getByRole('button', { name: 'Re-publish' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.locator('tbody tr').filter({ hasText: 'published' }).locator('td').nth(1)).toHaveText('1');
});

test('viewer accounts never see the admin area', async ({ page, request }) => {
  await login(page, 'viewer@e2e.test', 'e2e-viewer-password');
  await expect(kpi(page, 'kpis', 'Total dials').locator('.v')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/$/); // sent back to the dashboard
  const api = await page.request.post('/api/admin/snapshots/1/archive');
  expect(api.status()).toBe(403);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await request.get('/', { maxRedirects: 0 })).status()).toBe(307); // signed out → login
});

test('admin sees the Admin button on the dashboard', async ({ page }) => {
  await login(page, 'admin@e2e.test', 'e2e-admin-password');
  await page.getByRole('link', { name: 'Admin' }).click();
  await expect(page.getByRole('heading', { name: 'Upload weekly workbook' })).toBeVisible();
});

test('history: view sheet, re-upload a week, delete the published version', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/history');
  const published = () => page.locator('tbody tr').filter({ hasText: 'published' });

  // View the original workbook of a past upload
  await published().getByRole('link', { name: 'View sheet' }).click();
  const tabs = page.getByRole('navigation', { name: 'Workbook tabs' });
  await expect(tabs.getByRole('link', { name: 'YTD_Orders' })).toBeVisible();
  await tabs.getByRole('link', { name: 'Calls_This_Week' }).click();
  await expect(page.locator('th', { hasText: 'Persona' })).toBeVisible();
  await expect(page.getByText('Page 1 of 30')).toBeVisible(); // 2,919 dials / 100 per page
  await page.getByRole('link', { name: 'Next →' }).click();
  await expect(page.getByText('Page 2 of 30')).toBeVisible();

  // Re-upload the week from History
  await page.goto('/admin/history');
  const before = await page.locator('tbody tr').count();
  await published().getByRole('link', { name: 'Re-upload' }).click();
  await expect(page.getByRole('heading', { name: 'Re-upload Week of Oct 5' })).toBeVisible();
  await page.locator('[data-testid=file-input][data-ready]').setInputFiles(SAMPLE);
  await expect(page.getByRole('heading', { name: 'Preview · Week of Oct 5 – Oct 11, 2026' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Publish' }).click();
  await page.getByRole('button', { name: 'Replace and publish' }).click();
  await expect(page.getByText(/is live as version \d+/)).toBeVisible();

  // Delete the published version → the week leaves the dashboard
  await page.goto('/admin/history');
  await expect(page.locator('tbody tr')).toHaveCount(before + 1);
  await published().getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('This week will no longer appear on the dashboard.')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(before);
  await expect(published()).toHaveCount(0);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No week published yet' })).toBeVisible();
});
