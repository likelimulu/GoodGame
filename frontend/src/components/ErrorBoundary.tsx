import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Catches unhandled rendering errors anywhere in the component tree
 * and displays a friendly fallback UI instead of a blank page.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to console in dev; swap for a reporting service later if needed.
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="app-shell">
        <div className="error-boundary-fallback">
          <h1 className="error-boundary-title">Something went wrong</h1>
          <p className="error-boundary-body">
            An unexpected error occurred. Try refreshing the page.
          </p>
          <button
            className="btn primary"
            onClick={() => {
              this.setState({ hasError: false });
              window.location.reload();
            }}
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }
}
