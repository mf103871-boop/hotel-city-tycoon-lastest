/**
 * Pixi bootstrap.
 *
 * WebGPU where available, WebGL2 everywhere else. The fallback is not
 * optional: WebGPU support on Android is still uneven, and a black screen on
 * a mid-range phone is worse than a slightly slower renderer.
 *
 * NOTE: this file cannot be verified without a browser. Everything in the
 * render layer that could be tested headlessly — camera, culling, pooling,
 * layout — deliberately lives elsewhere.
 */
import { Application, Container, RendererType } from 'pixi.js';
import { LAYER } from './layout.ts';
import type { LayerName } from './layout.ts';

export interface RendererHandle {
  app: Application;
  /** Everything that moves with the camera. */
  world: Container;
  layers: Record<LayerName, Container>;
  backend: 'webgpu' | 'webgl';
  destroy: () => void;
}

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** Capped at 2: beyond that the pixel cost buys nothing visible on a phone. */
  maxResolution?: number;
  background?: number;
}

export async function createRenderer(opts: RendererOptions): Promise<RendererHandle> {
  const app = new Application();
  const resolution = Math.min(globalThis.devicePixelRatio || 1, opts.maxResolution ?? 2);

  const shared = {
    canvas: opts.canvas,
    width: opts.width,
    height: opts.height,
    background: opts.background ?? 0x1a1210,
    antialias: false,          // crisp pixel art; also cheaper
    resolution,
    autoDensity: true,
    powerPreference: 'high-performance' as const,
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
function detectBackend(app: Application): 'webgpu' | 'webgl' {
  const renderer = app.renderer as unknown as {
    type?: number;
    name?: string;
    gl?: unknown;
    gpu?: unknown;
  };

  // 1. The enum, when Pixi exposes it.
  if (typeof renderer.type === 'number' && typeof RendererType?.WEBGPU === 'number') {
    if (renderer.type === RendererType.WEBGPU) return 'webgpu';
    if (renderer.type === RendererType.WEBGL) return 'webgl';
  }
  // 2. The context object each renderer actually owns.
  if (renderer.gpu != null) return 'webgpu';
  if (renderer.gl != null) return 'webgl';
  // 3. The name, as a last resort.
  return String(renderer.name ?? '').toLowerCase().includes('webgpu') ? 'webgpu' : 'webgl';
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
