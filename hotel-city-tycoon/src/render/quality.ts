/**
 * Which motion tier the rig runs at, and the URL flags that override it.
 *
 * The rig (HC-P2-S3, DEC-020) poses every person every frame on a GPU
 * backend. The DEC-009 lane is Pixi's CanvasRenderer, where every Graphics
 * part is a path fill and stroke redrawn each frame in software, so there
 * the rig samples its poses on the clip's own frame grid and leaves the
 * springs, the walk bob and the squash off — the 'lite' tier. That is what CI
 * draws; `?lite=0` exists so the full tier can be captured and measured on
 * that lane for evidence, and `?lite=1` so the sandbox's software WebGL can
 * be read at the lite tier. Neither is a quality lever for players yet
 * (BL-046 owns that); nothing here caches a person to a RenderTexture, which
 * DEC-019 forbids on the lane.
 *
 * `?aa=1` asks the renderer for antialiasing: live outlines are aliased under
 * Pixi's default on WebGL/WebGPU while the canvas lane antialiases, and the
 * phone reading (BL-044) needs both to compare.
 *
 * Reduced motion is a different concern and stays in characterView.ts, which
 * is where the `prefers-reduced-motion` query lives.
 *
 * Pure: no window, no document. HotelCanvas hands in `location.search`.
 */
export type MotionTier = 'full' | 'lite';

let tier: MotionTier = 'full';

export function setMotionTier(t: MotionTier): void {
  tier = t;
}

export function motionTier(): MotionTier {
  return tier;
}

/** The tier a backend gets unless the URL says otherwise. */
export function tierFor(backend: 'webgpu' | 'webgl' | 'canvas', request: MotionTier | null): MotionTier {
  return request ?? (backend === 'canvas' ? 'lite' : 'full');
}

export interface RenderFlags {
  /** A tier the URL asked for, or null to let the backend decide. */
  tier: MotionTier | null;
  aa: boolean;
}

/**
 * Read the flags from a query string. Only the literal `1` and `0` count —
 * `?lite=yes` is nobody's request — and a malformed query is no request.
 */
export function renderFlags(search: string): RenderFlags {
  try {
    const params = new URLSearchParams(search);
    const lite = params.get('lite');
    return {
      tier: lite === '1' ? 'lite' : lite === '0' ? 'full' : null,
      aa: params.get('aa') === '1',
    };
  } catch {
    return { tier: null, aa: false };
  }
}
