/**
 * Console Override - Désactive automatiquement les logs en production
 * 
 * Ce fichier intercepte console.log, console.info, console.debug
 * et les désactive en production.
 * 
 * console.warn et console.error restent toujours actifs.
 */

// Sauvegarder les fonctions originales
const originalConsole = {
  log: console.log,
  info: console.info,
  debug: console.debug,
  warn: console.warn,
  error: console.error,
};

/**
 * Initialise l'override de la console
 */
export function initConsoleOverride() {
  // Ne rien faire si déjà initialisé
  if ((console.log as any)._meeshyOverride) {
    return;
  }

  const isDevelopment = process.env.NODE_ENV === 'development';
  const isDebugMode = typeof window !== 'undefined' && 
    process.env.NEXT_PUBLIC_DEBUG_LOGS === 'true';

  // Désactiver en production (sauf si debug mode)
  if (!isDevelopment && !isDebugMode) {
    // Fonction vide pour production
    const noop = () => {};

    // Override console.log, info, debug
    console.log = noop;
    console.info = noop;
    console.debug = noop;

    // Marquer comme overridé
    (console.log as any)._meeshyOverride = true;
    (console.info as any)._meeshyOverride = true;
    (console.debug as any)._meeshyOverride = true;
  }
}

/**
 * Restaure la console originale (pour les tests)
 */
export function restoreConsole() {
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.debug = originalConsole.debug;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
}

/**
 * Logger de développement garanti (bypass l'override)
 */
export const devConsole = {
  log: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      originalConsole.log(...args);
    }
  },
  info: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      originalConsole.info(...args);
    }
  },
  debug: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      originalConsole.debug(...args);
    }
  },
  warn: (...args: any[]) => originalConsole.warn(...args),
  error: (...args: any[]) => originalConsole.error(...args),
};

// Auto-initialiser dès l'import
if (typeof window !== 'undefined') {
  initConsoleOverride();
}

