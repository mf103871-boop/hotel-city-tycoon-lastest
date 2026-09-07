import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sprite, Texture, TextureSource } from 'pixi.js';
import { DecorView } from '../../src/render/decorView.ts';
import type { DecorPlacement } from '../../src/render/decorView.ts';

let generation = 0;
let loaded: Texture | null = null;
vi.mock('../../src/render/assets.ts', () => ({
  assetGeneration: () => generation,
  texture: () => loaded,
  entryFor: () => null,
}));

const piece: DecorPlacement = {
  key: 'room:bed', assetKey: 'decor.bed_simple', x: 64, y: 62,
  w: 53, h: 40, footY: 82, depth: 1, flipX: false, night: false,
  slotType: 'bed', category: 'bed',
};
afterEach(() => { loaded?.destroy(true); loaded = null; generation = 0; });

describe('furniture texture arrival', () => {
  it('replaces a placeholder when loading finishes without changing the piece', () => {
    const view = new DecorView();
    const sprite = view.children.find((child): child is Sprite => child instanceof Sprite)!;
    view.update(piece);
    expect(sprite.visible).toBe(false);
    expect(view.children).toHaveLength(2);
    loaded = new Texture({ source: new TextureSource({ width: 96, height: 72 }) });
    generation++;
    view.update(piece);
    expect(sprite.visible).toBe(true);
    expect(sprite.texture).toBe(loaded);
    expect(view.children).toHaveLength(1);
    expect(sprite.width).toBeCloseTo(piece.w);
    expect(sprite.height).toBeCloseTo(piece.h);
    view.destroy({ children: true });
  });

  it('recovers on a later retry and still resets correctly for pooled reuse', () => {
    const view = new DecorView();
    view.update(piece);
    generation++;
    view.update(piece);
    expect(view.children).toHaveLength(2);
    loaded = new Texture({ source: new TextureSource({ width: 96, height: 72 }) });
    generation++;
    view.update(piece);
    expect(view.children).toHaveLength(1);
    const sprite = view.children[0] as Sprite;
    expect(sprite.visible).toBe(true);
    view.reset();
    view.update({ ...piece, flipX: true, night: true });
    expect(view.scale.x).toBe(-1);
    expect(sprite.visible).toBe(true);
    expect(sprite.tint).not.toBe(0xffffff);
    view.destroy({ children: true });
  });
});
