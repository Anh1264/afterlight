import { useState } from 'react';
import './shell.css';

export const TRY_ANYWAY_KEY = 'al:try-anyway';

export function PhoneGate({ onTryAnyway }: { onTryAnyway: () => void }) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const copy = async () => {
    try {
      if (!navigator.clipboard) { setState('manual'); return; }
      await navigator.clipboard.writeText(location.href);
      setState('copied');
    } catch (e) {
      console.warn('clipboard blocked', e);
      setState('manual');
    }
  };
  return (
    <main className="gate">
      <div className="gate-copy">
        <h1 className="logo gate-logo">AFTERLIGHT</h1>
        <p className="gate-pitch">A two-player card duel against a bot, free in your browser.</p>
        <p className="gate-desktop">Made for desktop: open this link on a computer</p>
        <div className="gate-actions">
          <button className="gate-btn" onClick={copy}>{state === 'copied' ? 'Copied' : 'Copy link'}</button>
          {state === 'manual' && <input className="gate-url" readOnly value={location.href} aria-label="Page link" onFocus={e => e.currentTarget.select()} />}
          {state === 'manual' && <p className="gate-hint">Copying is blocked here. Press and hold the link to copy it.</p>}
        </div>
        <button className="gate-try" onClick={onTryAnyway}>Try anyway</button>
      </div>
      <img className="gate-img" src="/og.jpg" alt="Legend cards from AFTERLIGHT" />
    </main>
  );
}
