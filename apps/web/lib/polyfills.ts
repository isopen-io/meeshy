/**
 * Polyfills pour la compatibilité avec les anciens navigateurs Android
 * À importer dans le layout principal avant tout autre code
 */

// Polyfill pour Promise.allSettled (manquant sur certains Android)
if (typeof Promise.allSettled === 'undefined') {
  Promise.allSettled = function <T>(promises: Iterable<T | PromiseLike<T>>) {
    return Promise.all(
      Array.from(promises).map((promise) =>
        Promise.resolve(promise).then(
          (value) => ({ status: 'fulfilled' as const, value }),
          (reason) => ({ status: 'rejected' as const, reason })
        )
      )
    );
  };
}

// Polyfill pour structuredClone (manquant sur certains navigateurs)
if (typeof structuredClone === 'undefined') {
  (globalThis as any).structuredClone = function <T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  };
}

// Polyfill pour queueMicrotask (manquant sur certains navigateurs)
if (typeof queueMicrotask === 'undefined') {
  (globalThis as any).queueMicrotask = function (callback: () => void) {
    Promise.resolve().then(callback);
  };
}

// Fix pour localStorage sur certains navigateurs en mode privé
if (typeof window !== 'undefined') {
  try {
    window.localStorage.setItem('__test__', '1');
    window.localStorage.removeItem('__test__');
  } catch (e) {
    console.warn('[Polyfill] localStorage not available, using in-memory storage');

    // Créer un fallback en mémoire
    const memoryStorage: Record<string, string> = {};

    (window as any).localStorage = {
      getItem: (key: string) => memoryStorage[key] || null,
      setItem: (key: string, value: string) => {
        memoryStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete memoryStorage[key];
      },
      clear: () => {
        Object.keys(memoryStorage).forEach((key) => delete memoryStorage[key]);
      },
      get length() {
        return Object.keys(memoryStorage).length;
      },
      key: (index: number) => {
        const keys = Object.keys(memoryStorage);
        return keys[index] || null;
      },
    };
  }
}

// Fix pour IntersectionObserver (ancien Android)
if (typeof IntersectionObserver === 'undefined' && typeof window !== 'undefined') {
  console.warn('[Polyfill] IntersectionObserver not available');
  // Créer un stub basique
  (window as any).IntersectionObserver = class IntersectionObserver {
    constructor(callback: any) {
      this.callback = callback;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    private callback: any;
  };
}

// Fix pour navigator.connection (manquant sur certains navigateurs)
if (typeof navigator !== 'undefined' && !(navigator as any).connection) {
  (navigator as any).connection = {
    effectiveType: '4g',
    downlink: 10,
    rtt: 50,
    saveData: false,
  };
}

console.info('[Polyfills] Polyfills loaded successfully');
