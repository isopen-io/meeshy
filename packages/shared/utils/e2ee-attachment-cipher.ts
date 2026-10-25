/**
 * Le chiffrement d'une pièce jointe de conversation chiffrée de bout en bout,
 * format `client-v1` (#10789) : celui de Signal, repris sans réglage.
 *
 * - clé de 64 octets : 32 pour AES-256, 32 pour HMAC-SHA256
 *   (Signal-Android `AttachmentCipherOutputStream`, `Util.split(key, 32, 32)`) ;
 * - clair complété de zéros à `paddedAttachmentSize` (Signal-Android
 *   `PaddingInputStream.getPaddedSize`, Signal-iOS `Cryptography.paddedSize`) ;
 * - blob `IV ‖ AES-256-CBC-PKCS7(clair complété) ‖ HMAC-SHA256(IV ‖ chiffré)` ;
 * - condensat SHA-256 du blob entier.
 *
 * L'ouverture vérifie le condensat, puis le HMAC, puis seulement déchiffre :
 * un blob altéré ne rend RIEN. Jumeau Swift : `E2EEAttachmentCipher`
 * (`packages/MeeshySDK/Sources/MeeshyE2EE/`), rejoué sur les mêmes vecteurs
 * (`packages/shared/fixtures/e2ee-attachment/client-v1.vectors.json`, écrits par OpenSSL).
 *
 * Primitives : WebCrypto (`AES-CBC`, `HMAC`, `SHA-256`), dans Node 22 comme
 * dans un navigateur. Décision : `packages/MeeshySDK/decisions/2026-10-25-une-piece-jointe-e2ee-est-chiffree-sur-l-appareil-a-la-maniere-de-signal.md`.
 */

export const E2EE_ATTACHMENT_SCHEME = 'client-v1';

const KEY_BYTES = 64;
const IV_BYTES = 16;
const MAC_BYTES = 32;
const DIGEST_BYTES = 32;
const AES_BLOCK = 16;

export type E2EEAttachmentFailure = 'digest-mismatch' | 'mac-mismatch' | 'malformed' | 'size-mismatch';

export class E2EEAttachmentCipherError extends Error {
  constructor(readonly reason: E2EEAttachmentFailure) {
    super(`e2ee attachment refused: ${reason}`);
    this.name = 'E2EEAttachmentCipherError';
  }
}

export type SealedAttachment = {
  readonly blob: Uint8Array;
  readonly key: Uint8Array;
  readonly digest: Uint8Array;
  readonly size: number;
};

export type AttachmentOpening = {
  readonly key: Uint8Array;
  readonly digest: Uint8Array;
  readonly size: number;
};

/** La taille que le serveur voit : le clair arrondi au palier de 5 % de Signal, 541 octets au moins. */
export function paddedAttachmentSize(size: number): number {
  if (size <= 0) return 541;
  return Math.max(541, Math.floor(Math.pow(1.05, Math.ceil(Math.log(size) / Math.log(1.05)))));
}

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

type Bytes = Uint8Array<ArrayBuffer>;

/** Une copie que WebCrypto accepte : jamais une vue sur un `SharedArrayBuffer`. */
const owned = (value: Uint8Array): Bytes => new Uint8Array(value);

const randomBytes = (count: number): Bytes => globalThis.crypto.getRandomValues(new Uint8Array(count));

const concat = (...parts: readonly Uint8Array[]): Bytes => {
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  parts.reduce((offset, part) => {
    joined.set(part, offset);
    return offset + part.length;
  }, 0);
  return joined;
};

const bytes = async (buffer: Promise<ArrayBuffer>): Promise<Bytes> => new Uint8Array(await buffer);

/** Égalité sans court-circuit : la durée ne dit pas où les deux valeurs diffèrent. */
const constantTimeEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.reduce((difference, byte, index) => difference | (byte ^ (right[index] ?? 0)), 0) === 0;

const aesKey = (key: Bytes, usage: KeyUsage): Promise<CryptoKey> =>
  subtle().importKey('raw', key.slice(0, 32), { name: 'AES-CBC' }, false, [usage]);

const macKey = (key: Bytes, usage: KeyUsage): Promise<CryptoKey> =>
  subtle().importKey('raw', key.slice(32, KEY_BYTES), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);

/** Une clé et un IV NEUFS à chaque fichier : la seule façon de chiffrer hors des vecteurs de test. */
export function encryptAttachment(plaintext: Uint8Array): Promise<SealedAttachment> {
  return seal(plaintext, randomBytes(KEY_BYTES), randomBytes(IV_BYTES));
}

/**
 * VECTEURS DE TEST SEULEMENT : clé et IV imposés, pour rejouer un vecteur
 * figé. Réutiliser une clé ou un IV hors de là romprait la confidentialité.
 */
export function encryptAttachmentForTestVector(
  plaintext: Uint8Array,
  material: { readonly key: Uint8Array; readonly iv: Uint8Array },
): Promise<SealedAttachment> {
  return seal(plaintext, owned(material.key), owned(material.iv));
}

async function seal(plaintext: Uint8Array, key: Bytes, iv: Bytes): Promise<SealedAttachment> {
  if (key.length !== KEY_BYTES || iv.length !== IV_BYTES) throw new E2EEAttachmentCipherError('malformed');
  const padded = concat(plaintext, new Uint8Array(paddedAttachmentSize(plaintext.length) - plaintext.length));
  const ciphertext = await bytes(subtle().encrypt({ name: 'AES-CBC', iv }, await aesKey(key, 'encrypt'), padded));
  const authenticated = concat(iv, ciphertext);
  const mac = await bytes(subtle().sign('HMAC', await macKey(key, 'sign'), authenticated));
  const blob = concat(authenticated, mac);
  const digest = await bytes(subtle().digest('SHA-256', blob));
  return { blob, key, digest, size: plaintext.length };
}

export async function decryptAttachment(blob: Uint8Array, opening: AttachmentOpening): Promise<Uint8Array> {
  if (opening.key.length !== KEY_BYTES || opening.digest.length !== DIGEST_BYTES || !Number.isSafeInteger(opening.size) || opening.size < 0) {
    throw new E2EEAttachmentCipherError('malformed');
  }
  const sealed = owned(blob);
  const digest = await bytes(subtle().digest('SHA-256', sealed));
  if (!constantTimeEqual(digest, opening.digest)) throw new E2EEAttachmentCipherError('digest-mismatch');
  const ciphertextLength = sealed.length - IV_BYTES - MAC_BYTES;
  if (ciphertextLength < AES_BLOCK || ciphertextLength % AES_BLOCK !== 0) throw new E2EEAttachmentCipherError('malformed');
  const authenticated = sealed.slice(0, sealed.length - MAC_BYTES);
  const mac = sealed.slice(sealed.length - MAC_BYTES);
  const verified = await subtle().verify('HMAC', await macKey(owned(opening.key), 'verify'), mac, authenticated);
  if (!verified) throw new E2EEAttachmentCipherError('mac-mismatch');
  const padded = await bytes(
    subtle().decrypt({ name: 'AES-CBC', iv: sealed.slice(0, IV_BYTES) }, await aesKey(owned(opening.key), 'decrypt'), sealed.slice(IV_BYTES, sealed.length - MAC_BYTES)),
  ).catch(() => {
    throw new E2EEAttachmentCipherError('malformed');
  });
  if (opening.size > padded.length) throw new E2EEAttachmentCipherError('size-mismatch');
  return padded.slice(0, opening.size);
}
