/**
 * #13100 — le format d'un fichier scellé au repos : AES-GCM-HKDF Streaming de
 * Tink, octet pour octet. Les vecteurs viennent de Tink lui-même ; un fichier
 * que la passerelle scelle s'ouvre donc avec une implémentation de référence.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import * as crypto from 'crypto';
import vectors from './fixtures/tink-aes-gcm-hkdf-streaming.json';
import {
  SEALED_FILE_HEADER_LENGTH,
  ciphertextSizeFor,
  openSealedRange,
  plaintextSizeFor,
  sealSegments,
  type SealedFileParams,
} from '../atRest/sealedFileFormat';

const plaintextOf = (length: number): Buffer => Buffer.from(Array.from({ length }, (_, i) => (i * 31 + 7) % 256));

const paramsFor = (overrides: Partial<SealedFileParams> = {}): SealedFileParams => ({
  mainKey: Buffer.from(vectors.key, 'hex'),
  associatedData: Buffer.from(vectors.associatedData, 'utf8'),
  ciphertextSegmentSize: vectors.ciphertextSegmentSize,
  ...overrides,
});

async function* chunksOf(buffer: Buffer, size: number): AsyncGenerator<Buffer> {
  for (let offset = 0; offset < buffer.length; offset += size) yield buffer.subarray(offset, offset + size);
}

async function collect(source: AsyncIterable<Buffer>): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of source) parts.push(part);
  return Buffer.concat(parts);
}

const readerOf = (ciphertext: Buffer) => async (start: number, end: number) => ciphertext.subarray(start, end);

const open = (ciphertext: Buffer, plaintextSize: number, overrides: Partial<SealedFileParams> = {}, range?: { start: number; end: number }) =>
  collect(openSealedRange({ ...paramsFor(overrides), plaintextSize, readCiphertext: readerOf(ciphertext), range }));

describe('HKDF-SHA256, la dérivation de clé du format', () => {
  it('rend le vecteur 1 de la RFC 5869', () => {
    const okm = crypto.hkdfSync(
      'sha256',
      Buffer.from('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b', 'hex'),
      Buffer.from('000102030405060708090a0b0c', 'hex'),
      Buffer.from('f0f1f2f3f4f5f6f7f8f9', 'hex'),
      42
    );
    expect(Buffer.from(okm).toString('hex')).toBe(
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865'
    );
  });
});

describe('un fichier scellé par Tink s’ouvre', () => {
  it.each(vectors.vectors.map((v) => [v.plaintextLength, v.ciphertext] as const))(
    'clair de %i octets',
    async (length, hex) => {
      const ciphertext = Buffer.from(hex, 'hex');
      expect(ciphertextSizeFor(length, vectors.ciphertextSegmentSize)).toBe(ciphertext.length);
      expect(plaintextSizeFor(ciphertext.length, vectors.ciphertextSegmentSize)).toBe(length);
      expect((await open(ciphertext, length)).equals(plaintextOf(length))).toBe(true);
    }
  );

  it('chaque plage d’un fichier de plusieurs segments rend exactement ses octets', async () => {
    const vector = vectors.vectors.find((v) => v.plaintextLength === 1000)!;
    const ciphertext = Buffer.from(vector.ciphertext, 'hex');
    const plain = plaintextOf(1000);
    const ranges = [[0, 0], [0, 199], [199, 200], [200, 439], [439, 441], [5, 998], [999, 999], [0, 999]];
    for (const segmentsPerRead of [1, 2, 16]) {
      for (const [start, end] of ranges) {
        const opened = await collect(openSealedRange({ ...paramsFor(), plaintextSize: 1000, readCiphertext: readerOf(ciphertext), range: { start, end }, segmentsPerRead }));
        expect(opened.equals(plain.subarray(start, end + 1))).toBe(true);
      }
    }
  });
});

describe('la passerelle scelle au format de Tink', () => {
  it.each([0, 1, 199, 200, 201, 456, 457, 1000, 5000])('aller-retour de %i octets, découpé au hasard', async (length) => {
    const plain = crypto.randomBytes(length);
    const sealed = await collect(sealSegments(chunksOf(plain, 37), paramsFor()));
    expect(sealed.length).toBe(ciphertextSizeFor(length, vectors.ciphertextSegmentSize));
    expect(sealed[0]).toBe(SEALED_FILE_HEADER_LENGTH);
    expect((await open(sealed, length)).equals(plain)).toBe(true);
  });

  it('un sel et un préfixe fixés rendent un chiffré déterministe', async () => {
    const random = (size: number) => Buffer.alloc(size, 0xab);
    const once = await collect(sealSegments(chunksOf(plaintextOf(457), 100), { ...paramsFor(), random }));
    const twice = await collect(sealSegments(chunksOf(plaintextOf(457), 3), { ...paramsFor(), random }));
    expect(once.equals(twice)).toBe(true);
  });

  it('aucun octet du clair ne figure dans le chiffré', async () => {
    const secret = Buffer.from('PASSEPORT-JEAN-48.8566N', 'ascii');
    const plain = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), secret, crypto.randomBytes(3000)]);
    const sealed = await collect(sealSegments(chunksOf(plain, 512), paramsFor()));
    expect(sealed.includes(secret)).toBe(false);
    expect(sealed.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
  });
});

describe('un fichier scellé altéré ne rend aucun octet', () => {
  const sealedOf = async (length: number) => {
    const plain = crypto.randomBytes(length);
    return { plain, sealed: await collect(sealSegments(chunksOf(plain, 64), paramsFor())) };
  };

  it('un bit retourné dans un segment', async () => {
    const { sealed } = await sealedOf(1000);
    const tampered = Buffer.from(sealed);
    tampered[300] ^= 0x01;
    await expect(open(tampered, 1000)).rejects.toThrow();
  });

  it('un fichier tronqué à une frontière de segment, taille inscrite comprise', async () => {
    const { sealed } = await sealedOf(1000);
    const truncated = sealed.subarray(0, 2 * vectors.ciphertextSegmentSize);
    await expect(open(truncated, 200 + 240)).rejects.toThrow();
    await expect(open(truncated, 1000)).rejects.toThrow();
  });

  it('deux segments permutés', async () => {
    const { sealed } = await sealedOf(1000);
    const cs = vectors.ciphertextSegmentSize;
    const swapped = Buffer.concat([sealed.subarray(0, cs), sealed.subarray(2 * cs, 3 * cs), sealed.subarray(cs, 2 * cs), sealed.subarray(3 * cs)]);
    await expect(open(swapped, 1000)).rejects.toThrow();
  });

  it('ouvert sous d’autres données associées (autre pièce, autre conversation)', async () => {
    const { sealed } = await sealedOf(300);
    await expect(open(sealed, 300, { associatedData: Buffer.from('["meeshy:attachment-file:v1","autre"]') })).rejects.toThrow();
  });

  it('ouvert sous une autre clé', async () => {
    const { sealed } = await sealedOf(300);
    await expect(open(sealed, 300, { mainKey: crypto.randomBytes(32) })).rejects.toThrow();
  });

  it('une taille de clair qui ne correspond pas au chiffré', async () => {
    const { sealed } = await sealedOf(300);
    await expect(open(sealed, 299)).rejects.toThrow();
  });

  it('une plage hors du clair est refusée', async () => {
    const { sealed } = await sealedOf(300);
    await expect(open(sealed, 300, {}, { start: 10, end: 300 })).rejects.toThrow();
  });
});
