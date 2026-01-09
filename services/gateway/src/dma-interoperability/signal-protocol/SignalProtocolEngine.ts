/**
 * Signal Protocol Engine for DMA Interoperability
 *
 * Phase 2, Week 1-6: Signal Protocol Implementation
 * Status: TO BE IMPLEMENTED
 *
 * Responsibilities:
 * - X3DH key agreement (Week 3-4)
 * - Double Ratchet algorithm (Week 5-6)
 * - Key management and storage (Week 1-2)
 * - Message encryption/decryption
 * - Perfect forward secrecy
 */

import { PrismaClient } from '../../../shared/prisma/client';
import { SignalKeyManager } from './SignalKeyManager';
import { X3DHKeyAgreement } from './X3DHKeyAgreement';
import { DoubleRatchet, DoubleRatchetSession } from './DoubleRatchet';
import * as crypto from 'crypto';

/**
 * Encrypted message from Signal Protocol
 */
export interface EncryptedMessage {
  version: number;
  ephemeralPublicKey: Buffer;
  iv: Buffer;
  ciphertext: Buffer;
  authenticationTag: Buffer;
  signature: Buffer;
  messageNumber: number;
  previousChainLength: number;
}

/**
 * Signal Protocol Session state
 */
interface SignalSession {
  recipientId: string;
  rootKey: Buffer;
  chainKeySend: Buffer;
  chainKeyReceive: Buffer;
  dhRatchetKey: Buffer;
  messageNumber: number;
  previousChainLength: number;
}

export class SignalProtocolEngine {
  private prisma: PrismaClient;
  private keyManager?: SignalKeyManager;
  private x3dh?: X3DHKeyAgreement;
  private doubleRatchet?: DoubleRatchet;
  private sessions: Map<string, SignalSession> = new Map();
  private ratchetSessions: Map<string, DoubleRatchetSession> = new Map();
  private stats = {
    sessionsActive: 0,
    keysGenerated: 0,
    messagesEncrypted: 0,
    messagesDecrypted: 0
  };

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Initialize Signal Protocol engine
   *
   * Week 1-2 (COMPLETED): Initialize key manager
   * Week 3-4 (COMPLETED): Initialize X3DH key agreement
   * Week 5-6 (COMPLETED): Initialize Double Ratchet algorithm
   * TODO (Phase 2, Week 5-8):
   * 1. Setup session restoration from database
   * 2. Implement message encryption/decryption pipeline
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Signal Protocol Engine');

    try {
      // Initialize key manager (Week 1-2)
      this.keyManager = new SignalKeyManager(this.prisma);
      await this.keyManager.initialize();

      // Initialize X3DH key agreement (Week 3-4)
      this.x3dh = new X3DHKeyAgreement(this.keyManager, this.prisma);
      console.log('✓ X3DH Key Agreement initialized');

      // Initialize Double Ratchet (Week 5-6)
      this.doubleRatchet = new DoubleRatchet();
      console.log('✓ Double Ratchet initialized');

      // TODO: Restore sessions from database
      // const sessions = await this.prisma.signalSession.findMany();
      // for (const session of sessions) {
      //   const ratchetSession = this.doubleRatchet!.initializeSession(
      //     Buffer.from(session.rootKey),
      //     Buffer.from(session.chainKeySend),
      //     Buffer.from(session.chainKeyReceive)
      //   );
      //   this.ratchetSessions.set(session.recipientId, ratchetSession);
      // }

      console.log('✅ Signal Protocol Engine initialization complete');
    } catch (error) {
      console.error('❌ Failed to initialize Signal Protocol Engine:', error);
      throw error;
    }
  }

  /**
   * Encrypt message with Signal Protocol
   *
   * Week 5-6 (COMPLETED): Message encryption implementation
   *
   * Steps:
   * 1. Get or create ratchet session with recipient
   * 2. Get message key from Double Ratchet (symmetric ratchet)
   * 3. Encrypt plaintext with AES-256-GCM
   * 4. Return encrypted message with metadata
   */
  async encryptMessage(plaintext: string, recipientId: string): Promise<EncryptedMessage> {
    console.log(`📝 Encrypting message for: ${recipientId}`);

    try {
      if (!this.doubleRatchet) {
        throw new Error('Double Ratchet not initialized');
      }

      // Step 1: Get or create ratchet session with X3DH key agreement
      let ratchetSession = this.ratchetSessions.get(recipientId);
      if (!ratchetSession) {
        console.log(`  ℹ️  Initiating X3DH session with ${recipientId}`);
        // Perform X3DH key agreement and initialize Double Ratchet
        const session = await this.initiateNewSession(recipientId);
        ratchetSession = this.doubleRatchet.initializeSession(
          session.rootKey,
          session.chainKeySend,
          session.chainKeyReceive
        );
        this.ratchetSessions.set(recipientId, ratchetSession);
        console.log(`  ✓ X3DH key agreement completed with ${recipientId}`);
      }

      // Step 2: Get message key from Double Ratchet
      const messageKey = this.doubleRatchet.getMessageKeySend(ratchetSession);
      console.log(`  ✓ Generated message key #${messageKey.messageNumber}`);

      // Step 3: Encrypt plaintext with AES-256-GCM
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', messageKey.key, iv);

      const plaintextBuffer = Buffer.from(plaintext, 'utf-8');
      let ciphertext = cipher.update(plaintextBuffer);
      ciphertext = Buffer.concat([ciphertext, cipher.final()]);

      const authenticationTag = cipher.getAuthTag();
      console.log(`  ✓ Encrypted with AES-256-GCM (${plaintextBuffer.length} bytes)`);

      // Step 4: Return encrypted message
      const encryptedMessage: EncryptedMessage = {
        version: 3,
        ephemeralPublicKey: ratchetSession.dhRatchetKeyPair?.publicKey || Buffer.alloc(0),
        iv,
        ciphertext,
        authenticationTag,
        signature: Buffer.alloc(0), // TODO: Sign with identity key (Phase 3)
        messageNumber: messageKey.messageNumber,
        previousChainLength: ratchetSession.previousChainLength
      };

      this.stats.messagesEncrypted++;
      console.log(`✅ Message encrypted successfully`);

      return encryptedMessage;
    } catch (error) {
      console.error(`❌ Message encryption failed:`, error);
      throw error;
    }
  }

  /**
   * Decrypt message with Signal Protocol
   *
   * Week 5-6 (COMPLETED): Message decryption implementation
   *
   * Steps:
   * 1. Get or create ratchet session with sender
   * 2. Get message key from Double Ratchet (handles out-of-order)
   * 3. Decrypt ciphertext with AES-256-GCM
   * 4. Return plaintext
   *
   * Handles out-of-order messages via Double Ratchet skipped key storage.
   */
  async decryptMessage(
    encryptedMessage: EncryptedMessage,
    senderId: string
  ): Promise<string> {
    console.log(`📥 Decrypting message from: ${senderId}`);

    try {
      if (!this.doubleRatchet) {
        throw new Error('Double Ratchet not initialized');
      }

      // Step 1: Get or create ratchet session with sender (using X3DH derived keys)
      let ratchetSession = this.ratchetSessions.get(senderId);
      if (!ratchetSession) {
        console.log(`  ℹ️  Initiating X3DH session with ${senderId}`);
        // Perform X3DH key agreement and initialize Double Ratchet
        // In this context, we're the responder, so we use the ephemeralPublicKey from sender
        const session = await this.responderKeyAgreement(senderId, encryptedMessage.ephemeralPublicKey);
        ratchetSession = this.doubleRatchet.initializeSession(
          session.rootKey,
          session.chainKeyReceive,
          session.chainKeySend
        );
        this.ratchetSessions.set(senderId, ratchetSession);
        console.log(`  ✓ X3DH key agreement completed with ${senderId}`);
      }

      // Step 2: Get message key (handles out-of-order via skipped keys)
      const messageKey = this.doubleRatchet.getMessageKeyReceive(
        ratchetSession,
        encryptedMessage.messageNumber
      );

      if (!messageKey) {
        throw new Error(
          `Failed to derive message key #${encryptedMessage.messageNumber}`
        );
      }

      console.log(`  ✓ Derived message key #${encryptedMessage.messageNumber}`);

      // Step 3: Decrypt ciphertext with AES-256-GCM
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        messageKey.key,
        encryptedMessage.iv
      );

      decipher.setAuthTag(encryptedMessage.authenticationTag);

      let plaintext = decipher.update(encryptedMessage.ciphertext);
      plaintext = Buffer.concat([plaintext, decipher.final()]);

      const plaintextString = plaintext.toString('utf-8');
      console.log(`  ✓ Decrypted with AES-256-GCM (${plaintext.length} bytes)`);

      // Step 4: Return plaintext
      this.stats.messagesDecrypted++;
      console.log(`✅ Message decrypted successfully`);

      return plaintextString;
    } catch (error) {
      console.error(`❌ Message decryption failed:`, error);
      throw error;
    }
  }

  /**
   * Initiate new X3DH session with recipient (INITIATOR SIDE)
   *
   * Phase 2, Week 3-4: Initiator-side X3DH key agreement
   *
   * Steps:
   * 1. Generate ephemeral key pair
   * 2. Get recipient's pre-key bundle from key manager
   * 3. Perform X3DH key agreement
   * 4. Derive root key and chain keys via HKDF
   * 5. Store session in database
   * 6. Return session for Double Ratchet initialization
   */
  private async initiateNewSession(recipientId: string): Promise<SignalSession> {
    console.log(`🔐 Initiating X3DH session (INITIATOR) with: ${recipientId}`);

    if (!this.x3dh || !this.keyManager) {
      throw new Error('X3DH or KeyManager not initialized');
    }

    try {
      // Step 1: Get our identity key pair
      const identityKeyPair = await this.keyManager.getIdentityKeyPair();
      console.log(`  ✓ Using identity key pair`);

      // Step 2: Get recipient's pre-key bundle from database
      const preKeyBundle = await this.prisma.preKey.findMany({
        where: {
          signalEnrollment: { whatsappInternalId: recipientId },
          isUsed: false
        },
        take: 1
      });

      if (preKeyBundle.length === 0) {
        throw new Error(`No pre-keys available for recipient: ${recipientId}`);
      }

      const preKey = preKeyBundle[0];
      console.log(`  ✓ Retrieved pre-key (ID: ${preKey.id})`);

      // Step 3: Perform X3DH key agreement (INITIATOR SIDE)
      const x3dhResult = await this.x3dh.initiatorKeyAgreement(
        {
          identityKey: Buffer.from(preKey.signalEnrollment.identityKey, 'base64'),
          signedPreKey: Buffer.from(preKey.signalEnrollment.signedPreKey, 'base64'),
          signedPreKeySignature: Buffer.from(preKey.signalEnrollment.signedPreKeySignature, 'base64'),
          onetimePreKey: preKey.keyData ? Buffer.from(preKey.keyData, 'base64') : undefined
        },
        identityKeyPair.privateKey
      );

      console.log(`  ✓ X3DH key agreement completed`);

      // Step 4: Create session
      const session: SignalSession = {
        recipientId,
        rootKey: x3dhResult.rootKey,
        chainKeySend: x3dhResult.chainKeySend,
        chainKeyReceive: x3dhResult.chainKeyReceive,
        dhRatchetKey: x3dhResult.ephemeralKeyPair.publicKey,
        messageNumber: 0,
        previousChainLength: 0
      };

      // Step 5: Store session in database for persistence
      try {
        await this.prisma.dMASession.upsert({
          where: { remotePartyId: recipientId },
          update: {
            rootKey: session.rootKey.toString('base64'),
            chainKeySend: session.chainKeySend.toString('base64'),
            chainKeyReceive: session.chainKeyReceive.toString('base64'),
            sessionState: 'established'
          },
          create: {
            remotePartyId: recipientId,
            rootKey: session.rootKey.toString('base64'),
            chainKeySend: session.chainKeySend.toString('base64'),
            chainKeyReceive: session.chainKeyReceive.toString('base64'),
            sessionType: 'signal_protocol_x3dh',
            sessionState: 'established'
          }
        });
        console.log(`  ✓ Session persisted to database`);
      } catch (dbError) {
        console.warn(`  ⚠️  Failed to persist session to database:`, dbError);
        // Continue anyway, session is in memory
      }

      // Step 6: Mark one-time pre-key as used
      if (preKey.id) {
        try {
          await this.prisma.preKey.update({
            where: { id: preKey.id },
            data: { isUsed: true }
          });
          console.log(`  ✓ Marked one-time pre-key as used`);
        } catch (pkError) {
          console.warn(`  ⚠️  Failed to mark pre-key as used:`, pkError);
        }
      }

      this.stats.sessionsActive++;
      console.log(`✅ X3DH session established with ${recipientId}`);

      return session;
    } catch (error) {
      console.error(`❌ Failed to initiate X3DH session:`, error);
      throw error;
    }
  }

  /**
   * Responder-side X3DH key agreement
   *
   * Phase 2, Week 3-4: Responder-side X3DH key agreement
   *
   * Steps:
   * 1. Get ephemeral public key from sender (in encrypted message)
   * 2. Get sender's identity key and pre-key info from database
   * 3. Perform X3DH key agreement (RESPONDER SIDE)
   * 4. Derive root key and chain keys via HKDF
   * 5. Return session for Double Ratchet initialization
   *
   * Note: Responder side uses the ephemeral public key sent by initiator
   */
  private async responderKeyAgreement(senderId: string, ephemeralPublicKey: Buffer): Promise<SignalSession> {
    console.log(`🔐 Performing X3DH key agreement (RESPONDER) with: ${senderId}`);

    if (!this.x3dh || !this.keyManager) {
      throw new Error('X3DH or KeyManager not initialized');
    }

    try {
      // Step 1: Get sender's identity key from enrollment
      const enrollment = await this.prisma.dMAEnrollment.findUnique({
        where: { whatsappInternalId: senderId }
      });

      if (!enrollment) {
        throw new Error(`No enrollment found for sender: ${senderId}`);
      }

      const senderIdentityKey = Buffer.from(enrollment.identityKey, 'base64');
      console.log(`  ✓ Retrieved sender's identity key`);

      // Step 2: Get our signed pre-key info
      const signedPreKeyPair = await this.keyManager.getSignedPreKeyPair();
      console.log(`  ✓ Using our signed pre-key`);

      // Step 3: Perform X3DH key agreement (RESPONDER SIDE)
      // X3DH internally uses keyManager to get private keys
      const x3dhResult = await this.x3dh.responderKeyAgreement(
        ephemeralPublicKey,
        senderIdentityKey,
        enrollment.signedPreKeyId,
        undefined // preKeyId - optional
      );

      console.log(`  ✓ X3DH key agreement completed (responder side)`);

      // Step 4: Create session
      // Note: X3DH already swaps chain keys for responder, so use them directly
      const session: SignalSession = {
        recipientId: senderId,
        rootKey: x3dhResult.rootKey,
        chainKeySend: x3dhResult.chainKeySend,
        chainKeyReceive: x3dhResult.chainKeyReceive,
        dhRatchetKey: signedPreKeyPair.publicKey,
        messageNumber: 0,
        previousChainLength: 0
      };

      this.stats.sessionsActive++;
      console.log(`✅ X3DH key agreement completed (responder) with ${senderId}`);

      return session;
    } catch (error) {
      console.error(`❌ Failed to perform responder key agreement:`, error);
      throw error;
    }
  }

  /**
   * Validate test vectors from Meta
   *
   * Used in Phase 3 for compatibility testing
   *
   * TODO (Phase 2 late + Phase 3):
   * 1. Load test vectors from file
   * 2. For each vector:
   *    - Decrypt message
   *    - Verify plaintext matches expected
   *    - Check Signal Protocol compliance
   * 3. Report pass/fail
   */
  async validateTestVectors(testVectorsPath: string): Promise<{
    passed: number;
    failed: number;
    errors: string[];
  }> {
    console.log(`Validating test vectors from: ${testVectorsPath}`);

    // TODO: Implement test vector validation

    return {
      passed: 0,
      failed: 0,
      errors: ['Not implemented yet']
    };
  }

  /**
   * Get Signal Protocol statistics
   */
  getStatistics(): {
    sessionsActive: number;
    keysGenerated: number;
    messagesEncrypted: number;
    messagesDecrypted: number;
    keyManagerStats?: ReturnType<SignalKeyManager['getStatistics']>;
    x3dhStats?: ReturnType<X3DHKeyAgreement['getStatistics']>;
    doubleRatchetStats?: ReturnType<DoubleRatchet['getStatistics']>;
  } {
    return {
      ...this.stats,
      keyManagerStats: this.keyManager?.getStatistics(),
      x3dhStats: this.x3dh?.getStatistics(),
      doubleRatchetStats: this.doubleRatchet?.getStatistics()
    };
  }

  /**
   * Get the key manager instance
   */
  getKeyManager(): SignalKeyManager | undefined {
    return this.keyManager;
  }

  /**
   * Get the X3DH key agreement instance
   */
  getX3DH(): X3DHKeyAgreement | undefined {
    return this.x3dh;
  }

  /**
   * Get the Double Ratchet instance
   */
  getDoubleRatchet(): DoubleRatchet | undefined {
    return this.doubleRatchet;
  }
}
