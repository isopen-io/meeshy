/**
 * Library Adapter Interfaces for DMA Interoperability
 *
 * Defines interfaces for cryptographic library adapters.
 * Allows swapping between custom implementation and @signalapp/libsignal-client.
 */

/**
 * Encryption Library Adapter Interface
 *
 * For general-purpose encryption operations.
 */
export interface IEncryptionAdapter {
  /**
   * Encrypt data with AES-256-GCM
   */
  encrypt(plaintext: Buffer, key: Buffer): Promise<{
    ciphertext: Buffer;
    iv: Buffer;
    authTag: Buffer;
  }>;

  /**
   * Decrypt data with AES-256-GCM
   */
  decrypt(ciphertext: Buffer, key: Buffer, iv: Buffer, authTag: Buffer): Promise<Buffer>;

  /**
   * Generate random bytes
   */
  randomBytes(length: number): Buffer;

  /**
   * Derive key using HKDF
   */
  deriveKey(
    inputKeyMaterial: Buffer,
    salt: Buffer,
    info: Buffer,
    length: number
  ): Buffer;
}
