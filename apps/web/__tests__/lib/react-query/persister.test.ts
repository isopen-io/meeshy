/**
 * Tests for lib/react-query/persister.ts
 *
 * The persister is a thin wrapper around idb-keyval that exposes
 * getItem/setItem/removeItem for @tanstack/query-async-storage-persister.
 */

const mockGet = jest.fn();
const mockSet = jest.fn();
const mockDel = jest.fn();

jest.mock('idb-keyval', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  set: (...args: unknown[]) => mockSet(...args),
  del: (...args: unknown[]) => mockDel(...args),
}));

const mockCreateAsyncStoragePersister = jest.fn((opts: { storage: unknown; key: string }) => ({
  _storage: opts.storage,
  _key: opts.key,
}));

jest.mock('@tanstack/query-async-storage-persister', () => ({
  createAsyncStoragePersister: (...args: unknown[]) => mockCreateAsyncStoragePersister(...args as [{ storage: unknown; key: string }]),
}));

describe('indexedDbPersister', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('creates a persister via createAsyncStoragePersister', async () => {
    await import('@/lib/react-query/persister');
    expect(mockCreateAsyncStoragePersister).toHaveBeenCalledTimes(1);
  });

  it('uses "meeshy-rq-cache" as cache key', async () => {
    await import('@/lib/react-query/persister');
    const [opts] = mockCreateAsyncStoragePersister.mock.calls[0] as [{ key: string }][];
    expect(opts.key).toBe('meeshy-rq-cache');
  });

  it('storage.getItem delegates to idb-keyval get', async () => {
    mockGet.mockResolvedValue('cached-value');
    await import('@/lib/react-query/persister');
    const [opts] = mockCreateAsyncStoragePersister.mock.calls[0] as [{ storage: { getItem: (k: string) => Promise<unknown> } }][];
    await opts.storage.getItem('test-key');
    expect(mockGet).toHaveBeenCalledWith('test-key');
  });

  it('storage.setItem delegates to idb-keyval set', async () => {
    mockSet.mockResolvedValue(undefined);
    await import('@/lib/react-query/persister');
    const [opts] = mockCreateAsyncStoragePersister.mock.calls[0] as [{ storage: { setItem: (k: string, v: string) => Promise<void> } }][];
    await opts.storage.setItem('test-key', 'test-value');
    expect(mockSet).toHaveBeenCalledWith('test-key', 'test-value');
  });

  it('storage.removeItem delegates to idb-keyval del', async () => {
    mockDel.mockResolvedValue(undefined);
    await import('@/lib/react-query/persister');
    const [opts] = mockCreateAsyncStoragePersister.mock.calls[0] as [{ storage: { removeItem: (k: string) => Promise<void> } }][];
    await opts.storage.removeItem('test-key');
    expect(mockDel).toHaveBeenCalledWith('test-key');
  });
});
