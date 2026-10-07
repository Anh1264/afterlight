import { FEEDBACK_URL } from '../links';
import './shell.css';

export const ENDED_TEXT = {
  error: 'Something went wrong on our side and this match had to end. Sorry!',
  idle: 'This match ended because nobody played for a while.',
} as const;

export function ServerEnded({ reason, onHome }: { reason: 'error' | 'idle'; onHome: () => void }) {
  return (
    <div className="shell-msg">
      <h1>Match ended</h1>
      <p>{ENDED_TEXT[reason]}</p>
      <div className="shell-actions">
        <button className="btn dark big" onClick={onHome}>Back to home</button>
        {FEEDBACK_URL !== '' && <a className="link" href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">Give feedback</a>}
      </div>
    </div>
  );
}
