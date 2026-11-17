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
import { persistableEncryption } from '../e2eeRelayPayload';

const SENTINEL = 'sentinelle-secrete-42';
const relay = {
  protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 1, sessionId: 's1', unapprovedOwnDevices: [],
  envelopes: [{ userId: 'u2', deviceId: 1, registrationId: 2, type: 3 as const, body: 'b3BhcXVl' }],
};

/** La charge telle que `toEncryptedPayload` la compose : chiffré et mode, puis les métadonnées du client répandues. */
const payloadOf = (fields: Record<string, unknown>) =>
  ({ ciphertext: LIBSIGNAL_PROTOCOL, mode: 'e2ee', ...fields, relay }) as unknown as Parameters<typeof persistableEncryption>[0];

const capture = () => {
  const withheld: (readonly string[])[] = [];
  return { withheld, onWithheld: (keys: readonly string[]) => withheld.push(keys) };
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
    expect(log.withheld).toEqual([['note', 'language']]);
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
    expect(log.withheld).toEqual([['protocol', 'senderDeviceId', 'regimeEpoch']]);
  });

  it('une clé héritée du prototype (`constructor`, `toString`) n’est pas une clé gardée', () => {
    const log = capture();

    const kept = persistableEncryption(payloadOf({ protocol: LIBSIGNAL_PROTOCOL, constructor: SENTINEL, toString: SENTINEL }), log);

    expect(kept.encryptionMetadata).toEqual({ mode: 'e2ee', protocol: LIBSIGNAL_PROTOCOL });
    expect(log.withheld).toEqual([['constructor', 'toString']]);
  });

  it('un envoi relayé porte sur sa ligne le marqueur libsignal, quel que soit le « chiffré » déclaré, et le dit', () => {
    const log = capture();

    const kept = persistableEncryption(payloadOf({ ciphertext: SENTINEL, protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 1 }), log);

    expect(kept.encryptedContent).toBe(LIBSIGNAL_PROTOCOL);
    expect(log.withheld).toEqual([['ciphertext']]);
  });

  it('sans charge chiffrée, rien ne s’écrit', () => {
    expect(persistableEncryption(undefined, capture())).toEqual({});
  });
});
