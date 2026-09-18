/**
 * A renderer handle with no renderer in it.
 *
 * `HotelScene` was written against `RendererHandle` (app.ts) rather than
 * against Pixi's `Application`, and it turns out that is enough: every part of
 * the handle the scene touches — the stage's event hooks, the canvas's DOM
 * listeners, the background colour, a resize — can be a plain object, and the
 * layers are ordinary `Container`s, which construct without a GPU (measured
 * this session; `Text` does not, `Container`, `Graphics` and `Sprite` do).
 *
 * So the scene's wiring can be driven for real here: hand it a snapshot and
 * some effects, tick it, and count the children of the layer they were meant
 * to land in. That is a stronger proof than the source greps `render.ts` used
 * for BL-035, which could pass on an `addChild` in a dead branch.
 *
 * Its own module, with no side effects, for the reason `guest-factory.ts`
 * gives: importing a runnable selftest runs it.
 */
import { Container } from 'pixi.js';
import { LAYER } from '../../src/render/layout.ts';
import type { LayerName } from '../../src/render/layout.ts';
import type { RendererHandle } from '../../src/render/app.ts';

export interface FakeHandle {
  handle: RendererHandle;
  layers: Record<LayerName, Container>;
  /** DOM listener names the scene attached to the canvas. */
  canvasListeners: string[];
  /** What the scene set the clear colour to, last. */
  background: { color: number };
}

export function fakeRendererHandle(): FakeHandle {
  const world = new Container();
  world.label = 'world';
  world.sortableChildren = true;
  const layers = {} as Record<LayerName, Container>;
  for (const name of Object.keys(LAYER) as LayerName[]) {
    const container = new Container();
    container.label = name;
    container.zIndex = LAYER[name];
    container.cullable = true;
    world.addChild(container);
    layers[name] = container;
  }
  const stage = new Container();
  const canvasListeners: string[] = [];
  const background = { color: 0 };
  const app = {
    stage,
    canvas: { addEventListener: (name: string) => { canvasListeners.push(name); } },
    renderer: { background, resize: () => { /* no surface */ } },
    ticker: { add: () => { /* the test ticks by hand */ }, FPS: 60, deltaMS: 16.7 },
  };
  const handle = {
    app, world, layers, backend: 'webgl', destroy: () => { /* nothing to free */ },
  } as unknown as RendererHandle;
  return { handle, layers, canvasListeners, background };
}
