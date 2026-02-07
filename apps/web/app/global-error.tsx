'use client';

/**
 * Global Error Handler pour Next.js App Router
 * Ce fichier capture les erreurs au niveau root de l'application
 * Spécialement conçu pour gérer les problèmes sur mobile Android
 */

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Wifi, WifiOff } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const msg = error.message || '';
    const isChunkError = msg.includes('Loading chunk') || msg.includes('ChunkLoadError');
    const isStaleAction = msg.includes('Failed to find Server Action');

    // Auto-recovery pour les erreurs de deploiement (chunks/server actions obsoletes)
    if (isChunkError || isStaleAction) {
      const key = '__meeshy_global_error_reload';
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
        return;
      }
      // Si le reload n'a pas resolu, nettoyer le flag pour la prochaine fois
      sessionStorage.removeItem(key);
    }

    // Importer dynamiquement le collecteur (evite les erreurs SSR)
    import('@/utils/error-context-collector').then(({ collectErrorContext, sendErrorContext }) => {
      const context = collectErrorContext(error);
      console.error('[Global Error] Complete context:', context);
      sendErrorContext(context).catch(() => {});
    }).catch((err) => {
      console.error('[Global Error] Fallback:', {
        message: error.message,
        stack: error.stack,
        digest: error.digest,
      });
    });
  }, [error]);

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  return (
    <html lang="fr">
      <body>
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
          <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-6 space-y-4">
            {/* Icône d'erreur */}
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
            </div>

            {/* Titre */}
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold text-gray-900">
                Oups ! Une erreur s'est produite
              </h1>
              <p className="text-gray-600">
                {isOnline
                  ? "Une erreur inattendue est survenue. Veuillez recharger la page."
                  : "Vous semblez être hors ligne. Vérifiez votre connexion internet."}
              </p>
            </div>

            {/* Indicateur de connexion */}
            <div className="flex items-center justify-center gap-2 text-sm">
              {isOnline ? (
                <>
                  <Wifi className="w-4 h-4 text-green-600" />
                  <span className="text-green-600">En ligne</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-red-600" />
                  <span className="text-red-600">Hors ligne</span>
                </>
              )}
            </div>

            {/* Détails de l'erreur (mode développement uniquement) */}
            {process.env.NODE_ENV === 'development' && (
              <details className="text-left text-sm bg-gray-50 p-3 rounded">
                <summary className="cursor-pointer font-medium text-gray-700">
                  Détails techniques
                </summary>
                <pre className="mt-2 text-xs text-gray-600 whitespace-pre-wrap break-words overflow-auto max-h-40">
                  {error.message}
                  {'\n\n'}
                  {error.stack}
                </pre>
              </details>
            )}

            {/* Boutons d'action */}
            <div className="space-y-2">
              <button
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.location.href = '/';
                  }
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Recharger l'application
              </button>

              <button
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    // Nettoyer le cache et recharger
                    if ('serviceWorker' in navigator) {
                      navigator.serviceWorker.getRegistrations().then((registrations) => {
                        registrations.forEach((registration) => {
                          registration.unregister();
                        });
                      });
                    }
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.href = '/';
                  }
                }}
                className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
              >
                Nettoyer le cache et recharger
              </button>
            </div>

            {/* Message d'aide */}
            <p className="text-xs text-center text-gray-500">
              Si le problème persiste, contactez le support technique
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
