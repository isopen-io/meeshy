/**
 * Audit #9629 (1) — un avis de capture n'est pas un contenu. On ne le cite, ne
 * le transfère, ne le met en favori ni ne l'épingle — pour personne : chacun de
 * ces gestes le ferait voyager hors de son audience. Réagir lui était déjà
 * refusé (`ReactionService` refuse tout message système).
 *
 * Et chaque lecture PAR IDENTIFIANT passe par `captureNoticeWithheldFrom` :
 * le témoin de comportement de `GET /messages/:id` vit dans
 * `routes/capture-notice-by-id-and-retention.test.ts` ; celui-ci compte les
 * appels dans chaque route et rougit si l'un disparaît.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('../../../../services/messaging/messageReadAccess', () => ({
  ...(jest.requireActual('../../../../services/messaging/messageReadAccess') as object),
  loadMessageReadableByParticipant: async () => ({ id: 'notice', conversationId: 'conv' }),
  readerMayReadMessage: async () => true,
}));

import { admitAttachmentReply } from '../../../../services/messaging/attachmentReplySnapshot';
import { admitMessageForward } from '../../../../services/messaging/forwardAdmission';
import { MessageStarWriter } from '../../../../services/messaging/messageStars/MessageStarWriter';

const CONV = 'conv';
const NOTICE = {
  id: 'notice',
  conversationId: CONV,
  senderId: 'p-capturer',
  deletedAt: null,
  createdAt: new Date('2026-10-08T10:05:00.000Z'),
  messageType: 'system',
  metadata: { kind: 'content-capture', capturedMessageId: 'captured' },
  isViewOnce: false,
  isBlurred: false,
  isEncrypted: false,
  effectFlags: 0,
  ephemeralDuration: null,
  expiresAt: new Date('2026-10-16T10:00:00.000Z'),
  attachments: [],
  _count: { attachments: 0 },
};
const PLAIN = { ...NOTICE, id: 'plain', messageType: 'text', metadata: null, expiresAt: null };

const prismaWith = (row: typeof NOTICE) => ({
  message: { findUnique: jest.fn<any>().mockResolvedValue(row) },
  messageAttachment: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  messageStar: { create: jest.fn<any>().mockResolvedValue({ conversationId: CONV, createdAt: new Date() }) },
});

describe('un avis de capture ne se cite pas', () => {
  it('refuse la réponse qui le cite, admet celle qui cite un message ordinaire', async () => {
    expect((await admitAttachmentReply(prismaWith(NOTICE) as never, { conversationId: CONV, replyToId: 'notice' })).ok).toBe(false);
    expect((await admitAttachmentReply(prismaWith(PLAIN) as never, { conversationId: CONV, replyToId: 'plain' })).ok).toBe(true);
  });
});

describe('un avis de capture ne se transfère pas', () => {
  it('refuse le transfert d’un avis comme une source introuvable, admet celui d’un message ordinaire', async () => {
    const params = { forwardedFromId: 'notice', senderParticipantId: 'p-capturer', at: new Date(), bodyOnlyFromSource: true };
    expect(await admitMessageForward(prismaWith(NOTICE) as never, params)).toEqual({ admitted: false, reason: 'forward-source-unavailable' });
    expect((await admitMessageForward(prismaWith(PLAIN) as never, { ...params, forwardedFromId: 'plain', bodyOnlyFromSource: false })).admitted).toBe(true);
  });
});

describe('un avis de capture ne se met pas en favori', () => {
  it('rend « non mis en favori » pour un avis, pose l’étoile sur un message ordinaire', async () => {
    expect(await new MessageStarWriter(prismaWith(NOTICE) as never).star('u-1', 'notice')).toEqual({ kind: 'not-starrable' });
    expect((await new MessageStarWriter(prismaWith(PLAIN) as never).star('u-1', 'plain')).kind).toBe('starred');
  });
});

describe('chaque lecture par identifiant et chaque épingle passent par la loi', () => {
  const ROUTES = join(__dirname, '../../../../routes');
  const count = (file: string, needle: string) => readFileSync(join(ROUTES, file), 'utf8').split(needle).length - 1;

  it.each([
    ['messages-reads.ts', 'captureNoticeWithheldFrom(prisma', 3],
    ['conversations/receipts.ts', 'captureNoticeWithheldFrom(ctx.prisma', 1],
    ['reactions.ts', 'captureNoticeWithheldFrom(prisma', 1],
    ['mentions.ts', 'captureNoticeWithheldFrom(prisma', 1],
    ['conversations/threads.ts', 'captureNoticeWithheldFrom(prisma', 1],
    ['conversations/messages-pin.ts', 'refusesContentGesture(message)', 1],
    ['conversations/messages-pin.ts', 'withoutCaptureNotices({ conversationId, pinnedAt', 1],
  ])('%s appelle %s (%i fois)', (file, needle, times) => {
    expect(count(file, needle)).toBe(times);
  });
});
