/**
 * Tests for utils/service-worker.ts
 */

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { disconnectForUpdate: jest.fn() },
}));

import {
  registerServiceWorker,
  performFullAppInvalidationAndReload,
  activateWaitingServiceWorker,
  triggerManualUpdateCheck,
  unregisterServiceWorker,
  isServiceWorkerActive,
} from '@/utils/service-worker';

const mockRegister = jest.fn();
const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockGetRegistration = jest.fn();
const mockUnregister = jest.fn();
const mockPostMessage = jest.fn();
const mockReload = jest.fn();
const mockSwAddEventListener = jest.fn();

function makeRegistration(overrides: Partial<{
  waiting: ServiceWorker | null;
  installing: ServiceWorker | null;
  active: ServiceWorker | null;
  scope: string;
}> = {}): ServiceWorkerRegistration {
  return {
    scope: '/',
    update: mockUpdate,
    unregister: mockUnregister,
    addEventListener: jest.fn(),
    waiting: null,
    installing: null,
    active: null,
    ...overrides,
  } as unknown as ServiceWorkerRegistration;
}

beforeEach(() => {
  jest.clearAllMocks();

  mockUpdate.mockResolvedValue(undefined);
  mockUnregister.mockResolvedValue(true);
  mockRegister.mockResolvedValue(makeRegistration());
  mockGetRegistration.mockResolvedValue(undefined);

  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      register: mockRegister,
      getRegistration: mockGetRegistration,
      addEventListener: mockSwAddEventListener,
      controller: null,
    },
    writable: true,
    configurable: true,
  });

  // jest.setup.js installed a getter/setter on Window.prototype that checks
  // this.__mockedLocation — use it to swap in a mockable location object.
  (window as unknown as Record<string, unknown>).__mockedLocation = {
    reload: mockReload,
    href: 'http://localhost/',
    origin: 'http://localhost',
    pathname: '/',
    assign: jest.fn(),
    replace: jest.fn(),
  };

  // Provide minimal caches API
  Object.defineProperty(window, 'caches', {
    value: {
      keys: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(true),
    },
    writable: true,
    configurable: true,
  });

  // Provide minimal indexedDB.deleteDatabase
  Object.defineProperty(window, 'indexedDB', {
    value: {
      deleteDatabase: jest.fn().mockReturnValue({ onerror: null, onsuccess: null }),
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__mockedLocation;
});

// ─── registerServiceWorker ────────────────────────────────────────────────────

describe('registerServiceWorker', () => {
  it('returns null when serviceWorker is not in navigator', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const result = await registerServiceWorker();
    expect(result).toBeNull();
  });

  it('registers /sw.js with scope / and updateViaCache none', async () => {
    await registerServiceWorker();
    expect(mockRegister).toHaveBeenCalledWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
  });

  it('calls registration.update() immediately after registration', async () => {
    await registerServiceWorker();
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('returns the registration on success', async () => {
    const reg = makeRegistration();
    mockRegister.mockResolvedValue(reg);
    const result = await registerServiceWorker();
    expect(result).toBe(reg);
  });

  it('dispatches sw-update-available when registration.waiting exists', async () => {
    const waitingWorker = {} as ServiceWorker;
    const reg = makeRegistration({ waiting: waitingWorker });
    mockRegister.mockResolvedValue(reg);

    const dispatchSpy = jest.spyOn(window, 'dispatchEvent');
    await registerServiceWorker();

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sw-update-available' })
    );
    dispatchSpy.mockRestore();
  });

  it('returns null and logs error when registration fails', async () => {
    mockRegister.mockRejectedValue(new Error('network error'));
    const result = await registerServiceWorker();
    expect(result).toBeNull();
  });
});

// ─── unregisterServiceWorker ──────────────────────────────────────────────────

describe('unregisterServiceWorker', () => {
  it('returns false when serviceWorker is not in navigator', async () => {
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    const result = await unregisterServiceWorker();
    expect(result).toBe(false);
  });

  it('returns false when no registration exists', async () => {
    mockGetRegistration.mockResolvedValue(undefined);
    const result = await unregisterServiceWorker();
    expect(result).toBe(false);
  });

  it('calls unregister() on the existing registration', async () => {
    const reg = makeRegistration();
    mockGetRegistration.mockResolvedValue(reg);
    await unregisterServiceWorker();
    expect(mockUnregister).toHaveBeenCalled();
  });

  it('returns true when unregister succeeds', async () => {
    const reg = makeRegistration();
    mockGetRegistration.mockResolvedValue(reg);
    mockUnregister.mockResolvedValue(true);
    const result = await unregisterServiceWorker();
    expect(result).toBe(true);
  });

  it('returns false when unregister returns false', async () => {
    const reg = makeRegistration();
    mockGetRegistration.mockResolvedValue(reg);
    mockUnregister.mockResolvedValue(false);
    const result = await unregisterServiceWorker();
    expect(result).toBe(false);
  });
});

// ─── isServiceWorkerActive ────────────────────────────────────────────────────

describe('isServiceWorkerActive', () => {
  it('returns false when serviceWorker is not in navigator', async () => {
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    const result = await isServiceWorkerActive();
    expect(result).toBe(false);
  });

  it('returns false when no registration exists', async () => {
    mockGetRegistration.mockResolvedValue(undefined);
    const result = await isServiceWorkerActive();
    expect(result).toBe(false);
  });

  it('returns false when registration has no active worker', async () => {
    const reg = makeRegistration({ active: null });
    mockGetRegistration.mockResolvedValue(reg);
    const result = await isServiceWorkerActive();
    expect(result).toBe(false);
  });

  it('returns true when registration has an active worker', async () => {
    const reg = makeRegistration({ active: {} as ServiceWorker });
    mockGetRegistration.mockResolvedValue(reg);
    const result = await isServiceWorkerActive();
    expect(result).toBe(true);
  });
});

// ─── triggerManualUpdateCheck ─────────────────────────────────────────────────

describe('triggerManualUpdateCheck', () => {
  it('does nothing when serviceWorker is not in navigator', async () => {
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    await expect(triggerManualUpdateCheck()).resolves.toBeUndefined();
  });

  it('does nothing when no registration exists', async () => {
    mockGetRegistration.mockResolvedValue(undefined);
    await triggerManualUpdateCheck();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('calls registration.update() when registration exists', async () => {
    const reg = makeRegistration();
    mockGetRegistration.mockResolvedValue(reg);
    await triggerManualUpdateCheck();
    expect(mockUpdate).toHaveBeenCalled();
  });
});

// ─── performFullAppInvalidationAndReload ──────────────────────────────────────

describe('performFullAppInvalidationAndReload', () => {
  it('posts SKIP_WAITING to waiting worker', async () => {
    const waitingWorker = { postMessage: mockPostMessage, state: 'installed' } as unknown as ServiceWorker;
    const reg = makeRegistration({ waiting: waitingWorker });
    await performFullAppInvalidationAndReload(reg);
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('does not send SKIP_WAITING when no waiting worker (takes reload branch)', async () => {
    // jsdom 26 makes window.location.reload non-configurable so we cannot spy on it;
    // instead we verify the SKIP_WAITING path was NOT taken.
    const reg = makeRegistration({ waiting: null });
    await expect(performFullAppInvalidationAndReload(reg)).resolves.toBeUndefined();
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('clears CacheStorage caches', async () => {
    const cacheKeysResult = ['cache1', 'cache2'];
    const mockDelete = jest.fn().mockResolvedValue(true);
    Object.defineProperty(window, 'caches', {
      value: {
        keys: jest.fn().mockResolvedValue(cacheKeysResult),
        delete: mockDelete,
      },
      writable: true,
      configurable: true,
    });
    const reg = makeRegistration({ waiting: { postMessage: jest.fn() } as unknown as ServiceWorker });
    await performFullAppInvalidationAndReload(reg);
    expect(mockDelete).toHaveBeenCalledWith('cache1');
    expect(mockDelete).toHaveBeenCalledWith('cache2');
  });

  it('resolves gracefully on critical error', async () => {
    Object.defineProperty(window, 'caches', {
      get: () => { throw new Error('caches unavailable'); },
      configurable: true,
    });
    const reg = makeRegistration({ waiting: null });
    // Should not throw even when caches access fails
    await expect(performFullAppInvalidationAndReload(reg)).resolves.toBeUndefined();
  });
});

// ─── activateWaitingServiceWorker ─────────────────────────────────────────────

describe('activateWaitingServiceWorker', () => {
  it('delegates to performFullAppInvalidationAndReload (posts SKIP_WAITING)', async () => {
    const waitingWorker = { postMessage: mockPostMessage, state: 'installed' } as unknown as ServiceWorker;
    const reg = makeRegistration({ waiting: waitingWorker });
    await activateWaitingServiceWorker(reg);
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });
});
