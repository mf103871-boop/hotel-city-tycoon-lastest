/**
 * The last line before a blank screen.
 *
 * There was none. A single render error anywhere in the tree took the whole
 * interface down, and what the player saw was an empty page where their hotel
 * had been — indistinguishable from having lost everything.
 *
 * The save is untouched by a render error, so the most important thing this
 * screen does is say so, and offer the save file itself before anything else.
 * A player who can export their hotel has lost nothing, whatever happens next.
 */
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { SaveManager } from '../save/index.ts';
import { useGameStore } from '../bridge/index.ts';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Printed rather than swallowed: whoever is diagnosing this needs the
    // stack, and the player's report will otherwise be "it went white".
    console.error('[hotel-city-tycoon] interface error', error, info.componentStack);
    this.setState({ info: info.componentStack ?? null });
  }

  private exportSave = (): void => {
    try {
      const engine = useGameStore.getState().engine;
      if (!engine) return;
      const json = new SaveManager().exportToJson(engine.getState(), Date.now());
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `hotel-city-tycoon-recovered-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // If even this fails there is nothing further to offer.
    }
  };

  override render(): ReactNode {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full items-center justify-center bg-ink-950 px-6">
        <section className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-5">
          <h1 className="text-lg font-semibold text-cream-100">Something broke</h1>
          <p className="mt-1 text-sm text-slate-400">
            Your hotel is safe. This is a problem drawing the screen, not with
            your save.
          </p>

          <button
            type="button"
            onClick={this.exportSave}
            className="mt-4 min-h-11 w-full rounded-xl bg-coral-500 px-4 py-3 font-semibold text-ink-950"
          >
            Download my hotel
          </button>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 min-h-11 w-full rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-200"
          >
            Reload
          </button>

          <details className="mt-4">
            <summary className="cursor-pointer text-[11px] text-slate-500">
              Details for a bug report
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-black/40 p-2 text-[11px] text-slate-400">
              {error.message}
              {info ? `\n${info}` : ''}
            </pre>
          </details>
        </section>
      </div>
    );
  }
}
