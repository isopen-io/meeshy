/**
 * Service Worker Registration Manager
 * Gère l'enregistrement et le cycle de vie des Service Workers
 */

interface ServiceWorkerRegistrationOptions {
  /**
   * Activer le debug logging
   */
  debug?: boolean;

  /**
   * Callback quand le SW est enregistré
   */
  onRegistered?: (registration: ServiceWorkerRegistration) => void;

  /**
   * Callback quand une mise à jour est disponible
   */
  onUpdateAvailable?: (registration: ServiceWorkerRegistration) => void;

  /**
   * Callback en cas d'erreur
   */
  onError?: (error: Error) => void;

  /**
   * Activer la mise à jour automatique
   */
  autoUpdate?: boolean;
}

class ServiceWorkerRegistrationManager {
  private registration: ServiceWorkerRegistration | null = null;
  private isRegistered: boolean = false;
  private options: ServiceWorkerRegistrationOptions;
  private updateCheckInterval: NodeJS.Timeout | null = null;

  constructor(options: ServiceWorkerRegistrationOptions = {}) {
    this.options = {
      debug: false,
      autoUpdate: true,
      ...options,
    };
  }

  /**
   * Log helper
   */
  private log(...args: any[]): void {
    if (this.options.debug) {
      console.log('[SW-Registration]', ...args);
    }
  }

  /**
   * Gestion des erreurs
   */
  private handleError(error: Error, context: string): void {
    console.error(`[SW-Registration] Error in ${context}:`, error);
    this.options.onError?.(error);
  }

  /**
   * Vérifie si les Service Workers sont supportés
   */
  public isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window
    );
  }

  /**
   * Enregistre le Service Worker principal
   */
  public async register(swPath: string = '/sw.js'): Promise<boolean> {
    if (!this.isSupported()) {
      this.log('Service Workers not supported');
      return false;
    }

    if (this.isRegistered && this.registration) {
      this.log('Already registered');
      return true;
    }

    try {
      this.log('Registering Service Worker:', swPath);

      // Enregistrer le SW
      this.registration = await navigator.serviceWorker.register(swPath, {
        scope: '/',
        updateViaCache: 'none', // Toujours vérifier les mises à jour
      });

      this.log('Service Worker registered successfully');
      this.isRegistered = true;

      // Setup des event listeners
      this.setupEventListeners();

      // Callback
      this.options.onRegistered?.(this.registration);

      // Vérifier mise à jour au montage
      await this.checkForUpdates();

      // Vérifier périodiquement les mises à jour
      if (this.options.autoUpdate) {
        this.startUpdateChecks();
      }

      return true;
    } catch (error) {
      this.handleError(error as Error, 'register');
      return false;
    }
  }

  /**
   * Configure les event listeners du SW
   */
  private setupEventListeners(): void {
    if (!this.registration) return;

    // Écouter les mises à jour
    this.registration.addEventListener('updatefound', () => {
      this.log('Update found');
      this.handleUpdateFound();
    });

    // Écouter les changements de contrôleur
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      this.log('Controller changed, reloading page');
      // Le nouveau SW a pris le contrôle, recharger la page
      window.location.reload();
    });

    // Écouter les messages du SW
    navigator.serviceWorker.addEventListener('message', (event) => {
      this.log('Message from SW:', event.data);
      this.handleServiceWorkerMessage(event);
    });
  }

  /**
   * Gère la découverte d'une mise à jour
   */
  private handleUpdateFound(): void {
    if (!this.registration || !this.registration.installing) return;

    const installingWorker = this.registration.installing;

    installingWorker.addEventListener('statechange', () => {
      if (installingWorker.state === 'installed') {
        if (navigator.serviceWorker.controller) {
          // Un nouveau SW est disponible
          this.log('New version available');
          this.options.onUpdateAvailable?.(this.registration!);
        } else {
          // Premier install
          this.log('Content cached for offline use');
        }
      }
    });
  }

  /**
   * Gère les messages du Service Worker
   */
  private handleServiceWorkerMessage(event: MessageEvent): void {
    const { data } = event;

    switch (data.type) {
      case 'NOTIFICATION_CLICKED':
        // Gérer le clic sur notification
        this.log('Notification clicked, navigating to:', data.url);
        if (data.url) {
          window.location.href = data.url;
        }
        break;

      case 'CACHE_UPDATED':
        this.log('Cache updated');
        break;

      default:
        this.log('Unknown message type:', data.type);
    }
  }

  /**
   * Vérifie les mises à jour du SW
   */
  public async checkForUpdates(): Promise<void> {
    if (!this.registration) {
      this.log('No registration to update');
      return;
    }

    try {
      this.log('Checking for updates...');
      await this.registration.update();
      this.log('Update check complete');
    } catch (error) {
      this.handleError(error as Error, 'checkForUpdates');
    }
  }

  /**
   * Démarre les vérifications périodiques de mise à jour
   */
  private startUpdateChecks(): void {
    // Vérifier toutes les heures
    this.updateCheckInterval = setInterval(() => {
      this.log('Periodic update check');
      this.checkForUpdates();
    }, 60 * 60 * 1000); // 1 heure
  }

  /**
   * Arrête les vérifications périodiques
   */
  private stopUpdateChecks(): void {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
    }
  }

  /**
   * Active le nouveau SW (skip waiting)
   */
  public async activateUpdate(): Promise<void> {
    if (!this.registration || !this.registration.waiting) {
      this.log('No waiting SW to activate');
      return;
    }

    try {
      this.log('Activating update...');

      // Envoyer message SKIP_WAITING au SW en attente
      this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });

      // Le controllerchange event rechargera la page automatiquement
    } catch (error) {
      this.handleError(error as Error, 'activateUpdate');
    }
  }

  /**
   * Obtient la registration actuelle
   */
  public getRegistration(): ServiceWorkerRegistration | null {
    return this.registration;
  }

  /**
   * Vérifie si un SW est enregistré
   */
  public isServiceWorkerRegistered(): boolean {
    return this.isRegistered && this.registration !== null;
  }

  /**
   * Vérifie si une mise à jour est en attente
   */
  public hasWaitingUpdate(): boolean {
    return !!(this.registration && this.registration.waiting);
  }

  /**
   * Envoie un message au Service Worker
   */
  public async sendMessage(message: any): Promise<void> {
    if (!navigator.serviceWorker.controller) {
      this.log('No SW controller to send message');
      return;
    }

    try {
      navigator.serviceWorker.controller.postMessage(message);
      this.log('Message sent to SW:', message);
    } catch (error) {
      this.handleError(error as Error, 'sendMessage');
    }
  }

  /**
   * Met à jour le badge PWA via le SW
   */
  public async updateBadge(count: number): Promise<void> {
    await this.sendMessage({
      type: count > 0 ? 'SET_BADGE' : 'CLEAR_BADGE',
      count,
    });
  }

  /**
   * Désenregistre le Service Worker
   */
  public async unregister(): Promise<boolean> {
    if (!this.registration) {
      this.log('No registration to unregister');
      return true;
    }

    try {
      this.log('Unregistering Service Worker...');

      // Arrêter les update checks
      this.stopUpdateChecks();

      // Désenregistrer
      const success = await this.registration.unregister();
      this.log('Unregister result:', success);

      if (success) {
        this.registration = null;
        this.isRegistered = false;
      }

      return success;
    } catch (error) {
      this.handleError(error as Error, 'unregister');
      return false;
    }
  }

  /**
   * Nettoie les ressources
   */
  public cleanup(): void {
    this.stopUpdateChecks();
  }
}

// Instance singleton
let swRegistrationInstance: ServiceWorkerRegistrationManager | null = null;

/**
 * Obtient l'instance singleton du SW Registration Manager
 */
export function getSWRegistrationManager(
  options?: ServiceWorkerRegistrationOptions
): ServiceWorkerRegistrationManager {
  if (!swRegistrationInstance) {
    swRegistrationInstance = new ServiceWorkerRegistrationManager(options);
  }
  return swRegistrationInstance;
}

/**
 * Réinitialise l'instance singleton (tests)
 */
export function resetSWRegistrationManager(): void {
  if (swRegistrationInstance) {
    swRegistrationInstance.cleanup();
    swRegistrationInstance = null;
  }
}

/**
 * Utilitaires rapides
 */
export const swRegistration = {
  /**
   * Vérifie si supporté
   */
  isSupported: (): boolean => {
    return getSWRegistrationManager().isSupported();
  },

  /**
   * Enregistre le SW
   */
  register: async (swPath?: string): Promise<boolean> => {
    return getSWRegistrationManager().register(swPath);
  },

  /**
   * Obtient la registration
   */
  getRegistration: (): ServiceWorkerRegistration | null => {
    return getSWRegistrationManager().getRegistration();
  },

  /**
   * Vérifie les mises à jour
   */
  checkForUpdates: async (): Promise<void> => {
    return getSWRegistrationManager().checkForUpdates();
  },

  /**
   * Active la mise à jour
   */
  activateUpdate: async (): Promise<void> => {
    return getSWRegistrationManager().activateUpdate();
  },

  /**
   * Vérifie si une mise à jour est en attente
   */
  hasWaitingUpdate: (): boolean => {
    return getSWRegistrationManager().hasWaitingUpdate();
  },

  /**
   * Envoie un message au SW
   */
  sendMessage: async (message: any): Promise<void> => {
    return getSWRegistrationManager().sendMessage(message);
  },

  /**
   * Met à jour le badge
   */
  updateBadge: async (count: number): Promise<void> => {
    return getSWRegistrationManager().updateBadge(count);
  },

  /**
   * Désenregistre le SW
   */
  unregister: async (): Promise<boolean> => {
    return getSWRegistrationManager().unregister();
  },
};

export default swRegistration;
