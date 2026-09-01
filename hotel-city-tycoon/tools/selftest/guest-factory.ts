/**
 * A guest for a fixture, with everything `GuestInstance` requires.
 *
 * Its own module on purpose. This used to live in `core-helpers.ts`, which is
 * also a runnable selftest — importing it executed that suite and called
 * `process.exit`, silently truncating whatever imported it. A shared factory
 * must not have a side effect.
 *
 * Sixteen call sites used to build guests by hand, so every field added to
 * `GuestInstance` meant sixteen edits. Pass only what the check is about.
 */
import type { GuestInstance } from '../../src/core/state/types.ts';

export function testGuest(over: Partial<GuestInstance> & { id: string }): GuestInstance {
  return {
    typeId: 'standard',
    state: 'arriving',
    roomId: null,
    stateSinceTick: 0,
    finishesAtTick: 0,
    desire: null,
    patienceUntilTick: 0,
    patienceTotalTicks: 600,
    waitedTicks: 0,
    satisfaction: -1,
    satisfactionLog: [],
    desireMet: false,
    sawIncident: false,
    ratedQuality: -1,
    ratedCleanliness: -1,
    review: -1,
    leaveReason: null,
    everCheckedIn: false,
    ...over,
  };
}
