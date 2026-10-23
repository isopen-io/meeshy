/**
 * Un vérificateur de signatures DÉTERMINISTE pour les tests unitaires de
 * l'annuaire : une « signature » valide est le SHA-256 de (identité ‖ message).
 * La vraie vérification XEdDSA par libsignal est prouvée par le test
 * d'intégration à deux appareils (`e2ee-two-devices.integration.test.ts`).
 */
import { createHash, randomBytes } from 'crypto';
import type { SignatureVerifier } from '../signature-verifier';

export const fakeSign = (identityKey: string, message: string): string =>
  createHash('sha256').update(`${identityKey}|${message}`).digest('base64');

export const fakeVerifier: SignatureVerifier = {
  verify: async ({ identityKey, message, signature }) => fakeSign(identityKey, message) === signature,
};

export const randomKey = (bytes = 33): string => randomBytes(bytes).toString('base64');

export function fakeDeviceKeys(options: { oneTime?: number; kyber?: number; firstKeyId?: number } = {}) {
  const identityKey = randomKey();
  const signed = (keyId: number, bytes = 33) => {
    const publicKey = randomKey(bytes);
    return { keyId, publicKey, signature: fakeSign(identityKey, publicKey) };
  };
  const first = options.firstKeyId ?? 1;
  return {
    identityKey,
    registrationId: 1 + Math.floor(Math.random() * 16000),
    signedPreKey: signed(1),
    kyberLastResort: signed(1, 1569),
    oneTimePreKeys: Array.from({ length: options.oneTime ?? 0 }, (_, index) => ({ keyId: first + index, publicKey: randomKey() })),
    kyberPreKeys: Array.from({ length: options.kyber ?? 0 }, (_, index) => signed(first + index, 1569)),
    signed,
  };
}
