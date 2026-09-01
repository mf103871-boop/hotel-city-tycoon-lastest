/**
 * Accessibility audit.
 *
 * Never examined once across ten phases. The game has been measured for
 * determinism, balance, payload size and dead data, and never for whether a
 * person can actually operate it: whether a thumb can hit the buttons, whether
 * the text is readable, whether someone who gets motion sick can play, whether
 * a screen reader announces anything useful.
 *
 * Everything here is measured from the source rather than asserted, because
 * "it looks fine" is exactly how these problems survive.
 *
 * Run: node --experimental-strip-types tools/selftest/accessibility.ts
 */
import fs from 'node:fs';
import path from 'node:path';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

// ---------------------------------------------------------------- sources
function uiFiles(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (/\.tsx$/.test(name)) out.push([full, fs.readFileSync(full, 'utf8')]);
    }
  };
  walk('src/ui');
  return out;
}

/**
 * The diagnostics badge is excluded.
 *
 * It is a developer tool shown behind `?debug=1`, not part of the interface a
 * player operates, and holding it to the same legibility floor would push
 * useful density out of it for no benefit to anyone.
 */
const files = uiFiles().filter(([f]) => !f.includes('DebugBadge'));
const css = fs.readFileSync('src/index.css', 'utf8');

// ---------------------------------------------------------------- contrast
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Relative luminance, per WCAG. */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The theme tokens, read from the stylesheet rather than duplicated here. */
function tokens(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    out[m[1]!] = m[2]!;
  }
  return out;
}

const T = tokens();

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — accessibility audit');
console.log(line);

// ---------------------------------------------------------------- targets
check('every tappable control is big enough for a thumb', () => {
  // The usual floor is 44px. Tailwind's py-1 is 4px of padding, which with
  // a 14px line box makes a 22px target — half of what a thumb needs.
  const MIN_PADDING_Y = 2;   // py-2 = 8px each side; 8+8+~20 line ≈ 36px minimum
  const problems: string[] = [];

  for (const [file, src] of files) {
    // Only elements that are actually pressed.
    //
    // Both quoted and template-literal className values, and across line
    // breaks: matching only `className="..."` read the first line of a
    // multi-line template and reported buttons as unsized when the guarantee
    // was two lines further down.
    for (const m of src.matchAll(/<button[\s\S]*?className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const classes = (m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, ' ');
      const py = /\bpy-\[?(\d+(?:\.\d+)?)/.exec(classes);
      const p = /\bp-\[?(\d+(?:\.\d+)?)/.exec(classes);
      const h = /\bh-(\d+)/.exec(classes);
      // A declared minimum height settles the question regardless of padding,
      // and is the honest way to guarantee a target rather than infer one.
      const minH = /\bmin-h-(\d+)/.exec(classes);
      const padding = Number(py?.[1] ?? p?.[1] ?? 0);
      const height = Number(h?.[1] ?? minH?.[1] ?? 0);
      if (height >= 10) continue;                    // h-10 / min-h-10 = 40px
      if (padding >= MIN_PADDING_Y) continue;
      problems.push(`${path.basename(file)}: py-${padding || 0}`);
    }
  }
  assert(problems.length === 0,
    `controls too small to hit reliably: ${[...new Set(problems)].join(', ')}`);
});

check('no text is smaller than it needs to be', () => {
  // Ten-pixel text is a label on a diagram, not something to read on a phone.
  const problems: string[] = [];
  for (const [file, src] of files) {
    for (const m of src.matchAll(/text-\[(\d+)px\]/g)) {
      const size = Number(m[1]!);
      if (size < 11) problems.push(`${path.basename(file)}: ${size}px`);
    }
  }
  assert(problems.length === 0,
    `text below 11px: ${[...new Set(problems)].join(', ')}`);
});

// ---------------------------------------------------------------- contrast
check('body text has enough contrast against its background', () => {
  const bg = T['ink-900'] ?? T['midnight-900'];
  const fg = T['cream-100'];
  assert(bg && fg, 'the theme is missing a background or foreground token');
  const ratio = contrast(fg, bg);
  assert(ratio >= 4.5, `body text is ${ratio.toFixed(2)}:1 against panels, below the 4.5 minimum`);
  console.log(`      body text ${ratio.toFixed(1)}:1 on panels`);
});

check('the primary action reads against its own background', () => {
  const coral = T['coral-500'];
  const ink = T['ink-950'];
  assert(coral && ink, 'the theme is missing the action colours');
  const ratio = contrast(ink, coral);
  assert(ratio >= 4.5,
    `the label on a primary button is ${ratio.toFixed(2)}:1, below the 4.5 minimum`);
  console.log(`      primary button label ${ratio.toFixed(1)}:1`);
});

check('numbers the player watches are legible', () => {
  const amber = T['amber-500'] ?? T['brass-400'];
  const bg = T['ink-900'] ?? T['midnight-900'];
  const ratio = contrast(amber!, bg!);
  // Coin counts are large text, where 3:1 is the threshold.
  assert(ratio >= 3, `currency figures are ${ratio.toFixed(2)}:1, below 3 even for large text`);
  console.log(`      currency figures ${ratio.toFixed(1)}:1`);
});

check('muted text is not invisible', () => {
  // Tailwind's slate-500 is #64748b; slate-400 is #94a3b8.
  const bg = T['ink-900'] ?? T['midnight-900'];
  const slate500 = '#64748b';
  const slate400 = '#94a3b8';
  const dim = contrast(slate500, bg!);
  const muted = contrast(slate400, bg!);
  assert(muted >= 4.5,
    `secondary text is ${muted.toFixed(2)}:1 — every hint and description sits at this level`);
  assert(dim >= 3,
    `the dimmest text is ${dim.toFixed(2)}:1, below the floor even for large text`);
  console.log(`      secondary ${muted.toFixed(1)}:1, dimmest ${dim.toFixed(1)}:1`);
});

// ---------------------------------------------------------------- labels
check('every icon-only control announces itself', () => {
  // A button whose whole content is a glyph reads as nothing to a screen
  // reader, and as nothing at all to somebody who does not know the icon.
  const problems: string[] = [];
  for (const [file, src] of files) {
    for (const m of src.matchAll(/<button([\s\S]*?)>\s*([^<\s{][^<]{0,3})\s*<\/button>/g)) {
      const attrs = m[1]!;
      const content = m[2]!.trim();
      if (!content || /^\{/.test(content)) continue;
      // A short literal that is not a word: an icon.
      if (/^[a-zA-Z0-9 ]+$/.test(content)) continue;
      if (/aria-label=/.test(attrs)) continue;
      problems.push(`${path.basename(file)}: "${content}"`);
    }
  }
  assert(problems.length === 0,
    `icon buttons with no label: ${problems.join(', ')}`);
});

check('the canvas is described to anyone who cannot see it', () => {
  const canvas = files.find(([f]) => f.includes('HotelCanvas'))?.[1] ?? '';
  assert(/aria-label=|role=/.test(canvas),
    'the canvas is an unlabelled blank to a screen reader, and it is most of the screen');
});

check('the document declares its language', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert(/<html[^>]*\blang=/.test(html), 'index.html does not declare a language');
  const app = fs.readFileSync('src/ui/App.tsx', 'utf8');
  assert(/documentElement\.lang/.test(app), 'the language never changes when the player switches it');
});

// ---------------------------------------------------------------- motion
check('animation respects a request for less motion', () => {
  // A hotel full of walking characters, sliding sheets and moving meters is a
  // lot of motion for somebody it makes ill.
  const respected = /prefers-reduced-motion/.test(css)
    || files.some(([, src]) => /prefers-reduced-motion|motion-reduce/.test(src));
  assert(respected,
    'nothing in the game responds to prefers-reduced-motion, and it animates constantly');
});

check('the interface does not depend on colour alone', () => {
  // The decor meter turns green when full and the hazard badge is coloured.
  // Both need a second signal.
  const room = fs.readFileSync('src/ui/RoomSheet.tsx', 'utf8');
  assert(/\{points\}\/\{target\}|\d+\/\d+/.test(room),
    'the decor meter communicates only through colour and length');
});

// ---------------------------------------------------------------- input
check('the canvas does not swallow keyboard focus', () => {
  const canvas = files.find(([f]) => f.includes('HotelCanvas'))?.[1] ?? '';
  assert(!/tabIndex=\{-1\}/.test(canvas) || /aria-label/.test(canvas),
    'the canvas is unreachable and unlabelled at once');
});

check('text can grow without the layout collapsing', () => {
  // Fixed pixel heights on anything containing text break at large font sizes.
  const problems: string[] = [];
  for (const [file, src] of files) {
    for (const m of src.matchAll(/className="[^"]*\bh-\[(\d+)px\][^"]*"/g)) {
      problems.push(`${path.basename(file)}: h-[${m[1]}px]`);
    }
  }
  assert(problems.length === 0,
    `fixed pixel heights that break with larger text: ${problems.join(', ')}`);
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
