/**
 * Constat GW-12 de la revue E2EE du 2026-11-17 (#18906), et #9998 — la
 * métadonnée qu'une ligne chiffrée de bout en bout GARDE est une liste blanche
 * posée par la passerelle : le protocole, l'appareil émetteur et l'époque du
 * régime, sous le mode `e2ee` qu'elle affirme elle-même. Tout le reste de ce que
 * le client répand est RETENU, jamais refusé (un client plus récent ne perd pas
 * son message, #9223), et la passerelle dit quelles clés, jamais leur valeur.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { LIBSIGNAL_PROTOCOL } from '@meeshy/shared/types/e2ee-directory';
import { persistableEncryption, type WithheldKeys } from '../e2eeRelayPayload';

const SENTINEL = 'sentinelle-secrete-42';
const relay = {
  protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 1, sessionId: 's1', unapprovedOwnDevices: [],
  envelopes: [{ userId: 'u2', deviceId: 1, registrationId: 2, type: 3 as const, body: 'b3BhcXVl' }],
};

/** La charge telle que `toEncryptedPayload` la compose : chiffré et mode, puis les métadonnées du client répandues. */
const payloadOf = (fields: Record<string, unknown>) =>
  ({ ciphertext: LIBSIGNAL_PROTOCOL, mode: 'e2ee', ...fields, relay }) as unknown as Parameters<typeof persistableEncryption>[0];

const capture = () => {
  const withheld: WithheldKeys[] = [];
  return { withheld, onWithheld: (summary: WithheldKeys) => withheld.push(summary) };
};

describe('persistableEncryption — ce qu’une ligne chiffrée de bout en bout garde de la métadonnée', () => {
  it('un envoi d’iPhone ou d’Android garde son protocole, son appareil et son époque, et rien n’est retenu', () => {
    const log = capture();

    const kept = persistableEncryption(payloadOf({ protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 3, regimeEpoch: 2 }), log);

    expect(kept.encryptionMetadata).toEqual({ mode: 'e2ee', protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 3, regimeEpoch: 2 });
    expect(kept.encryptedContent).toBe(LIBSIGNAL_PROTOCOL);
    expect(kept.e2eeRelay).toEqual(relay);
    expect(log.withheld).toEqual([]);
  });

  it('une clé libre ne s’écrit jamais : elle est retenue, nommée sans sa valeur, et le message passe', () => {
    const log = capture();

    const kept = persistableEncryption(payloadOf({ protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 1, note: SENTINEL, language: 'en' }), log);

    expect(kept.encryptionMetadata).toEqual({ mode: 'e2ee', protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 1 });
    expect(log.withheld).toEqual([{ count: 2, named: ['language'] }]);
    expect(JSON.stringify(kept.encryptionMetadata)).not.toContain(SENTINEL);
    expect(JSON.stringify(log.withheld)).not.toContain(SENTINEL);
  });

  it('#9998 — le mode est celui de la passerelle : un `mode` glissé dans la métadonnée ne le remplace pas', () => {
    const kept = persistableEncryption(payloadOf({ mode: 'server', protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 1 }), capture());

    expect(kept.encryptionMetadata).toMatchObject({ mode: 'e2ee' });
  });

  it('une clé gardée du mauvais type est retenue comme une clé libre', () => {
    const log = capture();

    const kept = persistableEncryption(payloadOf({ protocol: SENTINEL, senderDeviceId: '1', regimeEpoch: -1 }), log);

    expect(kept.encryptionMetadata).toEqual({ mode: 'e2ee' });
    expect(log.withheld).toEqual([{ count: 3, named: ['protocol', 'senderDeviceId', 'regimeEpoch'] }]);
  });

  it('une clé héritée du prototype (`constructor`, `toString`) n’est pas une clé gardée', () => {
    const log = capture();

    const kept = persistableEncryption(payloadOf({ protocol: LIBSIGNAL_PROTOCOL, constructor: SENTINEL, toString: SENTINEL }), log);

    expect(kept.encryptionMetadata).toEqual({ mode: 'e2ee', protocol: LIBSIGNAL_PROTOCOL });
    expect(log.withheld).toEqual([{ count: 2, named: [] }]);
  });

  it('un envoi relayé porte sur sa ligne le marqueur libsignal, quel que soit le « chiffré » déclaré, et le dit', () => {
    const log = capture();

    const kept = persistableEncryption(payloadOf({ ciphertext: SENTINEL, protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 1 }), log);

    expect(kept.encryptedContent).toBe(LIBSIGNAL_PROTOCOL);
    expect(log.withheld).toEqual([{ count: 1, named: ['ciphertext'] }]);
  });

  // Audit de #19080, E6 — le NOM d'une clé est un texte que le client choisit :
  // seuls les noms que la passerelle connaît se nomment au journal, tout autre
  // n'y est que compté. Une borne de longueur et d'alphabet y laisserait passer
  // un mot de clair.
  it('le nom d’une clé inconnue n’atteint jamais le journal : il n’y est que compté', () => {
    const log = capture();

    persistableEncryption(payloadOf({ protocol: LIBSIGNAL_PROTOCOL, [SENTINEL]: 1, [`${SENTINEL}\n{"forged":"log"}`]: 2 }), log);

    expect(log.withheld).toEqual([{ count: 2, named: [] }]);
    expect(JSON.stringify(log.withheld)).not.toContain('sentinelle');
  });

  it('dix mille clés retenues se résument en un compte, sans liste qui enfle', () => {
    const log = capture();
    const flood = Object.fromEntries(Array.from({ length: 10_000 }, (_, index) => [`k${index}`, index]));

    persistableEncryption(payloadOf({ protocol: LIBSIGNAL_PROTOCOL, language: 'en', ...flood }), log);

    expect(log.withheld).toEqual([{ count: 10_001, named: ['language'] }]);
  });

  it('sans charge chiffrée, rien ne s’écrit', () => {
    expect(persistableEncryption(undefined, capture())).toEqual({});
  });
});
