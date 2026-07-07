'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/hooks/useI18n';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

// Mirrors public/chunk-recovery.js's patterns and one-shot sessionStorage
// guard. That script only catches stale-chunk failures via window
// 'error'/'unhandledrejection' events, which never fire when React catches
// the failure here first — e.g. a stale client reference to a chunk a
// newer deployment already deleted from disk surfaces as minified React
// error #130 ("element type is invalid: got undefined") inside
// componentDidCatch instead of an explicit ChunkLoadError reaching window.
const STALE_DEPLOYMENT_RELOAD_KEY = '__meeshy_chunk_reload';

function isStaleDeploymentError(message: string): boolean {
  return (
    message.includes('Loading chunk') ||
    message.includes('ChunkLoadError') ||
    message.includes('Failed to find Server Action') ||
    message.includes('react.dev/errors/130')
  );
}

function ErrorDisplay({ error, onRetry }: { error?: Error; onRetry: () => void }) {
  const { t } = useI18n('common');

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-xl">{t('errorBoundary.title')}</CardTitle>
          <CardDescription>{t('errorBoundary.description')}</CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {process.env.NODE_ENV === 'development' && error && (
            <details className="text-left text-sm">
              <summary className="cursor-pointer font-medium">{t('errorBoundary.details')}</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                {error.message}
                {'\n'}
                {error.stack}
              </pre>
            </details>
          )}
          <Button onClick={onRetry} className="w-full">
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('errorBoundary.reload')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);

    if (isStaleDeploymentError(error.message) && !sessionStorage.getItem(STALE_DEPLOYMENT_RELOAD_KEY)) {
      sessionStorage.setItem(STALE_DEPLOYMENT_RELOAD_KEY, String(Date.now()));
      window.location.reload();
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return <ErrorDisplay error={this.state.error} onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}
