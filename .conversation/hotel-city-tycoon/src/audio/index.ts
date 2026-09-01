/**
 * Sound.
 *
 * One manager, one place that owns the audio context, one place that decides
 * whether a sound plays. The previous project learned this the hard way:
 * scattered `new Audio()` calls become impossible to mute, impossible to
 * throttle, and they stack into noise.
 *
 * Web Audio directly rather than a library — nine short WAVs need buffers and
 * a gain node, not a dependency.
 */

export type SoundId = 'coin' | 'levelUp' | 'star' | 'bell' | 'build' | 'tap' | 'error' | 'alert' | 'chime';

export const SOUNDS: readonly SoundId[] = [
  'coin', 'levelUp', 'star', 'bell', 'build', 'tap', 'error', 'alert', 'chime',
];

/**
 * A sound cannot retrigger faster than this.
 *
 * A busy hotel checks out several guests a second. Without a floor the coin
 * chime becomes a buzzsaw, which is exactly how a good sound turns into the
 * reason someone mutes the game.
 */
const THROTTLE_MS: Partial<Record<SoundId, number>> = {
  coin: 120,
  tap: 40,
  error: 250,
  alert: 800,
};

export interface AudioPorts {
  /** Injected so tests can drive time without a clock. */
  now(): number;
  /** Where the files live. */
  baseUrl: string;
}

export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<SoundId, AudioBuffer>();
  private readonly lastPlayed = new Map<SoundId, number>();
  private readonly ports: AudioPorts;
  private enabled = true;
  private volume = 0.7;
  private failed = new Set<SoundId>();

  constructor(ports: AudioPorts) {
    this.ports = ports;
  }

  /**
   * Browsers refuse to start audio before a gesture, so this is called from
   * the first tap rather than at boot. Calling it early is harmless.
   */
  async unlock(): Promise<void> {
    if (this.context) {
      if (this.context.state === 'suspended') await this.context.resume();
      return;
    }
    const Ctor = globalThis.AudioContext
      ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.context = new Ctor();
    this.master = this.context.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    this.master.connect(this.context.destination);
  }

  /** Fetch and decode. Individual failures are absorbed — silence beats a crash. */
  async load(ids: readonly SoundId[] = SOUNDS): Promise<{ loaded: number; missing: SoundId[] }> {
    await this.unlock();
    if (!this.context) return { loaded: 0, missing: [...ids] };

    const missing: SoundId[] = [];
    let loaded = 0;
    await Promise.all(ids.map(async (id) => {
      if (this.buffers.has(id)) return;
      try {
        const response = await fetch(`${this.ports.baseUrl}/audio/${id}.wav`);
        if (!response.ok) throw new Error(String(response.status));
        const decoded = await this.context!.decodeAudioData(await response.arrayBuffer());
        this.buffers.set(id, decoded);
        loaded++;
      } catch {
        this.failed.add(id);
        missing.push(id);
      }
    }));
    if (missing.length > 0) {
      console.warn(`[audio] ${missing.length} sounds unavailable: ${missing.join(', ')}`);
    }
    return { loaded, missing };
  }

  /** True when this sound may play right now. Pure, so it is testable. */
  canPlay(id: SoundId): boolean {
    if (!this.enabled || this.failed.has(id)) return false;
    const gap = THROTTLE_MS[id];
    if (gap === undefined) return true;
    const last = this.lastPlayed.get(id);
    return last === undefined || this.ports.now() - last >= gap;
  }

  play(id: SoundId): boolean {
    if (!this.canPlay(id)) return false;
    this.lastPlayed.set(id, this.ports.now());

    const buffer = this.buffers.get(id);
    if (!buffer || !this.context || !this.master) return false;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.master);
    source.start();
    return true;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? this.volume : 0;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.master && this.enabled) this.master.gain.value = this.volume;
  }

  getVolume(): number {
    return this.volume;
  }
}

/** The app's single instance. */
let manager: AudioManager | null = null;

export function initAudio(ports: AudioPorts): AudioManager {
  manager ??= new AudioManager(ports);
  return manager;
}

export function audio(): AudioManager | null {
  return manager;
}

/** Convenience for call sites that should never care whether audio exists. */
export function playSound(id: SoundId): void {
  manager?.play(id);
}
