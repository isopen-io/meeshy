/**
 * Signal Protocol Adapter
 *
 * Wraps custom Signal Protocol implementation
 * Can be extended to use @signalapp/libsignal
 */

import { ISignalProtocolAdapter } from '../../adapters/LibraryAdapters';
import { SignalKeyManager } from '../SignalKeyManager';
import { X3DHKeyAgreement } from '../X3DHKeyAgreement';
import { DoubleRatchet } from '../DoubleRatchet';
import * as crypto from 'crypto';

export class SignalProtocolAdapter implements ISignalProtocolAdapter {
  private keyManager: SignalKeyManager;
  private x3dh: X3DHKeyAgreement;
  private doubleRatchet: DoubleRatchet;

  constructor() {
    this.keyManager = new SignalKeyManager();
    this.x3dh = new X3DHKeyAgreement();
    this.doubleRatchet = new DoubleRatchet();
  }

  async generateIdentityKeyPair(): Promise<{ publicKey: Buffer; privateKey: Buffer }> {
    // Use custom implementation
    const keyPair = this.keyManager['generateIdentityKeyPair']();
    return keyPair;
  }

  async generatePreKeyBatch(count: number): Promise<Array<{ id: number; publicKey: Buffer }>> {
    const preKeys = await this.keyManager.generatePreKeyBatch(count);
    return preKeys.map((pk: any) => ({
      id: pk.id,
      publicKey: pk.publicKey
    }));
  }

  async generateSignedPreKey(id: number): Promise<{ id: number; publicKey: Buffer; signature: Buffer }> {
    const signedPreKey = await this.keyManager.generateAndStoreSignedPreKey();
    return {
      id: signedPreKey.id,
      publicKey: signedPreKey.publicKey,
      signature: signedPreKey.signature
    };
  }

  async performX3DH(
    ourIdentityPrivate: Buffer,
    ourEphemeralPrivate: Buffer,
    theirIdentityPublic: Buffer,
    theirSignedPreKeyPublic: Buffer,
    theirPreKeyPublic?: Buffer
  ): Promise<Buffer> {
    // Create mock recipient bundle for X3DH
    const recipientBundle = {
      identityKey: theirIdentityPublic,
      signedPreKey: {
        id: 0,
        publicKey: theirSignedPreKeyPublic
      },
      preKey: theirPreKeyPublic ? { id: 0, publicKey: theirPreKeyPublic } : undefined,
      registrationId: 0
    };

    const result = await this.x3dh.initiatorKeyAgreement(recipientBundle as any, ourIdentityPrivate);
    return result.rootKey;
  }

  async encryptMessage(
    sessionKey: Buffer,
    plaintext: Buffer,
    messageNumber: number
  ): Promise<{
    ciphertext: Buffer;
    iv: Buffer;
    authTag: Buffer;
  }> {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
    let ciphertext = cipher.update(plaintext);
    ciphertext = Buffer.concat([ciphertext, cipher.final()]);
    const authTag = cipher.getAuthTag();

    return { ciphertext, iv, authTag };
  }

  async decryptMessage(
    sessionKey: Buffer,
    ciphertext: Buffer,
    iv: Buffer,
    authTag: Buffer
  ): Promise<Buffer> {
    const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, iv);
    decipher.setAuthTag(authTag);
    let plaintext = decipher.update(ciphertext);
    plaintext = Buffer.concat([plaintext, decipher.final()]);
    return plaintext;
  }

  async deriveMessageKey(chainKey: Buffer): Promise<{ messageKey: Buffer; nextChainKey: Buffer }> {
    // HMAC-based KDF for Double Ratchet
    const hmac1 = crypto.createHmac('sha256', chainKey);
    hmac1.update(Buffer.from([0x01]));
    const messageKey = hmac1.digest();

    const hmac2 = crypto.createHmac('sha256', chainKey);
    hmac2.update(Buffer.from([0x02]));
    const nextChainKey = hmac2.digest();

    return { messageKey, nextChainKey };
  }

  getImplementation(): 'libsignal' | 'custom' {
    return 'custom';
  }

  getVersion(): string {
    return 'signal-protocol-v3-custom';
  }
}
