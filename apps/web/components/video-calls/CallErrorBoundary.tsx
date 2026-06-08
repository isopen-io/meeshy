/**
 * CALL ERROR BOUNDARY
 * Handles errors and browser compatibility issues
 */

'use client';

import React, { Component, ReactNode } from 'react';
import { logger } from '@/utils/logger';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function CallErrorDisplay({ error, onReset }: { error: Error; onReset: () => void }) {
  const { t } = useI18n('calls');

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-900 rounded-lg p-6 text-center">
        <div className="bg-red-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-white" />
        </div>

        <h1 className="text-white text-2xl font-bold mb-2">{t('calls.error.title')}</h1>

        <p className="text-gray-300 mb-6">
          {error.message || t('calls.error.message')}
        </p>

        <div className="flex gap-3 justify-center">
          <Button
            onClick={onReset}
            variant="default"
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            {t('calls.error.tryAgain')}
          </Button>

          <Button
            onClick={() => { window.location.href = '/'; }}
            variant="outline"
          >
            {t('calls.error.returnHome')}
          </Button>
        </div>

        <div className="mt-6 text-left text-sm text-gray-400">
          <p className="font-semibold mb-2">{t('calls.error.troubleshooting.title')}</p>
          <ul className="list-disc list-inside space-y-1">
            <li>{t('calls.error.troubleshooting.permissions')}</li>
            <li>{t('calls.error.troubleshooting.browser')}</li>
            <li>{t('calls.error.troubleshooting.https')}</li>
            <li>{t('calls.error.troubleshooting.refresh')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
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

      return <CallErrorDisplay error={this.state.error} onReset={this.reset} />;
    }

    return this.props.children;
  }
}
