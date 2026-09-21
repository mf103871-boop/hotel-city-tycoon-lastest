/**
 * Bundles the prototype into one self-contained HTML file.
 *
 * esbuild rather than the game's Vite config on purpose: a plain bundler with
 * no plugins and no framework is the strictest possible check that `src/core`
 * really does stand on its own.
 */
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'dist');
await mkdir(out, { recursive: true });

const result = await build({
  entryPoints: [join(here, 'src/main.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: process.argv.includes('--minify'),
  write: false,
  loader: { '.json': 'json' },
  // The repo writes imports with an explicit `.ts`, which esbuild resolves
  // directly. Nothing else needs resolving: there are no dependencies.
  logLevel: 'info',
});

const js = result.outputFiles[0].text;
const html = await readFile(join(here, 'index.html'), 'utf8');
const inlined = html.replace(
  /<script type="module" src="\.\/src\/main\.ts"><\/script>/,
  `<script type="module">\n${js}\n</script>`,
);

await writeFile(join(out, 'index.html'), inlined);
console.log(`dist/index.html — ${(Buffer.byteLength(inlined) / 1024).toFixed(0)} KB`);
