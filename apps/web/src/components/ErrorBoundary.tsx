import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.href = '/';
  };

  override render() {
    if (this.state.hasError) {
      return (
        <main className="error-screen" role="alert">
          <div className="error-screen-inner">
            <h1 className="error-screen-title">Что-то пошло не так</h1>
            <p className="error-screen-text">
              Произошла неожиданная ошибка. Перезагрузите страницу, чтобы продолжить.
            </p>
            <button type="button" className="btn-primary" onClick={this.handleReload}>
              Перезагрузить
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
