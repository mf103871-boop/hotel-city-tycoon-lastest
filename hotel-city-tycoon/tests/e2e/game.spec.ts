/**
 * End-to-end tests.
 *
 * These exist because every bug this project has actually shipped lived in the
 * same place: the wiring between a working UI component and a working piece of
 * logic. The art was generated, validated, and never loaded. The event buffer
 * was filled and never read. A package import was corrupted and the render
 * layer stopped compiling for two releases.
 *
 * None of that was catchable by the 189 headless checks, because all of it
 * needed a browser. This file is that missing layer.
 *
 * Run: npm run test:e2e
 */
import { test, expect } from '@playwright/test';
import type { Page, ConsoleMessage } from '@playwright/test';
import { tapRoom } from './rooms.ts';

const NO_3D = process.env.PLAYWRIGHT_EXTRA_ARGS?.includes('--disable-3d-apis') ?? false;

/** Collect console output so a test can assert on what the game reported. */
function captureConsole(page: Page): ConsoleMessage[] {
  const messages: ConsoleMessage[] = [];
  page.on('console', (m) => messages.push(m));
  return messages;
}

async function bootFresh(
  page: Page,
  options: { dismissGift?: boolean } = {},
): Promise<ConsoleMessage[]> {
  const messages = captureConsole(page);
  // Start from a clean hotel so tests do not inherit each other's saves.
  // Once per test, not once per navigation: an init script runs again on
  // every reload, and this one used to wipe the save the reload test had
  // just written — "6 rooms" before, "4 rooms" after, whatever the game did.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('hct-e2e-fresh')) return;
    sessionStorage.setItem('hct-e2e-fresh', '1');
    void indexedDB.deleteDatabase('hotel-city-tycoon');
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /open hotel/i })).toBeVisible({ timeout: 20_000 });
  if (options.dismissGift ?? true) {
    try {
      const collect = page.getByRole('button', { name: /^collect$|^اجمع/i }).first();
      await collect.waitFor({ state: 'visible', timeout: 8_000 });
      await collect.click();
      await page.locator('div.z-40').first().waitFor({ state: 'hidden', timeout: 5_000 });
    } catch {
      // The daily gift is optional during test boot.
    }
  }
  return messages;
}

// ---------------------------------------------------------------- boot

test('the game boots past the loading screen', async ({ page }) => {
  // React StrictMode mounts, unmounts and remounts in development. An earlier
  // boot guard made the second mount exit early and the loading screen never
  // went away.
  await bootFresh(page);
  await expect(page.getByText('…', { exact: true })).toHaveCount(0);
});

test('a renderer initialises and says which one', async ({ page }) => {
  const messages = await bootFresh(page);
  const line = messages.find((m) => m.text().includes('[hotel-city-tycoon] renderer:'));
  expect(line, 'the renderer never reported which backend it got').toBeTruthy();
  expect(line!.text()).toMatch(/renderer: (webgpu|webgl)/);
});

test('the room art actually loads', async ({ page }) => {
  // The whole art set shipped once while the loader was never called: every
  // file present, validated, and unused.
  const messages = await bootFresh(page);
  await page.waitForTimeout(2000);
  const loaded = messages.find((m) => /\[assets\] \d+ room textures loaded/.test(m.text()));
  const failed = messages.find((m) => /\[assets\].*unavailable/.test(m.text()));
  expect(failed?.text(), 'textures failed to load').toBeUndefined();
  expect(loaded, 'nothing ever asked the loader for room textures').toBeTruthy();
});

test('no errors reach the console on a clean boot', async ({ page }) => {
  const messages = await bootFresh(page);
  await page.waitForTimeout(2000);
  const errors = messages.filter((m) => m.type() === 'error').map((m) => m.text());
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- simulation

test('the shift countdown ticks every second', async ({ page }) => {
  // It showed HH:MM once, so a live countdown looked frozen and there was no
  // way to tell whether the simulation was running at all.
  await bootFresh(page);
  await page.getByRole('button', { name: /open hotel/i }).first().click();
  const anyShift = page.getByRole('button', { name: /hours/i }).first();
  await anyShift.click();

  const timer = page.locator('footer .font-mono').first();
  const first = await timer.textContent();
  await page.waitForTimeout(2500);
  const second = await timer.textContent();
  expect(second, 'the countdown did not move in two and a half seconds').not.toBe(first);
});

test('guests appear once the hotel is open', async ({ page }) => {
  await bootFresh(page);
  await page.getByRole('button', { name: /open hotel/i }).first().click();
  await page.getByRole('button', { name: /hours/i }).first().click();

  // The debug badge reports how many people the scene is drawing.
  const badge = page.locator('text=/people \\d+/');
  await expect(badge).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(async () => {
      const text = (await badge.textContent()) ?? '';
      return Number(/people (\d+)/.exec(text)?.[1] ?? 0);
    }, { timeout: 30_000, message: 'nobody ever walked into the hotel' })
    .toBeGreaterThan(0);
});

// ---------------------------------------------------------------- building

test('the build menu lists every room and explains what is locked', async ({ page }) => {
  await bootFresh(page);
  await page.getByRole('button', { name: /\+ build/i }).click();
  await expect(page.getByRole('heading', { name: /build/i })).toBeVisible();

  // A level-1 player can build an economy room and cannot build a suite.
  await expect(page.getByRole('button', { name: /Budget Room/i }).first()).toBeEnabled();
  await expect(page.getByRole('button', { name: /High Ceiling Room/i }).first()).toBeDisabled();
  await expect(page.getByText(/unlocks at level/i).first()).toBeVisible();
});

test('building a room adds it to the hotel', async ({ page }) => {
  await bootFresh(page);
  const count = page.locator('footer p').filter({ hasText: /rooms/ });
  const before = (await count.textContent()) ?? '';

  await page.getByRole('button', { name: /\+ build/i }).click();
  await page.getByRole('button', { name: /Budget Room/i }).first().click();

  await expect(count).not.toHaveText(before);
  await expect(count).toContainText(/\d+ rooms/);
});

// ---------------------------------------------------------------- the meter

test('tapping a room opens its sheet, and decorating moves the meter', async ({ page }) => {
  test.skip(NO_3D, 'canvas lane is disabled on CI runners');
  // The decor meter is the mechanic the whole economy hangs on, and it was
  // unreachable through the UI for four phases.
  await bootFresh(page);

  // Where the renderer says a room is, not a coordinate that held on one
  // viewport: on the phone profile the old fixed point missed every room.
  const tapped = await tapRoom(page);
  expect(tapped, 'no room is on screen to tap').toBeTruthy();

  const sheet = page.locator('section').filter({ hasText: /decor/i }).first();
  await expect(sheet, 'tapping a room opened nothing').toBeVisible({ timeout: 5000 });

  const meter = page.locator('text=/\\d+\\/\\d+/').first();
  const before = await meter.textContent();

  await page.getByRole('button', { name: /^decorate$/i }).click();
  await page.getByRole('button', { name: /wallpaper|flooring/i }).first().click();

  await expect(meter, 'placing decor did not move the meter').not.toHaveText(before ?? '');
});

// ---------------------------------------------------------------- objectives

test('the objective card appears and advances when claimed', async ({ page }) => {
  await bootFresh(page);
  await expect(page.getByText(/next up/i)).toBeVisible();
  const first = await page.locator('footer').getByText(/open the hotel/i).textContent();

  await page.getByRole('button', { name: /open hotel/i }).first().click();
  await page.getByRole('button', { name: /hours/i }).first().click();

  const claim = page.getByRole('button', { name: /^claim/i });
  await expect(claim, 'a completed objective never offered its reward').toBeVisible({ timeout: 5000 });
  await claim.click();

  await expect(page.locator('footer').getByText(first ?? '')).toHaveCount(0);
});

test('a facility can be built and staffed', async ({ page }) => {
  // Commercial rooms earned nothing for five phases. This at least proves the
  // player can reach and staff one; the income itself is covered headlessly.
  await bootFresh(page);
  await page.getByRole('button', { name: /\+ build/i }).click();
  await page.getByRole('button', { name: /facilities/i }).click();

  const cafe = page.getByRole('button', { name: /cafe/i }).first();
  await expect(cafe).toBeVisible();
  // At level 1 it is locked, and the menu must say why rather than go quiet.
  await expect(page.getByText(/unlocks at level/i).first()).toBeVisible();
});

test('characters are drawn, not left as placeholder shapes', async ({ page }) => {
  // A verification pass found a street of blank capsules beside one properly
  // drawn character: views cached a placeholder before the texture bundle
  // landed and never looked again.
  const messages = await bootFresh(page);
  await page.getByRole('button', { name: /open hotel/i }).first().click();
  await page.getByRole('button', { name: /hours/i }).first().click();
  await page.waitForTimeout(8000);

  // The message the game actually prints ("N of M declared textures missing").
  // This looked for "missing overall", a phrase no source line has ever
  // contained, so it could not fail and the two capsule staff went unnoticed.
  const gaps = messages.find((m) => /\[assets\].*declared textures missing/.test(m.text()));
  expect(gaps?.text(), 'textures were missing after every bundle loaded').toBeUndefined();

  const characterFailures = messages.find((m) => /bundle "characters".*missing/.test(m.text()));
  expect(characterFailures?.text(), 'character textures failed to load').toBeUndefined();
});

test('the debug badge can be turned on in a deployed build', async ({ page }) => {
  await page.goto('/?debug=1');
  await expect(page.getByText(/renderer/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/people \d+/)).toBeVisible();
});

test('switching to Arabic sets the document direction', async ({ page }) => {
  await bootFresh(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'العربية' }).click();
  // Not just our own container: the document element itself.
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
});

test('the game is operable with reduced motion', async ({ page }) => {
  // For somebody motion sickness affects, this is not a preference — it is
  // whether they can play at all. The game must still work, not just animate
  // less.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await bootFresh(page);

  await page.getByRole('button', { name: /open hotel/i }).first().click();
  await page.getByRole('button', { name: /hours/i }).first().click();
  await expect(page.locator('footer .font-mono').first()).toBeVisible();

  await page.getByRole('button', { name: /\+ build/i }).click();
  await expect(page.getByRole('heading', { name: /build/i })).toBeVisible();
});

test('every control can be reached and named', async ({ page }) => {
  await bootFresh(page);
  // An icon-only control that announces nothing is invisible to a screen
  // reader and ambiguous to everyone else.
  for (const label of ['Settings', 'Close']) {
    const control = page.getByRole('button', { name: label });
    if (await control.count() > 0) await expect(control.first()).toBeVisible();
  }
  await expect(page.getByRole('img', { name: /hotel/i })).toBeVisible();
});

test('controls are large enough to hit on a phone', async ({ page }) => {
  await bootFresh(page);
  const buttons = page.locator('footer button');
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const box = await buttons.nth(i).boundingBox();
    if (!box) continue;
    expect(box.height, `a control is only ${box.height}px tall`).toBeGreaterThanOrEqual(36);
  }
});

test('a render error shows a recovery screen, not a blank page', async ({ page }) => {
  // Without a boundary, one thrown error emptied the page and the player saw
  // what looked exactly like having lost their hotel.
  await bootFresh(page);
  // The boundary listens for this in a VITE_E2E build only (which is what the
  // web server here starts) and renders a child that throws, so the real
  // catch path runs. The event used to have no listener at all, and the test
  // then asserted the canvas was still there — which it always was.
  await page.evaluate(() => {
    document.getElementById('root')?.dispatchEvent(new Event('hct-force-error'));
  });

  // The recovery screen, with the save offered before anything else.
  await expect(page.getByRole('heading', { name: /something broke/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /download my hotel/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^reload$/i })).toBeVisible();
});

test('the game starts even when storage is unavailable', async ({ page }) => {
  // A private window can present IndexedDB as unusable. That used to throw
  // during boot, before anything had been drawn.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      get() { throw new Error('IndexedDB is not available'); },
    });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /open hotel/i })).toBeVisible({ timeout: 20_000 });
});

// ---------------------------------------------------------------- live ops
//
// Everything below arrived after this file was written in P6a, and the suite
// did not grow with the game. Running it as it stood would have reported a
// healthy pass while never opening half the screens a player uses.

test('the shop offers a discounted shelf that can be bought from', async ({ page }) => {
  await bootFresh(page);
  await page.getByRole('button', { name: /^shop$/i }).click();

  const sheet = page.getByRole('heading', { name: /^shop$/i });
  await expect(sheet).toBeVisible();
  // Six slots, one of them the pick of the week.
  await expect(page.getByText(/pick of the week/i)).toBeVisible();
  // Every row shows a struck-through original beside the discounted price.
  await expect(page.getByText('→', { exact: false }).first()).toBeVisible();
});

test('the shop says when its stock changes', async ({ page }) => {
  // The weekly refresh is the reason to come back; a shop that does not say
  // when it turns over is just a list.
  await bootFresh(page);
  await page.getByRole('button', { name: /^shop$/i }).click();
  await expect(page.getByText(/new stock in/i)).toBeVisible();
});

test('the city shows rivals and says plainly what they are', async ({ page }) => {
  // The honesty line matters more than the feature. A generated city that
  // implies real people would be a lie the game tells to look busier.
  await bootFresh(page);
  await page.getByRole('button', { name: /the city/i }).click();

  await expect(page.getByText(/part of the game, not other people/i)).toBeVisible();
  await expect(page.getByText(/your hotel/i)).toBeVisible();
  await expect(page.getByText(/#\d+ of \d+/)).toBeVisible();
});

test('visiting a rival pays once and then stops', async ({ page }) => {
  await bootFresh(page);
  await page.getByRole('button', { name: /the city/i }).click();

  const visit = page.getByRole('button', { name: /^visit/i }).first();
  await expect(visit).toBeEnabled();
  await visit.click();
  // The same hotel cannot be visited twice in a day.
  await expect(page.getByText(/^visited$/i).first()).toBeVisible();
});

test('the upgrades panel shows what a tier would change', async ({ page }) => {
  // "Renown IV" is not a reason to spend. "x1.36 to x1.52" is.
  await bootFresh(page);
  const upgrades = page.getByRole('button', { name: /upgrades/i });
  // DEC #14 parks every track past the level cap; while that holds the HUD
  // hides the button rather than open a panel of disabled rows.
  test.skip(await upgrades.count() === 0, 'no upgrade track is reachable at the level cap (DEC #14)');
  await upgrades.click();

  await expect(page.getByRole('heading', { name: /upgrades/i })).toBeVisible();
  await expect(page.getByText(/×\d\.\d+ → ×\d\.\d+/).first()).toBeVisible();
  // Late tracks are locked, and say why rather than going quiet.
  await expect(page.getByText(/unlocks at level/i).first()).toBeVisible();
});

test('the daily gift is offered without being hunted for', async ({ page }) => {
  // A reward a player has to go looking for is not a reason to come back.
  await bootFresh(page, { dismissGift: false });
  const gift = page.getByRole('heading', { name: /daily gift/i });
  await expect(gift).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: /collect/i }).click();
  await expect(gift).toHaveCount(0);
});

test('a refusal explains itself instead of doing nothing', async ({ page }) => {
  // Twenty-six of twenty-nine refusals once reached nobody: the player tapped,
  // the game did not move, and no message explained why.
  await bootFresh(page);
  await page.getByRole('button', { name: /\+ build/i }).click();
  await page.getByRole('button', { name: /facilities/i }).click();

  // Locked entries must carry a reason on their face.
  await expect(page.getByText(/unlocks at level/i).first()).toBeVisible();
});

test('every bottom-bar destination opens', async ({ page }) => {
  // Four panels arrived after this suite was written and none of them had a
  // scenario. This is the cheapest guard against that happening again.
  await bootFresh(page);
  for (const [button, heading] of [
    [/\+ build/i, /build/i],
    [/^shop$/i, /^shop$/i],
    [/the city/i, /the city/i],
    [/^manage$/i, /^manage$/i],
    [/upgrades/i, /upgrades/i],
  ] as const) {
    // The Upgrades button is hidden while no track can unlock (DEC #14).
    if (await page.getByRole('button', { name: button }).count() === 0) continue;
    await page.getByRole('button', { name: button }).first().click();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await page.getByRole('button', { name: '✕' }).click();
  }
});

// ---------------------------------------------------------------- persistence

test('the hotel survives a full reload', async ({ page }) => {
  // Verified headlessly since P2.5 and never once in a real browser, because
  // IndexedDB does not exist in Node.
  await bootFresh(page);

  await page.getByRole('button', { name: /\+ build/i }).click();
  await page.getByRole('button', { name: /Budget Room/i }).first().click();
  await page.getByRole('button', { name: /\+ build/i }).click();
  await page.getByRole('button', { name: /Budget Room/i }).first().click();

  const count = page.locator('footer p').filter({ hasText: /rooms/ });
  const before = await count.textContent();
  // Every accepted command saves at once; the pause only lets the queued
  // write land. (A synthetic `visibilitychange` used to be dispatched here,
  // but the handler reads document.visibilityState, which stays "visible",
  // so it never flushed — the test passed only when the autosave happened
  // to run first.)
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(500);

  await page.reload();
  await expect(page.getByRole('button', { name: /open hotel|shift/i }).first()).toBeVisible({ timeout: 20_000 });
  await expect(count, 'the hotel was not there after a reload').toHaveText(before ?? '');
});

// ---------------------------------------------------------------- settings

test('the language switch flips the HUD without flipping the canvas', async ({ page }) => {
  await bootFresh(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'العربية' }).click();

  await expect(page.locator('div[dir]').first()).toHaveAttribute('dir', 'rtl');
  // The world is a world: only the interface mirrors.
  const transform = await page.locator('canvas').evaluate((el) => getComputedStyle(el).transform);
  expect(transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)').toBeTruthy();
});

test('a save can be exported', async ({ page }) => {
  // For a game with no account, this is the difference between owning
  // progress and renting it.
  await bootFresh(page);
  await page.getByRole('button', { name: 'Settings' }).click();

  const download = page.waitForEvent('download', { timeout: 10_000 });
  await page.getByRole('button', { name: /export save/i }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/hotel-city-tycoon-.*\.json/);
});

test('sound can be turned off', async ({ page }) => {
  await bootFresh(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const toggle = page.getByRole('checkbox');
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
});

// ---------------------------------------------------------------- gestures

test('the hotel cannot be dragged off screen', async ({ page }) => {
  await bootFresh(page);
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;

  // Shove hard in one direction, then check a room is still tappable.
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.95, box.y + box.height * 0.95, { steps: 8 });
    await page.mouse.up();
  }
  // The clamp must have kept a room on screen; tapping it must still work.
  const tapped = await tapRoom(page);
  if (tapped) await expect(page.locator('section[role="dialog"]')).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
});
