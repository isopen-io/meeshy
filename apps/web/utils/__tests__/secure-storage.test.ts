/**
 * Tests for Secure Storage Utility
 * Tests encryption, decryption, TTL, and sanitization
 */

// Jest provides describe, it, expect, beforeEach globally
// Use jest.fn() instead of vi.fn()
import { SecureStorage, sanitizeNotificationForStorage } from '../secure-storage';

describe('SecureStorage', () => {
  beforeEach(() => {
    // Clear storage before each test
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('setSecure and getSecure', () => {
    it('should encrypt and decrypt data correctly', async () => {
      const testData = { message: 'Hello World', count: 42 };

      await SecureStorage.setSecure('test-key', testData);
      const retrieved = await SecureStorage.getSecure<typeof testData>('test-key');

      expect(retrieved).toEqual(testData);
    });

    it('should store encrypted data in localStorage', async () => {
      const testData = { secret: 'sensitive info' };

      await SecureStorage.setSecure('test-key', testData);

      // Get raw localStorage value
      const raw = localStorage.getItem('test-key');

      // Should be encrypted (base64 string)
      expect(raw).toBeTruthy();
      expect(raw).not.toContain('sensitive info'); // Not plaintext
      expect(raw).toMatch(/^[A-Za-z0-9+/=]+$/); // Base64 pattern
    });

    it('should return null for non-existent keys', async () => {
      const result = await SecureStorage.getSecure('non-existent');
      expect(result).toBeNull();
    });

    it('should handle complex nested objects', async () => {
      const complexData = {
        user: {
          id: '123',
          profile: {
            name: 'Test User',
            settings: {
              theme: 'dark',
              notifications: true
            }
          }
        },
        notifications: [
          { id: '1', title: 'Test' },
          { id: '2', title: 'Test 2' }
        ]
      };

      await SecureStorage.setSecure('complex', complexData);
      const retrieved = await SecureStorage.getSecure<typeof complexData>('complex');

      expect(retrieved).toEqual(complexData);
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should respect TTL and return null for expired data', async () => {
      const testData = { value: 'test' };
      const ttl = 100; // 100ms

      await SecureStorage.setSecure('test-ttl', testData, ttl);

      // Should be accessible immediately
      let retrieved = await SecureStorage.getSecure('test-ttl');
      expect(retrieved).toEqual(testData);

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should return null after expiration
      retrieved = await SecureStorage.getSecure('test-ttl');
      expect(retrieved).toBeNull();

      // Should be removed from storage
      expect(localStorage.getItem('test-ttl')).toBeNull();
    });

    it('should use default TTL of 24 hours', async () => {
      const testData = { value: 'test' };

      await SecureStorage.setSecure('test-default-ttl', testData);

      // Get raw data and parse
      const raw = localStorage.getItem('test-default-ttl');
      expect(raw).toBeTruthy();

      // Decrypt and check TTL
      const decrypted = await SecureStorage.getSecure<any>('test-default-ttl');
      expect(decrypted).toEqual(testData);
    });
  });

  describe('sessionStorage support', () => {
    it('should use sessionStorage when flag is true', async () => {
      const testData = { value: 'session data' };

      await SecureStorage.setSecure('session-key', testData, 60000, true);

      // Should be in sessionStorage, not localStorage
      expect(sessionStorage.getItem('session-key')).toBeTruthy();
      expect(localStorage.getItem('session-key')).toBeNull();

      const retrieved = await SecureStorage.getSecure('session-key', true);
      expect(retrieved).toEqual(testData);
    });
  });

  describe('removeSecure and clearAll', () => {
    it('should remove specific item', async () => {
      await SecureStorage.setSecure('key1', { value: 1 });
      await SecureStorage.setSecure('key2', { value: 2 });

      SecureStorage.removeSecure('key1');

      expect(await SecureStorage.getSecure('key1')).toBeNull();
      expect(await SecureStorage.getSecure('key2')).toEqual({ value: 2 });
    });

    it('should clear all storage', async () => {
      await SecureStorage.setSecure('key1', { value: 1 });
      await SecureStorage.setSecure('key2', { value: 2 });
      await SecureStorage.setSecure('session-key', { value: 3 }, 60000, true);

      SecureStorage.clearAll();

      expect(await SecureStorage.getSecure('key1')).toBeNull();
      expect(await SecureStorage.getSecure('key2')).toBeNull();
      expect(await SecureStorage.getSecure('session-key', true)).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle corrupted data gracefully', async () => {
      // Manually set corrupted data
      localStorage.setItem('corrupted', 'not-valid-encrypted-data');

      const result = await SecureStorage.getSecure('corrupted');

      expect(result).toBeNull();
      // Should remove corrupted data
      expect(localStorage.getItem('corrupted')).toBeNull();
    });

    it('should handle decryption failures', async () => {
      // Set data with one session
      await SecureStorage.setSecure('test', { value: 'test' });

      // Clear session (simulates logout)
      sessionStorage.clear();

      // Try to decrypt with different session
      const result = await SecureStorage.getSecure('test');

      // Should fail gracefully
      expect(result).toBeNull();
    });
  });

  describe('getStorageSize', () => {
    it('should calculate storage sizes', async () => {
      await SecureStorage.setSecure('key1', { data: 'test data' });
      await SecureStorage.setSecure('key2', { data: 'more test data' });

      const sizes = SecureStorage.getStorageSize();

      expect(sizes.localStorage).toBeGreaterThan(0);
      expect(sizes.sessionStorage).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('sanitizeNotificationForStorage', () => {
  it('should remove sensitive content from notification', () => {
    const notification = {
      id: 'notif123',
      type: 'new_message',
      title: 'Private Message Title',
      content: 'This is sensitive content',
      messagePreview: 'Preview of private message',
      isRead: false,
      priority: 'normal',
      createdAt: new Date('2025-01-01'),
      senderId: 'user123',
      senderUsername: 'JohnDoe',
      senderAvatar: 'https://example.com/avatar.jpg',
      context: {
        conversationId: 'conv456',
        messageId: 'msg789',
        userId: 'user123'
      }
    };

    const sanitized = sanitizeNotificationForStorage(notification);

    // Should keep only IDs and metadata
    expect(sanitized).toEqual({
      id: 'notif123',
      type: 'new_message',
      isRead: false,
      priority: 'normal',
      createdAt: notification.createdAt,
      context: {
        conversationId: 'conv456',
        messageId: 'msg789',
        userId: 'user123'
      }
    });

    // Should NOT contain sensitive fields
    expect(sanitized).not.toHaveProperty('title');
    expect(sanitized).not.toHaveProperty('content');
    expect(sanitized).not.toHaveProperty('messagePreview');
    expect(sanitized).not.toHaveProperty('senderUsername');
    expect(sanitized).not.toHaveProperty('senderAvatar');
  });

  it('should handle null/undefined notifications', () => {
    expect(sanitizeNotificationForStorage(null)).toBeNull();
    expect(sanitizeNotificationForStorage(undefined)).toBeNull();
  });

  it('should handle notifications without context', () => {
    const notification = {
      id: 'notif123',
      type: 'system',
      title: 'System Notification',
      content: 'Content',
      isRead: false,
      priority: 'normal',
      createdAt: new Date()
    };

    const sanitized = sanitizeNotificationForStorage(notification);

    expect(sanitized.context).toBeUndefined();
  });
});
