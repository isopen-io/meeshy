/**
 * #3743 — après déconnexion, aucun message ni média de l'ancien compte n'est
 * servi au suivant. Ces témoins couvrent les TROIS magasins qui survivaient à
 * `AuthManager.clearAllSessions()` : le Cache Storage du service worker, le
 * cache React Query persistant en IndexedDB, et les clés de chiffrement E2EE.
 */

jest.mock('@/utils/service-worker', () => ({
  purgeOwnedCacheStorage: jest.fn(),
}));

jest.mock('@/lib/encryption/adapters/indexeddb-key-storage-adapter', () => ({
  indexedDBKeyStorageAdapter: { clearAll: jest.fn() },
}));

jest.mock('@/lib/react-query/persister', () => ({
  indexedDbPersister: { removeClient: jest.fn() },
}));

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { cleanup: jest.fn() },
}));

/**
 * `registerAccountScopedCachePurge` guards itself with a module-level flag so
 * a React remount doesn't stack a second callback. That flag would otherwise
 * leak between these tests (same module instance) — `jest.resetModules()` +
 * a fresh `import()` per test gives each one its own, exactly like a fresh
 * page load would. Same pattern as `__tests__/lib/settings-sync.test.ts`.
 */
async function loadModules() {
  jest.resetModules();
  const [authManagerModule, serviceWorkerModule, encryptionModule, persisterModule, purgeModule] =
    await Promise.all([
      import('@/services/auth-manager.service'),
      import('@/utils/service-worker'),
      import('@/lib/encryption/adapters/indexeddb-key-storage-adapter'),
      import('@/lib/react-query/persister'),
      import('@/utils/session-cache-purge'),
    ]);

  return {
    authManager: authManagerModule.authManager,
    purgeOwnedCacheStorage: serviceWorkerModule.purgeOwnedCacheStorage as jest.Mock,
    indexedDBKeyStorageAdapter: encryptionModule.indexedDBKeyStorageAdapter as unknown as {
      clearAll: jest.Mock;
    },
    indexedDbPersister: persisterModule.indexedDbPersister as unknown as {
      removeClient: jest.Mock;
    },
    purgeAccountScopedBrowserStorage: purgeModule.purgeAccountScopedBrowserStorage,
    registerAccountScopedCachePurge: purgeModule.registerAccountScopedCachePurge,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('purgeAccountScopedBrowserStorage', () => {
  it('purges the Cache Storage, the encryption keys and the persisted React Query cache', async () => {
    const mods = await loadModules();
    mods.purgeOwnedCacheStorage.mockResolvedValue(undefined);
    mods.indexedDBKeyStorageAdapter.clearAll.mockResolvedValue(undefined);
    mods.indexedDbPersister.removeClient.mockResolvedValue(undefined);

    await mods.purgeAccountScopedBrowserStorage();

    expect(mods.purgeOwnedCacheStorage).toHaveBeenCalledTimes(1);
    expect(mods.indexedDBKeyStorageAdapter.clearAll).toHaveBeenCalledTimes(1);
    expect(mods.indexedDbPersister.removeClient).toHaveBeenCalledTimes(1);
  });

  it('does not let one failing purge stop or fail the others', async () => {
    const mods = await loadModules();
    mods.purgeOwnedCacheStorage.mockResolvedValue(undefined);
    mods.indexedDBKeyStorageAdapter.clearAll.mockRejectedValue(
      new Error('IndexedDB unavailable (private browsing)')
    );
    mods.indexedDbPersister.removeClient.mockResolvedValue(undefined);

    await expect(mods.purgeAccountScopedBrowserStorage()).resolves.toBeUndefined();

    expect(mods.purgeOwnedCacheStorage).toHaveBeenCalledTimes(1);
    expect(mods.indexedDbPersister.removeClient).toHaveBeenCalledTimes(1);
  });
});

describe('registerAccountScopedCachePurge', () => {
  function fakeQueryClient() {
    return { clear: jest.fn() };
  }

  it('clears the in-memory QueryClient and purges browser storage when sessions are cleared', async () => {
    const mods = await loadModules();
    mods.purgeOwnedCacheStorage.mockResolvedValue(undefined);
    mods.indexedDBKeyStorageAdapter.clearAll.mockResolvedValue(undefined);
    mods.indexedDbPersister.removeClient.mockResolvedValue(undefined);

    const queryClient = fakeQueryClient();
    mods.registerAccountScopedCachePurge(queryClient as never);

    mods.authManager.clearAllSessions();

    expect(queryClient.clear).toHaveBeenCalledTimes(1);
    expect(mods.purgeOwnedCacheStorage).toHaveBeenCalledTimes(1);
    expect(mods.indexedDBKeyStorageAdapter.clearAll).toHaveBeenCalledTimes(1);
    expect(mods.indexedDbPersister.removeClient).toHaveBeenCalledTimes(1);
  });

  it('does not register a second callback on a second call (idempotent)', async () => {
    const mods = await loadModules();
    mods.purgeOwnedCacheStorage.mockResolvedValue(undefined);
    mods.indexedDBKeyStorageAdapter.clearAll.mockResolvedValue(undefined);
    mods.indexedDbPersister.removeClient.mockResolvedValue(undefined);

    const first = fakeQueryClient();
    const second = fakeQueryClient();

    mods.registerAccountScopedCachePurge(first as never);
    mods.registerAccountScopedCachePurge(second as never);

    mods.authManager.clearAllSessions();

    // The module-level guard keeps only the FIRST registration — the second
    // QueryClient is never wired, so only the first is cleared.
    expect(first.clear).toHaveBeenCalledTimes(1);
    expect(second.clear).not.toHaveBeenCalled();
    // The purge itself still ran exactly once, not twice.
    expect(mods.purgeOwnedCacheStorage).toHaveBeenCalledTimes(1);
  });
});
