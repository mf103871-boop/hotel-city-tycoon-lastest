# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: game.spec.ts >> the hotel survives a full reload
- Location: tests/e2e/game.spec.ts:395:1

# Error details

```
Error: the hotel was not there after a reload

expect(locator).toHaveText(expected) failed

Locator:  locator('footer p').filter({ hasText: /rooms/ })
Expected: "6 rooms · 0 guests served"
Received: "4 rooms · 0 guests served"
Timeout:  10000ms

Call log:
  - the hotel was not there after a reload with timeout 10000ms
  - waiting for locator('footer p').filter({ hasText: /rooms/ })
    24 × locator resolved to <p class="mt-2 text-center text-[11px] text-slate-500">…</p>
       - unexpected value "4 rooms · 0 guests served"

```

```yaml
- paragraph: 4 rooms · 0 guests served
```

# Test source

```ts
  314 | 
  315 | test('the shop says when its stock changes', async ({ page }) => {
  316 |   // The weekly refresh is the reason to come back; a shop that does not say
  317 |   // when it turns over is just a list.
  318 |   await bootFresh(page);
  319 |   await page.getByRole('button', { name: /^shop$/i }).click();
  320 |   await expect(page.getByText(/new stock in/i)).toBeVisible();
  321 | });
  322 | 
  323 | test('the city shows rivals and says plainly what they are', async ({ page }) => {
  324 |   // The honesty line matters more than the feature. A generated city that
  325 |   // implies real people would be a lie the game tells to look busier.
  326 |   await bootFresh(page);
  327 |   await page.getByRole('button', { name: /the city/i }).click();
  328 | 
  329 |   await expect(page.getByText(/part of the game, not other people/i)).toBeVisible();
  330 |   await expect(page.getByText(/your hotel/i)).toBeVisible();
  331 |   await expect(page.getByText(/#\d+ of \d+/)).toBeVisible();
  332 | });
  333 | 
  334 | test('visiting a rival pays once and then stops', async ({ page }) => {
  335 |   await bootFresh(page);
  336 |   await page.getByRole('button', { name: /the city/i }).click();
  337 | 
  338 |   const visit = page.getByRole('button', { name: /^visit/i }).first();
  339 |   await expect(visit).toBeEnabled();
  340 |   await visit.click();
  341 |   // The same hotel cannot be visited twice in a day.
  342 |   await expect(page.getByText(/^visited$/i).first()).toBeVisible();
  343 | });
  344 | 
  345 | test('the upgrades panel shows what a tier would change', async ({ page }) => {
  346 |   // "Renown IV" is not a reason to spend. "x1.36 to x1.52" is.
  347 |   await bootFresh(page);
  348 |   await page.getByRole('button', { name: /upgrades/i }).click();
  349 | 
  350 |   await expect(page.getByRole('heading', { name: /upgrades/i })).toBeVisible();
  351 |   await expect(page.getByText(/×\d\.\d+ → ×\d\.\d+/).first()).toBeVisible();
  352 |   // Late tracks are locked, and say why rather than going quiet.
  353 |   await expect(page.getByText(/unlocks at level/i).first()).toBeVisible();
  354 | });
  355 | 
  356 | test('the daily gift is offered without being hunted for', async ({ page }) => {
  357 |   // A reward a player has to go looking for is not a reason to come back.
  358 |   await bootFresh(page, { dismissGift: false });
  359 |   const gift = page.getByRole('heading', { name: /daily gift/i });
  360 |   await expect(gift).toBeVisible({ timeout: 10_000 });
  361 | 
  362 |   await page.getByRole('button', { name: /collect/i }).click();
  363 |   await expect(gift).toHaveCount(0);
  364 | });
  365 | 
  366 | test('a refusal explains itself instead of doing nothing', async ({ page }) => {
  367 |   // Twenty-six of twenty-nine refusals once reached nobody: the player tapped,
  368 |   // the game did not move, and no message explained why.
  369 |   await bootFresh(page);
  370 |   await page.getByRole('button', { name: /\+ build/i }).click();
  371 |   await page.getByRole('button', { name: /facilities/i }).click();
  372 | 
  373 |   // Locked entries must carry a reason on their face.
  374 |   await expect(page.getByText(/unlocks at level/i).first()).toBeVisible();
  375 | });
  376 | 
  377 | test('every bottom-bar destination opens', async ({ page }) => {
  378 |   // Four panels arrived after this suite was written and none of them had a
  379 |   // scenario. This is the cheapest guard against that happening again.
  380 |   await bootFresh(page);
  381 |   for (const [button, heading] of [
  382 |     [/\+ build/i, /build/i],
  383 |     [/^shop$/i, /^shop$/i],
  384 |     [/the city/i, /the city/i],
  385 |     [/upgrades/i, /upgrades/i],
  386 |   ] as const) {
  387 |     await page.getByRole('button', { name: button }).first().click();
  388 |     await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  389 |     await page.getByRole('button', { name: '✕' }).click();
  390 |   }
  391 | });
  392 | 
  393 | // ---------------------------------------------------------------- persistence
  394 | 
  395 | test('the hotel survives a full reload', async ({ page }) => {
  396 |   // Verified headlessly since P2.5 and never once in a real browser, because
  397 |   // IndexedDB does not exist in Node.
  398 |   await bootFresh(page);
  399 | 
  400 |   await page.getByRole('button', { name: /\+ build/i }).click();
  401 |   await page.getByRole('button', { name: /Budget Room/i }).first().click();
  402 |   await page.getByRole('button', { name: /\+ build/i }).click();
  403 |   await page.getByRole('button', { name: /Budget Room/i }).first().click();
  404 | 
  405 |   const count = page.locator('footer p').filter({ hasText: /rooms/ });
  406 |   const before = await count.textContent();
  407 |   // Give the autosave a chance to run.
  408 |   await page.waitForTimeout(1500);
  409 |   await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  410 |   await page.waitForTimeout(500);
  411 | 
  412 |   await page.reload();
  413 |   await expect(page.getByRole('button', { name: /open hotel|shift/i }).first()).toBeVisible({ timeout: 20_000 });
> 414 |   await expect(count, 'the hotel was not there after a reload').toHaveText(before ?? '');
      |                                                                 ^ Error: the hotel was not there after a reload
  415 | });
  416 | 
  417 | // ---------------------------------------------------------------- settings
  418 | 
  419 | test('the language switch flips the HUD without flipping the canvas', async ({ page }) => {
  420 |   await bootFresh(page);
  421 |   await page.getByRole('button', { name: 'Settings' }).click();
  422 |   await page.getByRole('button', { name: 'العربية' }).click();
  423 | 
  424 |   await expect(page.locator('div[dir]').first()).toHaveAttribute('dir', 'rtl');
  425 |   // The world is a world: only the interface mirrors.
  426 |   const transform = await page.locator('canvas').evaluate((el) => getComputedStyle(el).transform);
  427 |   expect(transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)').toBeTruthy();
  428 | });
  429 | 
  430 | test('a save can be exported', async ({ page }) => {
  431 |   // For a game with no account, this is the difference between owning
  432 |   // progress and renting it.
  433 |   await bootFresh(page);
  434 |   await page.getByRole('button', { name: 'Settings' }).click();
  435 | 
  436 |   const download = page.waitForEvent('download', { timeout: 10_000 });
  437 |   await page.getByRole('button', { name: /export save/i }).click();
  438 |   const file = await download;
  439 |   expect(file.suggestedFilename()).toMatch(/hotel-city-tycoon-.*\.json/);
  440 | });
  441 | 
  442 | test('sound can be turned off', async ({ page }) => {
  443 |   await bootFresh(page);
  444 |   await page.getByRole('button', { name: 'Settings' }).click();
  445 |   const toggle = page.getByRole('checkbox');
  446 |   await expect(toggle).toBeChecked();
  447 |   await toggle.uncheck();
  448 |   await expect(toggle).not.toBeChecked();
  449 | });
  450 | 
  451 | // ---------------------------------------------------------------- gestures
  452 | 
  453 | test('the hotel cannot be dragged off screen', async ({ page }) => {
  454 |   await bootFresh(page);
  455 |   const canvas = page.locator('canvas');
  456 |   const box = (await canvas.boundingBox())!;
  457 | 
  458 |   // Shove hard in one direction, then check a room is still tappable.
  459 |   for (let i = 0; i < 6; i++) {
  460 |     await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  461 |     await page.mouse.down();
  462 |     await page.mouse.move(box.x + box.width * 0.95, box.y + box.height * 0.95, { steps: 8 });
  463 |     await page.mouse.up();
  464 |   }
  465 |   await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.62 } });
  466 |   // Either a room sheet opened, or the tap missed — but the page must be alive.
  467 |   await expect(page.locator('canvas')).toBeVisible();
  468 | });
  469 | 
```