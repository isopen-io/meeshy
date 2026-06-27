/**
 * Tests for utils/service-worker-registration.ts
 */

import {
  getSWRegistrationManager,
  resetSWRegistrationManager,
  swRegistration,
} from '@/utils/service-worker-registration';

const mockRegister = jest.fn();
const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockUnregister = jest.fn().mockResolvedValue(true);
const mockPostMessage = jest.fn();
const mockSwAddEventListener = jest.fn();
const mockRegAddEventListener = jest.fn();

function makeRegistration(overrides: Partial<ServiceWorkerRegistration> = {}): ServiceWorkerRegistration {
  return {
    scope: '/',
    update: mockUpdate,
    unregister: mockUnregister,
    addEventListener: mockRegAddEventListener,
    waiting: null,
    installing: null,
    active: null,
    ...overrides,
  } as unknown as ServiceWorkerRegistration;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  resetSWRegistrationManager();

  mockUpdate.mockResolvedValue(undefined);
  mockUnregister.mockResolvedValue(true);
  mockRegister.mockResolvedValue(makeRegistration());

  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      register: mockRegister,
      addEventListener: mockSwAddEventListener,
      controller: null,
    },
    writable: true,
    configurable: true,
  });

  Object.defineProperty(window, 'PushManager', {
    value: class PushManager {},
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  jest.useRealTimers();
  resetSWRegistrationManager();
});

// ─── isSupported ──────────────────────────────────────────────────────────────

describe('isSupported', () => {
  it('returns true when serviceWorker and PushManager are present', () => {
    expect(getSWRegistrationManager().isSupported()).toBe(true);
  });

  it('returns false when serviceWorker is absent', () => {
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    expect(getSWRegistrationManager().isSupported()).toBe(false);
  });

  it('returns false when PushManager is absent', () => {
    delete (window as unknown as Record<string, unknown>).PushManager;
    expect(getSWRegistrationManager().isSupported()).toBe(false);
  });
});

// ─── register ─────────────────────────────────────────────────────────────────

describe('register', () => {
  it('returns false when not supported', async () => {
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    const result = await getSWRegistrationManager().register();
    expect(result).toBe(false);
  });

  it('calls navigator.serviceWorker.register with default path', async () => {
    await getSWRegistrationManager().register();
    expect(mockRegister).toHaveBeenCalledWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
  });

  it('calls navigator.serviceWorker.register with custom path', async () => {
    await getSWRegistrationManager().register('/custom-sw.js');
    expect(mockRegister).toHaveBeenCalledWith('/custom-sw.js', expect.any(Object));
  });

  it('returns true on success', async () => {
    const result = await getSWRegistrationManager().register();
    expect(result).toBe(true);
  });

  it('returns false on registration error', async () => {
    mockRegister.mockRejectedValue(new Error('network error'));
    const result = await getSWRegistrationManager().register();
    expect(result).toBe(false);
  });

  it('calls onRegistered callback on success', async () => {
    const onRegistered = jest.fn();
    resetSWRegistrationManager();
    const mgr = getSWRegistrationManager({ onRegistered });
    await mgr.register();
    expect(onRegistered).toHaveBeenCalled();
  });

  it('calls onError callback on failure', async () => {
    const onError = jest.fn();
    resetSWRegistrationManager();
    mockRegister.mockRejectedValue(new Error('fail'));
    const mgr = getSWRegistrationManager({ onError });
    await mgr.register();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('is idempotent: second call does not re-register', async () => {
    const mgr = getSWRegistrationManager();
    await mgr.register();
    await mgr.register();
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });

  it('calls registration.update() after registering', async () => {
    await getSWRegistrationManager().register();
    expect(mockUpdate).toHaveBeenCalled();
  });
});

// ─── getRegistration / isServiceWorkerRegistered ──────────────────────────────

describe('getRegistration / isServiceWorkerRegistered', () => {
  it('getRegistration returns null before registration', () => {
    expect(getSWRegistrationManager().getRegistration()).toBeNull();
  });

  it('getRegistration returns registration after register()', async () => {
    const reg = makeRegistration();
    mockRegister.mockResolvedValue(reg);
    await getSWRegistrationManager().register();
    expect(getSWRegistrationManager().getRegistration()).toBe(reg);
  });

  it('isServiceWorkerRegistered is false before registration', () => {
    expect(getSWRegistrationManager().isServiceWorkerRegistered()).toBe(false);
  });

  it('isServiceWorkerRegistered is true after register()', async () => {
    await getSWRegistrationManager().register();
    expect(getSWRegistrationManager().isServiceWorkerRegistered()).toBe(true);
  });
});

// ─── hasWaitingUpdate ─────────────────────────────────────────────────────────

describe('hasWaitingUpdate', () => {
  it('returns false when no registration', () => {
    expect(getSWRegistrationManager().hasWaitingUpdate()).toBe(false);
  });

  it('returns false when no waiting worker', async () => {
    mockRegister.mockResolvedValue(makeRegistration({ waiting: null }));
    await getSWRegistrationManager().register();
    expect(getSWRegistrationManager().hasWaitingUpdate()).toBe(false);
  });

  it('returns true when waiting worker exists', async () => {
    const reg = makeRegistration({ waiting: {} as ServiceWorker });
    mockRegister.mockResolvedValue(reg);
    await getSWRegistrationManager().register();
    expect(getSWRegistrationManager().hasWaitingUpdate()).toBe(true);
  });
});

// ─── checkForUpdates ──────────────────────────────────────────────────────────

describe('checkForUpdates', () => {
  it('does nothing when no registration', async () => {
    await expect(getSWRegistrationManager().checkForUpdates()).resolves.toBeUndefined();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('calls registration.update() when registered', async () => {
    await getSWRegistrationManager().register();
    mockUpdate.mockClear();
    await getSWRegistrationManager().checkForUpdates();
    expect(mockUpdate).toHaveBeenCalled();
  });
});

// ─── activateUpdate ───────────────────────────────────────────────────────────

describe('activateUpdate', () => {
  it('does nothing when no registration', async () => {
    await expect(getSWRegistrationManager().activateUpdate()).resolves.toBeUndefined();
  });

  it('posts SKIP_WAITING to waiting worker', async () => {
    const waitingWorker = { postMessage: mockPostMessage } as unknown as ServiceWorker;
    const reg = makeRegistration({ waiting: waitingWorker });
    mockRegister.mockResolvedValue(reg);
    await getSWRegistrationManager().register();
    await getSWRegistrationManager().activateUpdate();
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('does nothing when waiting is null', async () => {
    await getSWRegistrationManager().register();
    await expect(getSWRegistrationManager().activateUpdate()).resolves.toBeUndefined();
    expect(mockPostMessage).not.toHaveBeenCalled();
  });
});

// ─── sendMessage ──────────────────────────────────────────────────────────────

describe('sendMessage', () => {
  it('does nothing when no SW controller', async () => {
    await getSWRegistrationManager().register();
    await expect(getSWRegistrationManager().sendMessage({ type: 'PING' })).resolves.toBeUndefined();
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('posts message to controller when available', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: mockRegister,
        addEventListener: mockSwAddEventListener,
        controller: { postMessage: mockPostMessage },
      },
      writable: true,
      configurable: true,
    });
    await getSWRegistrationManager().register();
    await getSWRegistrationManager().sendMessage({ type: 'PING' });
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'PING' });
  });
});

// ─── updateBadge ──────────────────────────────────────────────────────────────

describe('updateBadge', () => {
  it('sends SET_BADGE for positive count', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: mockRegister,
        addEventListener: mockSwAddEventListener,
        controller: { postMessage: mockPostMessage },
      },
      writable: true,
      configurable: true,
    });
    await getSWRegistrationManager().register();
    await getSWRegistrationManager().updateBadge(5);
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'SET_BADGE', count: 5 });
  });

  it('sends CLEAR_BADGE for count = 0', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: mockRegister,
        addEventListener: mockSwAddEventListener,
        controller: { postMessage: mockPostMessage },
      },
      writable: true,
      configurable: true,
    });
    await getSWRegistrationManager().register();
    await getSWRegistrationManager().updateBadge(0);
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'CLEAR_BADGE', count: 0 });
  });
});

// ─── unregister ───────────────────────────────────────────────────────────────

describe('unregister', () => {
  it('returns true when no registration exists', async () => {
    const result = await getSWRegistrationManager().unregister();
    expect(result).toBe(true);
  });

  it('calls registration.unregister() when registered', async () => {
    await getSWRegistrationManager().register();
    await getSWRegistrationManager().unregister();
    expect(mockUnregister).toHaveBeenCalled();
  });

  it('returns true when unregister succeeds', async () => {
    await getSWRegistrationManager().register();
    const result = await getSWRegistrationManager().unregister();
    expect(result).toBe(true);
  });

  it('clears registration state on success', async () => {
    await getSWRegistrationManager().register();
    await getSWRegistrationManager().unregister();
    expect(getSWRegistrationManager().isServiceWorkerRegistered()).toBe(false);
  });

  it('returns false on unregister error', async () => {
    await getSWRegistrationManager().register();
    mockUnregister.mockRejectedValue(new Error('unregister failed'));
    const result = await getSWRegistrationManager().unregister();
    expect(result).toBe(false);
  });
});

// ─── autoUpdate interval ──────────────────────────────────────────────────────

describe('autoUpdate interval', () => {
  it('starts periodic update check when autoUpdate = true (default)', async () => {
    await getSWRegistrationManager({ autoUpdate: true }).register();
    mockUpdate.mockClear();
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('does not start interval when autoUpdate = false', async () => {
    resetSWRegistrationManager();
    await getSWRegistrationManager({ autoUpdate: false }).register();
    mockUpdate.mockClear();
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// ─── swRegistration facade ────────────────────────────────────────────────────

describe('swRegistration facade', () => {
  it('isSupported delegates to manager', () => {
    expect(typeof swRegistration.isSupported()).toBe('boolean');
  });

  it('register delegates to manager', async () => {
    const result = await swRegistration.register();
    expect(typeof result).toBe('boolean');
  });

  it('getRegistration returns null before registration', () => {
    resetSWRegistrationManager();
    expect(swRegistration.getRegistration()).toBeNull();
  });
});
