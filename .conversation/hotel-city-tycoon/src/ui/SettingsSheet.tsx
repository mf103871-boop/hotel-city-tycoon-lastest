/**
 * Settings.
 *
 * Sound, language, and the save file. Export and import have existed in the
 * save layer since P2.5 and were never reachable — a player could not take
 * their hotel anywhere, which for a game with no account is the difference
 * between owning progress and renting it.
 */
import { useRef, useState } from 'react';
import { useGameStore } from '../bridge/index.ts';
import type { SaveCapability } from '../save/coordinator.ts';
import { audio } from '../audio/index.ts';
import { translate } from '../i18n/index.ts';
import type { Locale } from '../i18n/index.ts';
import { LOCALES } from '../i18n/index.ts';
import { Sheet } from './Sheet.tsx';

export function SettingsSheet({
  locale, saves, onLocaleChange, onClose,
}: {
  locale: Locale;
  /**
   * The only way this screen reaches storage.
   *
   * It used to build its own `SaveManager` with no `SimData`, so a file
   * imported here skipped the semantic validation that loading a save
   * performs — and it could call `save()` and `clear()` directly, outside the
   * queue the engine writes through.
   */
  saves: SaveCapability | null;
  onLocaleChange: (next: Locale) => void;
  onClose: () => void;
}) {
  const engine = useGameStore((s) => s.engine);
  const [soundOn, setSoundOn] = useState(audio()?.isEnabled() ?? true);
  const [confirmReset, setConfirmReset] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);
  // Two clicks on Import or Reset used to start two operations; the second
  // could commit after the first and undo it.
  const [busy, setBusy] = useState(false);

  const exportSave = () => {
    if (!engine || !saves) return;
    const json = saves.exportToJson(engine.getState());
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `hotel-city-tycoon-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importSave = async (file: File) => {
    if (!saves || busy) return;
    setBusy(true);
    setProblem(null);
    // Runs on every exit. Clearing the input is what lets the same file be
    // chosen again after a failure: it keeps its value otherwise and the
    // change event never fires a second time.
    const done = () => {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    };
    try {
      let json: string;
      try {
        json = await file.text();
      } catch (readError) {
        void readError;
        // An unreadable file is a failed import, not an exception thrown at
        // the user out of an event handler.
        setProblem(t('ui.importFailed'));
        done();
        return;
      }

      /*
       * Validation and the write happen together, through the coordinator.
       *
       * This used to import, then call `save()` and reload without ever
       * looking at whether the write succeeded — so a full disk produced a
       * reload, an unchanged save, and a player who believed it had worked.
       */
      const result = await saves.importAndCommit(json);
      if (!result.ok) {
        setProblem(t(result.kind === 'invalid' ? 'ui.importFailed' : 'ui.saveFailing'));
        done();
        return;
      }
      // Only now: the file was valid and it is on disk. A reload is the honest
      // way to swap the whole world out, since the engine, the scene and every
      // pool are still holding the old hotel.
      /*
       * `busy` stays true and the reload follows.
       *
       * Releasing it here would let a second import start in the moments
       * before the page tears down, against a coordinator that is already
       * sealed and a world that is already stale.
       */
      if (fileInput.current) fileInput.current.value = '';
      window.location.reload();
    } catch (unexpected) {
      /*
       * Never rethrown.
       *
       * These handlers are called with `void`, so a rethrow becomes an
       * unhandled rejection: the player sees nothing, the console gets a
       * stack trace, and the screen sits there looking busy for ever.
       */
      void unexpected;
      setProblem(t('ui.saveFailing'));
      done();
    }
  };

  const resetSave = async () => {
    if (!saves || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await saves.reset();
      if (!result.ok) {
        // The old save is still there. Reloading now would show it again and
        // look as though the reset had silently failed.
        setProblem(t('ui.saveFailing'));
        setBusy(false);
        return;
      }
      // busy stays true through the reload, for the same reason as import.
      window.location.reload();
    } catch (unexpected) {
      void unexpected;
      setProblem(t('ui.saveFailing'));
      setBusy(false);
    }
  };

  return (
    <Sheet title={t('ui.settings')} onClose={onClose}>
      <label className="mb-3 flex items-center justify-between rounded-xl border border-white/10 px-4 py-3">
        <span className="text-sm text-slate-100">{t('ui.sound')}</span>
        <input
          type="checkbox"
          checked={soundOn}
          onChange={(e) => { setSoundOn(e.target.checked); audio()?.setEnabled(e.target.checked); }}
          className="h-5 w-5 accent-brass-500"
        />
      </label>

      <div className="mb-3 rounded-xl border border-white/10 px-4 py-3">
        <span className="mb-2 block text-sm text-slate-100">{t('ui.language')}</span>
        <div className="flex gap-2">
          {LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => onLocaleChange(code)}
              className={`min-h-11 flex-1 rounded-lg px-3 py-2.5 text-xs transition
                ${locale === code ? 'bg-brass-500 font-semibold text-midnight-950' : 'bg-white/5 text-slate-300'}`}
            >
              {code === 'ar' ? 'العربية' : 'English'}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={exportSave}
        className="mb-2 w-full rounded-xl border border-white/10 px-4 py-3 text-start hover:border-brass-500/60"
      >
        <span className="block text-sm text-slate-100">{t('ui.exportSave')}</span>
        <span className="block text-[11px] text-slate-400">{t('ui.exportSaveHint')}</span>
      </button>

      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={busy}
        className="mb-2 w-full rounded-xl border border-white/10 px-4 py-3 text-start hover:border-brass-500/60 disabled:opacity-50"
      >
        <span className="block text-sm text-slate-100">{t('ui.importSave')}</span>
        <span className="block text-[11px] text-slate-400">{t('ui.importSaveHint')}</span>
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json"
        className="hidden"
        disabled={busy}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void importSave(f); }}
      />

      {problem && (
        <p className="mb-2 rounded-lg border border-red-500/30 bg-red-950/50 px-3 py-2 text-xs text-red-200">
          {problem}
        </p>
      )}

      {confirmReset ? (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-950/40 p-3">
          <p className="mb-2 text-xs text-red-200">{t('ui.resetWarning')}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              disabled={busy}
              className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 disabled:opacity-50"
            >
              {t('ui.cancel')}
            </button>
            <button
              type="button"
              onClick={() => { void resetSave(); }}
              disabled={busy}
              className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {t('ui.confirm')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmReset(true)}
          disabled={busy}
          className="mt-3 w-full rounded-xl px-4 py-2.5 text-sm text-slate-500 hover:text-red-300 disabled:opacity-50"
        >
          {t('ui.resetGame')}
        </button>
      )}
    </Sheet>
  );
}
