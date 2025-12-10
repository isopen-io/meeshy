/**
 * Collecteur de contexte pour les erreurs client
 * Rassemble toutes les informations utiles sur l'appareil, la configuration et la localisation
 */

export interface ErrorContext {
  // Informations de base
  timestamp: string;
  url: string;
  message: string;
  stack?: string;
  digest?: string;

  // User Agent détaillé
  userAgent: string;
  platform: string;
  language: string;
  languages: readonly string[];

  // Informations appareil
  device: {
    type: 'mobile' | 'tablet' | 'desktop' | 'unknown';
    os: string;
    osVersion: string;
    browser: string;
    browserVersion: string;
    vendor: string;
    isTouchDevice: boolean;
  };

  // Viewport et écran
  screen: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
    colorDepth: number;
    pixelRatio: number;
    orientation: 'portrait' | 'landscape' | 'unknown';
  };

  // État réseau
  network: {
    online: boolean;
    effectiveType?: string; // '4g', '3g', '2g', 'slow-2g'
    downlink?: number; // Mbps
    rtt?: number; // Round-trip time en ms
    saveData?: boolean;
  };

  // Performance
  performance: {
    memory?: {
      usedJSHeapSize?: number;
      totalJSHeapSize?: number;
      jsHeapSizeLimit?: number;
    };
    timing?: {
      loadTime?: number;
      domContentLoaded?: number;
    };
  };

  // Configuration utilisateur
  preferences: {
    cookiesEnabled: boolean;
    doNotTrack: boolean | null;
    storageAvailable: {
      localStorage: boolean;
      sessionStorage: boolean;
      indexedDB: boolean;
    };
  };

  // Localisation (approximative via timezone et langue)
  location: {
    timezone: string;
    timezoneOffset: number;
    locale: string;
  };
}

/**
 * Parse le User Agent pour extraire des informations détaillées
 */
function parseUserAgent(ua: string) {
  const device = {
    type: 'unknown' as 'mobile' | 'tablet' | 'desktop' | 'unknown',
    os: 'Unknown',
    osVersion: 'Unknown',
    browser: 'Unknown',
    browserVersion: 'Unknown',
    vendor: navigator.vendor || 'Unknown',
    isTouchDevice: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
  };

  // Détection type d'appareil
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    device.type = 'tablet';
  } else if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
    device.type = 'mobile';
  } else {
    device.type = 'desktop';
  }

  // Détection OS
  if (/Android/.test(ua)) {
    device.os = 'Android';
    const match = ua.match(/Android\s([0-9.]+)/);
    device.osVersion = match ? match[1] : 'Unknown';
  } else if (/iPhone|iPad|iPod/.test(ua)) {
    device.os = 'iOS';
    const match = ua.match(/OS\s([0-9_]+)/);
    device.osVersion = match ? match[1].replace(/_/g, '.') : 'Unknown';
  } else if (/Windows/.test(ua)) {
    device.os = 'Windows';
    if (/Windows NT 10/.test(ua)) device.osVersion = '10';
    else if (/Windows NT 6.3/.test(ua)) device.osVersion = '8.1';
    else if (/Windows NT 6.2/.test(ua)) device.osVersion = '8';
    else if (/Windows NT 6.1/.test(ua)) device.osVersion = '7';
  } else if (/Mac OS X/.test(ua)) {
    device.os = 'macOS';
    const match = ua.match(/Mac OS X\s([0-9_]+)/);
    device.osVersion = match ? match[1].replace(/_/g, '.') : 'Unknown';
  } else if (/Linux/.test(ua)) {
    device.os = 'Linux';
  }

  // Détection navigateur
  if (/Chrome/.test(ua) && !/Edg|OPR/.test(ua)) {
    device.browser = 'Chrome';
    const match = ua.match(/Chrome\/([0-9.]+)/);
    device.browserVersion = match ? match[1] : 'Unknown';
  } else if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
    device.browser = 'Safari';
    const match = ua.match(/Version\/([0-9.]+)/);
    device.browserVersion = match ? match[1] : 'Unknown';
  } else if (/Firefox/.test(ua)) {
    device.browser = 'Firefox';
    const match = ua.match(/Firefox\/([0-9.]+)/);
    device.browserVersion = match ? match[1] : 'Unknown';
  } else if (/Edg/.test(ua)) {
    device.browser = 'Edge';
    const match = ua.match(/Edg\/([0-9.]+)/);
    device.browserVersion = match ? match[1] : 'Unknown';
  } else if (/OPR/.test(ua)) {
    device.browser = 'Opera';
    const match = ua.match(/OPR\/([0-9.]+)/);
    device.browserVersion = match ? match[1] : 'Unknown';
  }

  return device;
}

/**
 * Collecte tous les détails du contexte d'une erreur
 */
export function collectErrorContext(
  error: Error & { digest?: string },
  additionalContext?: Partial<ErrorContext>
): ErrorContext {
  const ua = navigator.userAgent;
  const device = parseUserAgent(ua);

  // Informations réseau
  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  const network = {
    online: navigator.onLine,
    effectiveType: connection?.effectiveType,
    downlink: connection?.downlink,
    rtt: connection?.rtt,
    saveData: connection?.saveData,
  };

  // Informations écran
  const screen = {
    width: window.screen.width,
    height: window.screen.height,
    availWidth: window.screen.availWidth,
    availHeight: window.screen.availHeight,
    colorDepth: window.screen.colorDepth,
    pixelRatio: window.devicePixelRatio || 1,
    orientation:
      window.innerHeight > window.innerWidth
        ? ('portrait' as const)
        : ('landscape' as const),
  };

  // Informations performance
  const performance: ErrorContext['performance'] = {
    memory: undefined,
    timing: undefined,
  };

  if ('memory' in window.performance) {
    const mem = (window.performance as any).memory;
    performance.memory = {
      usedJSHeapSize: mem.usedJSHeapSize,
      totalJSHeapSize: mem.totalJSHeapSize,
      jsHeapSizeLimit: mem.jsHeapSizeLimit,
    };
  }

  if (window.performance.timing) {
    const timing = window.performance.timing;
    performance.timing = {
      loadTime: timing.loadEventEnd - timing.navigationStart,
      domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
    };
  }

  // Test de disponibilité du stockage
  const storageAvailable = {
    localStorage: false,
    sessionStorage: false,
    indexedDB: false,
  };

  try {
    localStorage.setItem('__test__', '1');
    localStorage.removeItem('__test__');
    storageAvailable.localStorage = true;
  } catch (e) {
    // localStorage non disponible
  }

  try {
    sessionStorage.setItem('__test__', '1');
    sessionStorage.removeItem('__test__');
    storageAvailable.sessionStorage = true;
  } catch (e) {
    // sessionStorage non disponible
  }

  try {
    storageAvailable.indexedDB = 'indexedDB' in window;
  } catch (e) {
    // indexedDB non disponible
  }

  // Préférences utilisateur
  const preferences = {
    cookiesEnabled: navigator.cookieEnabled,
    doNotTrack: (navigator as any).doNotTrack === '1' ? true : (navigator as any).doNotTrack === '0' ? false : null,
    storageAvailable,
  };

  // Localisation approximative
  const location = {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset: new Date().getTimezoneOffset(),
    locale: navigator.language,
  };

  return {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    message: error.message,
    stack: error.stack,
    digest: error.digest,
    userAgent: ua,
    platform: navigator.platform,
    language: navigator.language,
    languages: navigator.languages,
    device,
    screen,
    network,
    performance,
    preferences,
    location,
    ...additionalContext,
  };
}

/**
 * Envoie le contexte d'erreur au backend
 */
export async function sendErrorContext(context: ErrorContext): Promise<boolean> {
  try {
    const response = await fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context),
    });
    return response.ok;
  } catch (error) {
    console.error('[Error Context] Failed to send error context:', error);
    return false;
  }
}
