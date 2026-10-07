import './shell.css';

/** Covers the whole page (outside the stage) while the socket is down mid-match, so nothing underneath can be clicked. */
export function ConnectionOverlay() {
  return <div className="conn-overlay" role="alert"><p>Connection lost. Reconnecting...</p></div>;
}
