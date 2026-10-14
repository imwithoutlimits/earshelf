import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Catches a crash in the screen and shows a way out, instead of leaving a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode; appName: string; onError?: (error: Error, where: string, extra: Record<string, string>) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { this.props.onError?.(error, 'render', { component: (info.componentStack ?? '').split('\n')[1]?.trim().slice(0, 80) ?? '' }); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="auth">
        <div className="auth-card stack" role="alert">
          <h1>Something went wrong</h1>
          <p className="hint">Your saved work is safe. It is stored on this device and in your account. Reloading usually fixes this.</p>
          <button className="btn primary" onClick={() => location.reload()}>Reload {this.props.appName}</button>
        </div>
      </main>
    );
  }
}
