/**
 * @jest-environment node
 *
 * #10483 — la clé de lecteur d'un anonyme : une empreinte HMAC à clé secrète,
 * stable par invité, qui ne garde jamais la valeur brute de X-Session-Token.
 */
import { describe, it, expect } from '@jest/globals';
import { readerKeyOf, readerKeySecret, isReaderKey } from '../../../../services/posts/readerKey';

const SECRET = 'a'.repeat(64);

describe('readerKeyOf', () => {
  it('le même jeton donne la même clé', () => {
    const token = 'visitor_6f1c2b9e-1d2a-4c55-9a1e-0a4b5c6d7e8f';
    expect(readerKeyOf({ sessionToken: token }, SECRET)).toBe(readerKeyOf({ sessionToken: token }, SECRET));
  });

  it('deux jetons d’un même invité donnent la même clé', () => {
    const a = readerKeyOf({ sessionToken: 'jeton-iphone', participantId: '507f1f77bcf86cd799439011' }, SECRET);
    const b = readerKeyOf({ sessionToken: 'jeton-navigateur', participantId: '507f1f77bcf86cd799439011' }, SECRET);
    expect(a).toBe(b);
  });

  it('deux visiteurs distincts ne partagent pas de clé, ni un visiteur et un invité', () => {
    const visiteurA = readerKeyOf({ sessionToken: 'visitor_a' }, SECRET);
    const visiteurB = readerKeyOf({ sessionToken: 'visitor_b' }, SECRET);
    const invite = readerKeyOf({ sessionToken: 'visitor_a', participantId: '507f1f77bcf86cd799439011' }, SECRET);
    expect(new Set([visiteurA, visiteurB, invite]).size).toBe(3);
  });

  it('la clé est en hex 64 et ne contient jamais la valeur brute', () => {
    const token = 'abcdef0123456789';
    const key = readerKeyOf({ sessionToken: token }, SECRET);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain(token);
    expect(isReaderKey(key)).toBe(true);
    expect(isReaderKey(token)).toBe(false);
  });

  it('change avec le secret — elle ne se recalcule pas sans lui', () => {
    expect(readerKeyOf({ sessionToken: 'visitor_a' }, SECRET))
      .not.toBe(readerKeyOf({ sessionToken: 'visitor_a' }, 'b'.repeat(64)));
  });
});

describe('readerKeySecret', () => {
  it('secret absent en production ⇒ throw', () => {
    expect(() => readerKeySecret({ NODE_ENV: 'production' })).toThrow(/READER_KEY_HMAC_SECRET/);
  });

  it('secret trop court en production ⇒ throw', () => {
    expect(() => readerKeySecret({ NODE_ENV: 'production', READER_KEY_HMAC_SECRET: 'court' })).toThrow(/READER_KEY_HMAC_SECRET/);
  });

  it('secret posé en production ⇒ servi', () => {
    expect(readerKeySecret({ NODE_ENV: 'production', READER_KEY_HMAC_SECRET: SECRET })).toBe(SECRET);
  });

  it('hors production sans secret ⇒ un secret de processus, stable d’un appel à l’autre', () => {
    const premier = readerKeySecret({ NODE_ENV: 'test' });
    expect(premier.length).toBeGreaterThanOrEqual(32);
    expect(readerKeySecret({ NODE_ENV: 'test' })).toBe(premier);
  });
});
