/**
 * CALL ERROR BOUNDARY
 * Handles errors and browser compatibility issues
 */

'use client';

import React, { Component, ReactNode } from 'react';
import { logger } from '@/utils/logger';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class CallErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('[CallErrorBoundary]', 'Call error caught', {
      error: error.message,
      componentStack: errorInfo.componentStack,
    });
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }

      return (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-gray-900 rounded-lg p-6 text-center">
            <div className="bg-red-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-white" />
            </div>

            <h1 className="text-white text-2xl font-bold mb-2">Call Error</h1>

            <p className="text-gray-300 mb-6">
              {this.state.error.message || 'An unexpected error occurred during the call.'}
            </p>

            <div className="flex gap-3 justify-center">
              <Button
                onClick={this.reset}
                variant="default"
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </Button>

              <Button
                onClick={() => window.location.href = '/'}
                variant="outline"
              >
                Return Home
              </Button>
            </div>

            {/* Browser Compatibility Tips */}
            <div className="mt-6 text-left text-sm text-gray-400">
              <p className="font-semibold mb-2">Troubleshooting:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Make sure you granted camera and microphone permissions</li>
                <li>Check that your browser supports video calls (Chrome, Firefox, Safari)</li>
                <li>Ensure you are using HTTPS connection</li>
                <li>Try refreshing the page</li>
              </ul>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
