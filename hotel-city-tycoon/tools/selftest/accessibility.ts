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
  // This assertion used to be `/\{points\}\/\{target\}|\d+\/\d+/`, and its
  // second alternative matches any "digits/digits" in the file — which every
  // Tailwind opacity modifier is. `border-brass-500/60` satisfied it. The
  // check could not fail, so it was not a check.
  //
  // Each state the game paints a colour for is listed with the second signal
  // that has to travel with it, and every one is asserted separately.
  // Comments are stripped first. The star assertion below passed against the
  // sentence in CityPanel's own docblock explaining the fix, which is the same
  // failure mode as the regex this check replaced: matching prose, not code.
  const read = (f: string) => fs.readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

  const room = read('src/ui/RoomSheet.tsx');
  assert(/\{points\}\/\{target\}/.test(room),
    'the decor meter has no numeric readout — it is a colour and a length');

  const toasts = read('src/ui/Toasts.tsx');
  const marks = /const TONE_MARK = \{([^}]*)\}/.exec(toasts);
  assert(marks, 'toast tones carry no mark beside their colour');
  const tones = [...(/const TONE_STYLE = \{([^}]*)\}/.exec(toasts)?.[1] ?? '')
    .matchAll(/^\s*(\w+):/gm)].map((m) => m[1]!);
  assert(tones.length > 0, 'no toast tones found');
  for (const tone of tones) {
    assert(new RegExp(`\\b${tone}:`).test(marks[1]!), `toast tone "${tone}" has a colour but no mark`);
  }

  const city = read('src/ui/CityPanel.tsx');
  assert(/★/.test(city) && /☆/.test(city),
    'earned and unearned star pips are the same glyph in two colours');

  // The room's hazards: each has its own sprite, and the drawn fallback under
  // it must not be the only thing separating one hazard from another.
  const roomView = read('src/render/roomView.ts');
  const overlays = [...roomView.matchAll(/'(event\.\w+\.overlay)'/g)].map((m) => m[1]!);
  assert(overlays.length >= 3, `expected a sprite per hazard, found ${overlays.length}`);
  assert(new Set(overlays).size === overlays.length, 'two hazards share one overlay sprite');
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

// ---------------------------------------------------------------- palette
/**
 * Tailwind v4's own colour families.
 *
 * Any other family name in a utility class has to be declared in `@theme`, or
 * Tailwind emits no rule at all for it — which is not a missing style but a
 * wrong one, because the element then inherits whatever colour its parent had.
 */
const TAILWIND_FAMILIES = new Set([
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan',
  'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
  'slate', 'gray', 'zinc', 'neutral', 'stone',
]);
const TAILWIND_SHADES = new Set([
  '50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950',
]);

const COLOUR_UTILITY = /\b(?:bg|text|border|ring|from|to|via|fill|stroke|shadow|outline|accent|caret|divide|placeholder|decoration)-([a-z]+)-([a-z0-9]+)(?=\b|\/)/g;

/**
 * Families that are not colours despite matching the shape.
 *
 * `bg-gradient-to-b` parses as family "gradient", shade "to"; so do the
 * linear/radial/conic forms. They declare a direction, not a colour, and the
 * colours themselves arrive through from-/via-/to-, which this check does see.
 */
const NOT_A_COLOUR = new Set(['gradient', 'linear', 'radial', 'conic']);

check('every colour class a component asks for actually exists', () => {
  // The check that would have caught `text-water-hi` and `text-brass-300`:
  // six call sites across four components named colours that `@theme` never
  // declared, so Tailwind emitted nothing and the gem price, the climate
  // banner's border, the weekly-gift callout and the Upgrade/Replace actions
  // all silently rendered in their parent's colour instead of their own.
  const declared = new Set(Object.keys(T));
  const problems: string[] = [];
  for (const [file, src] of uiFiles()) {
    for (const m of src.matchAll(COLOUR_UTILITY)) {
      const [, family, shade] = m as unknown as [string, string, string];
      if (NOT_A_COLOUR.has(family)) continue;
      if (declared.has(`${family}-${shade}`)) continue;
      if (TAILWIND_FAMILIES.has(family) && TAILWIND_SHADES.has(shade)) continue;
      problems.push(`${path.basename(file)}: ${m[0]}`);
    }
  }
  assert(problems.length === 0,
    `colour classes that produce no CSS: ${[...new Set(problems)].join(', ')}`);
});

/** Composite `fg` at `alpha` over `bg`, both #rrggbb. */
function over(fg: string, bg: string, alpha: number): string {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  const ch = (i: 0 | 1 | 2) => Math.round(f[i] * alpha + b[i] * (1 - alpha));
  return `#${[ch(0), ch(1), ch(2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The brightest thing the renderer can paint behind a panel.
 *
 * Not the page ground. Every panel in this game is translucent and floats on
 * the canvas, so a ramp measured against `ink-950` reads a whole step better
 * than it is — which is exactly how `sand-500` was calculated at 5.2:1 and
 * shipped at 3.9:1. The hotel can be panned under any panel, and its palest
 * wall is hcstyle.py's `wallCream`.
 */
const BRIGHTEST_BACKDROP = '#fbe7b8';

check('every text colour clears WCAG AA on the worst panel the game can make', () => {
  // `slate-500` (3.6:1) and `slate-600` (2.3:1) were the ramp for every piece
  // of secondary copy in the game. Both are below WCAG AA, and slate-600 was
  // carrying the text that explains why a purchase is refused.
  //
  // sand-600 is exempt: it is not for text. It exists for the unlit ☆ of a
  // star rating, which is a shape as well as a colour.
  const DECORATIVE = new Set(['sand-600']);

  // The lowest panel opacity any component actually uses, read from the
  // source: lower the opacity anywhere and this floor drops with it.
  //
  // Only the three tokens that are actually text surfaces. `ink-950` is the
  // page ground and the level bar's track — a bar carries no text, and folding
  // its 45% into this floor would demand a text ramp no chrome needs.
  let lowest = 1;
  const found: string[] = [];
  for (const [, src] of uiFiles()) {
    for (const m of src.matchAll(/\bbg-(?:ink-900|midnight-900|midnight-800)\/(\d{2})\b/g)) {
      const alpha = Number(m[1]) / 100;
      found.push(m[0]);
      if (alpha < lowest) lowest = alpha;
    }
  }
  assert(found.length > 0, 'no translucent panel found — has the chrome changed?');
  const panel = over(T['ink-900']!, BRIGHTEST_BACKDROP, lowest);

  const problems: string[] = [];
  for (const [name, hex] of Object.entries(T)) {
    if (!name.startsWith('sand-') || DECORATIVE.has(name)) continue;
    const ratio = contrast(hex, panel);
    if (ratio < 4.5) {
      problems.push(`${name} on the ${Math.round(lowest * 100)}% panel (${panel}) is ${ratio.toFixed(2)}:1`);
    }
  }
  // The money figures are the numbers the player is actually watching.
  for (const name of ['brass-400', 'water-hi']) {
    const ratio = contrast(T[name]!, panel);
    if (ratio < 4.5) problems.push(`${name} is ${ratio.toFixed(2)}:1`);
  }
  assert(problems.length === 0, `text colours below WCAG AA: ${problems.join(', ')}`);
});

check('nothing the canvas shows through is used to draw a control', () => {
  // The level bar's track was `bg-white/10`, drawn outside the HUD panel
  // directly on the canvas: white at a tenth over the sky is #7EC3FA against
  // #6FBCF9, and a screenshot of the empty bar was pixel-identical to the sky.
  // A control on bare canvas cannot lean on the page ground it is not on.
  const problems: string[] = [];
  for (const [file, src] of uiFiles()) {
    for (const m of src.matchAll(/\bbg-white\/(\d{1,2})\b/g)) {
      // Inside a panel a white veil is a legitimate raised surface; the sin is
      // using one as the only body of a control that has no panel under it.
      const around = src.slice(Math.max(0, m.index! - 400), m.index!);
      const onCanvas = /pointer-events-(?:none|auto) absolute|absolute inset-x-0 (?:top|bottom)-0/.test(around)
        && !/bg-(?:ink|midnight)-9\d0\//.test(src.slice(m.index!, m.index! + 200));
      if (onCanvas && Number(m[1]) <= 10) {
        problems.push(`${path.basename(file)}: ${m[0]} on bare canvas`);
      }
    }
  }
  assert(problems.length === 0,
    `controls drawn in a veil the canvas shows straight through: ${problems.join(', ')}`);
});

check('nothing in the interface is painted in the cold ramp the palette replaced', () => {
  // src/index.css says the interface was warmed so it would stop fighting the
  // art's temperature. It said so while 92 elements were still written in
  // Tailwind's blue-grey `slate` on warm brown chrome. A comment is not a
  // guarantee; this is.
  const problems: string[] = [];
  for (const [file, src] of uiFiles()) {
    for (const m of src.matchAll(/\b(?:bg|text|border|ring|fill|stroke|divide|placeholder)-(slate|gray|zinc|blue|indigo|sky|cyan)-\d+/g)) {
      problems.push(`${path.basename(file)}: ${m[0]}`);
    }
  }
  assert(problems.length === 0,
    `cold-ramp colours on warm chrome: ${[...new Set(problems)].join(', ')}`);
});

check('ordered number pairs keep their order in Arabic', () => {
  // `140 → 56` in a right-to-left paragraph is painted `56 → 140`: both
  // numbers resolve to right-to-left runs and the arrow between them is a
  // neutral that joins them, so the group is laid out right-to-left. Measured
  // in Chromium, not reasoned about. In Arabic that made every shop discount
  // read as a price rise, every upgrade as a downgrade, and every room's
  // width and height swap places.
  //
  // The fix is an isolate: `pair()` from src/i18n/format.ts for strings, the
  // <Pair> component for JSX. This finds a pair that has neither.
  // Both sides have to be numbers. `3 × شبح` is a number and an Arabic word,
  // and right-to-left is where that one belongs — the count reads first when
  // read from the right. It is two *numbers* either side of the mark that
  // swap, so an interpolation calling `t(...)` disqualifies the match.
  const NUMERIC = (slot: string): boolean => !/\bt\(/.test(slot);
  const PAIRED = [
    /\{([^{}]*)\}[^{}<>]{0,12}(?:→|·|×)[^{}<>]{0,12}\{([^{}]*)\}/,
    /\$\{([^{}]*)\}[^{}]{0,12}(?:→)[^{}]{0,12}\$\{([^{}]*)\}/,
    /\$\{([^{}]*)\}\s*×\s*\$?\{?([^{}]*)\}?/,
  ];
  const problems: string[] = [];
  for (const [file, src] of uiFiles()) {
    if (/\/Pair\.tsx$/.test(file)) continue;
    src.split('\n').forEach((raw, i) => {
      const codeOnly = raw.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
      if (!/→|×/.test(codeOnly)) return;
      if (/\bpair\(/.test(codeOnly) || /<Pair>/.test(codeOnly)) return;
      // The mark itself has to be a separator, not a suffix on one number.
      if (!/(?:→|(?:^|[\s}])×)/.test(codeOnly)) return;
      for (const re of PAIRED) {
        const m = re.exec(codeOnly);
        if (!m) continue;
        if (!NUMERIC(m[1] ?? '') || !NUMERIC(m[2] ?? '')) continue;
        problems.push(`${path.basename(file)}:${i + 1}: ${codeOnly.trim().slice(0, 70)}`);
        break;
      }
    });
  }
  assert(problems.length === 0,
    `number pairs that reverse in Arabic: ${problems.join(' | ')}`);
});

check('the phone\'s own chrome agrees with the app it frames', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const manifest = JSON.parse(fs.readFileSync('public/manifest.webmanifest', 'utf8')) as
    { theme_color?: string; background_color?: string };
  const meta = /<meta name="theme-color" content="(#[0-9a-fA-F]{6})"/.exec(html);
  assert(meta, 'index.html declares no theme-color');
  const declared = meta[1]!.toLowerCase();
  assert(declared === manifest.theme_color?.toLowerCase(),
    `theme-color disagrees between index.html (${declared}) and the manifest (${manifest.theme_color})`);
  assert(manifest.theme_color?.toLowerCase() === manifest.background_color?.toLowerCase(),
    `the manifest's theme and splash colours disagree (${manifest.theme_color} vs ${manifest.background_color})`);

  // `black-translucent` puts white system glyphs over the page, and with
  // viewport-fit=cover the page under them is the canvas — white on the day
  // sky is 2.05:1. Something opaque has to cover the inset.
  if (/apple-mobile-web-app-status-bar-style"\s+content="black-translucent"/.test(html)) {
    const hud = fs.readFileSync('src/ui/Hud.tsx', 'utf8');
    assert(/safe-area-inset-top/.test(hud) && /from-ink-950/.test(hud),
      'black-translucent status bar with nothing painted behind the safe-area inset');
  }
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
