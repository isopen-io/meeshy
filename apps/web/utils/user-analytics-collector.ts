/**
 * Collecteur d'analytics utilisateur
 * Réutilise le collecteur de contexte d'erreur pour les analytics
 *
 * USAGE:
 * - Tracking des pages vues
 * - Profiling des utilisateurs
 * - Statistiques d'engagement
 * - A/B testing
 */

import type { ErrorContext } from './error-context-collector';

/**
 * Contexte utilisateur pour analytics (sans l'erreur)
 */
export type UserAnalyticsContext = Omit<ErrorContext, 'message' | 'stack' | 'digest'>;

/**
 * Événement analytics avec son contexte
 */
export interface AnalyticsEvent {
  // Métadonnées de l'événement
  eventType: 'pageview' | 'click' | 'interaction' | 'conversion' | 'custom';
  eventName: string;
  eventData?: Record<string, any>;

  // Contexte utilisateur complet
  context: UserAnalyticsContext;

  // Session utilisateur
  sessionId?: string;
  userId?: string;
}

/**
 * Collecte le contexte utilisateur pour analytics
 * Réutilise la logique du collecteur d'erreurs
 */
export async function collectUserContext(): Promise<UserAnalyticsContext> {
  if (typeof window === 'undefined') {
    throw new Error('collectUserContext can only be called in browser context');
  }

  // Import dynamique pour éviter les erreurs SSR
  const { collectErrorContext } = await import('./error-context-collector');

  // Créer une "fausse" erreur pour réutiliser le collecteur
  const dummyError = new Error('Analytics context');
  const fullContext = collectErrorContext(dummyError);

  // Retirer les champs liés à l'erreur
  const { message, stack, digest, ...userContext } = fullContext;

  return userContext;
}

/**
 * Track un événement analytics avec contexte complet
 */
export async function trackEvent(
  eventType: AnalyticsEvent['eventType'],
  eventName: string,
  eventData?: Record<string, any>,
  sessionId?: string,
  userId?: string
): Promise<void> {
  try {
    const context = await collectUserContext();

    const event: AnalyticsEvent = {
      eventType,
      eventName,
      eventData,
      context,
      sessionId,
      userId,
    };

    // Log en dev
    if (process.env.NODE_ENV === 'development') {
      console.log('[Analytics]', eventName, event);
    }

    // TODO: Envoyer à votre service d'analytics
    // await fetch('/api/analytics', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(event),
    // });
  } catch (error) {
    console.error('[Analytics] Failed to track event:', error);
  }
}

/**
 * Track une page vue
 */
export async function trackPageView(
  pagePath: string,
  sessionId?: string,
  userId?: string
): Promise<void> {
  await trackEvent(
    'pageview',
    'page_view',
    {
      path: pagePath,
      title: document.title,
      referrer: document.referrer,
    },
    sessionId,
    userId
  );
}

/**
 * Track un clic utilisateur
 */
export async function trackClick(
  elementId: string,
  elementType: string,
  sessionId?: string,
  userId?: string
): Promise<void> {
  await trackEvent(
    'click',
    'element_click',
    {
      elementId,
      elementType,
    },
    sessionId,
    userId
  );
}

/**
 * Track une interaction utilisateur
 */
export async function trackInteraction(
  interactionType: string,
  interactionData?: Record<string, any>,
  sessionId?: string,
  userId?: string
): Promise<void> {
  await trackEvent(
    'interaction',
    interactionType,
    interactionData,
    sessionId,
    userId
  );
}

/**
 * Track une conversion
 */
export async function trackConversion(
  conversionType: string,
  conversionValue?: number,
  sessionId?: string,
  userId?: string
): Promise<void> {
  await trackEvent(
    'conversion',
    conversionType,
    {
      value: conversionValue,
    },
    sessionId,
    userId
  );
}

/**
 * Profiler un utilisateur (collecte toutes ses informations)
 * Utile pour le premier chargement ou lors du login
 */
export async function profileUser(userId?: string): Promise<UserAnalyticsContext> {
  const context = await collectUserContext();

  // Log en dev
  if (process.env.NODE_ENV === 'development') {
    console.log('[Analytics] User Profile:', { userId, context });
  }

  // TODO: Envoyer au backend pour stockage
  // await fetch('/api/analytics/profile', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ userId, context }),
  // });

  return context;
}

/**
 * Hook React pour tracker automatiquement les pages vues
 *
 * USAGE:
 * ```tsx
 * import { usePageTracking } from '@/utils/user-analytics-collector';
 *
 * function MyPage() {
 *   usePageTracking('/my-page');
 *   return <div>My Page</div>;
 * }
 * ```
 */
export function usePageTracking(pagePath: string, userId?: string) {
  if (typeof window !== 'undefined') {
    // Uniquement côté client
    import('react').then(({ useEffect }) => {
      useEffect(() => {
        // Générer un session ID basé sur le timestamp
        const sessionId = sessionStorage.getItem('analytics_session_id') ||
          `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        sessionStorage.setItem('analytics_session_id', sessionId);

        // Track la page vue
        trackPageView(pagePath, sessionId, userId);
      }, [pagePath, userId]);
    });
  }
}

/**
 * Détecte si l'utilisateur est probablement en Afrique
 * Basé sur le timezone et la connexion réseau
 */
export function isProbablyFromAfrica(context: UserAnalyticsContext): boolean {
  const africanTimezones = [
    'Africa/Cairo',
    'Africa/Lagos',
    'Africa/Johannesburg',
    'Africa/Nairobi',
    'Africa/Kinshasa',
    'Africa/Khartoum',
    'Africa/Algiers',
    'Africa/Casablanca',
    'Africa/Accra',
    'Africa/Dakar',
    'Africa/Addis_Ababa',
    'Africa/Dar_es_Salaam',
    'Africa/Kampala',
    'Africa/Abidjan',
    'Africa/Lusaka',
    'Africa/Harare',
    'Africa/Maputo',
  ];

  return africanTimezones.includes(context.location.timezone);
}

/**
 * Détecte si l'utilisateur a une connexion lente
 */
export function hasSlowConnection(context: UserAnalyticsContext): boolean {
  if (!context.network.effectiveType) return false;

  return ['slow-2g', '2g', '3g'].includes(context.network.effectiveType);
}

/**
 * Génère un rapport de diagnostic utilisateur
 * Utile pour le support technique
 */
export async function generateUserDiagnosticReport(
  userId?: string
): Promise<string> {
  const context = await collectUserContext();

  const report = `
=== RAPPORT DE DIAGNOSTIC UTILISATEUR ===
Généré le: ${context.timestamp}
${userId ? `User ID: ${userId}` : 'Utilisateur anonyme'}

📱 APPAREIL
Type: ${context.device.type}
OS: ${context.device.os} ${context.device.osVersion}
Navigateur: ${context.device.browser} ${context.device.browserVersion}
Tactile: ${context.device.isTouchDevice ? 'Oui' : 'Non'}

🌍 LOCALISATION
Timezone: ${context.location.timezone}
Locale: ${context.location.locale}
Probablement d'Afrique: ${isProbablyFromAfrica(context) ? 'OUI' : 'Non'}

📶 RÉSEAU
Statut: ${context.network.online ? 'En ligne' : 'Hors ligne'}
Type: ${context.network.effectiveType || 'Inconnu'}
Débit: ${context.network.downlink ? `${context.network.downlink} Mbps` : 'Inconnu'}
Latence: ${context.network.rtt ? `${context.network.rtt} ms` : 'Inconnu'}
Mode économie: ${context.network.saveData ? 'Activé' : 'Désactivé'}
Connexion lente: ${hasSlowConnection(context) ? 'OUI ⚠️' : 'Non'}

🖥️ ÉCRAN
Résolution: ${context.screen.width}x${context.screen.height}
Ratio pixel: ${context.screen.pixelRatio}x
Orientation: ${context.screen.orientation}

💾 STOCKAGE
localStorage: ${context.preferences.storageAvailable.localStorage ? '✓' : '✗'}
sessionStorage: ${context.preferences.storageAvailable.sessionStorage ? '✓' : '✗'}
indexedDB: ${context.preferences.storageAvailable.indexedDB ? '✓' : '✗'}
Cookies: ${context.preferences.cookiesEnabled ? '✓' : '✗'}

⚡ PERFORMANCE
${context.performance.memory ? `Mémoire JS: ${(context.performance.memory.usedJSHeapSize! / 1024 / 1024).toFixed(2)} MB / ${(context.performance.memory.jsHeapSizeLimit! / 1024 / 1024).toFixed(2)} MB` : 'Mémoire: Non disponible'}
${context.performance.timing?.loadTime ? `Temps de chargement: ${context.performance.timing.loadTime} ms` : ''}

🔧 USER AGENT
${context.userAgent}

📄 PAGE ACTUELLE
${context.url}
`;

  return report;
}
