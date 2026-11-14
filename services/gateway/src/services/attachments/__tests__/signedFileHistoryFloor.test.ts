/**
 * #18470 — une adresse signée VALIDE pour un lecteur ne lui ouvre pas un fichier
 * que son plancher d'historique lui ferme : une réponse qui cite une photo
 * d'avant son arrivée lui remet l'adresse, la route ne lui rend pas les octets.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../fileRouteVerdict', () => ({
  resolveFileRouteVerdict: async () => ({ kind: 'serve', cacheControl: 'private, no-store', readerBound: true }),
}));

import { resolveSignedFileAccess } from '../readerFileGate';
import { readerFileUrlSigner } from '../readerFileSignature';

const PIECE = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const MESSAGE = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const CONVERSATION = 'dddddddddddddddddddddd01';
const READER = 'cccccccccccccccccccccc01';
const STORAGE_KEY = '2026/10/68f2a81417a557e8ce4ddfc1/photo.jpg';
const NOW = new Date('2026-10-08T10:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const keys = { current: Buffer.alloc(32, 7), previous: null };

const tokenFor = (reader: string): string => {
  const signer = readerFileUrlSigner({ keys, now: NOW });
  if (!signer) throw new Error('signer');
  const path = signer.sign({ storageKey: STORAGE_KEY, attachmentId: PIECE, readerParticipantId: reader });
  const [token] = path.split('/signed/')[1].split('/');
  return token;
};

const prismaFor = (participant: Record<string, unknown>) => ({
  messageAttachment: { findUnique: async () => ({ messageId: MESSAGE, isViewOnce: false }) },
  message: {
    findUnique: async () => ({
      conversationId: CONVERSATION,
      deletedAt: null,
      viewOnceBurnAt: null,
      viewOnceBurnedAt: null,
      senderId: 'cccccccccccccccccccccc02',
      createdAt: ago(3_600_000),
      expiresAt: null,
      isViewOnce: false,
      effectFlags: 0,
      ephemeralDuration: null,
    }),
  },
  participant: { findFirst: async () => ({ id: READER, shareLinkId: null, ...participant }) },
  messageStatusEntry: { findFirst: async () => null },
  conversationShareLink: { findMany: async () => [], findUnique: async () => null },
});

const access = (participant: Record<string, unknown>) =>
  resolveSignedFileAccess(prismaFor(participant) as never, { token: tokenFor(READER), storageKey: STORAGE_KEY, keys, now: NOW });

describe('resolveSignedFileAccess — le plancher d’historique ferme une adresse signée valide (#18470)', () => {
  it('refuse le lecteur arrivé APRÈS le message porteur, historique fermé', async () => {
    expect(await access({ joinedAt: ago(60_000), permissions: { canViewHistory: false } })).toEqual({ kind: 'refuse', reason: 'reader:gone' });
  });

  it('refuse le lecteur dont l’octroi par date est postérieur au message porteur', async () => {
    expect(await access({ joinedAt: ago(60_000), historyVisibleFrom: ago(60_000) })).toEqual({ kind: 'refuse', reason: 'reader:gone' });
  });

  it('sert le lecteur sans plancher, et celui dont le plancher précède le message', async () => {
    expect(await access({ joinedAt: ago(60_000) })).toEqual({ kind: 'serve', cacheControl: 'private, no-store' });
    expect(await access({ joinedAt: ago(7_200_000), permissions: { canViewHistory: false } })).toEqual({ kind: 'serve', cacheControl: 'private, no-store' });
  });
});
