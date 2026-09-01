/**
 * Paste this into the browser console on the running game and send me the
 * output.
 *
 * It reports the things I cannot check from here and that have actually broken
 * this project before: which renderer initialised, whether the art is really
 * being served, whether the save survives, and how the simulation is moving.
 *
 * It reads only. Nothing here changes your hotel.
 */
(async () => {
  const out = [];
  const say = (label, value) => out.push(`${label.padEnd(24)} ${value}`);
  const ok = (b) => (b ? 'YES' : 'NO');

  say('url', location.href);
  say('user agent', navigator.userAgent.slice(0, 70));
  say('screen', `${innerWidth}x${innerHeight} @${devicePixelRatio}x`);

  // ---- did it boot ----------------------------------------------------
  const canvas = document.querySelector('canvas');
  say('canvas present', ok(!!canvas));
  if (canvas) say('canvas size', `${canvas.width}x${canvas.height}`);
  say('still loading', ok(!!document.body.textContent.match(/^\s*…\s*$/)));

  // ---- is the art actually being served -------------------------------
  const base = location.pathname.replace(/\/[^/]*$/, '/');
  const probe = async (path) => {
    try {
      const res = await fetch(base + path, { cache: 'no-store' });
      const size = Number(res.headers.get('content-length') ?? 0);
      return `${res.status}${size ? ` (${(size / 1024).toFixed(0)}KB)` : ''}`;
    } catch (e) {
      return `FAILED ${e.message}`;
    }
  };
  say('manifest.json', await probe('assets/manifest.json'));
  say('lobby art', await probe('assets/rooms/lobby_base.png'));
  say('a walk sheet', await probe('assets/characters/guest_tourist_walk.png'));
  say('a sound', await probe('assets/audio/coin.wav'));
  say('web manifest', await probe('manifest.webmanifest'));
  say('service worker', await probe('sw.js'));

  // ---- what the game itself thinks ------------------------------------
  const badge = [...document.querySelectorAll('button')]
    .map((b) => b.textContent ?? '')
    .find((t) => t.includes('renderer') || /fps/.test(t));
  say('debug badge', badge ? badge.replace(/\s+/g, ' ').trim() : 'not visible');

  // ---- the save --------------------------------------------------------
  try {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('hotel-city-tycoon', 1);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onupgradeneeded = () => res(r.result);
    });
    const value = await new Promise((res) => {
      try {
        const req = db.transaction('kv', 'readonly').objectStore('kv').get('hct:save');
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
      } catch { res(null); }
    });
    if (typeof value === 'string') {
      const save = JSON.parse(value);
      const s = save.state;
      say('save found', `version ${save.version}, ${(value.length / 1024).toFixed(0)}KB`);
      say('  rooms', s.hotel.rooms.length);
      say('  coins', s.player.coins.toLocaleString());
      say('  level / stars', `${s.player.level} / ${s.hotel.stars}`);
      say('  tick', s.tick);
      say('  guests on site', s.guests.length);
      say('  guests served', s.stats.guestsServed);
      say('  shift', s.shift.activeShiftId ?? 'closed');
      say('  objectives claimed', (s.completedObjectives ?? []).length);
    } else {
      say('save found', 'NO — nothing stored yet');
    }
  } catch (e) {
    say('save found', `ERROR ${e.message}`);
  }

  // ---- is time moving --------------------------------------------------
  const readTick = async () => {
    try {
      const db = await new Promise((res) => {
        const r = indexedDB.open('hotel-city-tycoon', 1);
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(null);
      });
      if (!db) return null;
      const v = await new Promise((res) => {
        const req = db.transaction('kv', 'readonly').objectStore('kv').get('hct:save');
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
      });
      return typeof v === 'string' ? JSON.parse(v).state.tick : null;
    } catch { return null; }
  };
  const before = await readTick();
  await new Promise((r) => setTimeout(r, 4000));
  const after = await readTick();
  say('simulation moving',
    before === null || after === null ? 'unknown' : after > before ? `YES (+${after - before} ticks)` : 'NO');

  // ---- service worker --------------------------------------------------
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    say('worker registered', regs.length ? 'YES' : 'NO (dev build, expected)');
  }

  const report = out.join('\n');
  console.log('\n===== HOTEL CITY TYCOON — DIAGNOSTIC =====\n' + report + '\n=========================================\n');
  try {
    await navigator.clipboard.writeText(report);
    console.log('(copied to clipboard)');
  } catch {
    console.log('(select the block above and copy it)');
  }
  return report;
})();
