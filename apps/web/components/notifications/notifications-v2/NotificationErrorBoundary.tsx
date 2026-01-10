/**
 * Notification Error Boundary
 * Catches React errors in notification components and provides graceful fallback
 *
 * Features:
 * - Catches rendering errors
 * - Provides retry mechanism
 * - Logs errors to backend
 * - Graceful UI fallback
 *
 * @author Meeshy Security Team
 * @version 1.0.0
 */

'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Props
 */
interface NotificationErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

/**
 * State
 */
interface NotificationErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

/**
 * Notification Error Boundary Component
 */
export class NotificationErrorBoundary extends Component<
  NotificationErrorBoundaryProps,
  NotificationErrorBoundaryState
> {
  constructor(props: NotificationErrorBoundaryProps) {
    super(props);

    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    };
  }

  /**
   * Catch errors in child components
   */
  static getDerivedStateFromError(error: Error): Partial<NotificationErrorBoundaryState> {
    return {
      hasError: true,
      error
    };
  }

  /**
   * Log error details
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Update state with error details
    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1
    }));

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('[NotificationErrorBoundary] Caught error:', {
        error,
        errorInfo,
        componentStack: errorInfo.componentStack
      });
    }

    // Call custom error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log to backend error tracking (optional)
    this.logErrorToBackend(error, errorInfo);
  }

  /**
   * Log error to backend
   */
  private async logErrorToBackend(error: Error, errorInfo: ErrorInfo) {
    try {
      // Don't log in development
      if (process.env.NODE_ENV === 'development') {
        return;
      }

      const errorData = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        component: 'NotificationSystem'
      };

      // Send to error tracking endpoint
      await fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorData)
      }).catch(err => {
        // Silently fail if error logging fails
        console.error('[NotificationErrorBoundary] Failed to log error:', err);
      });
    } catch (err) {
      // Silently fail
      console.error('[NotificationErrorBoundary] Error in error logging:', err);
    }
  }

  /**
   * Reset error boundary
   */
  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });

    // Reload notifications
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  /**
   * Retry without full page reload
   */
  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  /**
   * Render
   */
  render() {
    const { hasError, error, errorCount } = this.state;
    const { children, fallback } = this.props;

    // If no error, render children
    if (!hasError) {
      return children;
    }

    // If custom fallback provided, use it
    if (fallback) {
      return fallback;
    }

    // Default error UI
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          <h2 className="text-xl font-semibold text-red-900 dark:text-red-100">
            Notification System Error
          </h2>
        </div>

        <p className="text-center text-red-700 dark:text-red-300 mb-6 max-w-md">
          Something went wrong while loading notifications. This has been logged and we're working to fix it.
        </p>

        {process.env.NODE_ENV === 'development' && error && (
          <details className="mb-6 w-full max-w-2xl">
            <summary className="cursor-pointer text-red-700 dark:text-red-300 font-mono text-sm mb-2">
              Error Details (Dev Only)
            </summary>
            <pre className="bg-red-100 dark:bg-red-900/30 p-4 rounded text-xs overflow-auto max-h-48 text-red-900 dark:text-red-100">
              {error.message}
              {'\n\n'}
              {error.stack}
            </pre>
          </details>
        )}

        <div className="flex gap-3">
          <button
            onClick={this.handleRetry}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            disabled={errorCount > 3}
          >
            <RefreshCw className="w-4 h-4" />
            {errorCount > 3 ? 'Too many errors' : 'Try Again'}
          </button>

          {errorCount > 2 && (
            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              Reload Page
            </button>
          )}
        </div>

        {errorCount > 1 && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">
            Error occurred {errorCount} times. If this persists, please contact support.
          </p>
        )}
      </div>
    );
  }
}

/**
 * Functional wrapper for error boundary (for hooks compatibility)
 */
export function withNotificationErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WrappedComponent(props: P) {
    return (
      <NotificationErrorBoundary fallback={fallback}>
        <Component {...props} />
      </NotificationErrorBoundary>
    );
  };
}

/**
 * Lightweight error fallback for nested components
 */
export function NotificationErrorFallback({
  error,
  resetError
}: {
  error: Error;
  resetError: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-4 bg-red-50 dark:bg-red-950/20 rounded border border-red-200 dark:border-red-800">
      <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400 mb-2" />
      <p className="text-sm text-red-700 dark:text-red-300 mb-3 text-center">
        Failed to load this notification
      </p>
      <button
        onClick={resetError}
        className="text-xs px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

export default NotificationErrorBoundary;
