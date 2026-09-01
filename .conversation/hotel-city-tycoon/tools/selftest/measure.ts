/**
 * Timing, measured so the answer does not depend on the machine's mood.
 *
 * The self-tests used to time an operation ONCE and compare that single
 * sample against a budget. On this codebase the same call, on the same input,
 * in the same process, measures anywhere from 14ms to 62ms — a 4.5x spread
 * caused by JIT tiering on the first calls and by garbage collection landing
 * inside the timed region. A single sample therefore tests the machine, not
 * the code: the 59-second catch-up check passed when run alone (47.6ms) and
 * failed inside the full suite (53.1ms) with nothing about the engine
 * different between the two.
 *
 * So: warm up (discarded, to get past JIT tiering), then take several samples
 * and judge on the MEDIAN. The median ignores an unlucky GC pause without
 * hiding a real regression — if the code genuinely gets slower, every sample
 * moves and the median moves with them. min and max come back too, so a
 * report can show the spread instead of pretending timing is exact.
 *
 * What this deliberately does NOT do is relax any budget. The budgets are
 * unchanged; only the estimator is fixed.
 */

export interface Timing {
  /** The estimator to judge against: robust to a single unlucky sample. */
  median: number;
  /** The best sample — what the code can do when nothing interferes. */
  min: number;
  /** The worst sample — kept for reporting, never for gating. */
  max: number;
  /** Every sample, in the order measured. */
  samples: number[];
}

/**
 * Warm up, then take `runs` samples and report the spread. `prepare` builds a
 * fresh input for each run, since these operations mutate what they are given.
 *
 * The numbers behind the defaults, measured on this codebase: one warm-up run
 * is not enough — V8 is still tiering up, and the first few samples of a fresh
 * process land 20–60ms while the settled ones land 13–14ms. With two warm-ups
 * and nine samples the median of the 59-second catch-up check measured
 * 13.3–14.1ms across repeated trials, against a 50.1ms budget: stable enough
 * that the check answers a question about the engine rather than about what
 * else the machine was doing.
 */
export function measure<T>(
  prepare: () => T,
  fn: (input: T) => void,
  runs = 9,
): Timing {
  fn(prepare()); // warm-up, discarded
  fn(prepare()); // second warm-up: one is not enough to finish tiering up

  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const input = prepare();
    const started = performance.now();
    fn(input);
    samples.push(performance.now() - started);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  return {
    median: sorted[Math.floor(sorted.length / 2)]!,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    samples,
  };
}

/** `14.2ms median (12.9–31.4 over 5 runs)` — for the console line. */
export function describe(t: Timing): string {
  return `${t.median.toFixed(1)}ms median (${t.min.toFixed(1)}–${t.max.toFixed(1)} over ${t.samples.length} runs)`;
}
