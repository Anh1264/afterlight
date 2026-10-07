import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { deviceClass } from './device';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PhoneGate, TRY_ANYWAY_KEY } from './components/PhoneGate';
import './styles.css';

function triedAnyway(): boolean {
  try { return sessionStorage.getItem(TRY_ANYWAY_KEY) === '1'; } catch (e) { console.warn('sessionStorage unreadable', e); return false; }
}

function CrashTest(): never { throw new Error('crash test (#__crash)'); }

function Root() {
  const [gate, setGate] = useState(() => deviceClass() !== 'desktop' && !triedAnyway());
  if (location.hash === '#__crash') return <CrashTest />;
  if (gate) {
    return <PhoneGate onTryAnyway={() => {
      try { sessionStorage.setItem(TRY_ANYWAY_KEY, '1'); } catch (e) { console.warn('sessionStorage not saved', e); }
      setGate(false);
    }} />;
  }
  return <App />;
}

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
createRoot(root).render(<ErrorBoundary><Root /></ErrorBoundary>);
