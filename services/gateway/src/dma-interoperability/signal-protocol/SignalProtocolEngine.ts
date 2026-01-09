/**
 * Signal Protocol Engine for DMA Interoperability
 *
 * Phase 2, Week 1-6: Signal Protocol Implementation
 * Status: IMPLEMENTED
 *
 * Responsibilities:
 * - X3DH key agreement (Week 3-4)
 * - Double Ratchet algorithm (Week 5-6)
 * - Key management and storage (Week 1-2)
 * - Message encryption/decryption
 * - Perfect forward secrecy
 * - Message signing with identity key
 */

import { PrismaClient } from '../../../shared/prisma/client';
import { SignalKeyManager } from './SignalKeyManager';
import { X3DHKeyAgreement } from './X3DHKeyAgreement';
import { DoubleRatchet, DoubleRatchetSession } from './DoubleRatchet';
import * as crypto from 'crypto';
import { enhancedLogger } from '../../utils/logger-enhanced';

// Create a child logger for Signal Protocol operations
const logger = enhancedLogger.child({ module: 'SignalProtocolEngine' });

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
 * Aligned with Prisma DMASession model
 */
interface SignalSession {
  recipientId: string;
  rootKey: Buffer;
  chainKeySend: Buffer;
  chainKeyReceive: Buffer;
  // DH Ratchet keys (aligned with DB schema)
  dhRatchetPublicKey: Buffer | null;
  dhRatchetPrivateKey: Buffer | null;
  dhRatchetRemoteKey: Buffer | null;
  // Message counters (aligned with DB schema)
  messageNumberSend: number;
  messageNumberReceive: number;
  previousChainLength: number;
}

/**
 * Stored session data for database persistence
 * Matches Prisma DMASession model exactly
 */
interface StoredSessionData {
  recipientId: string;
  rootKey: string;
  chainKeySend: string;
  chainKeyReceive: string;
  // DH Ratchet keys (aligned with DB schema)
  dhRatchetPublicKey: string | null;
  dhRatchetPrivateKey: string | null;
  dhRatchetRemoteKey: string | null;
  // Message counters (aligned with DB schema)
  messageNumberSend: number;
  messageNumberReceive: number;
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
    messagesDecrypted: 0,
    sessionsRestored: 0
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
   */
  async initialize(): Promise<void> {
    logger.info('Initializing Signal Protocol Engine');

    try {
      // Initialize key manager (Week 1-2)
      this.keyManager = new SignalKeyManager(this.prisma);
      await this.keyManager.initialize();

      // Initialize X3DH key agreement (Week 3-4)
      this.x3dh = new X3DHKeyAgreement(this.keyManager, this.prisma);
      logger.debug('X3DH Key Agreement initialized');

      // Initialize Double Ratchet (Week 5-6)
      this.doubleRatchet = new DoubleRatchet();
      logger.debug('Double Ratchet initialized');

      // Restore sessions from database
      await this.restoreSessionsFromDatabase();

      logger.info('Signal Protocol Engine initialization complete', {
        sessionsRestored: this.stats.sessionsRestored
      });
    } catch (error) {
      logger.error('Failed to initialize Signal Protocol Engine', error);
      throw error;
    }
  }

  /**
   * Restore sessions from database on startup
   */
  private async restoreSessionsFromDatabase(): Promise<void> {
    logger.debug('Restoring sessions from database');

    try {
      const storedSessions = await this.prisma.dMASession.findMany({
        where: {
          sessionState: 'established',
          sessionType: 'signal_protocol_x3dh'
        }
      });

      for (const session of storedSessions) {
        try {
          // Reconstruct session from stored data (aligned with DB schema)
          const signalSession: SignalSession = {
            recipientId: session.remotePartyId,
            rootKey: Buffer.from(session.rootKey, 'base64'),
            chainKeySend: Buffer.from(session.chainKeySend, 'base64'),
            chainKeyReceive: Buffer.from(session.chainKeyReceive, 'base64'),
            // DH Ratchet keys from separate DB fields
            dhRatchetPublicKey: session.dhRatchetPublicKey ? Buffer.from(session.dhRatchetPublicKey, 'base64') : null,
            dhRatchetPrivateKey: session.dhRatchetPrivateKey ? Buffer.from(session.dhRatchetPrivateKey, 'base64') : null,
            dhRatchetRemoteKey: session.dhRatchetRemoteKey ? Buffer.from(session.dhRatchetRemoteKey, 'base64') : null,
            // Message counters from separate DB fields
            messageNumberSend: session.messageNumberSend || 0,
            messageNumberReceive: session.messageNumberReceive || 0,
            previousChainLength: session.previousChainLength || 0
          };

          // Initialize Double Ratchet session with restored DH key pair
          if (this.doubleRatchet) {
            const dhRatchetKeyPair = (signalSession.dhRatchetPublicKey && signalSession.dhRatchetPrivateKey)
              ? { publicKey: signalSession.dhRatchetPublicKey, privateKey: signalSession.dhRatchetPrivateKey }
              : undefined;

            const ratchetSession = this.doubleRatchet.initializeSession(
              signalSession.rootKey,
              signalSession.chainKeySend,
              signalSession.chainKeyReceive,
              dhRatchetKeyPair
            );

            // Restore remote key if available
            if (signalSession.dhRatchetRemoteKey) {
              ratchetSession.dhRatchetKeyRemote = signalSession.dhRatchetRemoteKey;
            }

            // Restore message counters
            ratchetSession.messageNumberSend = signalSession.messageNumberSend;
            ratchetSession.messageNumberReceive = signalSession.messageNumberReceive;
            ratchetSession.previousChainLength = signalSession.previousChainLength;

            this.ratchetSessions.set(session.remotePartyId, ratchetSession);
          }

          this.sessions.set(session.remotePartyId, signalSession);
          this.stats.sessionsRestored++;
          this.stats.sessionsActive++;

          logger.debug('Session restored', { recipientId: session.remotePartyId });
        } catch (sessionError) {
          logger.warn('Failed to restore session', {
            recipientId: session.remotePartyId,
            error: sessionError instanceof Error ? sessionError.message : String(sessionError)
          });
        }
      }

      logger.info('Session restoration complete', {
        sessionsRestored: this.stats.sessionsRestored,
        totalStoredSessions: storedSessions.length
      });
    } catch (error) {
      logger.error('Failed to restore sessions from database', error);
      // Continue without restored sessions - they'll be recreated on demand
    }
  }

  /**
   * Sign message content with identity key
   *
   * Creates an ECDSA signature over the message content using the identity private key.
   * This provides message authentication - recipients can verify the sender.
   */
  private async signMessage(content: Buffer): Promise<Buffer> {
    if (!this.keyManager) {
      throw new Error('KeyManager not initialized');
    }

    try {
      const identityKeyPair = await this.keyManager.getIdentityKeyPair();

      // Create EC key object from DER-encoded private key
      const privateKeyObj = crypto.createPrivateKey({
        key: identityKeyPair.privateKey,
        format: 'der',
        type: 'pkcs8',
      });

      // Sign the content using ECDSA with SHA-256
      const sign = crypto.createSign('SHA256');
      sign.update(content);
      const signature = sign.sign(privateKeyObj);

      logger.trace('Message signed', { signatureLength: signature.length });
      return signature;
    } catch (error) {
      logger.error('Failed to sign message', error);
      throw error;
    }
  }

  /**
   * Verify message signature
   *
   * Verifies the ECDSA signature using the sender's identity public key.
   */
  async verifyMessageSignature(
    content: Buffer,
    signature: Buffer,
    senderIdentityKey: Buffer
  ): Promise<boolean> {
    try {
      // Create EC key object from DER-encoded public key
      const publicKeyObj = crypto.createPublicKey({
        key: senderIdentityKey,
        format: 'der',
        type: 'spki',
      });

      // Verify the signature
      const verify = crypto.createVerify('SHA256');
      verify.update(content);
      const isValid = verify.verify(publicKeyObj, signature);

      logger.trace('Signature verification', { isValid });
      return isValid;
    } catch (error) {
      logger.warn('Signature verification failed', { error: error instanceof Error ? error.message : String(error) });
      return false;
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
   * 4. Sign the ciphertext with identity key
   * 5. Return encrypted message with metadata
   */
  async encryptMessage(plaintext: string, recipientId: string): Promise<EncryptedMessage> {
    logger.debug('Encrypting message', { recipientId });

    try {
      if (!this.doubleRatchet) {
        throw new Error('Double Ratchet not initialized');
      }

      // Step 1: Get or create ratchet session with X3DH key agreement
      let ratchetSession = this.ratchetSessions.get(recipientId);
      if (!ratchetSession) {
        logger.debug('Initiating X3DH session', { recipientId });
        // Perform X3DH key agreement and initialize Double Ratchet
        const session = await this.initiateNewSession(recipientId);
        ratchetSession = this.doubleRatchet.initializeSession(
          session.rootKey,
          session.chainKeySend,
          session.chainKeyReceive
        );
        this.ratchetSessions.set(recipientId, ratchetSession);
        logger.debug('X3DH key agreement completed', { recipientId });
      }

      // Step 2: Get message key from Double Ratchet
      const messageKey = this.doubleRatchet.getMessageKeySend(ratchetSession);
      logger.trace('Generated message key', { messageNumber: messageKey.messageNumber });

      // Step 3: Encrypt plaintext with AES-256-GCM
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', messageKey.key, iv);

      const plaintextBuffer = Buffer.from(plaintext, 'utf-8');
      let ciphertext = cipher.update(plaintextBuffer);
      ciphertext = Buffer.concat([ciphertext, cipher.final()]);

      const authenticationTag = cipher.getAuthTag();
      logger.trace('Message encrypted with AES-256-GCM', { plaintextLength: plaintextBuffer.length });

      // Step 4: Sign the ciphertext with identity key
      const contentToSign = Buffer.concat([iv, ciphertext, authenticationTag]);
      const signature = await this.signMessage(contentToSign);

      // Step 5: Return encrypted message
      const encryptedMessage: EncryptedMessage = {
        version: 3,
        ephemeralPublicKey: ratchetSession.dhRatchetKeyPair?.publicKey || Buffer.alloc(0),
        iv,
        ciphertext,
        authenticationTag,
        signature,
        messageNumber: messageKey.messageNumber,
        previousChainLength: ratchetSession.previousChainLength
      };

      // Persist session state
      await this.persistSession(recipientId, ratchetSession);

      this.stats.messagesEncrypted++;
      logger.debug('Message encrypted successfully', {
        recipientId,
        messageNumber: messageKey.messageNumber
      });

      return encryptedMessage;
    } catch (error) {
      logger.error('Message encryption failed', error, { recipientId });
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
   * 2. Optionally verify message signature
   * 3. Get message key from Double Ratchet (handles out-of-order)
   * 4. Decrypt ciphertext with AES-256-GCM
   * 5. Return plaintext
   *
   * Handles out-of-order messages via Double Ratchet skipped key storage.
   */
  async decryptMessage(
    encryptedMessage: EncryptedMessage,
    senderId: string,
    senderIdentityKey?: Buffer
  ): Promise<string> {
    logger.debug('Decrypting message', { senderId, messageNumber: encryptedMessage.messageNumber });

    try {
      if (!this.doubleRatchet) {
        throw new Error('Double Ratchet not initialized');
      }

      // Step 1: Get or create ratchet session with sender (using X3DH derived keys)
      let ratchetSession = this.ratchetSessions.get(senderId);
      if (!ratchetSession) {
        logger.debug('Initiating X3DH session (responder)', { senderId });
        // Perform X3DH key agreement and initialize Double Ratchet
        // In this context, we're the responder, so we use the ephemeralPublicKey from sender
        const session = await this.responderKeyAgreement(senderId, encryptedMessage.ephemeralPublicKey);
        ratchetSession = this.doubleRatchet.initializeSession(
          session.rootKey,
          session.chainKeyReceive,
          session.chainKeySend
        );
        this.ratchetSessions.set(senderId, ratchetSession);
        logger.debug('X3DH key agreement completed (responder)', { senderId });
      }

      // Step 2: Verify message signature if sender identity key provided
      // SECURITY: Strict signature verification - reject invalid signatures
      if (senderIdentityKey && encryptedMessage.signature.length > 0) {
        const contentToVerify = Buffer.concat([
          encryptedMessage.iv,
          encryptedMessage.ciphertext,
          encryptedMessage.authenticationTag
        ]);
        const isValid = await this.verifyMessageSignature(
          contentToVerify,
          encryptedMessage.signature,
          senderIdentityKey
        );
        if (!isValid) {
          logger.error('SECURITY: Message signature verification FAILED - rejecting message', { senderId });
          throw new Error('Message signature verification failed - message rejected');
        }
        logger.debug('Message signature verified successfully', { senderId });
      } else if (encryptedMessage.signature.length > 0) {
        // Signature present but no sender identity key to verify against
        logger.warn('Message has signature but no sender identity key provided for verification', { senderId });
      }

      // Step 3: Get message key (handles out-of-order via skipped keys)
      const messageKey = this.doubleRatchet.getMessageKeyReceive(
        ratchetSession,
        encryptedMessage.messageNumber
      );

      if (!messageKey) {
        throw new Error(
          `Failed to derive message key #${encryptedMessage.messageNumber}`
        );
      }

      logger.trace('Derived message key', { messageNumber: encryptedMessage.messageNumber });

      // Step 4: Decrypt ciphertext with AES-256-GCM
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        messageKey.key,
        encryptedMessage.iv
      );

      decipher.setAuthTag(encryptedMessage.authenticationTag);

      let plaintext = decipher.update(encryptedMessage.ciphertext);
      plaintext = Buffer.concat([plaintext, decipher.final()]);

      const plaintextString = plaintext.toString('utf-8');
      logger.trace('Decrypted with AES-256-GCM', { plaintextLength: plaintext.length });

      // Persist session state
      await this.persistSession(senderId, ratchetSession);

      // Step 5: Return plaintext
      this.stats.messagesDecrypted++;
      logger.debug('Message decrypted successfully', { senderId });

      return plaintextString;
    } catch (error) {
      logger.error('Message decryption failed', error, { senderId });
      throw error;
    }
  }

  /**
   * Persist session state to database
   * Uses correct field names aligned with Prisma DMASession model
   */
  private async persistSession(recipientId: string, ratchetSession: DoubleRatchetSession): Promise<void> {
    try {
      // Encrypt private key before storage (security requirement)
      const encryptedPrivateKey = ratchetSession.dhRatchetKeyPair?.privateKey
        ? await this.encryptPrivateKeyForStorage(ratchetSession.dhRatchetKeyPair.privateKey)
        : null;

      await this.prisma.dMASession.upsert({
        where: { remotePartyId: recipientId },
        update: {
          rootKey: ratchetSession.rootKey.toString('base64'),
          chainKeySend: ratchetSession.chainKeySend.toString('base64'),
          chainKeyReceive: ratchetSession.chainKeyReceive.toString('base64'),
          // Store DH keys in separate fields (aligned with DB schema)
          dhRatchetPublicKey: ratchetSession.dhRatchetKeyPair?.publicKey.toString('base64') || null,
          dhRatchetPrivateKey: encryptedPrivateKey,
          dhRatchetRemoteKey: ratchetSession.dhRatchetKeyRemote?.toString('base64') || null,
          // Store message counters in separate fields (aligned with DB schema)
          messageNumberSend: ratchetSession.messageNumberSend,
          messageNumberReceive: ratchetSession.messageNumberReceive,
          previousChainLength: ratchetSession.previousChainLength,
          sessionState: 'established',
          lastUsedAt: new Date(),
          updatedAt: new Date()
        },
        create: {
          remotePartyId: recipientId,
          userId: await this.getCurrentUserId(),
          rootKey: ratchetSession.rootKey.toString('base64'),
          chainKeySend: ratchetSession.chainKeySend.toString('base64'),
          chainKeyReceive: ratchetSession.chainKeyReceive.toString('base64'),
          // Store DH keys in separate fields (aligned with DB schema)
          dhRatchetPublicKey: ratchetSession.dhRatchetKeyPair?.publicKey.toString('base64') || null,
          dhRatchetPrivateKey: encryptedPrivateKey,
          dhRatchetRemoteKey: ratchetSession.dhRatchetKeyRemote?.toString('base64') || null,
          // Store message counters in separate fields (aligned with DB schema)
          messageNumberSend: ratchetSession.messageNumberSend,
          messageNumberReceive: ratchetSession.messageNumberReceive,
          previousChainLength: ratchetSession.previousChainLength,
          sessionType: 'signal_protocol_x3dh',
          sessionState: 'established'
        }
      });
      logger.trace('Session persisted', { recipientId });
    } catch (error) {
      logger.warn('Failed to persist session', {
        recipientId,
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't throw - session is still valid in memory
    }
  }

  /**
   * Encrypt private key before database storage
   */
  private async encryptPrivateKeyForStorage(privateKey: Buffer): Promise<string> {
    // Use the key manager's master key for encryption
    if (this.keyManager) {
      return this.keyManager.encryptKeyForStorage(privateKey);
    }
    // Fallback: base64 encode (less secure, for development only)
    logger.warn('KeyManager not available - storing private key without encryption');
    return privateKey.toString('base64');
  }

  /**
   * Get current user ID for session creation
   */
  private async getCurrentUserId(): Promise<string> {
    // This should be passed from the request context
    // For now, use the key manager's user ID
    if (this.keyManager) {
      return this.keyManager.getUserId();
    }
    throw new Error('Cannot determine current user ID - KeyManager not initialized');
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
    logger.debug('Initiating X3DH session (INITIATOR)', { recipientId });

    if (!this.x3dh || !this.keyManager) {
      throw new Error('X3DH or KeyManager not initialized');
    }

    try {
      // Step 1: Get our identity key pair
      const identityKeyPair = await this.keyManager.getIdentityKeyPair();
      logger.trace('Using identity key pair');

      // Step 2: Get recipient's pre-key bundle from database
      const preKeyBundle = await this.prisma.preKey.findMany({
        where: {
          signalEnrollment: { whatsappInternalId: recipientId },
          isUsed: false
        },
        include: {
          signalEnrollment: true
        },
        take: 1
      });

      if (preKeyBundle.length === 0) {
        throw new Error(`No pre-keys available for recipient: ${recipientId}`);
      }

      const preKey = preKeyBundle[0];
      logger.trace('Retrieved pre-key', { preKeyId: preKey.id });

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

      logger.debug('X3DH key agreement completed');

      // Step 4: Create session (aligned with DB schema)
      const session: SignalSession = {
        recipientId,
        rootKey: x3dhResult.rootKey,
        chainKeySend: x3dhResult.chainKeySend,
        chainKeyReceive: x3dhResult.chainKeyReceive,
        // DH Ratchet keys (aligned with DB schema)
        dhRatchetPublicKey: x3dhResult.ephemeralKeyPair.publicKey,
        dhRatchetPrivateKey: x3dhResult.ephemeralKeyPair.privateKey,
        dhRatchetRemoteKey: null, // Not known yet for initiator
        // Message counters (aligned with DB schema)
        messageNumberSend: 0,
        messageNumberReceive: 0,
        previousChainLength: 0
      };

      // Step 5 & 6: Store session and mark pre-key as used ATOMICALLY
      // Using Prisma transaction ensures both operations succeed or both fail
      try {
        // Encrypt private key before storage
        const encryptedPrivateKey = session.dhRatchetPrivateKey
          ? await this.encryptPrivateKeyForStorage(session.dhRatchetPrivateKey)
          : null;

        const currentUserId = await this.getCurrentUserId();

        await this.prisma.$transaction(async (tx) => {
          // Upsert session
          await tx.dMASession.upsert({
            where: { remotePartyId: recipientId },
            update: {
              rootKey: session.rootKey.toString('base64'),
              chainKeySend: session.chainKeySend.toString('base64'),
              chainKeyReceive: session.chainKeyReceive.toString('base64'),
              // Store DH keys in separate fields (aligned with DB schema)
              dhRatchetPublicKey: session.dhRatchetPublicKey?.toString('base64') || null,
              dhRatchetPrivateKey: encryptedPrivateKey,
              dhRatchetRemoteKey: session.dhRatchetRemoteKey?.toString('base64') || null,
              // Store message counters in separate fields (aligned with DB schema)
              messageNumberSend: session.messageNumberSend,
              messageNumberReceive: session.messageNumberReceive,
              sessionState: 'established',
              lastUsedAt: new Date(),
              updatedAt: new Date()
            },
            create: {
              remotePartyId: recipientId,
              userId: currentUserId,
              rootKey: session.rootKey.toString('base64'),
              chainKeySend: session.chainKeySend.toString('base64'),
              chainKeyReceive: session.chainKeyReceive.toString('base64'),
              // Store DH keys in separate fields (aligned with DB schema)
              dhRatchetPublicKey: session.dhRatchetPublicKey?.toString('base64') || null,
              dhRatchetPrivateKey: encryptedPrivateKey,
              dhRatchetRemoteKey: session.dhRatchetRemoteKey?.toString('base64') || null,
              // Store message counters in separate fields (aligned with DB schema)
              messageNumberSend: session.messageNumberSend,
              messageNumberReceive: session.messageNumberReceive,
              sessionType: 'signal_protocol_x3dh',
              sessionState: 'established'
            }
          });

          // Mark one-time pre-key as used (within same transaction)
          if (preKey.id) {
            await tx.preKey.update({
              where: { id: preKey.id },
              data: { isUsed: true }
            });
            logger.trace('Marked one-time pre-key as used');
          }
        });

        logger.debug('Session persisted to database (atomic transaction)');
      } catch (dbError) {
        logger.warn('Failed to persist session to database', {
          recipientId,
          error: dbError instanceof Error ? dbError.message : String(dbError)
        });
        // Continue anyway, session is in memory
      }

      this.stats.sessionsActive++;
      logger.info('X3DH session established', { recipientId });

      return session;
    } catch (error) {
      logger.error('Failed to initiate X3DH session', error, { recipientId });
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
    logger.debug('Performing X3DH key agreement (RESPONDER)', { senderId });

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
      logger.trace('Retrieved sender identity key');

      // Step 2: Get our signed pre-key info
      const signedPreKeyPair = await this.keyManager.getSignedPreKeyPair();
      logger.trace('Using our signed pre-key');

      // Step 3: Perform X3DH key agreement (RESPONDER SIDE)
      // X3DH internally uses keyManager to get private keys
      const x3dhResult = await this.x3dh.responderKeyAgreement(
        ephemeralPublicKey,
        senderIdentityKey,
        enrollment.signedPreKeyId,
        undefined, // preKeyId - optional
        enrollment.registrationId // Initiator's registration ID for HKDF
      );

      logger.debug('X3DH key agreement completed (responder side)');

      // Step 4: Create session (aligned with DB schema)
      // Note: X3DH already swaps chain keys for responder, so use them directly
      const session: SignalSession = {
        recipientId: senderId,
        rootKey: x3dhResult.rootKey,
        chainKeySend: x3dhResult.chainKeySend,
        chainKeyReceive: x3dhResult.chainKeyReceive,
        // DH Ratchet keys (aligned with DB schema)
        dhRatchetPublicKey: signedPreKeyPair.publicKey,
        dhRatchetPrivateKey: signedPreKeyPair.privateKey,
        dhRatchetRemoteKey: ephemeralPublicKey, // Sender's ephemeral key
        // Message counters (aligned with DB schema)
        messageNumberSend: 0,
        messageNumberReceive: 0,
        previousChainLength: 0
      };

      this.stats.sessionsActive++;
      logger.info('X3DH key agreement completed (responder)', { senderId });

      return session;
    } catch (error) {
      logger.error('Failed to perform responder key agreement', error, { senderId });
      throw error;
    }
  }

  /**
   * Validate test vectors from Meta
   *
   * Used in Phase 3 for compatibility testing
   */
  async validateTestVectors(testVectorsPath: string): Promise<{
    passed: number;
    failed: number;
    errors: string[];
  }> {
    logger.info('Validating test vectors', { path: testVectorsPath });

    // TODO: Implement test vector validation in Phase 3
    // 1. Load test vectors from file
    // 2. For each vector:
    //    - Decrypt message
    //    - Verify plaintext matches expected
    //    - Check Signal Protocol compliance
    // 3. Report pass/fail

    return {
      passed: 0,
      failed: 0,
      errors: ['Test vector validation not yet implemented - Phase 3']
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
    sessionsRestored: number;
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

  /**
   * Clear a specific session (for testing or session reset)
   */
  async clearSession(recipientId: string): Promise<void> {
    logger.info('Clearing session', { recipientId });

    this.sessions.delete(recipientId);
    this.ratchetSessions.delete(recipientId);

    try {
      await this.prisma.dMASession.delete({
        where: { remotePartyId: recipientId }
      });
    } catch {
      // Session may not exist in database
    }

    this.stats.sessionsActive = Math.max(0, this.stats.sessionsActive - 1);
  }

  /**
   * Check if a session exists for a recipient
   */
  hasSession(recipientId: string): boolean {
    return this.ratchetSessions.has(recipientId);
  }

  /**
   * Securely clear all sensitive data from memory
   *
   * SECURITY: This method should be called during graceful shutdown
   * to ensure no cryptographic material remains in memory.
   *
   * Clears:
   * - All active Double Ratchet sessions (chain keys, root keys)
   * - Key manager sensitive data (identity keys, pre-keys)
   * - Session maps
   */
  clearAllSensitiveData(): void {
    logger.info('Clearing all sensitive cryptographic data from memory');

    // Clear all Double Ratchet sessions
    if (this.doubleRatchet) {
      for (const [recipientId, ratchetSession] of this.ratchetSessions) {
        try {
          this.doubleRatchet.clearSession(ratchetSession);
          logger.debug('Cleared ratchet session', { recipientId });
        } catch (error) {
          logger.warn('Failed to clear ratchet session', { recipientId, error });
        }
      }
    }

    // Clear session maps
    this.sessions.clear();
    this.ratchetSessions.clear();

    // Clear key manager sensitive data
    if (this.keyManager) {
      this.keyManager.clearSensitiveData();
    }

    this.stats.sessionsActive = 0;
    logger.info('All sensitive cryptographic data cleared');
  }
}
