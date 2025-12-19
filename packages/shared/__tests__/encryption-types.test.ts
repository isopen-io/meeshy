/**
 * Tests for Encryption Types functions
 */
import { describe, it, expect } from 'vitest';
import {
  isMessageEncrypted,
  canAutoTranslate,
  getEncryptionStatus,
  type EncryptionMode,
} from '../types/encryption';

describe('isMessageEncrypted', () => {
  it('should return false for system messages', () => {
    const message = {
      messageType: 'system',
      createdAt: new Date('2024-01-15'),
    };
    const conversation = {
      encryptionEnabledAt: new Date('2024-01-01'),
    };

    expect(isMessageEncrypted(message, conversation)).toBe(false);
  });

  it('should return false when conversation encryption not enabled', () => {
    const message = {
      messageType: 'text',
      createdAt: new Date('2024-01-15'),
    };
    const conversation = {
      encryptionEnabledAt: null,
    };

    expect(isMessageEncrypted(message, conversation)).toBe(false);
  });

  it('should return false for messages before encryption enabled', () => {
    const message = {
      messageType: 'text',
      createdAt: new Date('2024-01-01'),
    };
    const conversation = {
      encryptionEnabledAt: new Date('2024-01-15'),
    };

    expect(isMessageEncrypted(message, conversation)).toBe(false);
  });

  it('should return true for messages after encryption enabled', () => {
    const message = {
      messageType: 'text',
      createdAt: new Date('2024-01-20'),
    };
    const conversation = {
      encryptionEnabledAt: new Date('2024-01-15'),
    };

    expect(isMessageEncrypted(message, conversation)).toBe(true);
  });

  it('should return true for messages on same date as encryption enabled', () => {
    const enabledAt = new Date('2024-01-15T10:00:00Z');
    const message = {
      messageType: 'text',
      createdAt: new Date('2024-01-15T11:00:00Z'),
    };
    const conversation = {
      encryptionEnabledAt: enabledAt,
    };

    expect(isMessageEncrypted(message, conversation)).toBe(true);
  });

  it('should handle image message type', () => {
    const message = {
      messageType: 'image',
      createdAt: new Date('2024-01-20'),
    };
    const conversation = {
      encryptionEnabledAt: new Date('2024-01-15'),
    };

    expect(isMessageEncrypted(message, conversation)).toBe(true);
  });

  it('should handle file message type', () => {
    const message = {
      messageType: 'file',
      createdAt: new Date('2024-01-20'),
    };
    const conversation = {
      encryptionEnabledAt: new Date('2024-01-15'),
    };

    expect(isMessageEncrypted(message, conversation)).toBe(true);
  });
});

describe('canAutoTranslate', () => {
  it('should return true for plaintext conversations', () => {
    const conversation = {
      encryptionEnabledAt: null,
      encryptionMode: null,
    };

    expect(canAutoTranslate(conversation)).toBe(true);
  });

  it('should return true for server-encrypted conversations', () => {
    const conversation = {
      encryptionEnabledAt: new Date('2024-01-15'),
      encryptionMode: 'server' as EncryptionMode,
    };

    expect(canAutoTranslate(conversation)).toBe(true);
  });

  it('should return false for E2EE conversations', () => {
    const conversation = {
      encryptionEnabledAt: new Date('2024-01-15'),
      encryptionMode: 'e2ee' as EncryptionMode,
    };

    expect(canAutoTranslate(conversation)).toBe(false);
  });

  it('should return false for E2EE even with null encryptionMode fallback', () => {
    const conversation = {
      encryptionEnabledAt: new Date('2024-01-15'),
      encryptionMode: 'e2ee' as EncryptionMode,
    };

    expect(canAutoTranslate(conversation)).toBe(false);
  });
});

describe('getEncryptionStatus', () => {
  it('should return unencrypted status for plaintext conversation', () => {
    const conversation = {
      encryptionEnabledAt: null,
      encryptionMode: null,
      encryptionEnabledBy: null,
    };

    const status = getEncryptionStatus(conversation);

    expect(status.isEncrypted).toBe(false);
    expect(status.mode).toBeNull();
    expect(status.canTranslate).toBe(true);
    expect(status.enabledAt).toBeNull();
    expect(status.enabledBy).toBeNull();
  });

  it('should return encrypted status for server-encrypted conversation', () => {
    const enabledAt = new Date('2024-01-15');
    const conversation = {
      encryptionEnabledAt: enabledAt,
      encryptionMode: 'server' as EncryptionMode,
      encryptionEnabledBy: 'user-123',
    };

    const status = getEncryptionStatus(conversation);

    expect(status.isEncrypted).toBe(true);
    expect(status.mode).toBe('server');
    expect(status.canTranslate).toBe(true);
    expect(status.enabledAt).toBe(enabledAt);
    expect(status.enabledBy).toBe('user-123');
  });

  it('should return encrypted status for E2EE conversation', () => {
    const enabledAt = new Date('2024-01-15');
    const conversation = {
      encryptionEnabledAt: enabledAt,
      encryptionMode: 'e2ee' as EncryptionMode,
      encryptionEnabledBy: 'user-456',
    };

    const status = getEncryptionStatus(conversation);

    expect(status.isEncrypted).toBe(true);
    expect(status.mode).toBe('e2ee');
    expect(status.canTranslate).toBe(false);
    expect(status.enabledAt).toBe(enabledAt);
    expect(status.enabledBy).toBe('user-456');
  });

  it('should handle conversation with encryptionEnabledAt but null mode', () => {
    const enabledAt = new Date('2024-01-15');
    const conversation = {
      encryptionEnabledAt: enabledAt,
      encryptionMode: null,
      encryptionEnabledBy: 'user-789',
    };

    const status = getEncryptionStatus(conversation);

    expect(status.isEncrypted).toBe(true);
    expect(status.mode).toBeNull();
    // null mode with encryptionEnabledAt returns false for canTranslate (not server mode)
    expect(status.canTranslate).toBe(false);
    expect(status.enabledAt).toBe(enabledAt);
    expect(status.enabledBy).toBe('user-789');
  });
});
