import { describe, it, expect } from 'vitest';
import { simData } from '../support/fixture.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { advance } from '../../src/core/sim/tick.ts';
import { execute } from '../../src/core/commands/index.ts';

const data = simData();
const TPS = data.economy.simulation.ticksPerSecond;
const fresh = (seed: number) => createInitialState(data, { seed, epochMs: 1_700_000_000_000 });

/**
 * If these ever fail, stop and find out why before shipping anything else.
 * Every other guarantee in the codebase — replay, save integrity, server
 * authority later — rests on the simulation being reproducible.
 */
describe('determinism', () => {
  it('produces an identical state from the same seed', () => {
    const run = () => {
      const s = fresh(20260828);
      execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
      advance(data, s, 6 * 3600 * TPS);
      return JSON.stringify(s);
    };
    expect(run()).toBe(run());
  });

  it('diverges for different seeds', () => {
    const run = (seed: number) => {
      const s = fresh(seed);
      execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
      advance(data, s, 3 * 3600 * TPS);
      return JSON.stringify(s);
    };
    expect(run(1)).not.toBe(run(2));
  });

  it('is unaffected by how the time is chunked', () => {
    const total = 3600 * TPS;
    const whole = fresh(555);
    execute(data, whole, { type: 'START_SHIFT', shiftId: 'shift_6h' });
    advance(data, whole, total);

    const chunked = fresh(555);
    execute(data, chunked, { type: 'START_SHIFT', shiftId: 'shift_6h' });
    for (let i = 0; i < 60; i++) advance(data, chunked, total / 60);

    expect(JSON.stringify(chunked)).toBe(JSON.stringify(whole));
  });

  it('leaves state untouched when a command is rejected', () => {
    const s = fresh(9);
    const before = JSON.stringify(s);
    const res = execute(data, s, { type: 'BUILD_ROOM', defId: 'family', x: 0, y: 0 });
    expect(res.ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('keeps the state JSON-serialisable', () => {
    const s = fresh(4);
    execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_2h' });
    advance(data, s, 600 * TPS);
    expect(JSON.stringify(JSON.parse(JSON.stringify(s)))).toBe(JSON.stringify(s));
  });
});
