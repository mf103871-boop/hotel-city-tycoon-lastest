/**
 * Verification badge.
 *
 * Reports the four things that have to be checked on a real device and cannot
 * be checked anywhere else: which renderer actually initialised, the frame
 * rate, how much is being drawn, and whether culling is doing its job.
 *
 * Visible in development only. Tap it to collapse.
 */
import { useState } from 'react';

export interface RenderStats {
  backend: 'webgpu' | 'webgl' | null;
  fps: number;
  rooms: number;
  visibleRooms: number;
  characters: number;
  zoom: number;
  /** The frame rate 95% of frames beat — what the game feels like at its worst. */
  fpsP95Low: number;
  memoryMB: number | null;
}

/**
 * Shown in development, and in any build when the url carries `?debug=1`.
 *
 * Hiding it outside development was a mistake: a deployed build is exactly
 * where somebody needs to read the renderer, the frame rate and the draw
 * counts, and a verification pass came back reporting the badge simply was
 * not there.
 */
function debugRequested(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return new URLSearchParams(window.location.search).has('debug');
  } catch {
    return false;
  }
}

export function DebugBadge({ stats }: { stats: RenderStats }) {
  const [open, setOpen] = useState(true);
  if (!debugRequested()) return null;

  // Coloured on the sustained figure once there is one: an instantaneous
  // reading is whatever the last frame happened to be.
  const judged = stats.fpsP95Low > 0 ? stats.fpsP95Low : stats.fps;
  const fpsColour = judged >= 55 ? 'text-emerald-400'
    : judged >= 40 ? 'text-amber-400'
    : 'text-red-400';

  return (
    <button
      type="button"
      aria-label="Diagnostics"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className="absolute start-3 top-24 z-30 rounded-lg border border-white/10 bg-black/70
                 px-3 py-2 text-start font-mono text-[11px] leading-relaxed text-slate-300 backdrop-blur"
    >
      {/* The readout is left-to-right; the badge's *position* follows the
          document direction. `dir` used to sit on the button itself, which
          made `start-3` resolve to the left in Arabic too — right on top of
          the Settings gear that had moved there. */}
      <span dir="ltr" className="block text-start">
      {open ? (
        <>
          <div>
            renderer{' '}
            <span className={stats.backend === 'webgpu' ? 'text-emerald-400' : 'text-amber-400'}>
              {stats.backend ?? 'starting…'}
            </span>
          </div>
          <div>
            fps <span className={fpsColour}>{stats.fps.toFixed(0)}</span>
            {stats.fpsP95Low > 0 && (
              <span className="text-slate-500"> · p5 {stats.fpsP95Low.toFixed(0)}</span>
            )}
          </div>
          {stats.memoryMB !== null && <div>memory {stats.memoryMB.toFixed(0)}MB</div>}
          <div>rooms {stats.visibleRooms}/{stats.rooms} drawn</div>
          <div>people {stats.characters}</div>
          <div>zoom {stats.zoom.toFixed(2)}×</div>
          <div className="mt-1 border-t border-white/10 pt-1 text-[10px] text-slate-500">
            build {typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'}
          </div>
        </>
      ) : (
        <span className={fpsColour}>{stats.fps.toFixed(0)} fps</span>
      )}
      </span>
    </button>
  );
}
