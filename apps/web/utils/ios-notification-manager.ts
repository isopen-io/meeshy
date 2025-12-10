/**
 * iOS Notification Manager
 * Gère les limitations spécifiques iOS pour les notifications PWA
 *
 * Limitations iOS:
 * - iOS < 16.4: Pas de support push notifications PWA
 * - iOS ≥ 16.4: Support uniquement si PWA installée ("Add to Home Screen")
 * - Safari iOS: Pas de Badging API
 * - Permissions: Workflow différent d'Android
 */

interface IOSInfo {
  isIOS: boolean;
  isIPadOS: boolean;
  version: number | null;
  isStandalone: boolean;
  isSafari: boolean;
  supportsPushNotifications: boolean;
  supportsBadging: boolean;
}

interface IOSNotificationCapabilities {
  canReceivePushNotifications: boolean;
  canShowBadge: boolean;
  needsHomeScreenInstall: boolean;
  recommendedFallback: 'in-app' | 'none';
  reason: string;
}

class IOSNotificationManager {
  private iosInfo: IOSInfo | null = null;
  private debug: boolean = false;

  constructor(debug: boolean = false) {
    this.debug = debug;
    this.detectIOSInfo();
  }

  /**
   * Log helper
   */
  private log(...args: any[]): void {
    if (this.debug) {
      console.log('[iOS-Notifications]', ...args);
    }
  }

  /**
   * Détecte si on est sur iOS et collecte les informations
   */
  private detectIOSInfo(): void {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      this.iosInfo = null;
      return;
    }

    const userAgent = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipod/.test(userAgent);
    const isIPadOS = /ipad/.test(userAgent) || (
      navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
    );
    const isSafari = /safari/.test(userAgent) && !/chrome|crios|fxios/.test(userAgent);

    // Détecter la version iOS
    let version: number | null = null;
    const versionMatch = userAgent.match(/os (\d+)_(\d+)_?(\d+)?/);
    if (versionMatch) {
      version = parseInt(versionMatch[1], 10);
    }

    // Détecter si en mode standalone (PWA installée)
    const isStandalone = (window.navigator as any).standalone === true ||
                        window.matchMedia('(display-mode: standalone)').matches;

    // Vérifier support push notifications
    // iOS 16.4+ supporte les push notifications PWA
    const supportsPushNotifications =
      (isIOS || isIPadOS) &&
      version !== null &&
      version >= 16 &&
      isStandalone &&
      'PushManager' in window &&
      'serviceWorker' in navigator;

    // iOS ne supporte pas Badging API
    const supportsBadging = false;

    this.iosInfo = {
      isIOS: isIOS || isIPadOS,
      isIPadOS,
      version,
      isStandalone,
      isSafari,
      supportsPushNotifications,
      supportsBadging,
    };

    this.log('iOS Info detected:', this.iosInfo);
  }

  /**
   * Vérifie si on est sur iOS
   */
  public isIOS(): boolean {
    return this.iosInfo?.isIOS || false;
  }

  /**
   * Vérifie si on est sur iPad
   */
  public isIPadOS(): boolean {
    return this.iosInfo?.isIPadOS || false;
  }

  /**
   * Obtient la version iOS
   */
  public getIOSVersion(): number | null {
    return this.iosInfo?.version || null;
  }

  /**
   * Vérifie si la PWA est installée (mode standalone)
   */
  public isInstalledPWA(): boolean {
    return this.iosInfo?.isStandalone || false;
  }

  /**
   * Vérifie si on est dans Safari
   */
  public isSafari(): boolean {
    return this.iosInfo?.isSafari || false;
  }

  /**
   * Vérifie si les push notifications sont supportées
   */
  public supportsPushNotifications(): boolean {
    return this.iosInfo?.supportsPushNotifications || false;
  }

  /**
   * Vérifie si le badging est supporté
   */
  public supportsBadging(): boolean {
    return this.iosInfo?.supportsBadging || false;
  }

  /**
   * Analyse les capacités de notification pour cet appareil iOS
   */
  public getNotificationCapabilities(): IOSNotificationCapabilities {
    if (!this.isIOS()) {
      return {
        canReceivePushNotifications: true,
        canShowBadge: true,
        needsHomeScreenInstall: false,
        recommendedFallback: 'none',
        reason: 'Not an iOS device',
      };
    }

    const version = this.getIOSVersion();
    const isStandalone = this.isInstalledPWA();

    // iOS < 16.4: Pas de support push PWA
    if (version !== null && version < 16) {
      return {
        canReceivePushNotifications: false,
        canShowBadge: false,
        needsHomeScreenInstall: false,
        recommendedFallback: 'in-app',
        reason: `iOS ${version} does not support PWA push notifications (requires iOS 16.4+)`,
      };
    }

    // iOS ≥ 16.4 mais pas en mode standalone
    if (version !== null && version >= 16 && !isStandalone) {
      return {
        canReceivePushNotifications: false,
        canShowBadge: false,
        needsHomeScreenInstall: true,
        recommendedFallback: 'in-app',
        reason: 'PWA must be installed to Home Screen to receive push notifications on iOS',
      };
    }

    // iOS ≥ 16.4 en mode standalone
    if (version !== null && version >= 16 && isStandalone) {
      return {
        canReceivePushNotifications: true,
        canShowBadge: false, // iOS ne supporte pas Badging API
        needsHomeScreenInstall: false,
        recommendedFallback: 'none',
        reason: 'Full push notification support (badge not supported)',
      };
    }

    // Cas par défaut (version inconnue)
    return {
      canReceivePushNotifications: false,
      canShowBadge: false,
      needsHomeScreenInstall: true,
      recommendedFallback: 'in-app',
      reason: 'Unable to determine iOS version',
    };
  }

  /**
   * Vérifie si on devrait montrer le guide "Add to Home Screen"
   */
  public shouldShowInstallPrompt(): boolean {
    if (!this.isIOS()) {
      return false;
    }

    const version = this.getIOSVersion();
    const isStandalone = this.isInstalledPWA();

    // Montrer le prompt si iOS 16.4+ et pas encore installé
    return version !== null && version >= 16 && !isStandalone;
  }

  /**
   * Obtient les instructions d'installation pour iOS
   */
  public getInstallInstructions(): string[] {
    if (this.isSafari()) {
      return [
        'Tap the Share button (square with arrow) at the bottom',
        'Scroll down and tap "Add to Home Screen"',
        'Tap "Add" in the top right corner',
        'The Meeshy app will appear on your Home Screen',
      ];
    } else {
      return [
        'Open this page in Safari browser',
        'Tap the Share button at the bottom',
        'Scroll and tap "Add to Home Screen"',
        'Tap "Add" to complete installation',
      ];
    }
  }

  /**
   * Obtient un message personnalisé pour l'utilisateur iOS
   */
  public getUserMessage(): string {
    const capabilities = this.getNotificationCapabilities();

    if (!capabilities.canReceivePushNotifications) {
      if (capabilities.needsHomeScreenInstall) {
        return 'To receive push notifications on iOS, please add Meeshy to your Home Screen first.';
      } else {
        return 'Push notifications are not available on your iOS version. You will receive in-app notifications only.';
      }
    }

    return 'Push notifications are available on your device!';
  }

  /**
   * Enregistre un refus d'installation
   */
  public recordInstallDismissal(): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ios_install_prompt_dismissed', Date.now().toString());
    }
  }

  /**
   * Vérifie si le prompt d'installation a été récemment refusé
   */
  public wasInstallPromptRecentlyDismissed(daysSince: number = 7): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    const dismissed = localStorage.getItem('ios_install_prompt_dismissed');
    if (!dismissed) {
      return false;
    }

    const daysPassed = (Date.now() - parseInt(dismissed)) / (1000 * 60 * 60 * 24);
    return daysPassed < daysSince;
  }

  /**
   * Obtient toutes les informations iOS
   */
  public getInfo(): IOSInfo | null {
    return this.iosInfo;
  }

  /**
   * Génère un rapport complet pour debug
   */
  public getDebugReport(): string {
    if (!this.iosInfo) {
      return 'iOS Info not available (not in browser environment)';
    }

    const capabilities = this.getNotificationCapabilities();

    return `
iOS Notification Debug Report
==============================
Device Info:
- Is iOS: ${this.iosInfo.isIOS}
- Is iPadOS: ${this.iosInfo.isIPadOS}
- Version: ${this.iosInfo.version || 'Unknown'}
- Is Safari: ${this.iosInfo.isSafari}
- Is Standalone: ${this.iosInfo.isStandalone}

Support:
- Push Notifications: ${this.iosInfo.supportsPushNotifications}
- Badging API: ${this.iosInfo.supportsBadging}

Capabilities:
- Can Receive Push: ${capabilities.canReceivePushNotifications}
- Can Show Badge: ${capabilities.canShowBadge}
- Needs Install: ${capabilities.needsHomeScreenInstall}
- Recommended Fallback: ${capabilities.recommendedFallback}
- Reason: ${capabilities.reason}

Recommendations:
- Show Install Prompt: ${this.shouldShowInstallPrompt()}
- User Message: ${this.getUserMessage()}
    `.trim();
  }
}

// Instance singleton
let iosManagerInstance: IOSNotificationManager | null = null;

/**
 * Obtient l'instance singleton du iOS Manager
 */
export function getIOSNotificationManager(debug?: boolean): IOSNotificationManager {
  if (!iosManagerInstance) {
    iosManagerInstance = new IOSNotificationManager(debug);
  }
  return iosManagerInstance;
}

/**
 * Réinitialise l'instance singleton (tests)
 */
export function resetIOSNotificationManager(): void {
  iosManagerInstance = null;
}

/**
 * Utilitaires rapides
 */
export const iosNotifications = {
  /**
   * Vérifie si on est sur iOS
   */
  isIOS: (): boolean => {
    return getIOSNotificationManager().isIOS();
  },

  /**
   * Vérifie si les push sont supportées
   */
  supportsPush: (): boolean => {
    return getIOSNotificationManager().supportsPushNotifications();
  },

  /**
   * Vérifie si le badging est supporté
   */
  supportsBadging: (): boolean => {
    return getIOSNotificationManager().supportsBadging();
  },

  /**
   * Obtient les capacités
   */
  getCapabilities: (): IOSNotificationCapabilities => {
    return getIOSNotificationManager().getNotificationCapabilities();
  },

  /**
   * Vérifie si on devrait montrer le prompt d'installation
   */
  shouldShowInstallPrompt: (): boolean => {
    return getIOSNotificationManager().shouldShowInstallPrompt();
  },

  /**
   * Obtient les instructions d'installation
   */
  getInstallInstructions: (): string[] => {
    return getIOSNotificationManager().getInstallInstructions();
  },

  /**
   * Obtient le message utilisateur
   */
  getUserMessage: (): string => {
    return getIOSNotificationManager().getUserMessage();
  },

  /**
   * Vérifie si la PWA est installée
   */
  isInstalled: (): boolean => {
    return getIOSNotificationManager().isInstalledPWA();
  },

  /**
   * Rapport de debug
   */
  getDebugReport: (): string => {
    return getIOSNotificationManager().getDebugReport();
  },
};

export default iosNotifications;
