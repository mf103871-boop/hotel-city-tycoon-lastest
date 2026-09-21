/**
 * Pixi bootstrap.
 *
 * WebGPU where available, WebGL2 everywhere else. The fallback is not
 * optional: WebGPU support on Android is still uneven, and a black screen on
 * a mid-range phone is worse than a slightly slower renderer.
 *
 * There is a third floor under both: since 8.16 Pixi falls through to its
 * CanvasRenderer when no 3D context exists, which is what the DEC-009 test
 * lane (`--disable-3d-apis`) has been running on all along while the badge
 * and the boot line called it `webgl`. It is reported as `canvas` now, so a
 * software backend on a phone, or in a CI log, is named for what it is
 * (DEC-019).
 *
 * Antialiasing stays off by default. The live rig (HC-P2-S3, DEC-020) draws
 * outlines as geometry, which WebGL/WebGPU leave aliased under that default
 * while the canvas lane antialiases regardless; `antialias` is the knob the
 * device reading compares (BL-044), reached through `?aa=1`.
 *
 * NOTE: this file cannot be verified without a browser. Everything in the
 * render layer that could be tested headlessly — camera, culling, pooling,
 * layout — deliberately lives elsewhere.
 */
import { Application, Container, RendererType } from 'pixi.js';
import { LAYER } from './layout.ts';
import { SKY } from './backdrop.ts';
import type { LayerName } from './layout.ts';

export interface RendererHandle {
  app: Application;
  /** Everything that moves with the camera. */
  world: Container;
  layers: Record<LayerName, Container>;
  backend: 'webgpu' | 'webgl' | 'canvas';
  destroy: () => void;
}

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** Capped at 2: beyond that the pixel cost buys nothing visible on a phone. */
  maxResolution?: number;
  background?: number;
  /** Smooth edges on WebGL/WebGPU. Off by default: crisp, and cheaper. */
  antialias?: boolean;
}

export async function createRenderer(opts: RendererOptions): Promise<RendererHandle> {
  const app = new Application();
  const resolution = Math.min(globalThis.devicePixelRatio || 1, opts.maxResolution ?? 2);

  const shared = {
    canvas: opts.canvas,
    width: opts.width,
    height: opts.height,
    // Sky, not the old warm charcoal. The backdrop paints its own sky over a
    // wide margin, but the clear colour is what shows for the instant before
    // the first snapshot lands and at the very edge of a hard fling.
    background: opts.background ?? SKY,
    antialias: opts.antialias ?? false,   // crisp pixel art; also cheaper
    resolution,
    autoDensity: true,
    powerPreference: 'high-performance' as const,
    // Test builds only. Keeping the WebGL drawing buffer is what lets an
    // in-page `drawImage` of the canvas read pixels back (measured: without
    // it the readback is fully transparent). It does NOT change what
    // Playwright screenshots (measured identical with and without), and the
    // white capture on a GPU-less SwiftShader host is BL-020, not this flag.
    // Vite inlines the env at build time, so production compiles the branch
    // away and check:cheats finds no `VITE_E2E` in dist (DEC-019).
    ...(import.meta.env.VITE_E2E === '1' ? { preserveDrawingBuffer: true } : {}),
  };

  try {
    await app.init({ ...shared, preference: 'webgpu' });
  } catch {
    await app.init({ ...shared, preference: 'webgl' });
  }

  const backend = detectBackend(app);

  // Printed on purpose: which backend initialised is the single most useful
  // fact when a device renders nothing, and it cannot be checked from a test.
  console.info(`[hotel-city-tycoon] renderer: ${backend}, resolution ${resolution}x`);

  const world = new Container();
  world.label = 'world';
  app.stage.addChild(world);

  const layers = {} as Record<LayerName, Container>;
  for (const name of Object.keys(LAYER) as LayerName[]) {
    const container = new Container();
    container.label = name;
    container.zIndex = LAYER[name];
    // Static layers are told not to recalculate their bounds every frame.
    container.cullable = true;
    world.addChild(container);
    layers[name] = container;
  }
  world.sortableChildren = true;

  return {
    app,
    world,
    layers,
    backend,
    destroy: () => {
      app.destroy({ removeView: false }, { children: true });
    },
  };
}

/**
 * Which backend actually initialised.
 *
 * Asking for WebGPU and getting it are different things: Pixi falls back
 * internally, and a browser can log "Failed to create WebGPU Context Provider"
 * while the request still appears to succeed. Reporting the requested backend
 * instead of the real one made the on-screen badge lie, which is worse than
 * having no badge.
 *
 * Checked three ways, cheapest first, so no single API change can break it.
 */
function detectBackend(app: Application): 'webgpu' | 'webgl' | 'canvas' {
  const renderer = app.renderer as unknown as {
    type?: number;
    name?: string;
    gl?: unknown;
    gpu?: unknown;
  };

  // 1. The enum, when Pixi exposes it. CANVAS (4) is checked first because
  //    it is the case the old two-way test silently misfiled as webgl.
  if (typeof renderer.type === 'number' && typeof RendererType?.WEBGPU === 'number') {
    if (renderer.type === RendererType.CANVAS) return 'canvas';
    if (renderer.type === RendererType.WEBGPU) return 'webgpu';
    if (renderer.type === RendererType.WEBGL) return 'webgl';
  }
  // 2. The context object each renderer actually owns.
  if (renderer.gpu != null) return 'webgpu';
  if (renderer.gl != null) return 'webgl';
  // 3. The name, as a last resort.
  const name = String(renderer.name ?? '').toLowerCase();
  if (name.includes('webgpu')) return 'webgpu';
  if (name.includes('canvas')) return 'canvas';
  return 'webgl';
}

/** Apply a camera to the world container. Called once per frame, allocation-free. */
export function applyCamera(
  world: Container,
  cam: { x: number; y: number; zoom: number },
  view: { width: number; height: number },
): void {
  world.scale.set(cam.zoom);
  world.position.set(view.width / 2 - cam.x * cam.zoom, view.height / 2 - cam.y * cam.zoom);
}
