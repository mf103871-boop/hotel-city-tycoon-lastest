import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from '@ui/App';
import { ErrorBoundary } from '@ui/ErrorBoundary';

// Printed first, before anything can fail: which build is actually running.
console.info(
  `[hotel-city-tycoon] build ${typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'}` +
  `, ${typeof __BUILD_ASSETS__ === 'number' ? __BUILD_ASSETS__ : '?'} assets declared`,
);

/**
 * A diagnostic that does not depend on the game working.
 *
 * The badge lives inside React, so a build that fails to render also hides the
 * one tool for finding out why. `window.hct.report()` is defined before
 * anything else runs and answers from the DOM and the network directly.
 */
declare global {
  interface Window { hct?: { report: () => Promise<string> } }
}

window.hct = {
  report: async () => {
    const lines: string[] = [];
    const say = (k: string, v: string | number) => lines.push(`${k.padEnd(22)} ${v}`);
    const build = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
    const declared = typeof __BUILD_ASSETS__ === 'number' ? __BUILD_ASSETS__ : 0;

    say('build', build);
    say('assets declared', declared);
    say('url', location.href);
    say('canvas', document.querySelector('canvas') ? 'present' : 'MISSING');

    const base = location.pathname.replace(/\/[^/]*$/, '/');
    const probe = async (file: string) => {
      try {
        const res = await fetch(base + file, { cache: 'no-store' });
        return `${res.status} ${res.ok ? `${((Number(res.headers.get('content-length')) || 0) / 1024).toFixed(0)}KB` : ''}`;
      } catch (e) {
        return `FAILED ${(e as Error).message}`;
      }
    };
    // A walk sheet is the sharpest test of deployment freshness: it exists
    // only in builds from the point the animation work landed.
    say('character sheet', await probe('assets/characters/guest_standard_sheet.png'));
    say('room art', await probe('assets/rooms/lobby_base.png'));
    say('manifest', await probe('assets/manifest.json'));

    try {
      const res = await fetch(base + 'assets/manifest.json', { cache: 'no-store' });
      const served = (await res.json()).entries.length as number;
      say('manifest entries', `${served} served vs ${declared} expected`);
      if (served !== declared) {
        say('VERDICT', 'the served assets do not match this build — redeploy');
      }
    } catch {
      say('manifest entries', 'unreadable');
    }

    const report = lines.join('\n');
    console.log('\n===== HOTEL CITY TYCOON =====\n' + report + '\n=============================\n');
    try { await navigator.clipboard.writeText(report); console.log('(copied)'); } catch { /* select it */ }
    return report;
  },
};

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// An escape hatch, before anything else runs.
//
// Two verification rounds were spent on a deployment that had not changed. If
// a stale worker is ever the reason, `?fresh=1` clears every cache and
// unregisters every worker, so "is the new build really live" has a
// definitive answer rather than a theory.
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('fresh')) {
  void (async () => {
    try {
      const registrations = await navigator.serviceWorker?.getRegistrations?.() ?? [];
      await Promise.all(registrations.map((r) => r.unregister()));
      const keys = await caches?.keys?.() ?? [];
      await Promise.all(keys.map((k) => caches.delete(k)));
      console.info(`[fresh] cleared ${registrations.length} workers and ${keys.length} caches`);
    } catch (e) {
      console.warn('[fresh] could not clear everything', e);
    }
    window.location.replace(window.location.pathname);
  })();
}

// Registered in production only: a service worker caching a dev bundle makes
// every change invisible until someone clears storage by hand.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // An unavailable service worker is a missing optimisation, not a failure.
    });
  });
}

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
