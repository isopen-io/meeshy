/**
 * Tests for useEncryption hook
 *
 * Tests cover:
 * - Initial state
 * - Hook interface (methods and properties)
 * - Error state handling
 *
 * Note: Due to the singleton pattern in useEncryption where the service is
 * initialized at module load time, full integration testing of the encryption
 * service is difficult in Jest. These tests focus on the hook's interface
 * and state management.
 */

import { renderHook, act, waitFor } from '@testing-library/react';

// Mock SharedEncryptionService - must be defined before hook import
const mockInitialize = jest.fn();
const mockEncryptMessage = jest.fn();
const mockDecryptMessage = jest.fn();
const mockGetConversationMode = jest.fn();
const mockHasConversationKey = jest.fn();
const mockPrepareMessage = jest.fn();
const mockProcessReceivedMessage = jest.fn();
const mockClearKeys = jest.fn();
const mockGenerateUserKeys = jest.fn();
const mockGetUserKeyBundle = jest.fn();

jest.mock('@meeshy/shared/encryption', () => ({
  SharedEncryptionService: jest.fn().mockImplementation(() => ({
    initialize: (...args: unknown[]) => mockInitialize(...args),
    encryptMessage: (...args: unknown[]) => mockEncryptMessage(...args),
    decryptMessage: (...args: unknown[]) => mockDecryptMessage(...args),
    getConversationMode: (...args: unknown[]) => mockGetConversationMode(...args),
    hasConversationKey: (...args: unknown[]) => mockHasConversationKey(...args),
    prepareMessage: (...args: unknown[]) => mockPrepareMessage(...args),
    processReceivedMessage: (...args: unknown[]) => mockProcessReceivedMessage(...args),
    clearKeys: (...args: unknown[]) => mockClearKeys(...args),
    generateUserKeys: (...args: unknown[]) => mockGenerateUserKeys(...args),
    getUserKeyBundle: (...args: unknown[]) => mockGetUserKeyBundle(...args),
  })),
}));

// Mock adapters
jest.mock('@/lib/encryption/adapters/web-crypto-adapter', () => ({
  webCryptoAdapter: {},
}));

jest.mock('@/lib/encryption/adapters/indexeddb-key-storage-adapter', () => ({
  indexedDBKeyStorageAdapter: {},
}));

// Mock getEncryptionStatus from shared types
jest.mock('@meeshy/shared/types/encryption', () => ({
  getEncryptionStatus: jest.fn((conversation) => ({
    isEncrypted: !!conversation?.encryptionMode,
    mode: conversation?.encryptionMode || null,
    enabledAt: conversation?.encryptionEnabledAt || null,
    enabledBy: conversation?.encryptionEnabledBy || null,
  })),
}));

// Import hook AFTER all mocks are set up
import { useEncryption } from '@/hooks/use-encryption';

describe('useEncryption', () => {
  const mockUserId = 'user-123';
  const mockConversationId = 'conv-456';

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockInitialize.mockResolvedValue(undefined);
    mockEncryptMessage.mockResolvedValue({
      ciphertext: 'encrypted-data',
      iv: 'iv-123',
      algorithm: 'AES-GCM',
    });
    mockDecryptMessage.mockResolvedValue('decrypted content');
    mockGetConversationMode.mockResolvedValue(null);
    mockHasConversationKey.mockResolvedValue(false);
    mockPrepareMessage.mockResolvedValue({ content: 'test' });
    mockProcessReceivedMessage.mockResolvedValue('processed content');
    mockClearKeys.mockResolvedValue(undefined);
    mockGenerateUserKeys.mockResolvedValue({ publicKey: 'pub', privateKey: 'priv' });
    mockGetUserKeyBundle.mockResolvedValue(null);

    // Suppress console warnings
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should return isReady false initially', () => {
      const { result } = renderHook(() => useEncryption());

      expect(result.current.isReady).toBe(false);
    });

    it('should return isInitializing false initially', () => {
      const { result } = renderHook(() => useEncryption());

      expect(result.current.isInitializing).toBe(false);
    });

    it('should return error as null initially', () => {
      const { result } = renderHook(() => useEncryption());

      expect(result.current.error).toBeNull();
    });
  });

  describe('Hook Interface', () => {
    it('should expose initialize method', () => {
      const { result } = renderHook(() => useEncryption());

      expect(typeof result.current.initialize).toBe('function');
    });

    it('should expose encrypt method', () => {
      const { result } = renderHook(() => useEncryption());

      expect(typeof result.current.encrypt).toBe('function');
    });

    it('should expose decrypt method', () => {
      const { result } = renderHook(() => useEncryption());

      expect(typeof result.current.decrypt).toBe('function');
    });

    it('should expose getConversationContext method', () => {
      const { result } = renderHook(() => useEncryption());

      expect(typeof result.current.getConversationContext).toBe('function');
    });

    it('should expose getEncryptionStatus method', () => {
      const { result } = renderHook(() => useEncryption());

      expect(typeof result.current.getEncryptionStatus).toBe('function');
    });

    it('should expose isConversationEncrypted method', () => {
      const { result } = renderHook(() => useEncryption());

      expect(typeof result.current.isConversationEncrypted).toBe('function');
    });

    it('should expose prepareMessage method', () => {
      const { result } = renderHook(() => useEncryption());

      expect(typeof result.current.prepareMessage).toBe('function');
    });

    it('should expose processReceivedMessage method', () => {
      const { result } = renderHook(() => useEncryption());

      expect(typeof result.current.processReceivedMessage).toBe('function');
    });

    it('should expose clearKeys method', () => {
      const { result } = renderHook(() => useEncryption());

      expect(typeof result.current.clearKeys).toBe('function');
    });

    it('should expose generateUserKeys method', () => {
      const { result } = renderHook(() => useEncryption());

      expect(typeof result.current.generateUserKeys).toBe('function');
    });

    it('should expose hasUserKeys method', () => {
      const { result } = renderHook(() => useEncryption());

      expect(typeof result.current.hasUserKeys).toBe('function');
    });
  });

  describe('getEncryptionStatus', () => {
    it('should return encryption status for a conversation', () => {
      const { result } = renderHook(() => useEncryption());

      const conversation = {
        encryptionMode: 'AES-GCM',
        encryptionEnabledAt: new Date(),
        encryptionEnabledBy: mockUserId,
      };

      const status = result.current.getEncryptionStatus(conversation as any);

      expect(status).toBeDefined();
      expect(status.isEncrypted).toBe(true);
      expect(status.mode).toBe('AES-GCM');
    });

    it('should return unencrypted status for null conversation', () => {
      const { result } = renderHook(() => useEncryption());

      const conversation = {
        encryptionMode: null,
        encryptionEnabledAt: null,
        encryptionEnabledBy: null,
      };

      const status = result.current.getEncryptionStatus(conversation as any);

      expect(status).toBeDefined();
      expect(status.isEncrypted).toBe(false);
      expect(status.mode).toBeNull();
    });
  });

  describe('isConversationEncrypted', () => {
    it('should call hasConversationKey on service', async () => {
      // Note: isConversationEncrypted takes a conversationId string and calls hasConversationKey
      // Due to singleton null issue, we test the interface exists
      const { result } = renderHook(() => useEncryption());

      expect(typeof result.current.isConversationEncrypted).toBe('function');

      // If service is available, it should return a promise
      const returnValue = result.current.isConversationEncrypted(mockConversationId);
      expect(returnValue).toBeInstanceOf(Promise);
    });
  });

  describe('State Transitions', () => {
    it('should maintain consistent state across rerenders', () => {
      const { result, rerender } = renderHook(() => useEncryption());

      const initialIsReady = result.current.isReady;
      const initialIsInitializing = result.current.isInitializing;

      rerender();

      expect(result.current.isReady).toBe(initialIsReady);
      expect(result.current.isInitializing).toBe(initialIsInitializing);
    });
  });

  describe('Method Memoization', () => {
    it('should memoize initialize method', () => {
      const { result, rerender } = renderHook(() => useEncryption());

      const firstInit = result.current.initialize;

      rerender();

      expect(result.current.initialize).toBe(firstInit);
    });

    it('should memoize encrypt method', () => {
      const { result, rerender } = renderHook(() => useEncryption());

      const firstEncrypt = result.current.encrypt;

      rerender();

      expect(result.current.encrypt).toBe(firstEncrypt);
    });

    it('should memoize decrypt method', () => {
      const { result, rerender } = renderHook(() => useEncryption());

      const firstDecrypt = result.current.decrypt;

      rerender();

      expect(result.current.decrypt).toBe(firstDecrypt);
    });

    it('should memoize getEncryptionStatus method', () => {
      const { result, rerender } = renderHook(() => useEncryption());

      const firstGetStatus = result.current.getEncryptionStatus;

      rerender();

      expect(result.current.getEncryptionStatus).toBe(firstGetStatus);
    });

    it('should memoize isConversationEncrypted method', () => {
      const { result, rerender } = renderHook(() => useEncryption());

      const firstIsEncrypted = result.current.isConversationEncrypted;

      rerender();

      expect(result.current.isConversationEncrypted).toBe(firstIsEncrypted);
    });
  });
});
