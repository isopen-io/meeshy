/**
 * PWA Badge Manager
 * Gère l'affichage du badge sur l'icône de l'application PWA
 *
 * Support:
 * - Chrome/Edge: ✅ Badging API
 * - Safari macOS: ✅ Badging API (avec limitations)
 * - Firefox: ❌ Non supporté
 * - iOS: ❌ Non supporté
 */

import { firebaseChecker } from './firebase-availability-checker';

interface BadgeManagerOptions {
  /**
   * Activer le debug logging
   */
  debug?: boolean;

  /**
   * Callback appelé quand le support est vérifié
   */
  onSupportCheck?: (supported: boolean) => void;

  /**
   * Callback appelé lors d'erreurs
   */
  onError?: (error: Error) => void;
}

class PWABadgeManager {
  private isSupported: boolean = false;
  private currentCount: number = 0;
  private options: BadgeManagerOptions;

  constructor(options: BadgeManagerOptions = {}) {
    this.options = {
      debug: false,
      ...options
    };

    this.checkSupport();
  }

  /**
   * Vérifie si l'API Badging est supportée
   */
  private checkSupport(): void {
    // Vérifier si on est dans un environnement navigateur
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      this.isSupported = false;
      this.log('Not in browser environment');
      this.options.onSupportCheck?.(false);
      return;
    }

    // Vérifier le support de l'API Badging
    this.isSupported = 'setAppBadge' in navigator && 'clearAppBadge' in navigator;

    this.log('Badge API support:', this.isSupported);
    this.options.onSupportCheck?.(this.isSupported);

    // Informations supplémentaires pour debug
    if (this.options.debug) {
      this.logEnvironmentInfo();
    }
  }

  /**
   * Log les informations sur l'environnement
   */
  private logEnvironmentInfo(): void {
    if (typeof window === 'undefined') return;

    const info = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      vendor: navigator.vendor,
      standalone: (window.navigator as any).standalone || false,
      displayMode: window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser'
    };

    this.log('Environment info:', info);
  }

  /**
   * Helper de logging
   */
  private log(...args: any[]): void {
    if (this.options.debug) {
      console.log('[PWABadge]', ...args);
    }
  }

  /**
   * Helper pour gérer les erreurs
   */
  private handleError(error: Error, context: string): void {
    this.log(`Error in ${context}:`, error);
    this.options.onError?.(error);
  }

  /**
   * Vérifie si l'API est supportée
   */
  public isBadgingSupported(): boolean {
    return this.isSupported;
  }

  /**
   * Obtient le compteur actuel
   */
  public getCurrentCount(): number {
    return this.currentCount;
  }

  /**
   * Définit le badge avec un nombre
   * @param count - Nombre à afficher (0 ou undefined pour clear)
   */
  public async setBadgeCount(count: number | undefined): Promise<boolean> {
    // CRITICAL: Vérifier si les badges sont activés
    if (!firebaseChecker.isBadgeEnabled()) {
      this.log('PWA Badges disabled - Firebase not available or feature flag off');
      return false;
    }

    if (!this.isSupported) {
      this.log('Badge API not supported, skipping setBadgeCount');
      return false;
    }

    // Si count est 0 ou undefined, clear le badge
    if (!count || count <= 0) {
      return this.clearBadge();
    }

    try {
      // L'API setAppBadge accepte un nombre ou undefined
      await (navigator as any).setAppBadge(count);
      this.currentCount = count;
      this.log('Badge set to:', count);
      return true;
    } catch (error) {
      this.handleError(error as Error, 'setBadgeCount');
      return false;
    }
  }

  /**
   * Définit le badge sans nombre (juste un point)
   */
  public async setBadge(): Promise<boolean> {
    // CRITICAL: Vérifier si les badges sont activés
    if (!firebaseChecker.isBadgeEnabled()) {
      this.log('PWA Badges disabled - Firebase not available or feature flag off');
      return false;
    }

    if (!this.isSupported) {
      this.log('Badge API not supported, skipping setBadge');
      return false;
    }

    try {
      // setAppBadge() sans argument affiche juste un point
      await (navigator as any).setAppBadge();
      this.currentCount = -1; // -1 indique "badge sans nombre"
      this.log('Badge set (no count)');
      return true;
    } catch (error) {
      this.handleError(error as Error, 'setBadge');
      return false;
    }
  }

  /**
   * Supprime le badge
   */
  public async clearBadge(): Promise<boolean> {
    if (!this.isSupported) {
      this.log('Badge API not supported, skipping clearBadge');
      return false;
    }

    try {
      await (navigator as any).clearAppBadge();
      this.currentCount = 0;
      this.log('Badge cleared');
      return true;
    } catch (error) {
      this.handleError(error as Error, 'clearBadge');
      return false;
    }
  }

  /**
   * Incrémente le badge
   */
  public async incrementBadge(amount: number = 1): Promise<boolean> {
    if (!this.isSupported || this.currentCount < 0) {
      return false;
    }

    const newCount = this.currentCount + amount;
    return this.setBadgeCount(newCount);
  }

  /**
   * Décrémente le badge
   */
  public async decrementBadge(amount: number = 1): Promise<boolean> {
    if (!this.isSupported || this.currentCount < 0) {
      return false;
    }

    const newCount = Math.max(0, this.currentCount - amount);
    return this.setBadgeCount(newCount);
  }

  /**
   * Synchronise le badge avec le Service Worker
   * Utile quand le SW a son propre état du badge
   */
  public async syncWithServiceWorker(): Promise<void> {
    if (!this.isSupported) return;

    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SET_BADGE',
          count: this.currentCount
        });
        this.log('Badge synced with Service Worker');
      }
    } catch (error) {
      this.handleError(error as Error, 'syncWithServiceWorker');
    }
  }

  /**
   * Réinitialise le manager
   */
  public reset(): void {
    this.clearBadge();
    this.currentCount = 0;
  }
}

// Instance singleton
let badgeManagerInstance: PWABadgeManager | null = null;

/**
 * Obtient l'instance singleton du BadgeManager
 */
export function getBadgeManager(options?: BadgeManagerOptions): PWABadgeManager {
  if (!badgeManagerInstance) {
    badgeManagerInstance = new PWABadgeManager(options);
  }
  return badgeManagerInstance;
}

/**
 * Réinitialise l'instance singleton (utile pour les tests)
 */
export function resetBadgeManager(): void {
  if (badgeManagerInstance) {
    badgeManagerInstance.reset();
    badgeManagerInstance = null;
  }
}

// Exports des fonctions utilitaires
export const pwaBadge = {
  /**
   * Vérifie si l'API Badging est supportée
   */
  isSupported: (): boolean => {
    return getBadgeManager().isBadgingSupported();
  },

  /**
   * Définit le badge avec un nombre
   */
  setCount: (count: number | undefined): Promise<boolean> => {
    return getBadgeManager().setBadgeCount(count);
  },

  /**
   * Définit le badge sans nombre
   */
  set: (): Promise<boolean> => {
    return getBadgeManager().setBadge();
  },

  /**
   * Supprime le badge
   */
  clear: (): Promise<boolean> => {
    return getBadgeManager().clearBadge();
  },

  /**
   * Incrémente le badge
   */
  increment: (amount?: number): Promise<boolean> => {
    return getBadgeManager().incrementBadge(amount);
  },

  /**
   * Décrémente le badge
   */
  decrement: (amount?: number): Promise<boolean> => {
    return getBadgeManager().decrementBadge(amount);
  },

  /**
   * Obtient le compteur actuel
   */
  getCount: (): number => {
    return getBadgeManager().getCurrentCount();
  },

  /**
   * Synchronise avec le Service Worker
   */
  sync: (): Promise<void> => {
    return getBadgeManager().syncWithServiceWorker();
  }
};

// Export par défaut
export default pwaBadge;
