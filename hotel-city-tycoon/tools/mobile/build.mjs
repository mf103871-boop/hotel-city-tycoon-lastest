import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { URL } from 'node:url';

// Native apps ship local files. Never inherit the Pages subpath or test
// handles from a developer's environment when producing the mobile bundle.
// A previous web build must not leave stale hashed chunks in the app package.
rmSync(new URL('../../dist/', import.meta.url), { recursive: true, force: true });
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, BASE_PATH: '/', VITE_NATIVE: '1', VITE_E2E: '0' },
  shell: process.platform === 'win32',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
