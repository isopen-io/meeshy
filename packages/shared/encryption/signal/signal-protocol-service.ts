/**
 * Signal Protocol Service
 *
 * High-level service for Signal Protocol operations:
 * - Pre-key bundle generation (X3DH)
 * - Session establishment
 * - Message encryption (Double Ratchet)
 * - Message decryption
 * - Group messaging with Sender Keys
 */

// Import from stubs (compatible with @signalapp/libsignal-client when available)
import {
  ProtocolAddress,
  PreKeyRecord,
  SignedPreKeyRecord,
  KyberPreKeyRecord,
  KEMKeyPair,
  PrivateKey,
  processPreKeyBundle,
  signalEncrypt,
  signalDecrypt,
  signalDecryptPreKey,
  PreKeySignalMessage,
  SignalMessageClass,
  groupEncrypt,
  groupDecrypt,
  SenderKeyDistributionMessage,
  processSenderKeyDistributionMessage,
  Uuid,
  type IdentityKeyStore,
  type SessionStore,
  type PreKeyStore,
  type SignedPreKeyStore,
  type KyberPreKeyStore,
  type SenderKeyStore,
} from './signal-stubs';

import type {
  PreKeyBundle as PreKeyBundleType,
  SignalEncryptedMessage,
  SignalMessageType,
} from './signal-types';

/**
 * Signal Protocol Service
 *
 * Provides high-level encryption/decryption using Signal Protocol
 */
export class SignalProtocolService {
  private identityStore: IdentityKeyStore;
  private sessionStore: SessionStore;
  private preKeyStore: PreKeyStore;
  private signedPreKeyStore: SignedPreKeyStore;
  private kyberPreKeyStore: KyberPreKeyStore;
  private senderKeyStore: SenderKeyStore;
  private deviceId: number;

  constructor(
    stores: {
      identityStore: IdentityKeyStore;
      sessionStore: SessionStore;
      preKeyStore: PreKeyStore;
      signedPreKeyStore: SignedPreKeyStore;
      kyberPreKeyStore: KyberPreKeyStore;
      senderKeyStore: SenderKeyStore;
    },
    deviceId: number = 1
  ) {
    this.identityStore = stores.identityStore;
    this.sessionStore = stores.sessionStore;
    this.preKeyStore = stores.preKeyStore;
    this.signedPreKeyStore = stores.signedPreKeyStore;
    this.kyberPreKeyStore = stores.kyberPreKeyStore;
    this.senderKeyStore = stores.senderKeyStore;
    this.deviceId = deviceId;
  }

  /**
   * Generate pre-key bundle for X3DH key agreement
   *
   * This bundle is uploaded to the server and retrieved by other users
   * to establish an encrypted session.
   */
  async generatePreKeyBundle(): Promise<PreKeyBundleType> {
    const identityKey = await this.identityStore.getIdentityKey();
    const identityPublicKey = identityKey.getPublicKey();
    const registrationId = await this.identityStore.getLocalRegistrationId();

    // Generate signed pre-key
    const signedPreKeyId = Date.now();
    const signedPreKeyPrivate = PrivateKey.generate();
    const signedPreKeyPublic = signedPreKeyPrivate.getPublicKey();
    const signedPreKeySignature = identityKey.sign(signedPreKeyPublic.serialize());

    const signedPreKeyRecord = SignedPreKeyRecord.new(
      signedPreKeyId,
      Date.now(),
      signedPreKeyPublic,
      signedPreKeyPrivate,
      signedPreKeySignature
    );

    await this.signedPreKeyStore.storeSignedPreKey(signedPreKeyId, signedPreKeyRecord);

    // Generate one-time pre-keys
    const preKeyId = Math.floor(Math.random() * 0xffffff);
    const preKeyPrivate = PrivateKey.generate();
    const preKeyPublic = preKeyPrivate.getPublicKey();
    const preKeyRecord = PreKeyRecord.new(preKeyId, preKeyPublic, preKeyPrivate);

    await this.preKeyStore.storePreKey(preKeyId, preKeyRecord);

    // Generate Kyber pre-key (post-quantum)
    const kyberPreKeyId = Date.now();
    const kyberKeyPair = KEMKeyPair.generate();
    const kyberPreKeyPublic = kyberKeyPair.getPublicKey();
    const kyberPreKeySignature = identityKey.sign(kyberPreKeyPublic);

    const kyberPreKeyRecord = new KyberPreKeyRecord(
      kyberPreKeyId,
      Date.now(),
      kyberPreKeyPublic,
      kyberKeyPair.getSecretKey(),
      kyberPreKeySignature
    );

    await this.kyberPreKeyStore.storeKyberPreKey(kyberPreKeyId, kyberPreKeyRecord);

    return {
      registrationId,
      deviceId: this.deviceId,
      preKeyId,
      preKeyPublic: preKeyPublic.serialize(),
      signedPreKeyId,
      signedPreKeyPublic: signedPreKeyPublic.serialize(),
      signedPreKeySignature,
      identityKey: identityPublicKey.serialize(),
      kyberPreKeyId,
      kyberPreKeyPublic,
      kyberPreKeySignature,
    };
  }

  /**
   * Generate multiple pre-keys for replenishment
   */
  async generatePreKeys(startId: number, count: number): Promise<number[]> {
    const preKeyIds: number[] = [];

    for (let i = 0; i < count; i++) {
      const preKeyId = startId + i;
      const preKeyPrivate = PrivateKey.generate();
      const preKeyPublic = preKeyPrivate.getPublicKey();
      const preKeyRecord = PreKeyRecord.new(preKeyId, preKeyPublic, preKeyPrivate);

      await this.preKeyStore.storePreKey(preKeyId, preKeyRecord);
      preKeyIds.push(preKeyId);
    }

    return preKeyIds;
  }

  /**
   * Process pre-key bundle to establish session (X3DH)
   *
   * This is called by the initiator to establish an encrypted session
   * with the recipient using their pre-key bundle.
   */
  async processPreKeyBundle(
    recipientAddress: ProtocolAddress,
    bundle: PreKeyBundleType
  ): Promise<void> {
    // Process bundle to establish session
    await processPreKeyBundle(bundle, recipientAddress, this.sessionStore, this.identityStore);
  }

  /**
   * Encrypt message using Double Ratchet algorithm
   *
   * Returns encrypted message that can be decrypted only by the recipient.
   * Provides forward secrecy - past messages cannot be decrypted if current keys are compromised.
   */
  async encryptMessage(
    recipientAddress: ProtocolAddress,
    plaintext: string
  ): Promise<SignalEncryptedMessage> {
    const plaintextBuffer = new TextEncoder().encode(plaintext);

    const ciphertext = await signalEncrypt(
      plaintextBuffer,
      recipientAddress,
      this.sessionStore,
      this.identityStore
    );

    const registrationId = await this.identityStore.getLocalRegistrationId();

    return {
      type: ciphertext.type() as SignalMessageType,
      destinationRegistrationId: registrationId,
      content: ciphertext.serialize(),
      messageVersion: 3,
      counter: 0,
      previousCounter: 0,
    };
  }

  /**
   * Decrypt message using Double Ratchet algorithm
   *
   * Handles both PreKeyMessages (first message) and regular SignalMessages.
   */
  async decryptMessage(
    senderAddress: ProtocolAddress,
    message: SignalEncryptedMessage
  ): Promise<string> {
    let plaintext: Uint8Array;

    if (message.type === 3) {
      // PreKeyMessage - first message in conversation
      const preKeyMessage = PreKeySignalMessage.deserialize(message.content);

      plaintext = await signalDecryptPreKey(
        preKeyMessage,
        senderAddress,
        this.sessionStore,
        this.identityStore,
        this.preKeyStore,
        this.signedPreKeyStore,
        this.kyberPreKeyStore
      );
    } else {
      // Regular SignalMessage
      const signalMessage = SignalMessageClass.deserialize(message.content);

      plaintext = await signalDecrypt(signalMessage, senderAddress, this.sessionStore, this.identityStore);
    }

    return new TextDecoder().decode(plaintext);
  }

  /**
   * Check if a session exists with the given address
   */
  async hasSession(recipientAddress: ProtocolAddress): Promise<boolean> {
    const session = await this.sessionStore.loadSession(recipientAddress);
    return session !== null;
  }

  /**
   * Get session state information
   */
  async getSessionInfo(recipientAddress: ProtocolAddress): Promise<{
    hasSession: boolean;
    recipientAddress: string;
    deviceId: number;
  }> {
    const session = await this.sessionStore.loadSession(recipientAddress);

    return {
      hasSession: session !== null,
      recipientAddress: recipientAddress.name(),
      deviceId: recipientAddress.deviceId(),
    };
  }

  /**
   * Create sender key distribution message for group encryption
   *
   * Sender keys allow efficient group messaging - each message is encrypted once
   * rather than once per recipient.
   */
  async createSenderKeyDistributionMessage(
    groupId: string,
    distributionId: Uuid
  ): Promise<Uint8Array> {
    const senderAddress = ProtocolAddress.new(groupId, this.deviceId);

    const message = new SenderKeyDistributionMessage(
      distributionId,
      Date.now(),
      0
    );

    // Store sender key
    await this.senderKeyStore.storeSenderKey(
      senderAddress,
      distributionId,
      { serialize: () => new Uint8Array(0) } as any
    );

    return message.serialize();
  }

  /**
   * Process sender key distribution message to enable group decryption
   */
  async processSenderKeyDistribution(
    senderAddress: ProtocolAddress,
    message: SenderKeyDistributionMessage
  ): Promise<void> {
    await processSenderKeyDistributionMessage(senderAddress, message, this.senderKeyStore);
  }

  /**
   * Encrypt group message using sender key
   */
  async encryptGroupMessage(
    groupId: string,
    distributionId: Uuid,
    plaintext: string
  ): Promise<Uint8Array> {
    const senderAddress = ProtocolAddress.new(groupId, this.deviceId);
    const plaintextBuffer = new TextEncoder().encode(plaintext);

    const ciphertext = await groupEncrypt(plaintextBuffer, senderAddress, distributionId, this.senderKeyStore);

    return ciphertext;
  }

  /**
   * Decrypt group message using sender key
   */
  async decryptGroupMessage(
    senderAddress: ProtocolAddress,
    distributionId: Uuid,
    ciphertext: Uint8Array
  ): Promise<string> {
    const plaintext = await groupDecrypt(ciphertext, senderAddress, distributionId, this.senderKeyStore);

    return new TextDecoder().decode(plaintext);
  }

  /**
   * Get registration ID
   */
  async getRegistrationId(): Promise<number> {
    return await this.identityStore.getLocalRegistrationId();
  }

  /**
   * Get identity key
   */
  async getIdentityKey(): Promise<Uint8Array> {
    const identityKey = await this.identityStore.getIdentityKey();
    return identityKey.getPublicKey().serialize();
  }
}
