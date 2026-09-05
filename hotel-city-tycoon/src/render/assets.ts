/**
 * Asset loading.
 *
 * Two rules shape this file.
 *
 * First, **a missing texture must never crash the game.** Art arrives over
 * weeks, half of it will be wrong the first time, and a build that dies
 * because `room.spa.night.png` has not been drawn yet is useless to work in.
 * Anything missing falls back to the procedural placeholder that P3a already
 * draws, and the miss is recorded so it can be reported rather than hidden.
 *
 * Second, **nothing loads until it is needed.** 263 files at two resolutions
 * is far past the 3MB initial budget, so assets are grouped into bundles and
 * pulled in per scene.
 */
import { Assets } from 'pixi.js';
import type { Texture } from 'pixi.js';
import manifest from '../../public/assets/manifest.json' with { type: 'json' };

/** One row of a character sheet, as the manifest declares it. */
export interface AnimClip {
  /** Which row of the sheet, counting from the top. */
  row: number;
  frames: number;
  /** Drawn frames per second — 8 to 12, per ART-0 §11. Not the display rate. */
  fps: number;
  loop: boolean;
}

/**
 * A character sheet's layout, copied into the manifest from that character's
 * animation file (HC-P2-S1). The renderer reads sizes, pivot and rates from
 * here rather than from constants of its own, which is what ART-0 §17 asks
 * for: one number, one source, three consumers.
 */
export interface AnimSpec {
  frame: { w: number; h: number; pivotX: number; pivotY: number };
  clips: Record<string, AnimClip>;
}

export interface AssetEntry {
  key: string;
  bundle: string;
  file: string;
  width: number;
  height: number;
  required: boolean;
  note?: string;
  /** Present on character sheets, absent on everything else. */
  anim?: AnimSpec;
}

export interface AssetManifest {
  version: number;
  blockSize: { w: number; h: number };
  resolutions: number[];
  format: string;
  bundles: string[];
  entries: AssetEntry[];
}

export const MANIFEST = manifest as AssetManifest;

const BY_KEY = new Map(MANIFEST.entries.map((e) => [e.key, e]));
const BY_BUNDLE = new Map<string, AssetEntry[]>();
for (const entry of MANIFEST.entries) {
  const list = BY_BUNDLE.get(entry.bundle) ?? [];
  list.push(entry);
  BY_BUNDLE.set(entry.bundle, list);
}

/** Keys that were asked for but had no file. Reported, never thrown. */
const missing = new Set<string>();
const loadedBundles = new Set<string>();

/**
 * Bumped whenever a bundle finishes loading.
 *
 * Views cache what they last drew and skip redundant work. Without this
 * counter in that cache key, a sprite created before its texture arrived kept
 * its placeholder forever — which is exactly what shipped: a street of blank
 * capsules beside one properly drawn character, because only the latecomer was
 * built after the bundle landed.
 */
let generation = 0;

export function assetGeneration(): number {
  return generation;
}

/** How many assets this build's manifest declares. */
export function declaredAssetCount(): number {
  return MANIFEST.entries.length;
}

/**
 * Where the art is served from.
 *
 * It lives under public/ so Vite serves it in development and copies it into
 * dist for production. An earlier version kept it in a sibling `assets/`
 * directory, which meant the files existed, validated, and were never once
 * served to the browser.
 *
 * BASE_URL is respected because Replit serves the app under a path prefix.
 */
const BASE = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
  ? import.meta.env.BASE_URL
  : '/';
const ASSET_ROOT = `${BASE.replace(/\/$/, '')}/assets`;

/** Pick the resolution tier for this device, capped where extra pixels stop paying. */
export function resolutionTier(devicePixelRatio: number): number {
  const tiers = [...MANIFEST.resolutions].sort((a, b) => a - b);
  let chosen = tiers[0] ?? 1;
  for (const tier of tiers) if (devicePixelRatio >= tier) chosen = tier;
  return chosen;
}

export function urlFor(entry: AssetEntry, tier: number): string {
  return tier > 1
    ? `${ASSET_ROOT}/@${tier}x/${entry.file}`
    : `${ASSET_ROOT}/${entry.file}`;
}

/**
 * Load one bundle. Individual failures are absorbed: one bad file must not
 * take down the twenty good ones beside it.
 */
export async function loadBundle(
  bundle: string,
  tier = 1,
): Promise<{ loaded: number; missing: string[]; fellBack: number }> {
  if (loadedBundles.has(bundle)) return { loaded: 0, missing: [], fellBack: 0 };
  const entries = BY_BUNDLE.get(bundle) ?? [];

  const results = await Promise.allSettled(
    entries.map(async (entry) => {
      try {
        const texture = await Assets.load<Texture>({ alias: entry.key, src: urlFor(entry, tier) });
        return { key: entry.key, texture, fellBack: false };
      } catch (error) {
        // HC-P1-S2 (BL-016). A tier above 1x is a nicer copy of the same
        // picture, never the only copy. When the @2x file is absent — a
        // partial delivery, or a stale deployment — the 1x file is drawn
        // instead of a placeholder. Only a miss at 1x counts as missing.
        if (tier <= 1) throw error;
        // Loaded by URL, then filed under the key directly: the failed attempt
        // already bound the alias to the higher-tier URL in Pixi's resolver,
        // and `texture()` reads the cache by key, not the resolver.
        const texture = await Assets.load<Texture>(urlFor(entry, 1));
        Assets.cache.set(entry.key, texture);
        return { key: entry.key, texture, fellBack: true };
      }
    }),
  );

  let loaded = 0;
  let fellBack = 0;
  const failures: string[] = [];
  results.forEach((result, i) => {
    const entry = entries[i];
    if (!entry) return;
    if (result.status === 'fulfilled') {
      loaded++;
      if (result.value.fellBack) fellBack++;
      // A view may have asked for this key before the bundle landed. Now that
      // the file is here, that earlier miss must not outlive it.
      missing.delete(entry.key);
    } else { missing.add(entry.key); failures.push(entry.key); }
  });

  loadedBundles.add(bundle);
  generation++;
  if (fellBack > 0) {
    console.info(`[assets] bundle "${bundle}": ${fellBack} of ${loaded} served at @1x (no @${tier}x file)`);
  }
  if (failures.length > 0) {
    console.warn(`[assets] bundle "${bundle}": ${loaded} loaded, ${failures.length} missing (placeholders will be used)`);
  }
  return { loaded, missing: failures, fellBack };
}

/**
 * A texture for `key`, or null when there is none.
 *
 * Callers draw their placeholder on null. That is the contract: the renderer
 * always has something to show.
 */
export function texture(key: string): Texture | null {
  if (missing.has(key)) return null;
  const found = Assets.cache.has(key) ? Assets.get<Texture>(key) : null;
  if (found) return found;
  /*
   * A miss only counts once the key's bundle has actually been loaded.
   *
   * The scene draws as soon as the rooms land while the other bundles are
   * still on their way. Recording those early lookups as "missing" made the
   * placeholder permanent: the bundle arrived, refreshArt() asked again, and
   * this function said no without looking. A fresh hotel's two staff were
   * drawn as capsules for the whole session on every boot. A key the manifest
   * does not know at all is missing for good and is recorded at once.
   */
  const bundle = BY_KEY.get(key)?.bundle;
  if (bundle === undefined || loadedBundles.has(bundle)) missing.add(key);
  return null;
}

export function hasTexture(key: string): boolean {
  return !missing.has(key) && Assets.cache.has(key);
}

/** Everything that was asked for and not found. For the debug badge. */
export function missingKeys(): string[] {
  return [...missing].sort();
}

/** Manifest entry for a key, so a caller can size its placeholder correctly. */
export function entryFor(key: string): AssetEntry | undefined {
  return BY_KEY.get(key);
}

export function requiredEntries(): AssetEntry[] {
  return MANIFEST.entries.filter((e) => e.required);
}

/** Reset between tests. */
export function resetAssetState(): void {
  missing.clear();
  loadedBundles.clear();
  generation = 0;
}
