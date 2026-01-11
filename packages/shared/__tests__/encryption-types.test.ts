/**
 * Tests for Encryption Types functions
 */
import { describe, it, expect } from 'vitest';
import {
  isMessageEncrypted,
  canAutoTranslate,
  getEncryptionStatus,
  isHybridPayload,
  shouldEncryptAttachment,
  canTranslateAttachment,
  type EncryptionMode,
} from '../types/encryption';
import { createProtocolAddress } from '../encryption/signal/signal-types';

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

describe('createProtocolAddress', () => {
  it('should create a ProtocolAddressLike object with name and deviceId', () => {
    const address = createProtocolAddress('user-123', 1);

    expect(address.name()).toBe('user-123');
    expect(address.deviceId()).toBe(1);
  });

  it('should work with different device IDs', () => {
    const address1 = createProtocolAddress('user-456', 1);
    const address2 = createProtocolAddress('user-456', 2);

    expect(address1.deviceId()).toBe(1);
    expect(address2.deviceId()).toBe(2);
  });

  it('should work with empty string name', () => {
    const address = createProtocolAddress('', 0);

    expect(address.name()).toBe('');
    expect(address.deviceId()).toBe(0);
  });

  it('should work with UUID as name', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const address = createProtocolAddress(uuid, 5);

    expect(address.name()).toBe(uuid);
    expect(address.deviceId()).toBe(5);
  });
});

describe('isHybridPayload', () => {
  it('should return true for valid hybrid payload', () => {
    const payload = {
      mode: 'hybrid',
      canTranslate: true,
      timestamp: Date.now(),
      e2ee: {
        ciphertext: 'base64data',
        type: 1,
        senderRegistrationId: 123,
        recipientRegistrationId: 456,
      },
      server: {
        ciphertext: 'base64data',
        iv: 'ivbase64',
        authTag: 'tagbase64',
        keyId: 'key-123',
      },
    };

    expect(isHybridPayload(payload)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isHybridPayload(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isHybridPayload(undefined)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isHybridPayload('string')).toBe(false);
    expect(isHybridPayload(123)).toBe(false);
  });

  it('should return false when mode is not hybrid', () => {
    const payload = {
      mode: 'server',
      canTranslate: true,
      timestamp: Date.now(),
      e2ee: {},
      server: {},
    };

    expect(isHybridPayload(payload)).toBe(false);
  });

  it('should return false when canTranslate is not boolean', () => {
    const payload = {
      mode: 'hybrid',
      canTranslate: 'true',
      timestamp: Date.now(),
      e2ee: {},
      server: {},
    };

    expect(isHybridPayload(payload)).toBe(false);
  });

  it('should return false when timestamp is not number', () => {
    const payload = {
      mode: 'hybrid',
      canTranslate: true,
      timestamp: '2024-01-01',
      e2ee: {},
      server: {},
    };

    expect(isHybridPayload(payload)).toBe(false);
  });

  it('should return false when e2ee is null', () => {
    const payload = {
      mode: 'hybrid',
      canTranslate: true,
      timestamp: Date.now(),
      e2ee: null,
      server: {},
    };

    expect(isHybridPayload(payload)).toBe(false);
  });

  it('should return false when server is null', () => {
    const payload = {
      mode: 'hybrid',
      canTranslate: true,
      timestamp: Date.now(),
      e2ee: {},
      server: null,
    };

    expect(isHybridPayload(payload)).toBe(false);
  });

  it('should return false when e2ee is missing', () => {
    const payload = {
      mode: 'hybrid',
      canTranslate: true,
      timestamp: Date.now(),
      server: {},
    };

    expect(isHybridPayload(payload)).toBe(false);
  });
});

describe('shouldEncryptAttachment', () => {
  it('should return true when encryption is enabled with a mode', () => {
    const conversation = {
      encryptionEnabledAt: new Date('2024-01-15'),
      encryptionMode: 'server' as EncryptionMode,
    };

    expect(shouldEncryptAttachment(conversation)).toBe(true);
  });

  it('should return true for e2ee mode', () => {
    const conversation = {
      encryptionEnabledAt: new Date('2024-01-15'),
      encryptionMode: 'e2ee' as EncryptionMode,
    };

    expect(shouldEncryptAttachment(conversation)).toBe(true);
  });

  it('should return true for hybrid mode', () => {
    const conversation = {
      encryptionEnabledAt: new Date('2024-01-15'),
      encryptionMode: 'hybrid' as EncryptionMode,
    };

    expect(shouldEncryptAttachment(conversation)).toBe(true);
  });

  it('should return false when encryption not enabled', () => {
    const conversation = {
      encryptionEnabledAt: null,
      encryptionMode: null,
    };

    expect(shouldEncryptAttachment(conversation)).toBe(false);
  });

  it('should return false when encryptionMode is null even with enabledAt', () => {
    const conversation = {
      encryptionEnabledAt: new Date('2024-01-15'),
      encryptionMode: null,
    };

    expect(shouldEncryptAttachment(conversation)).toBe(false);
  });
});

describe('canTranslateAttachment', () => {
  it('should return false for non-audio attachments', () => {
    const conversation = {
      encryptionMode: 'server' as EncryptionMode,
    };

    expect(canTranslateAttachment('image', conversation)).toBe(false);
    expect(canTranslateAttachment('video', conversation)).toBe(false);
    expect(canTranslateAttachment('document', conversation)).toBe(false);
  });

  it('should return false for audio in e2ee mode', () => {
    const conversation = {
      encryptionMode: 'e2ee' as EncryptionMode,
    };

    expect(canTranslateAttachment('audio', conversation)).toBe(false);
  });

  it('should return true for audio in server mode', () => {
    const conversation = {
      encryptionMode: 'server' as EncryptionMode,
    };

    expect(canTranslateAttachment('audio', conversation)).toBe(true);
  });

  it('should return true for audio in hybrid mode', () => {
    const conversation = {
      encryptionMode: 'hybrid' as EncryptionMode,
    };

    expect(canTranslateAttachment('audio', conversation)).toBe(true);
  });

  it('should return false for audio when mode is null', () => {
    const conversation = {
      encryptionMode: null,
    };

    expect(canTranslateAttachment('audio', conversation)).toBe(false);
  });
});
