/**
 * Tests for hooks/use-encryption.ts
 *
 * Strategy: the hook wraps a module-level SharedEncryptionService singleton.
 * Rather than mocking the class (which has module-resolution issues), we:
 *   1. Provide complete adapter mocks so the real constructor doesn't throw
 *   2. Use jest.spyOn on the real service instance (obtained via getEncryptionService())
 *   3. Mock getEncryptionStatus via jest.mock (it resolves to the real dist file)
 */

const mockGetEncryptionStatus = jest.fn(() => 'none');

jest.mock('../../../../packages/shared/types/encryption', () => ({
  getEncryptionStatus: (conv: unknown) => mockGetEncryptionStatus(conv),
}));

jest.mock('@/lib/encryption/adapters/web-crypto-adapter', () => ({
  webCryptoAdapter: {
    generateKeyPair: jest.fn().mockResolvedValue({ publicKey: 'pub', privateKey: 'priv' }),
    sign: jest.fn().mockResolvedValue(new Uint8Array(64)),
    verify: jest.fn().mockResolvedValue(true),
    deriveSharedSecret: jest.fn().mockResolvedValue(new Uint8Array(32)),
    encrypt: jest.fn().mockResolvedValue({ ciphertext: 'enc', iv: 'iv' }),
    decrypt: jest.fn().mockResolvedValue(new Uint8Array(0)),
    generateRandomBytes: jest.fn().mockReturnValue(new Uint8Array(32)),
    hmac: jest.fn().mockResolvedValue(new Uint8Array(32)),
    hkdf: jest.fn().mockResolvedValue(new Uint8Array(32)),
  },
}));

jest.mock('@/lib/encryption/adapters/indexeddb-key-storage-adapter', () => ({
  indexedDBKeyStorageAdapter: {
    getUserKeys: jest.fn().mockResolvedValue(null),
    storeUserKeys: jest.fn().mockResolvedValue(undefined),
    getConversationKey: jest.fn().mockResolvedValue(null),
    storeConversationKey: jest.fn().mockResolvedValue(undefined),
    getKey: jest.fn().mockResolvedValue(null),
    storeKey: jest.fn().mockResolvedValue(undefined),
    clearAll: jest.fn().mockResolvedValue(undefined),
    exportKeys: jest.fn().mockResolvedValue('backup'),
    importKeys: jest.fn().mockResolvedValue(undefined),
    listConversationKeys: jest.fn().mockResolvedValue([]),
    removeConversationKey: jest.fn().mockResolvedValue(undefined),
  },
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useEncryption, getEncryptionService } from '@/hooks/use-encryption';

let spyInitialize: jest.SpyInstance;
let spyEncryptMessage: jest.SpyInstance;
let spyDecryptMessage: jest.SpyInstance;
let spyGetConversationMode: jest.SpyInstance;
let spyHasConversationKey: jest.SpyInstance;
let spyPrepareMessage: jest.SpyInstance;
let spyProcessReceivedMessage: jest.SpyInstance;
let spyClearKeys: jest.SpyInstance;
let spyGenerateUserKeys: jest.SpyInstance;
let spyGetUserKeyBundle: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetEncryptionStatus.mockReturnValue('none');

  const svc = getEncryptionService();
  spyInitialize = jest.spyOn(svc, 'initialize').mockResolvedValue(undefined);
  spyEncryptMessage = jest.spyOn(svc, 'encryptMessage').mockResolvedValue({ ciphertext: 'enc', iv: 'iv', mode: 'e2ee' } as any);
  spyDecryptMessage = jest.spyOn(svc, 'decryptMessage').mockResolvedValue('decrypted');
  spyGetConversationMode = jest.spyOn(svc, 'getConversationMode').mockResolvedValue(null);
  spyHasConversationKey = jest.spyOn(svc, 'hasConversationKey').mockResolvedValue(false);
  spyPrepareMessage = jest.spyOn(svc, 'prepareMessage').mockImplementation(async (content: string) => ({ content }));
  spyProcessReceivedMessage = jest.spyOn(svc, 'processReceivedMessage').mockImplementation(async (msg: { content: string }) => msg.content);
  spyClearKeys = jest.spyOn(svc, 'clearKeys').mockResolvedValue(undefined);
  spyGenerateUserKeys = jest.spyOn(svc, 'generateUserKeys').mockResolvedValue({ publicKey: 'pk' } as any);
  spyGetUserKeyBundle = jest.spyOn(svc, 'getUserKeyBundle').mockResolvedValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('isReady starts false', () => {
    const { result } = renderHook(() => useEncryption());
    expect(result.current.isReady).toBe(false);
  });

  it('isInitializing starts false', () => {
    const { result } = renderHook(() => useEncryption());
    expect(result.current.isInitializing).toBe(false);
  });

  it('error starts null', () => {
    const { result } = renderHook(() => useEncryption());
    expect(result.current.error).toBeNull();
  });
});

// ─── initialize ───────────────────────────────────────────────────────────────

describe('initialize', () => {
  it('calls service.initialize with userId', async () => {
    const { result } = renderHook(() => useEncryption());
    await act(async () => { await result.current.initialize('user-1'); });
    expect(spyInitialize).toHaveBeenCalledWith('user-1');
  });

  it('sets isReady = true on success', async () => {
    const { result } = renderHook(() => useEncryption());
    await act(async () => { await result.current.initialize('user-1'); });
    expect(result.current.isReady).toBe(true);
  });

  it('sets error on failure', async () => {
    spyInitialize.mockRejectedValue(new Error('init failed'));
    const { result } = renderHook(() => useEncryption());
    await act(async () => {
      try { await result.current.initialize('user-1'); } catch {}
    });
    expect(result.current.error).toBe('init failed');
    expect(result.current.isReady).toBe(false);
  });

  it('skips re-initialize when already ready for same user', async () => {
    const { result } = renderHook(() => useEncryption());
    await act(async () => { await result.current.initialize('user-1'); });
    await act(async () => { await result.current.initialize('user-1'); });
    expect(spyInitialize).toHaveBeenCalledTimes(1);
  });
});

// ─── encrypt ──────────────────────────────────────────────────────────────────

describe('encrypt', () => {
  it('returns null when not initialized', async () => {
    const { result } = renderHook(() => useEncryption());
    const res = await act(async () => result.current.encrypt('hello', 'conv-1'));
    expect(res).toBeNull();
  });

  it('calls service.encryptMessage after initialization', async () => {
    spyGetConversationMode.mockResolvedValue('e2ee');
    const { result } = renderHook(() => useEncryption());
    await act(async () => { await result.current.initialize('user-1'); });
    await act(async () => { await result.current.encrypt('hello', 'conv-1'); });
    expect(spyEncryptMessage).toHaveBeenCalled();
  });

  it('returns null when no encryption mode set', async () => {
    spyGetConversationMode.mockResolvedValue(null);
    const { result } = renderHook(() => useEncryption());
    await act(async () => { await result.current.initialize('user-1'); });
    const res = await act(async () => result.current.encrypt('hello', 'conv-1'));
    expect(res).toBeNull();
  });
});

// ─── decrypt ──────────────────────────────────────────────────────────────────

describe('decrypt', () => {
  it('throws when not initialized', async () => {
    const { result } = renderHook(() => useEncryption());
    await expect(
      act(async () => result.current.decrypt({ ciphertext: 'c', iv: 'i' } as any))
    ).rejects.toThrow('not initialized');
  });

  it('calls service.decryptMessage after initialization', async () => {
    const { result } = renderHook(() => useEncryption());
    await act(async () => { await result.current.initialize('user-1'); });
    const payload = { ciphertext: 'c', iv: 'i', mode: 'e2ee' } as any;
    await act(async () => { await result.current.decrypt(payload); });
    expect(spyDecryptMessage).toHaveBeenCalledWith(payload, undefined);
  });
});

// ─── getEncryptionStatus ──────────────────────────────────────────────────────

describe('getEncryptionStatus', () => {
  it('delegates to the getEncryptionStatus utility', () => {
    mockGetEncryptionStatus.mockReturnValue('end-to-end');
    const { result } = renderHook(() => useEncryption());
    const conv = { encryptionEnabledAt: new Date(), encryptionMode: 'e2ee' as any, encryptionEnabledBy: 'u1' };
    const status = result.current.getEncryptionStatus(conv);
    expect(status).toBe('end-to-end');
    expect(mockGetEncryptionStatus).toHaveBeenCalledWith(conv);
  });
});

// ─── clearKeys ────────────────────────────────────────────────────────────────

describe('clearKeys', () => {
  it('calls service.clearKeys and resets isReady', async () => {
    const { result } = renderHook(() => useEncryption());
    await act(async () => { await result.current.initialize('user-1'); });
    expect(result.current.isReady).toBe(true);
    await act(async () => { await result.current.clearKeys(); });
    expect(spyClearKeys).toHaveBeenCalled();
    expect(result.current.isReady).toBe(false);
  });
});

// ─── hasUserKeys ──────────────────────────────────────────────────────────────

describe('hasUserKeys', () => {
  it('returns false when no key bundle', async () => {
    spyGetUserKeyBundle.mockResolvedValue(null);
    const { result } = renderHook(() => useEncryption());
    const has = await act(async () => result.current.hasUserKeys('user-1'));
    expect(has).toBe(false);
  });

  it('returns true when key bundle exists', async () => {
    spyGetUserKeyBundle.mockResolvedValue({ publicKey: 'pk' });
    const { result } = renderHook(() => useEncryption());
    const has = await act(async () => result.current.hasUserKeys('user-1'));
    expect(has).toBe(true);
  });
});

// ─── prepareMessage / processReceivedMessage ──────────────────────────────────

describe('prepareMessage', () => {
  it('returns plaintext when not initialized', async () => {
    const { result } = renderHook(() => useEncryption());
    const res = await act(async () => result.current.prepareMessage('hi', 'conv-1'));
    expect(res).toEqual({ content: 'hi' });
  });

  it('delegates to service when initialized', async () => {
    spyPrepareMessage.mockResolvedValue({ content: 'hi', encryptedPayload: { ciphertext: 'c', iv: 'i' } as any });
    const { result } = renderHook(() => useEncryption());
    await act(async () => { await result.current.initialize('user-1'); });
    await act(async () => { await result.current.prepareMessage('hi', 'conv-1'); });
    expect(spyPrepareMessage).toHaveBeenCalledWith('hi', 'conv-1', undefined);
  });
});

describe('processReceivedMessage', () => {
  it('returns message.content when not initialized', async () => {
    const { result } = renderHook(() => useEncryption());
    const msg = { content: 'original', encryptedContent: 'enc' };
    const res = await act(async () => result.current.processReceivedMessage(msg));
    expect(res).toBe('original');
  });

  it('delegates to service when initialized', async () => {
    spyProcessReceivedMessage.mockResolvedValue('processed');
    const { result } = renderHook(() => useEncryption());
    await act(async () => { await result.current.initialize('user-1'); });
    const msg = { content: 'original' };
    await act(async () => { await result.current.processReceivedMessage(msg); });
    expect(spyProcessReceivedMessage).toHaveBeenCalledWith(msg);
  });
});
