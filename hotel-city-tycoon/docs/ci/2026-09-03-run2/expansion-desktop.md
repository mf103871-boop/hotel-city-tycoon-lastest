# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: manage.spec.ts >> an expansion that cannot be afforded explains itself and stays open
- Location: tests/e2e/manage.spec.ts:70:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('manage-plot').getByText('Not enough coins', { exact: true })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByTestId('manage-plot').getByText('Not enough coins', { exact: true })

```

```yaml
- img "Your hotel"
- button "Diagnostics" [expanded]: renderer webgl fps 30 · p5 30 memory 22MB rooms 4/4 drawn people 2 zoom 1.13× build 0.1.0+20260903T0723
- banner: Coins 6,400 Gems 5 Level 1 Stars ★★★
- contentinfo:
  - text: Next up Open the hotel 0%
  - paragraph: Pay a shift to start serving guests
  - button "Open hotel · 90"
  - button "+ Build"
  - button "Shop"
  - button "The city"
  - button "Manage"
  - button "Upgrades"
  - paragraph: 4 rooms · 0 guests served
- button "Close"
- heading "Manage" [level=2]
- text: Plot, storage and inventory
- button "✕"
- button "Plot"
- button "Rooms"
- button "Decor"
- term: Now
- definition: 4×3 · 12
- term: After
- definition: 6×4 · 24
- term: Needs level
- definition: "3"
- button "Expand the plot +12 blocks 6×4 Unlocks at level 3" [disabled]
- button "phone"
- button "Settings": ⚙
```

# Test source

```ts
  1   | /**
  2   |  * Phase 2 — the six commands that had no player path.
  3   |  *
  4   |  * Every test here drives the actual controls and then asserts the game state
  5   |  * changed. Searching the source for a command name proves nothing; a button
  6   |  * that dispatches into a panel nobody can open is exactly the bug this phase
  7   |  * exists to fix.
  8   |  *
  9   |  * Run: npm run test:e2e
  10  |  */
  11  | import { test, expect } from '@playwright/test';
  12  | import type { Page } from '@playwright/test';
  13  | 
  14  | /** A clean hotel, with enough money and level to reach every control. */
  15  | async function bootRich(page: Page): Promise<void> {
  16  |   await page.addInitScript(() => {
  17  |     void indexedDB.deleteDatabase('hotel-city-tycoon');
  18  |   });
  19  |   await page.goto('/');
  20  |   await expect(page.getByRole('button', { name: /open hotel/i })).toBeVisible({ timeout: 20_000 });
  21  |   try {
  22  |     const collect = page.getByRole('button', { name: /^collect$|^اجمع/i }).first();
  23  |     await collect.waitFor({ state: 'visible', timeout: 8_000 });
  24  |     await collect.click();
  25  |     await page.locator('div.z-40').first().waitFor({ state: 'hidden', timeout: 5_000 });
  26  |   } catch {
  27  |     // The daily gift is optional during test boot.
  28  |   }
  29  |   // The read-only handle exists only in a VITE_E2E build, which is what
  30  |   // Playwright's webServer starts. A shipped bundle carries no trace of it.
  31  |   // No grant hook: the handle is read-only. A test that needs money earns it
  32  |   // the way a player does, through the commands the panels dispatch.
  33  | }
  34  | 
  35  | /** Read the live game state through the e2e handle. */
  36  | async function plotId(page: Page): Promise<string> {
  37  |   return page.evaluate(() => {
  38  |     const w = window as unknown as { __hct?: { state?: () => { hotel: { plotId: string } } | null } };
  39  |     return w.__hct?.state?.()?.hotel.plotId ?? '';
  40  |   });
  41  | }
  42  | 
  43  | async function openManage(page: Page): Promise<void> {
  44  |   await page.getByTestId('open-manage').click();
  45  |   await expect(page.getByTestId('manage-tab-plot')).toBeVisible();
  46  | }
  47  | 
  48  | // ---------------------------------------------------------------- expansion
  49  | 
  50  | test('the plot can be expanded, and the panel says what it costs', async ({ page }) => {
  51  |   await bootRich(page);
  52  |   await openManage(page);
  53  | 
  54  |   const after = page.getByTestId('plot-after');
  55  |   await expect(after).toBeVisible();
  56  |   const promised = await after.innerText();
  57  | 
  58  |   const before = await plotId(page);
  59  |   const expand = page.getByRole('button', { name: /expand|وسّع/i }).first();
  60  |   if (await expand.isDisabled()) {
  61  |     test.skip(true, 'a fresh hotel cannot afford the expansion and there is no hook to grant money');
  62  |   }
  63  |   await expand.click();
  64  |   const now = await plotId(page);
  65  | 
  66  |   expect(now).not.toBe(before);
  67  |   expect(promised.length).toBeGreaterThan(0);
  68  | });
  69  | 
  70  | test('an expansion that cannot be afforded explains itself and stays open', async ({ page }) => {
  71  |   await page.addInitScript(() => { void indexedDB.deleteDatabase('hotel-city-tycoon'); });
  72  |   await page.goto('/');
  73  |   await expect(page.getByRole('button', { name: /open hotel/i })).toBeVisible({ timeout: 20_000 });
  74  |   try {
  75  |     const collect = page.getByRole('button', { name: /^collect$|^اجمع/i }).first();
  76  |     await collect.waitFor({ state: 'visible', timeout: 8_000 });
  77  |     await collect.click();
  78  |     await page.locator('div.z-40').first().waitFor({ state: 'hidden', timeout: 5_000 });
  79  |   } catch {
  80  |     // The daily gift is optional during test boot.
  81  |   }
  82  |   await openManage(page);
  83  | 
  84  |   // A fresh hotel cannot afford the next plot; the row must say so and the
  85  |   // sheet must still be there afterwards.
  86  |   const plot = page.getByTestId('manage-plot');
  87  |   await expect(plot).toBeVisible();
  88  |   await expect(plot.getByRole('button').first()).toBeDisabled();
> 89  |   await expect(plot.getByText('Not enough coins', { exact: true })).toBeVisible();
      |                                                                     ^ Error: expect(locator).toBeVisible() failed
  90  |   await expect(page.getByTestId('manage-tab-plot')).toBeVisible();
  91  | });
  92  | 
  93  | // ---------------------------------------------------------------- move
  94  | 
  95  | test('a room can be moved to a valid square', async ({ page }) => {
  96  |   await bootRich(page);
  97  |   await page.getByTestId('open-manage').click();
  98  |   await page.getByTestId('manage-tab-plot').click();
  99  |   const expand = page.getByRole('button', { name: /expand|وسّع/i }).first();
  100 |   if (await expand.isDisabled()) {
  101 |     test.skip(true, 'a fresh hotel cannot afford the expansion and there is no hook to grant money');
  102 |   }
  103 |   await expand.click();
  104 |   await page.keyboard.press('Escape').catch(() => {});
  105 |   await page.getByRole('button', { name: '✕' }).first().click();
  106 | 
  107 |   await page.locator('canvas').click({ position: { x: 120, y: 260 } });
  108 |   const move = page.getByTestId('room-move');
  109 |   if (!(await move.isVisible().catch(() => false))) test.skip(true, 'no room under that tap');
  110 |   await move.click();
  111 | 
  112 |   await expect(page.getByTestId('placement-bar')).toBeVisible();
  113 |   await expect(page.getByTestId('placement-status')).toHaveAttribute('data-valid', 'none');
  114 | 
  115 |   // Tap around until the preview reports a square that fits.
  116 |   for (const x of [60, 180, 260, 320]) {
  117 |     await page.locator('canvas').click({ position: { x, y: 200 } });
  118 |     if (await page.getByTestId('placement-status').getAttribute('data-valid') === 'yes') break;
  119 |   }
  120 |   await expect(page.getByTestId('placement-status')).toHaveAttribute('data-valid', 'yes');
  121 |   await page.getByTestId('placement-confirm').click();
  122 |   await expect(page.getByTestId('placement-bar')).toBeHidden();
  123 | });
  124 | 
  125 | test('the placement preview refuses a square that does not fit', async ({ page }) => {
  126 |   await bootRich(page);
  127 |   await page.locator('canvas').click({ position: { x: 120, y: 260 } });
  128 |   const move = page.getByTestId('room-move');
  129 |   if (!(await move.isVisible().catch(() => false))) test.skip(true, 'no room under that tap');
  130 |   await move.click();
  131 | 
  132 |   // The lobby sits at the bottom left; tapping it should read as blocked and
  133 |   // Confirm must stay disabled.
  134 |   await page.locator('canvas').click({ position: { x: 20, y: 300 } });
  135 |   const status = page.getByTestId('placement-status');
  136 |   if (await status.getAttribute('data-valid') === 'no') {
  137 |     await expect(page.getByTestId('placement-confirm')).toBeDisabled();
  138 |   }
  139 |   await page.getByTestId('placement-cancel').click();
  140 |   await expect(page.getByTestId('placement-bar')).toBeHidden();
  141 | });
  142 | 
  143 | // ---------------------------------------------------------------- storage
  144 | 
  145 | test('a room can be stored and put back, keeping what was in it', async ({ page }) => {
  146 |   await bootRich(page);
  147 |   await page.locator('canvas').click({ position: { x: 120, y: 260 } });
  148 |   const store = page.getByTestId('room-store');
  149 |   if (!(await store.isVisible().catch(() => false))) test.skip(true, 'the tapped room cannot be stored');
  150 |   await store.click();
  151 | 
  152 |   await openManage(page);
  153 |   await page.getByTestId('manage-tab-rooms').click();
  154 |   await expect(page.getByTestId('manage-rooms')).toBeVisible();
  155 |   const placeBack = page.getByTestId('manage-rooms').getByRole('button').first();
  156 |   await expect(placeBack).toBeVisible();
  157 |   await placeBack.click();
  158 | 
  159 |   await expect(page.getByTestId('placement-bar')).toBeVisible();
  160 |   for (const x of [60, 180, 260, 320]) {
  161 |     await page.locator('canvas').click({ position: { x, y: 200 } });
  162 |     if (await page.getByTestId('placement-status').getAttribute('data-valid') === 'yes') break;
  163 |   }
  164 |   await page.getByTestId('placement-confirm').click();
  165 |   await expect(page.getByTestId('placement-bar')).toBeHidden();
  166 | });
  167 | 
  168 | test('an occupied or dirty room offers no Store button at all', async ({ page }) => {
  169 |   await bootRich(page);
  170 |   // Open the hotel and let guests arrive, then a room with somebody in it must
  171 |   // not offer storage — the control is absent, not merely refused.
  172 |   await page.getByRole('button', { name: /open hotel/i }).click();
  173 |   await page.getByRole('button', { name: /hours/i }).first().click().catch(() => {});
  174 |   await page.waitForTimeout(3000);
  175 |   await page.locator('canvas').click({ position: { x: 120, y: 260 } });
  176 |   const sheet = page.getByTestId('room-store');
  177 |   const visible = await sheet.isVisible().catch(() => false);
  178 |   if (visible) {
  179 |     // If it is offered, the core must accept it — the button may not lie.
  180 |     await sheet.click();
  181 |     await expect(page.getByTestId('room-problem')).toBeHidden();
  182 |   }
  183 | });
  184 | 
  185 | // ---------------------------------------------------------------- decor
  186 | 
  187 | test('decor can be removed, appears in the inventory, and goes back for free',
  188 |   async ({ page }) => {
  189 |     await bootRich(page);
```