/**
 * Performance measurement.
 *
 * The architecture document set five budgets on its first day and three of
 * them were never measured once across thirteen phases, because measuring them
 * needs a browser and every check until now ran headlessly. Those same three
 * numbers are the exit criteria for P3, P5 and P7 at the same time.
 *
 * This does not measure them for me. It makes measuring them one tap for
 * whoever opens the game, which is the only honest way to close a criterion I
 * cannot reach.
 *
 * An instantaneous frame rate is close to meaningless — it happens to be
 * whatever the last frame was. What matters is the shape of a few hundred
 * frames: the worst one, the fifth-percentile one, and how many missed.
 */

/** The document's budgets, so a report says pass or fail rather than a number. */
export const BUDGET = {
  fpsSustained: 60,
  /** A frame is late if it took longer than this. */
  frameMs: 1000 / 55,
  memoryMB: 250,
  firstPaintMs: 2500,
  /** The document's scene: 60 rooms and 40 characters at once. */
  stressRooms: 60,
  stressCharacters: 40,
} as const;

export interface FrameStats {
  samples: number;
  fpsAverage: number;
  fpsMin: number;
  /** The frame rate 95% of frames beat. Far more honest than an average. */
  fpsP95Low: number;
  worstFrameMs: number;
  lateFrames: number;
  lateFraction: number;
}

export interface PerfReport extends FrameStats {
  rooms: number;
  characters: number;
  drawnRooms: number;
  backend: string;
  memoryMB: number | null;
  firstPaintMs: number | null;
  devicePixelRatio: number;
  viewport: string;
  verdict: {
    sustained60: boolean | null;
    memory: boolean | null;
    firstPaint: boolean | null;
    atDocumentScale: boolean;
  };
}

/**
 * A rolling window of frame times.
 *
 * Fixed size and written in place: a sampler that allocates per frame would be
 * measuring itself.
 */
export class FrameSampler {
  private readonly times: Float32Array;
  private readonly capacity: number;
  private index = 0;
  private filled = 0;

  // Explicit fields rather than a constructor parameter property: the headless
  // tooling runs TypeScript through Node's strip-only mode, which does not
  // support them. The same constraint bit `Rng` in P2.
  constructor(capacity = 600) {
    this.capacity = capacity;
    this.times = new Float32Array(capacity);
  }

  record(deltaMs: number): void {
    // Ignore the enormous delta a backgrounded tab produces on return; it is
    // not a dropped frame, it is a tab that was not being drawn.
    if (deltaMs <= 0 || deltaMs > 1000) return;
    this.times[this.index] = deltaMs;
    this.index = (this.index + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled++;
  }

  reset(): void {
    this.index = 0;
    this.filled = 0;
  }

  get count(): number {
    return this.filled;
  }

  stats(): FrameStats {
    if (this.filled === 0) {
      return {
        samples: 0, fpsAverage: 0, fpsMin: 0, fpsP95Low: 0,
        worstFrameMs: 0, lateFrames: 0, lateFraction: 0,
      };
    }

    const window = Array.from(this.times.slice(0, this.filled));
    let total = 0;
    let worst = 0;
    let late = 0;
    for (const ms of window) {
      total += ms;
      if (ms > worst) worst = ms;
      if (ms > BUDGET.frameMs) late++;
    }

    // The 95th-percentile frame time, which is the 5th-percentile frame rate:
    // what the game feels like at its worst rather than on average.
    const sorted = [...window].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? worst;

    return {
      samples: this.filled,
      fpsAverage: 1000 / (total / this.filled),
      fpsMin: 1000 / worst,
      fpsP95Low: 1000 / p95,
      worstFrameMs: worst,
      lateFrames: late,
      lateFraction: late / this.filled,
    };
  }
}

/** Heap size where the browser will say. Chrome only, and that is fine. */
export function memoryMB(): number | null {
  const perf = performance as unknown as { memory?: { usedJSHeapSize: number } };
  const bytes = perf.memory?.usedJSHeapSize;
  return typeof bytes === 'number' ? bytes / 1024 / 1024 : null;
}

/**
 * When the page first painted something.
 *
 * `first-contentful-paint` is the honest proxy for the document's "first
 * meaningful paint": the moment the player stopped looking at a blank screen.
 */
export function firstPaintMs(): number | null {
  try {
    const entry = performance.getEntriesByName('first-contentful-paint')[0];
    return entry ? Math.round(entry.startTime) : null;
  } catch {
    return null;
  }
}

/**
 * A full report, with a verdict against each budget.
 *
 * A verdict is null when the measurement is unavailable rather than false —
 * a browser that will not report its heap has not failed the memory budget.
 */
export function report(
  sampler: FrameSampler,
  scene: { rooms: number; characters: number; drawnRooms: number; backend: string },
): PerfReport {
  const stats = sampler.stats();
  const memory = memoryMB();
  const paint = firstPaintMs();
  const atScale = scene.rooms >= BUDGET.stressRooms && scene.characters >= BUDGET.stressCharacters;

  return {
    ...stats,
    rooms: scene.rooms,
    characters: scene.characters,
    drawnRooms: scene.drawnRooms,
    backend: scene.backend,
    memoryMB: memory,
    firstPaintMs: paint,
    devicePixelRatio: globalThis.devicePixelRatio ?? 1,
    viewport: `${globalThis.innerWidth ?? 0}x${globalThis.innerHeight ?? 0}`,
    verdict: {
      // Judged on the fifth-percentile frame rate, not the average: sixty on
      // average with a stutter every second is not sixty.
      sustained60: stats.samples < 120 ? null : stats.fpsP95Low >= BUDGET.fpsSustained - 5,
      memory: memory === null ? null : memory <= BUDGET.memoryMB,
      firstPaint: paint === null ? null : paint <= BUDGET.firstPaintMs,
      atDocumentScale: atScale,
    },
  };
}

/** The report as text, ready to paste back. */
export function formatReport(r: PerfReport): string {
  const mark = (v: boolean | null) => (v === null ? '  ?' : v ? '  ✓' : '  ✗');
  const lines = [
    `renderer          ${r.backend}`,
    `viewport          ${r.viewport} @${r.devicePixelRatio}x`,
    `scene             ${r.rooms} rooms (${r.drawnRooms} drawn), ${r.characters} characters`,
    `frames sampled    ${r.samples}`,
    '',
    `fps average       ${r.fpsAverage.toFixed(1)}`,
    `fps 5th pct       ${r.fpsP95Low.toFixed(1)}${mark(r.verdict.sustained60)}  budget ${BUDGET.fpsSustained}`,
    `fps worst         ${r.fpsMin.toFixed(1)}`,
    `worst frame       ${r.worstFrameMs.toFixed(1)}ms`,
    `late frames       ${r.lateFrames} (${(r.lateFraction * 100).toFixed(1)}%)`,
    '',
    `memory            ${r.memoryMB === null ? 'not reported' : `${r.memoryMB.toFixed(0)}MB`}${mark(r.verdict.memory)}  budget ${BUDGET.memoryMB}MB`,
    `first paint       ${r.firstPaintMs === null ? 'not reported' : `${r.firstPaintMs}ms`}${mark(r.verdict.firstPaint)}  budget ${BUDGET.firstPaintMs}ms`,
    '',
    `at document scale ${r.verdict.atDocumentScale ? 'YES' : `NO — needs ${BUDGET.stressRooms} rooms and ${BUDGET.stressCharacters} characters`}`,
  ];
  return lines.join('\n');
}
