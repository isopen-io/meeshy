/**
 * Firebase Availability Checker
 * Vérifie si Firebase est disponible et configuré au démarrage de l'application
 *
 * USAGE:
 * - Vérifie une seule fois au démarrage
 * - Retourne un statut avec available/pushEnabled/badgeEnabled
 * - Utilisé par tous les managers Firebase pour éviter les crashs
 *
 * @module firebase-availability-checker
 */

export type FirebaseStatus = {
  /**
   * Firebase est disponible (clés configurées et init réussie)
   */
  available: boolean;

  /**
   * Push notifications activées (feature flag + Firebase available)
   */
  pushEnabled: boolean;

  /**
   * Badges PWA activés (feature flag + Firebase available)
   */
  badgeEnabled: boolean;

  /**
   * Raison du statut (pour debug)
   */
  reason?: string;
};

/**
 * Singleton pour vérifier la disponibilité de Firebase
 */
class FirebaseAvailabilityChecker {
  private static instance: FirebaseAvailabilityChecker;
  private status: FirebaseStatus = {
    available: false,
    pushEnabled: false,
    badgeEnabled: false,
  };
  private checked = false;

  /**
   * Obtient l'instance singleton
   */
  static getInstance(): FirebaseAvailabilityChecker {
    if (!this.instance) {
      this.instance = new FirebaseAvailabilityChecker();
    }
    return this.instance;
  }

  /**
   * Vérifie Firebase au démarrage de l'app (appelé une seule fois)
   */
  async check(): Promise<FirebaseStatus> {
    if (this.checked) {
      return this.status;
    }

    try {
      // 1. Vérifier que les variables d'env sont définies
      // NOTE: process.env.NEXT_PUBLIC_* doit être accédé en notation directe (dot notation)
      // car Next.js/webpack remplace uniquement les accès littéraux au build time.
      // process.env[variable] dynamique ne fonctionne PAS côté client.
      const envValues: Record<string, string | undefined> = {
        NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        NEXT_PUBLIC_FIREBASE_VAPID_KEY: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      };

      const missing = Object.entries(envValues)
        .filter(([, value]) => !value || value === '' || value.includes('xxxxx') || value === 'undefined')
        .map(([key]) => key);

      if (missing.length > 0) {
        this.status = {
          available: false,
          pushEnabled: false,
          badgeEnabled: false,
          reason: `Firebase credentials missing: ${missing.join(', ')}`,
        };
        console.warn(
          '[Firebase] Not configured - Using WebSocket notifications only',
          '\nMissing:', missing.join(', ')
        );
        this.checked = true;
        return this.status;
      }

      // 2. Vérifier feature flags
      const pushEnabled = process.env.NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS === 'true';
      const badgeEnabled = process.env.NEXT_PUBLIC_ENABLE_PWA_BADGES !== 'false'; // true par défaut

      // 3. Tester l'initialisation Firebase (seulement en environnement navigateur)
      if (typeof window !== 'undefined') {
        try {
          const { initializeApp, getApps } = await import('firebase/app');
          const firebaseConfig = {
            apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
            authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
          };

          // Vérifier si app déjà initialisée
          const existingApps = getApps();
          if (existingApps.length === 0) {
            // Tenter d'initialiser
            initializeApp(firebaseConfig);
          }

          this.status = {
            available: true,
            pushEnabled,
            badgeEnabled,
            reason: 'Firebase initialized successfully',
          };
          console.info('[Firebase] Available - Push notifications enabled');
        } catch (error: any) {
          // Firebase déjà initialisé
          if (error.code === 'app/duplicate-app') {
            this.status = {
              available: true,
              pushEnabled,
              badgeEnabled,
              reason: 'Firebase already initialized',
            };
            console.info('[Firebase] Already initialized');
          } else {
            // Erreur de configuration
            throw error;
          }
        }
      } else {
        // En SSR, on considère Firebase comme disponible si les clés sont présentes
        this.status = {
          available: true,
          pushEnabled,
          badgeEnabled,
          reason: 'SSR environment - Firebase will be initialized client-side',
        };
      }
    } catch (error: any) {
      console.error('[Firebase] Initialization failed:', error.message);
      this.status = {
        available: false,
        pushEnabled: false,
        badgeEnabled: false,
        reason: `Firebase init error: ${error.message}`,
      };
    }

    this.checked = true;
    return this.status;
  }

  /**
   * Obtient le status actuel (après check)
   */
  getStatus(): FirebaseStatus {
    if (!this.checked) {
      console.warn('[Firebase] Status requested before check - returning unavailable');
      return {
        available: false,
        pushEnabled: false,
        badgeEnabled: false,
        reason: 'Not checked yet',
      };
    }
    return this.status;
  }

  /**
   * Vérifie si Firebase est disponible
   */
  isAvailable(): boolean {
    return this.getStatus().available;
  }

  /**
   * Vérifie si les push notifications sont activées
   */
  isPushEnabled(): boolean {
    return this.getStatus().pushEnabled;
  }

  /**
   * Vérifie si les badges PWA sont activés
   */
  isBadgeEnabled(): boolean {
    return this.getStatus().badgeEnabled;
  }

  /**
   * Réinitialise le checker (utile pour les tests)
   */
  reset(): void {
    this.checked = false;
    this.status = {
      available: false,
      pushEnabled: false,
      badgeEnabled: false,
    };
  }

  /**
   * Obtient un rapport de debug
   */
  getDebugReport(): {
    status: FirebaseStatus;
    environment: Record<string, string | undefined>;
  } {
    return {
      status: this.getStatus(),
      environment: {
        FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY
          ? 'Set'
          : 'Missing',
        FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
          ? 'Set'
          : 'Missing',
        FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
          ? 'Set'
          : 'Missing',
        FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
          ? 'Set'
          : 'Missing',
        FIREBASE_VAPID_KEY: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
          ? 'Set'
          : 'Missing',
        ENABLE_PUSH_NOTIFICATIONS: process.env.NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS,
        ENABLE_PWA_BADGES: process.env.NEXT_PUBLIC_ENABLE_PWA_BADGES,
      },
    };
  }
}

// Instance singleton exportée
export const firebaseChecker = FirebaseAvailabilityChecker.getInstance();

// Export pour les tests
export { FirebaseAvailabilityChecker };
