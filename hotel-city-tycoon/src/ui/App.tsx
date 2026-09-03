import { useCallback, useEffect, useState } from 'react';
import { useGame, onSaveTrouble } from './useGame.ts';
import { HotelCanvas } from './HotelCanvas.tsx';
import { Hud } from './Hud.tsx';
import { DebugBadge } from './DebugBadge.tsx';
import { BuildPanel } from './BuildPanel.tsx';
import { ShiftPanel } from './ShiftPanel.tsx';
import { RoomSheet } from './RoomSheet.tsx';
import { Toasts } from './Toasts.tsx';
import { WelcomeBack } from './WelcomeBack.tsx';
import { ObjectiveCard } from './ObjectiveCard.tsx';
import { SettingsSheet } from './SettingsSheet.tsx';
import { UpgradesPanel } from './UpgradesPanel.tsx';
import { ShopPanel } from './ShopPanel.tsx';
import { CityPanel } from './CityPanel.tsx';
import { ManagePanel } from './ManagePanel.tsx';
import { PlacementBar } from './PlacementBar.tsx';
import type { Placement } from './PlacementBar.tsx';
import { DailyGift } from './DailyGift.tsx';
import { PhoneSheet, PhoneButton } from './PhoneSheet.tsx';
import { ClimateBanner } from './ClimateBanner.tsx';
import { SeasonBanner } from './SeasonBanner.tsx';
import { dailyGift } from '../bridge/selectors.ts';
import { useGameStore } from '../bridge/index.ts';
import { storedRoomViews } from '../bridge/selectors.ts';
import { noticesFrom, mergeNotices, offlineSummary, noticeForRejection } from '../bridge/notifications.ts';
import type { Notice, OfflineSummary } from '../bridge/notifications.ts';
import { playSound } from '../audio/index.ts';
import type { RenderStats } from './DebugBadge.tsx';
import { translate, directionOf } from '../i18n/index.ts';
import type { Locale } from '../i18n/index.ts';
import { loadLocale, storeLocale } from './prefs.ts';

export function App() {
  // Restored from the last visit; defaults to English on a fresh browser.
  const [locale, setLocale] = useState<Locale>(loadLocale);
  const changeLocale = useCallback((next: Locale) => {
    storeLocale(next);
    setLocale(next);
  }, []);
  const { ready, saveProblem, saves } = useGame();
  const [stats, setStats] = useState<RenderStats>({ backend: null, fps: 0, rooms: 0, visibleRooms: 0, characters: 0, zoom: 1, fpsP95Low: 0, memoryMB: null });
  const onStats = useCallback((s: Omit<RenderStats, 'backend'> & { backend: 'webgpu' | 'webgl' }) => setStats(s), []);
  const [panel, setPanel] = useState<'none' | 'build' | 'shift' | 'settings' | 'upgrades' | 'shop' | 'city' | 'manage'>('none');
  /*
   * Placement mode.
   *
   * Lives here rather than in either panel because both of them hand the
   * player to the same picker on the canvas, and the picker outlives the sheet
   * that started it.
   */
  const [placing, setPlacing] = useState<Placement | null>(null);

  /*
   * Stable across renders, deliberately.
   *
   * The Pixi effect lists its callbacks as dependencies, so an inline arrow
   * here made a new function on every render — every HUD tick, every stats
   * update — and tore the renderer down and rebuilt it each time. useCallback
   * with no dependencies is what keeps the scene alive.
   */
  const onEmptyTap = useCallback((x: number, y: number) => {
    setPlacing((p) => {
      if (!p) return p;
      // Rebuilt without `refusal` rather than setting it to undefined: the
      // project runs with exactOptionalPropertyTypes, where an explicit
      // undefined is not the same as an absent key.
      return { kind: p.kind, roomId: p.roomId, defId: p.defId, at: { x, y } };
    });
  }, []);
  const [openRoom, setOpenRoom] = useState<string | null>(null);
  const onRoomTap = useCallback((roomId: string) => setOpenRoom(roomId), []);

  // The store has buffered events since P2.5 and nothing ever read them:
  // level-ups, fires and five-star ratings were all equally silent.
  const consumeEvents = useGameStore((s) => s.consumeEvents);
  const consumeRejection = useGameStore((s) => s.consumeRejection);
  const revision = useGameStore((s) => s.revision);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [welcome, setWelcome] = useState<OfflineSummary | null>(null);

  useEffect(() => {
    // A refusal is news too: the player tapped and the game did not move.
    const refusal = consumeRejection();
    if (refusal) {
      const notice = noticeForRejection(refusal);
      if (notice) {
        setNotices((current) => mergeNotices(current, [notice]));
        playSound('error');
      }
    }

    const events = consumeEvents();
    if (events.length === 0) return;

    const summary = offlineSummary(events);
    if (summary) setWelcome(summary);

    const fresh = noticesFrom(events);
    if (fresh.length === 0) return;
    setNotices((current) => mergeNotices(current, fresh));
    // Only the most important sound in a batch plays; a busy minute should not
    // become a chord.
    const loudest = fresh.find((n) => n.sound !== null);
    if (loudest?.sound) playSound(loudest.sound as never);
  }, [revision, consumeEvents, consumeRejection]);

  // Saving failing is the one problem a player must be told about: they can
  // keep playing for hours and lose all of it without a word.
  const [saveTrouble, setSaveTrouble] = useState(false);
  // The gift opens itself once per session when one is waiting: a reward the
  // player has to go looking for is not a reason to come back.
  const [giftOpen, setGiftOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const state = useGameStore((s) => s.state);
  useEffect(() => {
    if (!ready || !state) return;
    if (dailyGift(state, state.epochMs).available) setGiftOpen(true);
  }, [ready, state?.seed]);
  useEffect(() => {
    onSaveTrouble(() => setSaveTrouble(true));
    return () => onSaveTrouble(null);
  }, []);

  const expire = useCallback(
    (id: string) => setNotices((current) => current.filter((n) => n.id !== id)),
    [],
  );
  const dir = directionOf(locale);

  // The document element, not just our own div. Scrollbar side, text
  // selection, and anything a browser decides above the React tree all read
  // `dir` from <html> — which stayed "ltr" while the interface flipped.
  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = locale;
  }, [dir, locale]);

  return (
    <div dir={dir} className="relative h-full w-full overflow-hidden bg-midnight-950">
      {ready ? (
        <>
          <HotelCanvas
            onStats={onStats}
            onRoomTap={onRoomTap}
            onEmptyTap={onEmptyTap}
          />
          <DebugBadge stats={stats} />
          {/* Rendered before the panels so every sheet stacks above it. */}
          <PhoneButton onOpen={() => setPhoneOpen(true)} />
          <Hud
            locale={locale}
            onOpenBuild={() => setPanel('build')}
            onOpenShift={() => setPanel('shift')}
            onOpenUpgrades={() => setPanel('upgrades')}
            onOpenShop={() => setPanel('shop')}
            onOpenCity={() => setPanel('city')}
            onOpenManage={() => setPanel('manage')}
            objective={<ObjectiveCard locale={locale} />}
          />
          {panel === 'build' && <BuildPanel locale={locale} onClose={() => setPanel('none')} />}
          {panel === 'shift' && <ShiftPanel locale={locale} onClose={() => setPanel('none')} />}
          {panel === 'upgrades' && <UpgradesPanel locale={locale} onClose={() => setPanel('none')} />}
          {panel === 'shop' && <ShopPanel locale={locale} onClose={() => setPanel('none')} />}
          {panel === 'city' && <CityPanel locale={locale} onClose={() => setPanel('none')} />}
          {panel === 'manage' && (
            <ManagePanel
              locale={locale}
              onClose={() => setPanel('none')}
              onPlaceStored={(roomId) => {
                const room = storedRoomViews(useGameStore.getState().state!).find((r) => r.id === roomId);
                if (room) setPlacing({ kind: 'stored', roomId, defId: room.defId, at: null });
              }}
            />
          )}
          {placing && (
            <PlacementBar
              placement={placing}
              locale={locale}
              onChange={setPlacing}
              onDone={() => setPlacing(null)}
            />
          )}
          {giftOpen && <DailyGift locale={locale} onClose={() => setGiftOpen(false)} />}
          {phoneOpen && <PhoneSheet locale={locale} onClose={() => setPhoneOpen(false)} />}
          <SeasonBanner locale={locale} />
          <ClimateBanner locale={locale} />
          {panel === 'settings' && (
            <SettingsSheet locale={locale} saves={saves} onLocaleChange={changeLocale} onClose={() => setPanel('none')} />
          )}
          {openRoom && (
            <RoomSheet
              roomId={openRoom}
              locale={locale}
              onClose={() => setOpenRoom(null)}
              onMove={(roomId, defId) => setPlacing({ kind: 'move', roomId, defId, at: null })}
            />
          )}
          <Toasts notices={notices} locale={locale} onExpire={expire} />
          {welcome && (
            <WelcomeBack summary={welcome} locale={locale} onDismiss={() => setWelcome(null)} />
          )}
          <button
            type="button"
            aria-label="Settings"
            onClick={() => setPanel('settings')}
            className="absolute end-3 top-24 z-20 rounded-lg border border-white/10 bg-midnight-900/85
                       px-4 py-2.5 text-sm text-slate-300 backdrop-blur"
          >
            ⚙
          </button>
          {saveTrouble && (
            <div className="absolute inset-x-3 top-36 z-30 rounded-xl border border-red-500/40 bg-red-950/90 px-4 py-3 backdrop-blur">
              <p className="text-sm text-red-100">{translate(locale, 'ui.saveFailing')}</p>
              <button
                type="button"
                onClick={() => setPanel('settings')}
                className="mt-2 min-h-11 w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white"
              >
                {translate(locale, 'ui.exportSave')}
              </button>
            </div>
          )}
          {/* Below the Settings gear, not over it: at top-24 this banner sat on
              the gear with the same z-index and swallowed every tap on it —
              in exactly the case where Settings is the only way out. */}
          {saveProblem && (
            <div className="absolute inset-x-3 top-36 z-20 rounded-lg border border-amber-500/30 bg-amber-950/80 px-4 py-3 text-sm text-amber-200">
              {translate(locale, 'ui.saveCorrupt')}
            </div>
          )}
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-500">
          <span>…</span>
          {/* Visible without opening a console: two rounds of verification
              were spent establishing which build was actually live. */}
          <span className="font-mono text-[11px] text-slate-600">
            {typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'}
          </span>
        </div>
      )}
    </div>
  );
}
