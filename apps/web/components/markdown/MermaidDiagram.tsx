'use client';

import React, { useEffect, useRef, useState, Component, ErrorInfo, ReactNode } from 'react';
import mermaid from 'mermaid';

interface MermaidDiagramProps {
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

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
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

// Configuration globale de Mermaid
let mermaidInitialized = false;

const initializeMermaid = () => {
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'strict',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      themeVariables: {
        primaryColor: '#a855f7',
        primaryTextColor: '#fff',
        primaryBorderColor: '#9333ea',
        lineColor: '#6b7280',
        secondaryColor: '#ec4899',
        tertiaryColor: '#3b82f6',
      },
    });
    mermaidInitialized = true;
  }
};

/**
 * Composant interne pour afficher les diagrammes Mermaid
 */
const MermaidDiagramInner: React.FC<MermaidDiagramProps> = ({
  chart,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string>('');

  useEffect(() => {
    if (!chart || !containerRef.current) return;

    const renderDiagram = async () => {
      try {
        initializeMermaid();

        // Générer un ID unique pour ce diagramme
        const id = `mermaid-${Math.random().toString(36).substring(2, 11)}`;

        // Valider le chart avant de tenter le rendu
        if (!chart.trim()) {
          throw new Error('Le contenu du diagramme est vide');
        }

        // Rendre le diagramme avec une gestion d'erreur renforcée
        const { svg: renderedSvg } = await mermaid.render(id, chart);
        setSvg(renderedSvg);
        setError(null);
      } catch (err: any) {
        // Supprimer les éléments DOM créés par Mermaid en cas d'erreur
        const errorElement = document.getElementById(`dmermaid-${err?.hash || ''}`);
        if (errorElement) {
          errorElement.remove();
        }

        // Extraire un message d'erreur plus clair
        let errorMessage = 'Erreur de syntaxe dans le diagramme Mermaid';

        if (err?.message) {
          // Nettoyer le message d'erreur de Mermaid
          const cleanMessage = err.message
            .replace(/mermaid version [\d.]+/g, '')
            .replace(/Syntax error in text/g, '')
            .trim();

          if (cleanMessage) {
            errorMessage = cleanMessage;
          }
        }

        console.error('Erreur Mermaid (arrêtée):', errorMessage, err);
        setError(errorMessage);
        setSvg(''); // S'assurer qu'aucun SVG partiel n'est affiché
      }
    };

    // Encapsuler dans un try-catch supplémentaire pour vraiment tout capter
    renderDiagram().catch((err) => {
      console.error('Erreur critique Mermaid (capturée):', err);
      setError('Impossible de rendre le diagramme');
      setSvg('');
    });
  }, [chart]);

  if (error) {
    return (
      <div
        className={`p-3 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-400 dark:border-amber-600 rounded ${className}`}
      >
        <div className="flex items-start gap-2">
          <span className="text-amber-600 dark:text-amber-400 text-lg">⚠️</span>
          <div className="flex-1">
            <p className="text-sm text-amber-800 dark:text-amber-300 font-medium mb-1">
              Diagramme Mermaid invalide
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 font-mono">
              {error}
            </p>
            <details className="mt-2">
              <summary className="text-xs text-amber-600 dark:text-amber-500 cursor-pointer hover:underline">
                Contenu du diagramme
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
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

/**
 * Composant public avec Error Boundary pour capturer toutes les erreurs
 */
export const MermaidDiagram: React.FC<MermaidDiagramProps> = (props) => {
  const errorFallback = (
    <div className={`p-3 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 dark:border-red-600 rounded ${props.className || ''}`}>
      <div className="flex items-start gap-2">
        <span className="text-red-600 dark:text-red-400 text-lg">❌</span>
        <div className="flex-1">
          <p className="text-sm text-red-800 dark:text-red-300 font-medium">
            Erreur critique du diagramme Mermaid
          </p>
          <p className="text-xs text-red-700 dark:text-red-400 mt-1">
            Le diagramme n'a pas pu être rendu. Vérifiez la syntaxe.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <MermaidErrorBoundary fallback={errorFallback}>
      <MermaidDiagramInner {...props} />
    </MermaidErrorBoundary>
  );
};
