import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Replit serves the app through a proxy on a port it chooses, so both are read
 * from the environment with sensible local defaults. `allowedHosts` is open
 * because the proxy hostname is not known ahead of time.
 */
const PORT = Number(process.env.PORT ?? 5000);
const BASE_PATH = process.env.BASE_PATH ?? '/';

/**
 * Bind address.
 *
 * 0.0.0.0 is right for Replit, which proxies from outside the container, but
 * some sandboxes cannot enumerate network interfaces and the listen fails with
 * an opaque uv error. HOST makes that recoverable instead of fatal.
 */
/*
 * Loopback by default.
 *
 * `HOST` was already honoured here, and `npm run dev` overrode it with a fixed
 * `--host 0.0.0.0` on the command line — which wins over the config. So
 * Playwright set HOST=127.0.0.1, the flag ignored it, and the browser never
 * started. The flag is gone; set HOST=0.0.0.0 to expose the server on a LAN.
 */
const HOST = process.env.HOST ?? '127.0.0.1';

/**
 * Build stamp.
 *
 * Two rounds of verification were spent establishing that a deployment was
 * simply out of date. The running game now says which build it is and how many
 * assets that build expects, so the answer takes five seconds instead of a
 * round trip.
 */
function buildStamp() {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  let assets = 0;
  try {
    assets = JSON.parse(fs.readFileSync('public/assets/manifest.json', 'utf8')).entries.length;
  } catch {
    assets = 0;
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
  return { id: `${pkg.version}+${stamp}`, assets };
}

const BUILD = buildStamp();

export default defineConfig({
  base: BASE_PATH,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@data': path.resolve(__dirname, 'src/data'),
      '@render': path.resolve(__dirname, 'src/render'),
      '@bridge': path.resolve(__dirname, 'src/bridge'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@save': path.resolve(__dirname, 'src/save'),
      '@audio': path.resolve(__dirname, 'src/audio'),
      '@i18n': path.resolve(__dirname, 'src/i18n'),
    },
  },
  server: {
    host: HOST,
    port: PORT,
    strictPort: false,
    allowedHosts: true,
  },
  preview: {
    host: HOST,
    port: PORT,
    strictPort: false,
    allowedHosts: true,
  },
  define: {
    __BUILD_ID__: JSON.stringify(BUILD.id),
    __BUILD_ASSETS__: JSON.stringify(BUILD.assets),
  },
  build: {
    target: 'es2022',
    /*
     * Hidden, not shipped.
     *
     * `sourcemap: true` emits the map into dist AND links it from the bundle.
     * A map carries the original source verbatim — including anything gated
     * out of the minified build — so the test handle survives in dist even
     * though the shipped JavaScript no longer contains it. 'hidden' generates
     * the map for uploading to an error tracker without referencing it from
     * the bundle; the check below then removes it from dist entirely.
     */
    sourcemap: process.env.VITE_E2E === '1' ? true : 'hidden',
  },
});
