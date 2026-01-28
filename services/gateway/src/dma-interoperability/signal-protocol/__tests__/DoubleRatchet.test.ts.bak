/**
 * Double Ratchet Algorithm Unit Tests
 *
 * Tests for Week 5-6 implementation:
 * - Session initialization
 * - Symmetric ratchet (forward secrecy)
 * - Asymmetric ratchet (DHR)
 * - Out-of-order message handling
 * - Skipped message key storage
 * - Memory attack prevention
 */

import { DoubleRatchet, DoubleRatchetSession, MessageKey } from '../DoubleRatchet';
import * as crypto from 'crypto';

describe('DoubleRatchet - Week 5-6 Implementation', () => {
  let doubleRatchet: DoubleRatchet;
  let testSession: DoubleRatchetSession;
  let rootKey: Buffer;
  let chainKeySend: Buffer;
  let chainKeyReceive: Buffer;

  beforeAll(() => {
    // Create test keys (would come from X3DH in real usage)
    rootKey = crypto.randomBytes(32);
    chainKeySend = crypto.randomBytes(32);
    chainKeyReceive = crypto.randomBytes(32);
  });

  beforeEach(() => {
    doubleRatchet = new DoubleRatchet();
    testSession = doubleRatchet.initializeSession(rootKey, chainKeySend, chainKeyReceive);
  });

  // ============================================================================
  // INITIALIZATION TESTS
  // ============================================================================

  describe('Session Initialization', () => {
    it('should initialize session from X3DH keys', () => {
      const session = doubleRatchet.initializeSession(rootKey, chainKeySend, chainKeyReceive);

      expect(session).toBeDefined();
      expect(session.rootKey).toEqual(rootKey);
      expect(session.chainKeySend).toEqual(chainKeySend);
      expect(session.chainKeyReceive).toEqual(chainKeyReceive);
    });

    it('should initialize with zero message counters', () => {
      const session = doubleRatchet.initializeSession(rootKey, chainKeySend, chainKeyReceive);

      expect(session.messageNumberSend).toBe(0);
      expect(session.messageNumberReceive).toBe(0);
      expect(session.messagesSent).toBe(0);
    });

    it('should initialize with empty skipped message keys', () => {
      const session = doubleRatchet.initializeSession(rootKey, chainKeySend, chainKeyReceive);

      expect(session.skippedMessageKeys).toBeDefined();
      expect(Array.isArray(session.skippedMessageKeys)).toBe(true);
      expect(session.skippedMessageKeys.length).toBe(0);
    });

    it('should set max skipped keys limit', () => {
      const session = doubleRatchet.initializeSession(rootKey, chainKeySend, chainKeyReceive);

      expect(session.maxSkippedKeys).toBe(100);
    });

    it('should initialize with optional DH key pair', () => {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        publicKeyEncoding: { type: 'spki', format: 'der' },
        privateKeyEncoding: { type: 'pkcs8', format: 'der' }
      });

      const dhKeyPair = {
        publicKey: publicKey as Buffer,
        privateKey: privateKey as Buffer
      };

      const session = doubleRatchet.initializeSession(
        rootKey,
        chainKeySend,
        chainKeyReceive,
        dhKeyPair
      );

      expect(session.dhRatchetKeyPair).toEqual(dhKeyPair);
    });
  });

  // ============================================================================
  // SYMMETRIC RATCHET TESTS
  // ============================================================================

  describe('Symmetric Ratchet (Forward Secrecy)', () => {
    it('should generate message key for sending', () => {
      const messageKey = doubleRatchet.getMessageKeySend(testSession);

      expect(messageKey).toBeDefined();
      expect(messageKey.key).toBeInstanceOf(Buffer);
      expect(messageKey.key.length).toBe(32); // 256-bit key
      expect(messageKey.messageNumber).toBe(0);
    });

    it('should increment message number on send', () => {
      const msg1 = doubleRatchet.getMessageKeySend(testSession);
      const msg2 = doubleRatchet.getMessageKeySend(testSession);

      expect(msg1.messageNumber).toBe(0);
      expect(msg2.messageNumber).toBe(1);
      expect(testSession.messagesSent).toBe(2);
    });

    it('should advance chain key after each message', () => {
      const keyBefore = testSession.chainKeySend.toString('hex');

      doubleRatchet.getMessageKeySend(testSession);

      const keyAfter = testSession.chainKeySend.toString('hex');

      // Chain key should have changed
      expect(keyAfter).not.toBe(keyBefore);
    });

    it('should generate different keys for each message', () => {
      const key1 = doubleRatchet.getMessageKeySend(testSession);
      const key2 = doubleRatchet.getMessageKeySend(testSession);
      const key3 = doubleRatchet.getMessageKeySend(testSession);

      // Keys should be different
      expect(key1.key).not.toEqual(key2.key);
      expect(key2.key).not.toEqual(key3.key);
      expect(key1.key).not.toEqual(key3.key);
    });

    it('should provide forward secrecy', () => {
      // Generate 10 keys
      const keys: MessageKey[] = [];
      for (let i = 0; i < 10; i++) {
        keys.push(doubleRatchet.getMessageKeySend(testSession));
      }

      // All keys should be unique
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          expect(keys[i].key).not.toEqual(keys[j].key);
        }
      }
    });

    it('should handle receive side ratcheting', () => {
      const msg1 = doubleRatchet.getMessageKeyReceive(testSession, 0);

      expect(msg1).toBeDefined();
      expect(msg1?.messageNumber).toBe(0);

      const msg2 = doubleRatchet.getMessageKeyReceive(testSession, 1);

      expect(msg2).toBeDefined();
      expect(msg2?.messageNumber).toBe(1);
    });

    it('should track chain key index', () => {
      const msg1 = doubleRatchet.getMessageKeySend(testSession);
      const msg2 = doubleRatchet.getMessageKeySend(testSession);

      expect(msg1.chainKeyIndex).toBe(0);
      expect(msg2.chainKeyIndex).toBe(1);
    });
  });

  // ============================================================================
  // ASYMMETRIC RATCHET TESTS
  // ============================================================================

  describe('Asymmetric Ratchet (DHR)', () => {
    it('should perform asymmetric ratchet', () => {
      const keysBefore = {
        rootKey: testSession.rootKey.toString('hex'),
        chainKeySend: testSession.chainKeySend.toString('hex'),
        chainKeyReceive: testSession.chainKeyReceive.toString('hex')
      };

      const result = doubleRatchet.asymmetricRatchet(testSession);

      expect(result).toBeDefined();
      expect(result.rootKey).toBeInstanceOf(Buffer);
      expect(result.chainKeySend).toBeInstanceOf(Buffer);
      expect(result.chainKeyReceive).toBeInstanceOf(Buffer);

      // Keys should have changed
      expect(result.rootKey.toString('hex')).not.toBe(keysBefore.rootKey);
      expect(result.chainKeySend.toString('hex')).not.toBe(keysBefore.chainKeySend);
    });

    it('should reset message counters after DHR', () => {
      doubleRatchet.getMessageKeySend(testSession); // msg 0
      doubleRatchet.getMessageKeySend(testSession); // msg 1
      doubleRatchet.getMessageKeySend(testSession); // msg 2

      expect(testSession.messageNumberSend).toBe(3);

      doubleRatchet.asymmetricRatchet(testSession);

      expect(testSession.messageNumberSend).toBe(0);
      expect(testSession.messageNumberReceive).toBe(0);
    });

    it('should track previous chain length', () => {
      doubleRatchet.getMessageKeySend(testSession);
      doubleRatchet.getMessageKeySend(testSession);

      const previousLength = testSession.messageNumberSend;

      doubleRatchet.asymmetricRatchet(testSession);

      expect(testSession.previousChainLength).toBe(previousLength);
    });

    it('should generate new DH key pair on ratchet', () => {
      const oldKey = testSession.dhRatchetKeyPair?.publicKey.toString('hex');

      doubleRatchet.asymmetricRatchet(testSession);

      const newKey = testSession.dhRatchetKeyPair?.publicKey.toString('hex');

      // Should have new DH key pair
      expect(newKey).not.toBe(oldKey);
    });

    it('should handle repeated asymmetric ratchets', () => {
      const stats1 = doubleRatchet.getStatistics();

      doubleRatchet.asymmetricRatchet(testSession);
      doubleRatchet.asymmetricRatchet(testSession);
      doubleRatchet.asymmetricRatchet(testSession);

      const stats2 = doubleRatchet.getStatistics();

      expect(stats2.asymmetricRatchets).toBeGreaterThan(stats1.asymmetricRatchets);
    });
  });

  // ============================================================================
  // OUT-OF-ORDER MESSAGE HANDLING
  // ============================================================================

  describe('Out-of-Order Message Handling', () => {
    it('should handle message received ahead of expected', () => {
      // Expected message 0, but receive message 3
      const messageKey = doubleRatchet.getMessageKeyReceive(testSession, 3);

      expect(messageKey).toBeDefined();
      expect(messageKey?.messageNumber).toBe(3);
    });

    it('should store skipped message keys', () => {
      // Skip messages 0-2, get message 3
      doubleRatchet.getMessageKeyReceive(testSession, 3);

      expect(testSession.skippedMessageKeys.length).toBeGreaterThan(0);
    });

    it('should retrieve skipped message key', () => {
      // Get message 3 (skips 0, 1, 2)
      doubleRatchet.getMessageKeyReceive(testSession, 3);

      const skippedKey = testSession.skippedMessageKeys[0];
      expect(skippedKey).toBeDefined();
      expect(skippedKey.messageNumber).toBeLessThan(3);
    });

    it('should handle receiving skipped messages later', () => {
      // Get message 5 (skips 0-4)
      doubleRatchet.getMessageKeyReceive(testSession, 5);

      const skippedCountBefore = testSession.skippedMessageKeys.length;

      // Now get message 2 (which was skipped)
      const msg2Key = doubleRatchet.retrieveSkippedMessageKey(
        testSession,
        testSession.dhRatchetKeyPair?.publicKey || Buffer.alloc(0),
        2
      );

      expect(msg2Key).toBeDefined();
      expect(testSession.skippedMessageKeys.length).toBeLessThan(skippedCountBefore);
    });

    it('should return null for missing skipped key', () => {
      // Try to retrieve a key that was never skipped
      const msg = doubleRatchet.retrieveSkippedMessageKey(
        testSession,
        Buffer.alloc(65), // dummy public key
        999
      );

      expect(msg).toBeNull();
    });

    it('should prevent duplicate message processing', () => {
      const stats1 = doubleRatchet.getStatistics();

      // Get message 2
      doubleRatchet.getMessageKeyReceive(testSession, 2);

      // Try to get message 0 (already processed)
      const oldMsg = doubleRatchet.getMessageKeyReceive(testSession, 0);

      expect(oldMsg).toBeNull();
    });
  });

  // ============================================================================
  // MEMORY ATTACK PREVENTION
  // ============================================================================

  describe('Memory Attack Prevention (Skipped Key Limit)', () => {
    it('should limit skipped message keys to prevent memory attack', () => {
      // Generate 150 skipped keys (over limit of 100)
      doubleRatchet.getMessageKeyReceive(testSession, 150);

      // Should keep only the last 100
      expect(testSession.skippedMessageKeys.length).toBeLessThanOrEqual(100);
    });

    it('should remove old skipped keys when limit exceeded', () => {
      // Get message 150 (creates 150 skipped keys)
      doubleRatchet.getMessageKeyReceive(testSession, 150);

      // Should have removed the oldest keys
      const minMessageNumber = Math.min(
        ...testSession.skippedMessageKeys.map((sk) => sk.messageNumber)
      );

      expect(minMessageNumber).toBeGreaterThanOrEqual(50);
    });

    it('should prevent memory exhaustion from out-of-order messages', () => {
      const maxSkipped = testSession.maxSkippedKeys;

      // Simulate receiving many out-of-order messages
      for (let i = 10; i < 200; i += 10) {
        doubleRatchet.getMessageKeyReceive(testSession, i);
      }

      expect(testSession.skippedMessageKeys.length).toBeLessThanOrEqual(maxSkipped);
    });
  });

  // ============================================================================
  // STATISTICS TESTS
  // ============================================================================

  describe('Statistics and Monitoring', () => {
    it('should track sessions active', () => {
      const stats = doubleRatchet.getStatistics();

      expect(stats.sessionsActive).toBeGreaterThanOrEqual(0);
    });

    it('should track symmetric ratchets', () => {
      const statsBefore = doubleRatchet.getStatistics();

      doubleRatchet.getMessageKeySend(testSession);
      doubleRatchet.getMessageKeySend(testSession);

      const statsAfter = doubleRatchet.getStatistics();

      expect(statsAfter.symmetricRatchets).toBeGreaterThan(statsBefore.symmetricRatchets);
    });

    it('should track asymmetric ratchets', () => {
      const statsBefore = doubleRatchet.getStatistics();

      doubleRatchet.asymmetricRatchet(testSession);

      const statsAfter = doubleRatchet.getStatistics();

      expect(statsAfter.asymmetricRatchets).toBeGreaterThan(statsBefore.asymmetricRatchets);
    });

    it('should track skipped keys stored', () => {
      const statsBefore = doubleRatchet.getStatistics();

      doubleRatchet.getMessageKeyReceive(testSession, 10);

      const statsAfter = doubleRatchet.getStatistics();

      expect(statsAfter.skippedKeysStored).toBeGreaterThan(statsBefore.skippedKeysStored);
    });

    it('should track skipped keys used', () => {
      // Get message 5 (create skipped keys)
      doubleRatchet.getMessageKeyReceive(testSession, 5);

      const statsBefore = doubleRatchet.getStatistics();

      // Use a skipped key
      doubleRatchet.retrieveSkippedMessageKey(
        testSession,
        testSession.dhRatchetKeyPair?.publicKey || Buffer.alloc(0),
        2
      );

      const statsAfter = doubleRatchet.getStatistics();

      expect(statsAfter.skippedKeysUsed).toBeGreaterThan(statsBefore.skippedKeysUsed);
    });
  });

  // ============================================================================
  // FORWARD SECRECY TESTS
  // ============================================================================

  describe('Forward Secrecy Properties', () => {
    it('should provide per-message forward secrecy', () => {
      const keys: MessageKey[] = [];

      for (let i = 0; i < 100; i++) {
        keys.push(doubleRatchet.getMessageKeySend(testSession));
      }

      // All keys should be unique
      const uniqueKeys = new Set(keys.map((k) => k.key.toString('hex')));
      expect(uniqueKeys.size).toBe(100);
    });

    it('should maintain forward secrecy through asymmetric ratchet', () => {
      const keysBeforeDHR: MessageKey[] = [];

      for (let i = 0; i < 5; i++) {
        keysBeforeDHR.push(doubleRatchet.getMessageKeySend(testSession));
      }

      // Perform asymmetric ratchet
      doubleRatchet.asymmetricRatchet(testSession);

      const keysAfterDHR: MessageKey[] = [];

      for (let i = 0; i < 5; i++) {
        keysAfterDHR.push(doubleRatchet.getMessageKeySend(testSession));
      }

      // New keys should be completely different
      const beforeSet = new Set(keysBeforeDHR.map((k) => k.key.toString('hex')));
      const afterSet = new Set(keysAfterDHR.map((k) => k.key.toString('hex')));

      // No overlap
      for (const key of beforeSet) {
        expect(afterSet.has(key)).toBe(false);
      }
    });

    it('should provide chain key forward secrecy', () => {
      const chainKeyBefore = testSession.chainKeySend.toString('hex');

      doubleRatchet.getMessageKeySend(testSession);

      const chainKeyAfter = testSession.chainKeySend.toString('hex');

      expect(chainKeyAfter).not.toBe(chainKeyBefore);
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================

  describe('Integration Tests', () => {
    it('should handle full messaging flow', () => {
      // Sender: send 3 messages
      const sentKeys = [
        doubleRatchet.getMessageKeySend(testSession),
        doubleRatchet.getMessageKeySend(testSession),
        doubleRatchet.getMessageKeySend(testSession)
      ];

      expect(sentKeys.length).toBe(3);
      expect(testSession.messagesSent).toBe(3);
    });

    it('should handle sender → receiver flow', () => {
      // Create separate sessions (sender & receiver would use same initial keys)
      const receiverSession = doubleRatchet.initializeSession(
        rootKey,
        chainKeyReceive, // Receiver's send is Sender's receive
        chainKeySend // Receiver's receive is Sender's send
      );

      // Sender sends message 0, 1, 2
      doubleRatchet.getMessageKeySend(testSession);
      doubleRatchet.getMessageKeySend(testSession);
      doubleRatchet.getMessageKeySend(testSession);

      // Receiver receives in order
      const msg0 = doubleRatchet.getMessageKeyReceive(receiverSession, 0);
      const msg1 = doubleRatchet.getMessageKeyReceive(receiverSession, 1);
      const msg2 = doubleRatchet.getMessageKeyReceive(receiverSession, 2);

      expect(msg0?.messageNumber).toBe(0);
      expect(msg1?.messageNumber).toBe(1);
      expect(msg2?.messageNumber).toBe(2);
    });

    it('should support multiple ratcheting cycles', () => {
      for (let cycle = 0; cycle < 3; cycle++) {
        // Send 5 messages
        for (let i = 0; i < 5; i++) {
          doubleRatchet.getMessageKeySend(testSession);
        }

        // Perform DHR
        doubleRatchet.asymmetricRatchet(testSession);
      }

      const stats = doubleRatchet.getStatistics();

      expect(stats.symmetricRatchets).toBeGreaterThan(10);
      expect(stats.asymmetricRatchets).toBe(3);
    });
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle missing skipped key gracefully', () => {
      const result = doubleRatchet.retrieveSkippedMessageKey(
        testSession,
        Buffer.alloc(65),
        999
      );

      expect(result).toBeNull();
    });

    it('should handle empty skipped keys list', () => {
      expect(testSession.skippedMessageKeys.length).toBe(0);

      const result = doubleRatchet.retrieveSkippedMessageKey(
        testSession,
        Buffer.alloc(65),
        0
      );

      expect(result).toBeNull();
    });

    it('should maintain session integrity after errors', () => {
      const originalMessageNumber = testSession.messageNumberSend;

      // Try invalid operation
      doubleRatchet.retrieveSkippedMessageKey(testSession, Buffer.alloc(65), 999);

      // Session should still be usable
      const key = doubleRatchet.getMessageKeySend(testSession);

      expect(key).toBeDefined();
      expect(testSession.messageNumberSend).toBe(originalMessageNumber + 1);
    });
  });

  // ============================================================================
  // DETERMINISM TESTS
  // ============================================================================

  describe('Determinism and Consistency', () => {
    it('should produce consistent keys from same state', () => {
      // Create two identical sessions
      const session1 = doubleRatchet.initializeSession(rootKey, chainKeySend, chainKeyReceive);
      const session2 = doubleRatchet.initializeSession(rootKey, chainKeySend, chainKeyReceive);

      const key1 = doubleRatchet.getMessageKeySend(session1);
      const key2 = doubleRatchet.getMessageKeySend(session2);

      expect(key1.key).toEqual(key2.key);
    });

    it('should maintain state consistency through operations', () => {
      const checkpoint1 = {
        messageNumberSend: testSession.messageNumberSend,
        chainKeySend: testSession.chainKeySend.toString('hex')
      };

      doubleRatchet.getMessageKeySend(testSession);

      const checkpoint2 = {
        messageNumberSend: testSession.messageNumberSend,
        chainKeySend: testSession.chainKeySend.toString('hex')
      };

      // State changed as expected
      expect(checkpoint2.messageNumberSend).toBe(checkpoint1.messageNumberSend + 1);
      expect(checkpoint2.chainKeySend).not.toBe(checkpoint1.chainKeySend);
    });
  });
});
