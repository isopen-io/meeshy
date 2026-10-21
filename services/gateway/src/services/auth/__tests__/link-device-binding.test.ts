/**
 * #10872 — le lien de connexion est LIÉ À L'APPAREIL qui l'a demandé.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import crypto from 'crypto';

import { linkDeviceHashOf, linkDeviceVerdict, parseLinkDeviceHash, parseLinkDeviceSecret } from '../link-device-binding';

const SECRET = crypto.randomBytes(32).toString('base64url');
const sha256 = (v: string) => crypto.createHash('sha256').update(v, 'utf8').digest('hex');

describe('linkDeviceHashOf', () => {
  it("rend l'empreinte SHA-256 hexadécimale de la chaîne du secret — celle que le client calcule", () => {
    expect(linkDeviceHashOf(SECRET)).toBe(sha256(SECRET));
  });
});

describe('linkDeviceVerdict', () => {
  it("même appareil : le secret présenté a l'empreinte liée ⇒ connexion directe", () => {
    expect(linkDeviceVerdict({ boundHash: sha256(SECRET), presentedSecret: SECRET, confirmed: false })).toBe('same-device');
  });

  it('autre appareil : aucun secret présenté ⇒ confirmation', () => {
    expect(linkDeviceVerdict({ boundHash: sha256(SECRET), presentedSecret: undefined, confirmed: false })).toBe('confirmation-required');
  });

  it("secret FAUX ⇒ confirmation, jamais une connexion", () => {
    const autre = crypto.randomBytes(32).toString('base64url');
    expect(linkDeviceVerdict({ boundHash: sha256(SECRET), presentedSecret: autre, confirmed: false })).toBe('confirmation-required');
  });

  it("lien NON lié (ancien client, digest, jeton déjà émis) ⇒ confirmation, même avec un secret", () => {
    expect(linkDeviceVerdict({ boundHash: null, presentedSecret: SECRET, confirmed: false })).toBe('confirmation-required');
    expect(linkDeviceVerdict({ boundHash: undefined, presentedSecret: undefined, confirmed: false })).toBe('confirmation-required');
  });

  it("le oui explicite de l'utilisateur ouvre la session, lié ou non", () => {
    expect(linkDeviceVerdict({ boundHash: null, presentedSecret: undefined, confirmed: true })).toBe('confirmed');
    expect(linkDeviceVerdict({ boundHash: sha256(SECRET), presentedSecret: 'faux-faux-faux-faux-faux', confirmed: true })).toBe('confirmed');
  });

  it("une empreinte stockée MAL FORMÉE ne correspond à rien", () => {
    expect(linkDeviceVerdict({ boundHash: 'abc', presentedSecret: SECRET, confirmed: false })).toBe('confirmation-required');
  });

  it('compare en TEMPS CONSTANT (timingSafeEqual), jamais par ===', () => {
    const spy = jest.spyOn(crypto, 'timingSafeEqual');
    linkDeviceVerdict({ boundHash: sha256(SECRET), presentedSecret: SECRET, confirmed: false });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('frontières', () => {
  it("l'empreinte demandée : 64 hexadécimaux, normalisée en minuscules ; tout le reste est refusé", () => {
    expect(parseLinkDeviceHash(sha256(SECRET).toUpperCase())).toBe(sha256(SECRET));
    expect(parseLinkDeviceHash('xyz')).toBeNull();
    expect(parseLinkDeviceHash(undefined)).toBeNull();
  });

  it('le secret présenté : base64url de 22 à 256 caractères (≥ 128 bits)', () => {
    expect(parseLinkDeviceSecret(SECRET)).toBe(SECRET);
    expect(parseLinkDeviceSecret('court')).toBeUndefined();
    expect(parseLinkDeviceSecret('a'.repeat(257))).toBeUndefined();
    expect(parseLinkDeviceSecret('espaces interdits espaces')).toBeUndefined();
  });
});
