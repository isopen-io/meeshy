/**
 * La porte « pair externe » (#17115) : ce qu'elle laisse passer, ce qu'elle
 * refuse, et ce qu'elle ne dit jamais. Les corps chiffrés sont ceux des vecteurs
 * croisés libsignal (#17113), lus par la VRAIE bibliothèque (processus à part).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { E2EE_ENVELOPE_BOUNDS } from '@meeshy/shared/types/e2ee-directory';
import { realLibsignalMessages } from '../../e2ee/__tests__/libsignal-devices';
import { admitExternalPeer, type ExternalPeerLogger } from '../external-peer-gate';
import { createFakeWhatsAppPeer, memoryPeerStore } from '../fake-whatsapp-peer';
import {
  EXTERNAL_PEER_ERROR_CODES,
  ExternalPeerError,
  type ExternalParty,
  type MeeshyParty,
  type PreKeyBundlePublication,
} from '../external-peer-contract';

type WireMessage = { type: 2 | 3; body: string; plaintext: string };
const VECTORS = JSON.parse(
  readFileSync(join(__dirname, '../../../../../../packages/shared/fixtures/libsignal/cross-platform.vectors.json'), 'utf8'),
) as { freshSession: { messages: WireMessage[] }; persistedSessions: { aliceOpensReply: { message: WireMessage } } };

const PREKEY_MESSAGE = VECTORS.freshSession.messages[0];
const SIGNAL_MESSAGE = VECTORS.persistedSessions.aliceOpensReply.message;
const HANDLE = '+33612345678';
const PLAINTEXT = 'Rendez-vous à 18 h devant la gare';

const meeshy = (deviceId = 1, userId = 'a'.repeat(24)): MeeshyParty => ({ side: 'meeshy', userId, deviceId });
const friend = (deviceId = 1, handle = HANDLE): ExternalParty => ({ side: 'external', network: 'whatsapp', handle, deviceId });

const b64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64');
const fakeKey = (seed: number): string => Buffer.alloc(33, seed).toString('base64');
const fakeSignature = (seed: number): string => Buffer.alloc(64, seed).toString('base64');

const publication = (overrides: Partial<PreKeyBundlePublication> = {}): PreKeyBundlePublication => ({
  party: friend(),
  registrationId: 4242,
  identityKey: fakeKey(1),
  signedPreKey: { keyId: 1, publicKey: fakeKey(2), signature: fakeSignature(2) },
  kyberLastResort: { keyId: 1000, publicKey: fakeKey(3), signature: fakeSignature(3) },
  oneTimePreKeys: [
    { keyId: 1, publicKey: fakeKey(4) },
    { keyId: 2, publicKey: fakeKey(5) },
  ],
  kyberPreKeys: [{ keyId: 1, publicKey: fakeKey(6), signature: fakeSignature(6) }],
  ...overrides,
});

const gate = () => {
  const lines: string[] = [];
  const logger: ExternalPeerLogger = { warn: (message, context) => lines.push(JSON.stringify({ message, context })) };
  const peer = admitExternalPeer(createFakeWhatsAppPeer({ store: memoryPeerStore() }), { libsignal: () => realLibsignalMessages, logger });
  return { peer, lines };
};

const refusalCode = async (attempt: () => Promise<unknown>): Promise<string> => {
  try {
    await attempt();
    return 'accepted';
  } catch (error) {
    return error instanceof ExternalPeerError ? error.code : `unexpected: ${String(error)}`;
  }
};

describe('pair externe — les enveloppes opaques', () => {
  it('une enveloppe libsignal remise au pair est servie à SON appareil, à l’octet près, puis effacée par son accusé', async () => {
    const { peer } = gate();

    const receipt = await peer.deliverEnvelope({ from: meeshy(), to: friend(), type: 3, body: PREKEY_MESSAGE.body });
    const inbound = await peer.receiveEnvelopes(friend());

    expect(inbound).toEqual([
      { envelopeId: receipt.envelopeId, from: meeshy(), type: 3, body: PREKEY_MESSAGE.body, acceptedAt: receipt.acceptedAt },
    ]);
    expect(await peer.receiveEnvelopes(friend(2))).toEqual([]);
    expect(await peer.acknowledge({ recipient: friend(), envelopeIds: [receipt.envelopeId] })).toBe(1);
    expect(await peer.receiveEnvelopes(friend())).toEqual([]);
  });

  it('les enveloppes sont servies dans l’ordre de leur remise', async () => {
    const { peer } = gate();

    const first = await peer.deliverEnvelope({ from: friend(), to: meeshy(), type: 3, body: PREKEY_MESSAGE.body });
    const second = await peer.deliverEnvelope({ from: friend(), to: meeshy(), type: 2, body: SIGNAL_MESSAGE.body });

    expect((await peer.receiveEnvelopes(meeshy())).map((envelope) => envelope.envelopeId)).toEqual([first.envelopeId, second.envelopeId]);
  });

  it('un clair soumis comme corps est REFUSÉ, rien n’est remis, et ni le clair ni le numéro n’apparaissent dans les journaux', async () => {
    const { peer, lines } = gate();

    const code = await refusalCode(() => peer.deliverEnvelope({ from: meeshy(), to: friend(), type: 2, body: b64(PLAINTEXT) }));

    expect(code).toBe(EXTERNAL_PEER_ERROR_CODES.PLAINTEXT_REFUSED);
    expect(await peer.receiveEnvelopes(friend())).toEqual([]);
    expect(lines.length).toBeGreaterThan(0);
    const journal = lines.join('\n');
    expect(journal).not.toContain(PLAINTEXT);
    expect(journal).not.toContain(b64(PLAINTEXT));
    expect(journal).not.toContain(HANDLE);
    expect(journal).not.toContain(HANDLE.slice(1));
  });

  it('un PreKeySignalMessage déclaré SignalMessage est refusé : le type et le corps se lisent ensemble', async () => {
    const { peer } = gate();

    expect(await refusalCode(() => peer.deliverEnvelope({ from: meeshy(), to: friend(), type: 2, body: PREKEY_MESSAGE.body }))).toBe(
      EXTERNAL_PEER_ERROR_CODES.PLAINTEXT_REFUSED,
    );
  });

  it('un champ de contenu posé à côté du chiffré fait refuser l’appel entier, au lieu d’être retiré en silence', async () => {
    const { peer } = gate();
    const envelope = { from: meeshy(), to: friend(), type: 3 as const, body: PREKEY_MESSAGE.body, text: PLAINTEXT };

    expect(await refusalCode(() => peer.deliverEnvelope(envelope))).toBe(EXTERNAL_PEER_ERROR_CODES.INVALID);
    expect(await peer.receiveEnvelopes(friend())).toEqual([]);
  });

  it('une enveloppe qui ne traverse pas la frontière est refusée : Meeshy-Meeshy ne passe jamais par cette porte', async () => {
    const { peer } = gate();

    expect(await refusalCode(() => peer.deliverEnvelope({ from: meeshy(1), to: meeshy(2), type: 3, body: PREKEY_MESSAGE.body }))).toBe(
      EXTERNAL_PEER_ERROR_CODES.INVALID,
    );
  });

  it('une file longue est servie par pages bornées, les plus anciennes d’abord, et l’accusé de chaque page découvre la suivante', async () => {
    const { peer } = gate();
    const delivered = await Array.from({ length: E2EE_ENVELOPE_BOUNDS.maxEnvelopes + 1 }).reduce<Promise<string[]>>(async (done) => {
      const ids = await done;
      const receipt = await peer.deliverEnvelope({ from: friend(), to: meeshy(), type: 2, body: SIGNAL_MESSAGE.body });
      return [...ids, receipt.envelopeId];
    }, Promise.resolve([]));

    const firstPage = await peer.receiveEnvelopes(meeshy());
    expect(firstPage.map((envelope) => envelope.envelopeId)).toEqual(delivered.slice(0, E2EE_ENVELOPE_BOUNDS.maxEnvelopes));
    expect(await peer.acknowledge({ recipient: meeshy(), envelopeIds: firstPage.map((envelope) => envelope.envelopeId) })).toBe(
      E2EE_ENVELOPE_BOUNDS.maxEnvelopes,
    );
    expect((await peer.receiveEnvelopes(meeshy())).map((envelope) => envelope.envelopeId)).toEqual(delivered.slice(E2EE_ENVELOPE_BOUNDS.maxEnvelopes));
  });

  it('un accusé ne retire que les enveloppes de SON destinataire', async () => {
    const { peer } = gate();
    const receipt = await peer.deliverEnvelope({ from: meeshy(), to: friend(), type: 3, body: PREKEY_MESSAGE.body });

    expect(await peer.acknowledge({ recipient: friend(2), envelopeIds: [receipt.envelopeId] })).toBe(0);
    expect(await peer.receiveEnvelopes(friend())).toHaveLength(1);
  });

  it('une erreur de la porte ne recopie jamais ce qui a été soumis', async () => {
    const { peer } = gate();

    const error = await peer.deliverEnvelope({ from: meeshy(), to: friend(), type: 2, body: b64(PLAINTEXT) }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ExternalPeerError);
    expect(String((error as Error).message)).toBe(EXTERNAL_PEER_ERROR_CODES.PLAINTEXT_REFUSED);
    expect(JSON.stringify(error)).not.toContain(HANDLE);
  });
});

describe('pair externe — la distribution des pré-clés', () => {
  it('deux demandes simultanées ne reçoivent jamais la même pré-clé unique ; épuisées, aucune n’est servie', async () => {
    const { peer } = gate();
    await peer.publishPreKeyBundle(publication());

    const served = await Promise.all([1, 2, 3].map(() => peer.fetchPreKeyBundles({ side: 'external', network: 'whatsapp', handle: HANDLE })));
    const preKeyIds = served.map(([bundle]) => bundle.preKey?.keyId ?? null);

    expect([...preKeyIds].sort()).toEqual([1, 2, null]);
  });

  it('la pré-clé Kyber unique est servie une fois, puis la Kyber de dernier recours prend le relais', async () => {
    const { peer } = gate();
    await peer.publishPreKeyBundle(publication());
    const user = { side: 'external', network: 'whatsapp', handle: HANDLE } as const;

    const [first] = await peer.fetchPreKeyBundles(user);
    const [second] = await peer.fetchPreKeyBundles(user);

    expect(first.kyberPreKey).toEqual({ keyId: 1, publicKey: fakeKey(6), signature: fakeSignature(6), lastResort: false });
    expect(second.kyberPreKey).toEqual({ keyId: 1000, publicKey: fakeKey(3), signature: fakeSignature(3), lastResort: true });
    expect(second.identityKey).toBe(fakeKey(1));
    expect(second.registrationId).toBe(4242);
  });

  it('un appareil réinstallé (nouvelle registrationId) ne sert plus les pré-clés de l’ancien', async () => {
    const { peer } = gate();
    await peer.publishPreKeyBundle(publication());
    await peer.publishPreKeyBundle(publication({ registrationId: 77, oneTimePreKeys: [{ keyId: 9, publicKey: fakeKey(9) }], kyberPreKeys: [] }));

    const [bundle] = await peer.fetchPreKeyBundles({ side: 'external', network: 'whatsapp', handle: HANDLE });

    expect(bundle.registrationId).toBe(77);
    expect(bundle.preKey).toEqual({ keyId: 9, publicKey: fakeKey(9) });
    expect(bundle.kyberPreKey.lastResort).toBe(true);
  });

  it('chaque appareil d’un utilisateur a son bundle, et un utilisateur sans bundle est inconnu', async () => {
    const { peer } = gate();
    await peer.publishPreKeyBundle(publication());
    await peer.publishPreKeyBundle(publication({ party: friend(2), registrationId: 9 }));

    const bundles = await peer.fetchPreKeyBundles({ side: 'external', network: 'whatsapp', handle: HANDLE });

    expect(bundles.map((bundle) => bundle.deviceId)).toEqual([1, 2]);
    expect(await refusalCode(() => peer.fetchPreKeyBundles({ side: 'external', network: 'whatsapp', handle: '+33700000000' }))).toBe(
      EXTERNAL_PEER_ERROR_CODES.PEER_UNKNOWN,
    );
  });

  it('un bundle qui porte une clé privée est refusé, à toute profondeur', async () => {
    const { peer } = gate();
    const leaking = { ...publication(), signedPreKey: { keyId: 1, publicKey: fakeKey(2), signature: fakeSignature(2), privateKey: fakeKey(7) } };

    expect(await refusalCode(() => peer.publishPreKeyBundle(leaking))).toBe(EXTERNAL_PEER_ERROR_CODES.KEYS_FORBIDDEN);
    expect(await refusalCode(() => peer.fetchPreKeyBundles({ side: 'external', network: 'whatsapp', handle: HANDLE }))).toBe(
      EXTERNAL_PEER_ERROR_CODES.PEER_UNKNOWN,
    );
  });
});

describe('pair externe — les pièces opaques', () => {
  const blob = Buffer.from(Array.from({ length: 96 }, (_, index) => (index * 37) % 256));
  const digest = createHash('sha256').update(blob).digest('base64');

  it('une pièce chiffrée se dépose avec sa seule empreinte et se relit par son identifiant', async () => {
    const { peer } = gate();

    const ref = await peer.deliverAttachment({ uploader: meeshy(), digest, bytes: blob.toString('base64') });

    expect(ref.digest).toBe(digest);
    expect(await peer.fetchAttachment(ref.attachmentId)).toEqual({ digest, bytes: blob.toString('base64') });
  });

  it.each([
    ['fileName', 'vacances.jpg'],
    ['mimeType', 'image/jpeg'],
    ['duration', 12],
    ['thumbnail', 'AAAA'],
    ['transcription', PLAINTEXT],
  ])('une pièce qui porte « %s » à côté de ses octets est refusée', async (field, value) => {
    const { peer } = gate();

    expect(await refusalCode(() => peer.deliverAttachment({ uploader: meeshy(), digest, bytes: blob.toString('base64'), [field]: value } as never))).toBe(
      EXTERNAL_PEER_ERROR_CODES.INVALID,
    );
  });

  it('une empreinte qui ne correspond pas aux octets est refusée', async () => {
    const { peer } = gate();
    const wrong = createHash('sha256').update('autre chose').digest('base64');

    expect(await refusalCode(() => peer.deliverAttachment({ uploader: meeshy(), digest: wrong, bytes: blob.toString('base64') }))).toBe(
      EXTERNAL_PEER_ERROR_CODES.DIGEST_MISMATCH,
    );
  });

  it('une pièce inconnue est refusée', async () => {
    const { peer } = gate();

    expect(await refusalCode(() => peer.fetchAttachment('00000000-0000-4000-8000-000000000000'))).toBe(EXTERNAL_PEER_ERROR_CODES.ATTACHMENT_UNKNOWN);
  });
});
