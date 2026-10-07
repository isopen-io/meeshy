/**
 * #9600 — l'adresse d'un fichier protégé est SIGNÉE pour un lecteur.
 *
 * La signature lie, sous une clé secrète du serveur, la clé de stockage, la
 * pièce jointe, le participant lecteur et une échéance. Ces témoins jouent le
 * primitif : ce qu'il émet, ce qu'il accepte, ce qu'il refuse.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';

import {
  READER_FILE_URL_LIFETIME_SECONDS,
  READER_FILE_URL_STEP_SECONDS,
  checkReaderFileToken,
  readerFileUrlSigner,
  readSigningKeys,
  readerFileSignatureEnforced,
  type SigningKeys,
} from '../readerFileSignature';

const KEY_A = Buffer.alloc(32, 7).toString('base64');
const KEY_B = Buffer.alloc(32, 9).toString('base64');
const keysOf = (current: string | undefined, previous?: string): SigningKeys =>
  readSigningKeys({ ATTACHMENT_URL_SIGNING_KEY: current, ATTACHMENT_URL_SIGNING_KEY_PREVIOUS: previous });

const STORAGE_KEY = '2026/10/68f2a81417a557e8ce4ddfc1/photo_8b1f0c1e.jpg';
const ATTACHMENT = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const READER = 'cccccccccccccccccccccc01';
const NOW = new Date('2026-10-08T10:17:00.000Z');
const later = (seconds: number): Date => new Date(NOW.getTime() + seconds * 1000);

const SIGNED_PREFIX = '/api/v1/attachments/signed/';

function signedUrl(keys: SigningKeys, at: Date = NOW, grant = { storageKey: STORAGE_KEY, attachmentId: ATTACHMENT, readerParticipantId: READER }): string {
  const signer = readerFileUrlSigner({ keys, now: at });
  if (!signer) throw new Error('signer attendu');
  return signer.sign(grant);
}

function tokenAndKeyOf(url: string): { token: string; storageKey: string } {
  expect(url.startsWith(SIGNED_PREFIX)).toBe(true);
  const rest = url.slice(SIGNED_PREFIX.length);
  const slash = rest.indexOf('/');
  return { token: rest.slice(0, slash), storageKey: decodeURIComponent(rest.slice(slash + 1)) };
}

describe('readSigningKeys', () => {
  it('lit une clé de 32 octets en base64 strict', () => {
    expect(keysOf(KEY_A).current?.length).toBe(32);
    expect(keysOf(KEY_A, KEY_B).previous?.length).toBe(32);
  });

  it('ignore une clé absente, malformée, trop courte ou nulle', () => {
    expect(keysOf(undefined).current).toBeNull();
    expect(keysOf('').current).toBeNull();
    expect(keysOf('pas-du-base64!').current).toBeNull();
    expect(keysOf(Buffer.alloc(16, 1).toString('base64')).current).toBeNull();
    expect(keysOf(Buffer.alloc(32, 0).toString('base64')).current).toBeNull();
  });
});

describe('readerFileUrlSigner', () => {
  it("ne signe rien sans clé courante — l'adresse servie reste celle d'aujourd'hui", () => {
    expect(readerFileUrlSigner({ keys: keysOf(undefined, KEY_B), now: NOW })).toBeNull();
  });

  it('compose une route qui ne porte ni la forme de la route de flux ni celle d\'une clé datée', () => {
    const url = signedUrl(keysOf(KEY_A));
    // Les résolveurs clients RECOMPOSENT une adresse qui commence par la route
    // de flux ou par une clé datée, et y perdent toute chaîne de requête
    // (web `media-url.ts`) : la signature vit donc dans le CHEMIN d'une autre route.
    expect(url.startsWith('/api/v1/attachments/file/')).toBe(false);
    expect(url).not.toMatch(/^\/\d{4}\/\d{2}\//);
    expect(url).not.toContain('?');
    expect(tokenAndKeyOf(url).storageKey).toBe(STORAGE_KEY);
  });

  it("garde la MÊME adresse pendant tout un pas d'horloge, et en change au suivant", () => {
    const keys = keysOf(KEY_A);
    const stepStart = new Date(Math.floor(NOW.getTime() / (READER_FILE_URL_STEP_SECONDS * 1000)) * READER_FILE_URL_STEP_SECONDS * 1000);
    const lastOfStep = new Date(stepStart.getTime() + READER_FILE_URL_STEP_SECONDS * 1000 - 1);
    expect(signedUrl(keys, stepStart)).toBe(signedUrl(keys, lastOfStep));
    expect(signedUrl(keys, new Date(lastOfStep.getTime() + 1))).not.toBe(signedUrl(keys, lastOfStep));
  });
});

describe('checkReaderFileToken', () => {
  const keys = keysOf(KEY_A);

  it('rend la pièce et le lecteur pour une adresse intacte', () => {
    const { token, storageKey } = tokenAndKeyOf(signedUrl(keys));
    expect(checkReaderFileToken({ token, storageKey, keys, now: NOW })).toEqual({
      kind: 'valid',
      attachmentId: ATTACHMENT,
      readerParticipantId: READER,
    });
  });

  it('vaut au moins toute la durée annoncée, et plus après son échéance', () => {
    const { token, storageKey } = tokenAndKeyOf(signedUrl(keys));
    expect(checkReaderFileToken({ token, storageKey, keys, now: later(READER_FILE_URL_LIFETIME_SECONDS) }).kind).toBe('valid');
    const beyond = later(READER_FILE_URL_LIFETIME_SECONDS + READER_FILE_URL_STEP_SECONDS);
    expect(checkReaderFileToken({ token, storageKey, keys, now: beyond })).toEqual({ kind: 'invalid', reason: 'expired' });
  });

  it("refuse la signature d'une pièce posée sur la clé d'une AUTRE", () => {
    const { token } = tokenAndKeyOf(signedUrl(keys));
    const other = '2026/10/68f2a81417a557e8ce4ddfc1/autre.jpg';
    expect(checkReaderFileToken({ token, storageKey: other, keys, now: NOW })).toEqual({ kind: 'invalid', reason: 'mismatch' });
  });

  it('refuse un lecteur, une pièce ou une échéance réécrits', () => {
    const { token, storageKey } = tokenAndKeyOf(signedUrl(keys));
    const [attachmentId, reader, exp, sig] = token.split('.');
    const forged = [
      ['bbbbbbbbbbbbbbbbbbbbbbb1', reader, exp, sig],
      [attachmentId, 'dddddddddddddddddddddd01', exp, sig],
      [attachmentId, reader, String(Number(exp) + 3600), sig],
    ];
    forged.forEach((parts) => {
      expect(checkReaderFileToken({ token: parts.join('.'), storageKey, keys, now: NOW }).kind).toBe('invalid');
    });
  });

  it("refuse une échéance plus lointaine que ce que le serveur émet, même correctement signée", () => {
    const farSigner = readerFileUrlSigner({ keys, now: later(48 * 3600) });
    const { token, storageKey } = tokenAndKeyOf(farSigner!.sign({ storageKey: STORAGE_KEY, attachmentId: ATTACHMENT, readerParticipantId: READER }));
    expect(checkReaderFileToken({ token, storageKey, keys, now: NOW })).toEqual({ kind: 'invalid', reason: 'beyond-lifetime' });
  });

  it('accepte la clé PRÉCÉDENTE pendant la rotation, refuse une clé inconnue', () => {
    const { token, storageKey } = tokenAndKeyOf(signedUrl(keysOf(KEY_B)));
    expect(checkReaderFileToken({ token, storageKey, keys: keysOf(KEY_A, KEY_B), now: NOW }).kind).toBe('valid');
    expect(checkReaderFileToken({ token, storageKey, keys: keysOf(KEY_A), now: NOW })).toEqual({ kind: 'invalid', reason: 'mismatch' });
  });

  it('refuse tout quand aucune clé n\'est posée', () => {
    const { token, storageKey } = tokenAndKeyOf(signedUrl(keys));
    expect(checkReaderFileToken({ token, storageKey, keys: keysOf(undefined), now: NOW })).toEqual({ kind: 'invalid', reason: 'no-key' });
  });

  it.each([
    [''],
    ['a.b.c.d'],
    [`${ATTACHMENT}.${READER}.12.${'A'.repeat(43)}.extra`],
    [`${ATTACHMENT}.${READER}.-12.${'A'.repeat(43)}`],
    [`${ATTACHMENT}.${READER}.1760000000.${'A'.repeat(42)}`],
    [`${ATTACHMENT.toUpperCase()}.${READER}.1760000000.${'A'.repeat(43)}`],
  ])('refuse un jeton malformé (%s)', (token) => {
    expect(checkReaderFileToken({ token, storageKey: STORAGE_KEY, keys, now: NOW })).toEqual({ kind: 'invalid', reason: 'malformed' });
  });
});

describe('readerFileSignatureEnforced', () => {
  it("n'est vrai qu'au mot « true »", () => {
    expect(readerFileSignatureEnforced({ ATTACHMENT_URL_SIGNATURE_ENFORCE: 'true' })).toBe(true);
    expect(readerFileSignatureEnforced({ ATTACHMENT_URL_SIGNATURE_ENFORCE: ' TRUE ' })).toBe(true);
    expect(readerFileSignatureEnforced({ ATTACHMENT_URL_SIGNATURE_ENFORCE: '1' })).toBe(false);
    expect(readerFileSignatureEnforced({})).toBe(false);
  });
});
