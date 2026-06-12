'use client';

import React, { useEffect, useRef, useState, Component, ErrorInfo, ReactNode } from 'react';
import mermaid from 'mermaid';
import { useTheme } from 'next-themes';
import { useI18n } from '@/hooks/useI18n';

export interface MermaidDiagramProps {
  chart: string;
  className?: string;
}

// Error Boundary pour capturer toute erreur React
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class MermaidErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(__: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('MermaidErrorBoundary a capturé une erreur:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

// Configuration globale de Mermaid — réinitialisée quand le thème change
let mermaidInitializedTheme: 'dark' | 'default' | null = null;

const initializeMermaid = (isDark: boolean) => {
  const theme = isDark ? 'dark' : 'default';
  if (mermaidInitializedTheme !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      theme,
      securityLevel: 'strict',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      themeVariables: {
        primaryColor: '#a855f7',
        primaryTextColor: '#fff',
        primaryBorderColor: '#9333ea',
        lineColor: isDark ? '#9ca3af' : '#6b7280',
        secondaryColor: '#ec4899',
        tertiaryColor: '#3b82f6',
      },
    });
    mermaidInitializedTheme = theme;
  }
};

/**
 * Composant interne pour afficher les diagrammes Mermaid
 * Note: dangerouslySetInnerHTML est utilisé avec le SVG généré par mermaid.render()
 * qui utilise securityLevel: 'strict' pour prévenir les injections XSS
 */
const MermaidDiagramInner: React.FC<MermaidDiagramProps> = ({
  chart,
  className = '',
}) => {
  const { t } = useI18n('mermaid');
  const { theme: themeMode, resolvedTheme } = useTheme();
  const isDark = themeMode === 'dark' || resolvedTheme === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string>('');

  useEffect(() => {
    if (!chart || !containerRef.current) return;

    const renderDiagram = async () => {
      try {
        initializeMermaid(isDark);

        // Valider le chart avant de tenter le rendu
        if (!chart.trim()) {
          setError(t('mermaid.error.emptyContent'));
          setSvg('');
          return;
        }

        // Valider la syntaxe avec mermaid.parse() avant le rendu
        // Cela capture les erreurs sans que mermaid ne les log dans la console
        try {
          await mermaid.parse(chart);
        } catch (parseErr: unknown) {
          const msg = (parseErr as { message?: string; str?: string })?.message || (parseErr as { message?: string; str?: string })?.str || '';
          const cleanMsg = msg
            .replace(/mermaid version [\d.]+/g, '')
            .replace(/Syntax error in text/gi, '')
            .trim();
          setError(cleanMsg || t('mermaid.error.invalidSyntax'));
          setSvg('');
          return;
        }

        // Générer un ID unique pour ce diagramme
        const id = `mermaid-${Math.random().toString(36).substring(2, 11)}`;

        // Rendre le diagramme — mermaid.render génère du SVG sécurisé (securityLevel: strict)
        const { svg: renderedSvg } = await mermaid.render(id, chart);
        setSvg(renderedSvg);
        setError(null);
      } catch (err: unknown) {
        // Supprimer les éléments DOM créés par Mermaid en cas d'erreur
        const errWithHash = err as { hash?: string; message?: string };
        const errorElement = document.getElementById(`dmermaid-${errWithHash?.hash || ''}`);
        if (errorElement) {
          errorElement.remove();
        }

        const msg = errWithHash?.message || '';
        const cleanMsg = msg
          .replace(/mermaid version [\d.]+/g, '')
          .replace(/Syntax error in text/gi, '')
          .trim();
        setError(cleanMsg || t('mermaid.error.syntaxError'));
        setSvg('');
      }
    };

    renderDiagram().catch(() => {
      setError(t('mermaid.error.renderError'));
      setSvg('');
    });
  }, [chart, t, isDark]);

  if (error) {
    return (
      <div
        className={`p-3 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-400 dark:border-amber-600 rounded ${className}`}
      >
        <div className="flex items-start gap-2">
          <span className="text-amber-600 dark:text-amber-400 text-lg">⚠️</span>
          <div className="flex-1">
            <p className="text-sm text-amber-800 dark:text-amber-300 font-medium mb-1">
              {t('mermaid.error.invalidDiagram')}
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 font-mono">
              {error}
            </p>
            <details className="mt-2">
              <summary className="text-xs text-amber-600 dark:text-amber-500 cursor-pointer hover:underline">
                {t('mermaid.error.diagramContent')}
              </summary>
              <pre className="mt-1 text-xs bg-amber-100 dark:bg-amber-900/30 p-2 rounded overflow-x-auto">
                {chart}
              </pre>
            </details>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`mermaid-diagram overflow-x-auto ${className}`}
      // SVG généré par mermaid avec securityLevel: 'strict' - sécurisé contre XSS
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

/**
 * Fallback interne avec i18n pour l'Error Boundary
 */
const MermaidCriticalErrorFallback: React.FC<{ className?: string }> = ({ className }) => {
  const { t } = useI18n('mermaid');
  return (
    <div className={`p-3 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 dark:border-red-600 rounded ${className || ''}`}>
      <div className="flex items-start gap-2">
        <span className="text-red-600 dark:text-red-400 text-lg">❌</span>
        <div className="flex-1">
          <p className="text-sm text-red-800 dark:text-red-300 font-medium">
            {t('mermaid.error.criticalError')}
          </p>
          <p className="text-xs text-red-700 dark:text-red-400 mt-1">
            {t('mermaid.error.criticalErrorSubtitle')}
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * Composant public avec Error Boundary pour capturer toutes les erreurs
 */
export const MermaidDiagram: React.FC<MermaidDiagramProps> = (props) => {
  const errorFallback = <MermaidCriticalErrorFallback className={props.className} />;

  return (
    <MermaidErrorBoundary fallback={errorFallback}>
      <MermaidDiagramInner {...props} />
    </MermaidErrorBoundary>
  );
};
