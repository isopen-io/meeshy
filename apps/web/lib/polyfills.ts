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
  (globalThis as unknown as Record<string, unknown>).structuredClone = function <T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  };
}

// Polyfill pour queueMicrotask (manquant sur certains navigateurs)
if (typeof queueMicrotask === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).queueMicrotask = function (callback: () => void) {
    Promise.resolve().then(callback);
  };
}

// Fix pour localStorage sur certains navigateurs en mode privé
if (typeof window !== 'undefined') {
  try {
    window.localStorage.setItem('__test__', '1');
    window.localStorage.removeItem('__test__');
  } catch {
    console.warn('[Polyfill] localStorage not available, using in-memory storage');

    // Créer un fallback en mémoire
    const memoryStorage: Record<string, string> = {};

    Object.defineProperty(window, 'localStorage', { value: {
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
    }, writable: true });
  }
}

// Fix pour IntersectionObserver (ancien Android)
if (typeof IntersectionObserver === 'undefined' && typeof window !== 'undefined') {
  console.warn('[Polyfill] IntersectionObserver not available');
  const StubObserver = class {
    private _callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) {
      this._callback = callback;
      void this._callback;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] { return []; }
    get root() { return null; }
    get rootMargin() { return '0px'; }
    get thresholds() { return [0]; }
  };
  Object.defineProperty(window, 'IntersectionObserver', { value: StubObserver, writable: true });
}

// Fix pour navigator.connection (manquant sur certains navigateurs)
if (typeof navigator !== 'undefined' && !('connection' in navigator)) {
  Object.defineProperty(navigator, 'connection', {
    value: {
      effectiveType: '4g',
      downlink: 10,
      rtt: 50,
      saveData: false,
    },
    writable: true,
  });
}

console.info('[Polyfills] Polyfills loaded successfully');
