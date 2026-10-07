import { Component, type ErrorInfo, type ReactNode } from 'react';
import { FEEDBACK_URL } from '../links';
import './shell.css';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('render error', error, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash">
        <div className="shell-msg">
          <h1>Something went wrong</h1>
          <p>Sorry! Going back to the home screen usually fixes it.</p>
          <div className="shell-actions">
            <button className="btn dark big" onClick={() => location.assign('/')}>Back to home</button>
            {FEEDBACK_URL !== '' && <a className="link" href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">Give feedback</a>}
          </div>
        </div>
      </div>
    );
  }
}
