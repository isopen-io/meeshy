import { describe, it, expect } from 'vitest';
import vectors from '../../fixtures/e2ee-attachment/client-v1.vectors.json';
import {
  E2EE_ATTACHMENT_SCHEME,
  E2EEAttachmentCipherError,
  decryptAttachment,
  encryptAttachment,
  paddedAttachmentSize,
} from '../e2ee-attachment-cipher';

const hex = (value: string): Uint8Array => Uint8Array.from(value.match(/../g) ?? [], (byte) => parseInt(byte, 16));
const toHex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const NIST_F25_CIPHERTEXT =
  'f58c4c04d6e5f1ba779eabfb5f7bfbd69cfc4e967edb808d679f777bc6702c7d39f23369a9d9bacfa530e26304231461b2eb05e2c39be9fcda6c19078c6a9d1b';

const failureOf = async (attempt: Promise<unknown>): Promise<string> => {
  try {
    await attempt;
    return 'opened';
  } catch (error) {
    return error instanceof E2EEAttachmentCipherError ? error.reason : 'other';
  }
};

describe('format client-v1 des pièces jointes chiffrées de bout en bout (#10789)', () => {
  it('nomme son format', () => {
    expect(E2EE_ATTACHMENT_SCHEME).toBe('client-v1');
  });

  // Signal-iOS, SignalServiceKit/Cryptography/CryptographyTests.swift (test_paddedSizeSpotChecks, test_spotCheckBucketBoundaries).
  it.each([
    [0, 541], [1, 541], [540, 541], [541, 541], [542, 568], [567, 568], [568, 568], [569, 596],
    [1_234, 1_240], [12_345, 12_903], [64_562, 67_789], [67_790, 71_178], [123_456, 127_826],
    [1_234_567, 1_266_246], [12_345_678, 12_543_397], [92_720_647, 97_356_678], [123_456_789, 124_254_533],
  ])('complète %i octets jusqu’à %i, comme Signal', (size, padded) => {
    expect(paddedAttachmentSize(size)).toBe(padded);
  });

  it.each(vectors.vectors.map((vector) => [vector.name, vector] as const))(
    'reproduit le vecteur %s, écrit par OpenSSL',
    async (_name, vector) => {
      const sealed = await encryptAttachment(hex(vector.plaintext), { key: hex(vector.key), iv: hex(vector.iv) });
      expect(toHex(sealed.blob)).toBe(vector.blob);
      expect(toHex(sealed.digest)).toBe(vector.digest);
      expect(sealed.size).toBe(vector.size);
      expect(sealed.blob.length).toBe(16 + (Math.floor(vector.paddedSize / 16) + 1) * 16 + 32);
    },
  );

  it('chiffre les quatre premiers blocs comme NIST SP 800-38A F.2.5', async () => {
    const vector = vectors.vectors[0];
    const sealed = await encryptAttachment(hex(vector.plaintext), { key: hex(vector.key), iv: hex(vector.iv) });
    expect(toHex(sealed.blob.slice(16, 80))).toBe(NIST_F25_CIPHERTEXT);
  });

  it.each(vectors.vectors.map((vector) => [vector.name, vector] as const))(
    'rouvre le vecteur %s à sa taille exacte',
    async (_name, vector) => {
      const opened = await decryptAttachment(hex(vector.blob), { key: hex(vector.key), digest: hex(vector.digest), size: vector.size });
      expect(toHex(opened)).toBe(vector.plaintext);
    },
  );

  it('tire une clé et un IV neufs à chaque fichier', async () => {
    const plaintext = new TextEncoder().encode('la même photo');
    const first = await encryptAttachment(plaintext);
    const second = await encryptAttachment(plaintext);
    expect(first.key.length).toBe(64);
    expect(toHex(first.key)).not.toBe(toHex(second.key));
    expect(toHex(first.blob.slice(0, 16))).not.toBe(toHex(second.blob.slice(0, 16)));
    expect(await decryptAttachment(first.blob, first)).toEqual(plaintext);
  });

  it('ne laisse aucun octet du clair dans le blob', async () => {
    const sentinel = new TextEncoder().encode(`sentinelle-${crypto.randomUUID()}`);
    const sealed = await encryptAttachment(sentinel);
    expect(Buffer.from(sealed.blob).includes(Buffer.from(sentinel))).toBe(false);
  });

  describe('fail-closed : rien ne sort d’un blob altéré', () => {
    const vector = vectors.vectors[2];
    const pointer = { key: hex(vector.key), digest: hex(vector.digest), size: vector.size };

    it('un octet du chiffré changé : condensat refusé', async () => {
      const blob = hex(vector.blob);
      blob[40] ^= 0x01;
      expect(await failureOf(decryptAttachment(blob, pointer))).toBe('digest-mismatch');
    });

    it('un condensat faux : refusé avant tout HMAC', async () => {
      const digest = hex(vector.digest);
      digest[0] ^= 0x80;
      expect(await failureOf(decryptAttachment(hex(vector.blob), { ...pointer, digest }))).toBe('digest-mismatch');
    });

    it('un blob ET son condensat remplacés par le serveur : le HMAC le refuse', async () => {
      const forged = hex(vector.blob);
      forged[40] ^= 0x01;
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', forged));
      expect(await failureOf(decryptAttachment(forged, { ...pointer, digest }))).toBe('mac-mismatch');
    });

    it('une mauvaise clé : le HMAC le refuse', async () => {
      const key = hex(vector.key);
      key[63] ^= 0x01;
      expect(await failureOf(decryptAttachment(hex(vector.blob), { ...pointer, key }))).toBe('mac-mismatch');
    });

    it('un blob tronqué : refusé', async () => {
      const blob = hex(vector.blob).slice(0, 40);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', blob));
      expect(await failureOf(decryptAttachment(blob, { ...pointer, digest }))).toBe('malformed');
    });

    it('une taille annoncée plus grande que le clair : refusée', async () => {
      expect(await failureOf(decryptAttachment(hex(vector.blob), { ...pointer, size: vector.paddedSize + 1 }))).toBe('size-mismatch');
    });

    it('une clé de mauvaise longueur : refusée', async () => {
      expect(await failureOf(decryptAttachment(hex(vector.blob), { ...pointer, key: hex(vector.key).slice(0, 32) }))).toBe('malformed');
    });
  });
});
