'use client';

/**
 * useEncryption Hook
 *
 * React hook for E2EE encryption in the Meeshy web frontend.
 * Provides encrypt/decrypt functionality and tracks encryption mode per conversation.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { SharedEncryptionService } from '@meeshy/shared/encryption';
import { webCryptoAdapter } from '@/lib/encryption/adapters/web-crypto-adapter';
import { indexedDBKeyStorageAdapter } from '@/lib/encryption/adapters/indexeddb-key-storage-adapter';
import type {
  EncryptedPayload,
  EncryptionMode,
  EncryptionStatus,
} from '@meeshy/shared/types/encryption';

/**
 * Encryption context for a conversation
 */
interface EncryptionContext {
  conversationId: string;
  mode: EncryptionMode | null;
  isInitialized: boolean;
  hasKey: boolean;
}

/**
 * Return type for the useEncryption hook
 */
interface UseEncryptionReturn {
  /** Whether the encryption service is ready */
  isReady: boolean;
  /** Whether the service is currently initializing */
  isInitializing: boolean;
  /** Error message if initialization failed */
  error: string | null;
  /** Initialize encryption for a user */
  initialize: (userId: string) => Promise<void>;
  /** Encrypt content for a conversation */
  encrypt: (content: string, conversationId: string, mode?: EncryptionMode) => Promise<EncryptedPayload | null>;
  /** Decrypt an encrypted payload */
  decrypt: (payload: EncryptedPayload, senderUserId?: string) => Promise<string>;
  /** Get encryption context for a conversation */
  getConversationContext: (conversationId: string) => Promise<EncryptionContext>;
  /** Get encryption status for a conversation */
  getEncryptionStatus: (conversation: {
    encryptionEnabledAt: Date | null;
    encryptionMode: EncryptionMode | null;
    encryptionEnabledBy: string | null;
  }) => EncryptionStatus;
  /** Check if conversation is encrypted */
  isConversationEncrypted: (conversationId: string) => Promise<boolean>;
  /** Get conversation encryption mode */
  getConversationMode: (conversationId: string) => Promise<EncryptionMode | null>;
  /** Prepare message for sending (encrypts if needed) */
  prepareMessage: (content: string, conversationId: string, encryptionMode?: EncryptionMode) => Promise<{
    content: string;
    encryptedPayload?: EncryptedPayload;
  }>;
  /** Process received message (decrypts if needed) */
  processReceivedMessage: (message: {
    content: string;
    encryptedContent?: string | null;
    encryptionMetadata?: any;
  }) => Promise<string>;
  /** Clear all encryption keys (for logout) */
  clearKeys: () => Promise<void>;
  /** Generate user keys */
  generateUserKeys: () => Promise<any>;
  /** Check if user has encryption keys */
  hasUserKeys: (userId: string) => Promise<boolean>;
}

// Singleton encryption service instance
let encryptionServiceInstance: SharedEncryptionService | null = null;

/**
 * Get or create the encryption service singleton
 */
function getEncryptionService(): SharedEncryptionService {
  if (!encryptionServiceInstance) {
    encryptionServiceInstance = new SharedEncryptionService({
      cryptoAdapter: webCryptoAdapter,
      keyStorage: indexedDBKeyStorageAdapter,
    });
  }
  return encryptionServiceInstance;
}

/**
 * useEncryption Hook
 *
 * Provides encryption/decryption functionality for the Meeshy chat.
 * Uses SharedEncryptionService with browser-specific adapters.
 *
 * @example
 * ```tsx
 * const { encrypt, decrypt, isReady, initialize } = useEncryption();
 *
 * // Initialize for user
 * await initialize(userId);
 *
 * // Encrypt a message
 * const encrypted = await encrypt('Hello world', conversationId);
 *
 * // Decrypt a message
 * const decrypted = await decrypt(encryptedPayload);
 * ```
 */
export function useEncryption(): UseEncryptionReturn {
  const [isReady, setIsReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache for conversation encryption contexts
  const contextCacheRef = useRef<Map<string, EncryptionContext>>(new Map());
  const currentUserIdRef = useRef<string | null>(null);

  // Get the encryption service
  const serviceRef = useRef<SharedEncryptionService>(getEncryptionService());

  /**
   * Initialize encryption for a user
   */
  const initialize = useCallback(async (userId: string): Promise<void> => {
    if (currentUserIdRef.current === userId && isReady) {
      // Already initialized for this user
      return;
    }

    setIsInitializing(true);
    setError(null);

    try {
      await serviceRef.current.initialize(userId);
      currentUserIdRef.current = userId;
      setIsReady(true);
      console.log('[useEncryption] Initialized for user:', userId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize encryption';
      setError(errorMessage);
      console.error('[useEncryption] Initialization failed:', err);
      throw err;
    } finally {
      setIsInitializing(false);
    }
  }, [isReady]);

  /**
   * Encrypt content for a conversation
   */
  const encrypt = useCallback(async (
    content: string,
    conversationId: string,
    mode?: EncryptionMode
  ): Promise<EncryptedPayload | null> => {
    if (!isReady) {
      console.warn('[useEncryption] Service not initialized, cannot encrypt');
      return null;
    }

    try {
      // Get the conversation mode if not provided
      const encryptionMode = mode || await serviceRef.current.getConversationMode(conversationId);

      if (!encryptionMode) {
        // No encryption mode set, return null (plaintext)
        return null;
      }

      const encrypted = await serviceRef.current.encryptMessage(
        content,
        conversationId,
        encryptionMode
      );

      // Update context cache
      contextCacheRef.current.set(conversationId, {
        conversationId,
        mode: encryptionMode,
        isInitialized: true,
        hasKey: true,
      });

      return encrypted;
    } catch (err) {
      console.error('[useEncryption] Encryption failed:', err);
      throw err;
    }
  }, [isReady]);

  /**
   * Decrypt an encrypted payload
   */
  const decrypt = useCallback(async (
    payload: EncryptedPayload,
    senderUserId?: string
  ): Promise<string> => {
    if (!isReady) {
      throw new Error('Encryption service not initialized');
    }

    try {
      return await serviceRef.current.decryptMessage(payload, senderUserId);
    } catch (err) {
      console.error('[useEncryption] Decryption failed:', err);
      throw err;
    }
  }, [isReady]);

  /**
   * Get encryption context for a conversation
   */
  const getConversationContext = useCallback(async (
    conversationId: string
  ): Promise<EncryptionContext> => {
    // Check cache first
    const cached = contextCacheRef.current.get(conversationId);
    if (cached) {
      return cached;
    }

    // Query from service
    const mode = await serviceRef.current.getConversationMode(conversationId);
    const hasKey = await serviceRef.current.hasConversationKey(conversationId);

    const context: EncryptionContext = {
      conversationId,
      mode,
      isInitialized: isReady,
      hasKey,
    };

    // Cache the result
    contextCacheRef.current.set(conversationId, context);

    return context;
  }, [isReady]);

  /**
   * Get encryption status for a conversation
   */
  const getEncryptionStatusFn = useCallback((conversation: {
    encryptionEnabledAt: Date | null;
    encryptionMode: EncryptionMode | null;
    encryptionEnabledBy: string | null;
  }): EncryptionStatus => {
    // Import the utility function from shared types
    const { getEncryptionStatus: getStatus } = require('@meeshy/shared/types/encryption');
    return getStatus(conversation);
  }, []);

  /**
   * Check if conversation is encrypted
   */
  const isConversationEncrypted = useCallback(async (
    conversationId: string
  ): Promise<boolean> => {
    return await serviceRef.current.hasConversationKey(conversationId);
  }, []);

  /**
   * Get conversation encryption mode
   */
  const getConversationMode = useCallback(async (
    conversationId: string
  ): Promise<EncryptionMode | null> => {
    return await serviceRef.current.getConversationMode(conversationId);
  }, []);

  /**
   * Prepare message for sending (encrypts if needed)
   */
  const prepareMessage = useCallback(async (
    content: string,
    conversationId: string,
    encryptionMode?: EncryptionMode
  ): Promise<{ content: string; encryptedPayload?: EncryptedPayload }> => {
    if (!isReady) {
      // Service not ready, return plaintext
      return { content };
    }

    return await serviceRef.current.prepareMessage(content, conversationId, encryptionMode);
  }, [isReady]);

  /**
   * Process received message (decrypts if needed)
   */
  const processReceivedMessage = useCallback(async (message: {
    content: string;
    encryptedContent?: string | null;
    encryptionMetadata?: any;
  }): Promise<string> => {
    if (!isReady) {
      // Service not ready, return as-is
      return message.content;
    }

    return await serviceRef.current.processReceivedMessage(message);
  }, [isReady]);

  /**
   * Clear all encryption keys (for logout)
   */
  const clearKeys = useCallback(async (): Promise<void> => {
    await serviceRef.current.clearKeys();
    contextCacheRef.current.clear();
    currentUserIdRef.current = null;
    setIsReady(false);
    console.log('[useEncryption] Keys cleared');
  }, []);

  /**
   * Generate user keys
   */
  const generateUserKeys = useCallback(async (): Promise<any> => {
    if (!isReady) {
      throw new Error('Encryption service not initialized');
    }
    return await serviceRef.current.generateUserKeys();
  }, [isReady]);

  /**
   * Check if user has encryption keys
   */
  const hasUserKeys = useCallback(async (userId: string): Promise<boolean> => {
    const bundle = await serviceRef.current.getUserKeyBundle(userId);
    return bundle !== null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear context cache on unmount
      contextCacheRef.current.clear();
    };
  }, []);

  return {
    isReady,
    isInitializing,
    error,
    initialize,
    encrypt,
    decrypt,
    getConversationContext,
    getEncryptionStatus: getEncryptionStatusFn,
    isConversationEncrypted,
    getConversationMode,
    prepareMessage,
    processReceivedMessage,
    clearKeys,
    generateUserKeys,
    hasUserKeys,
  };
}

// Export singleton getter for non-hook usage
export { getEncryptionService };
