'use client';

import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/use-i18n';

interface Props {
  featureName: string;
  fallback?: ReactNode;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

interface FeatureErrorFallbackProps {
  featureName: string;
  error?: Error;
  onRetry: () => void;
}

/**
 * UI de repli de l'ErrorBoundary. Composant fonction isolé pour pouvoir
 * consommer le hook i18n (impossible directement dans une classe).
 */
function FeatureErrorFallback({ featureName, error, onRetry }: FeatureErrorFallbackProps) {
  const { t } = useI18n('common');

  return (
    <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
        <AlertTriangle className="h-5 w-5 text-red-600" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">
          {t('errorBoundary.featureError', { feature: featureName })}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('errorBoundary.featureUnavailable')}
        </p>
      </div>
      {process.env.NODE_ENV === 'development' && error && (
        <details className="w-full text-left text-xs">
          <summary className="cursor-pointer text-muted-foreground">{t('errorBoundary.details')}</summary>
          <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-muted p-2 text-muted-foreground">
            {error.message}
          </pre>
        </details>
      )}
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw className="mr-2 h-3 w-3" />
        {t('errorBoundary.retry')}
      </Button>
    </div>
  );
}

/**
 * ErrorBoundary par fonctionnalité : isole les crashes pour qu'un composant
 * cassé n'affecte pas le reste de l'application.
 *
 * Usage:
 * <FeatureErrorBoundary featureName="Chat">
 *   <ChatPanel />
 * </FeatureErrorBoundary>
 */
export class FeatureErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[FeatureErrorBoundary][${this.props.featureName}]`, error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <FeatureErrorFallback
        featureName={this.props.featureName}
        error={this.state.error}
        onRetry={this.handleRetry}
      />
    );
  }
}
