export { createRenderer, applyCamera } from './app.ts';
export type { RendererHandle, RendererOptions } from './app.ts';
export { HotelScene } from './scene.ts';
export type { SceneSnapshot, SceneRoom, SceneCharacter, SceneCallbacks } from './scene.ts';
export { RoomView } from './roomView.ts';
export { DecorView } from './decorView.ts';
export type { DecorPlacement } from './decorView.ts';
export { CharacterView, prefersReducedMotion, setReducedMotionForTests } from './characterView.ts';
export type { CharacterViewData } from './characterView.ts';
export {
  createMotion, resetMotion, step as stepMotion, snapTo, fadeAlpha,
  SAMPLE_S, SNAP_BLOCKS, MAX_DT_S,
} from './anim/motion.ts';
export type { MotionSample, MotionState } from './anim/motion.ts';
export { createPlayer, resetPlayer, setBase, playOnce, advance as advanceClip } from './anim/clipPlayer.ts';
export type { ClipTiming, PlayerFrame } from './anim/clipPlayer.ts';
export { createScheduler, resetScheduler, tick as tickScheduler, FIDGET_MS } from './anim/scheduler.ts';
export type { SchedulerConfig, Fidget, Beat } from './anim/scheduler.ts';
export { framesFor, animOf, clipOf, clipNames, frameOf, resetSheetCache } from './anim/sheet.ts';
export type { RoomViewData } from './roomView.ts';
export * from './camera.ts';
export * from './culling.ts';
export * from './layout.ts';
export { Pool, KeyedPool } from './pool.ts';
export { FrameSampler, report as perfReport, formatReport, BUDGET } from './perf.ts';
export type { PerfReport, FrameStats } from './perf.ts';
export {
  MANIFEST, loadBundle, texture, hasTexture, missingKeys as missingAssetKeys,
  entryFor, requiredEntries, resolutionTier, urlFor, resetAssetState,
  declaredAssetCount,
} from './assets.ts';
export type { AssetEntry, AssetManifest } from './assets.ts';
export { GestureTracker, TAP_SLOP_PX } from './gestures.ts';
export type { GestureAction, Point } from './gestures.ts';
