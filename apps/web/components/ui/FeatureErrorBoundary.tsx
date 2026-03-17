'use client';

import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  featureName: string;
  fallback?: ReactNode;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
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
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
          <AlertTriangle className="h-5 w-5 text-red-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            Une erreur s&apos;est produite dans {this.props.featureName}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cette section n&apos;est pas disponible pour le moment.
          </p>
        </div>
        {process.env.NODE_ENV === 'development' && this.state.error && (
          <details className="w-full text-left text-xs">
            <summary className="cursor-pointer text-muted-foreground">Détails</summary>
            <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-muted p-2 text-muted-foreground">
              {this.state.error.message}
            </pre>
          </details>
        )}
        <Button size="sm" variant="outline" onClick={this.handleRetry}>
          <RefreshCw className="mr-2 h-3 w-3" />
          Réessayer
        </Button>
      </div>
    );
  }
}
