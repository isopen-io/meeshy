/**
 * ÉPINGLER, c'est mettre un message en avant pour TOUS (#11219) : la même
 * porte que les actes dérivés d'un message (`admitDerivedConversationWrite`) —
 * conversation ouverte, rang d'écriture, canal d'annonces — plus la permission
 * d'envoi de l'invité. PUT et DELETE la partagent : désépingler est le même
 * geste à l'envers.
 *
 * @jest-environment node
 */

import { describe, expect, it, jest } from '@jest/globals';

import {
  admitMessagePin,
  isMessagePinRefused,
  type MessagePinReader,
} from '../../../../services/messaging/messagePinAdmission';
import type { ConversationWriteStateRow } from '../../../../services/messaging/conversationWriteAdmission';

const CONVERSATION_ID = '65f0000000000000000000c1';
const NOW = new Date('2026-10-20T12:00:00.000Z');

type PinnerRow = Awaited<ReturnType<MessagePinReader['participant']['findFirst']>>;

const pinner = (overrides: Partial<NonNullable<PinnerRow>> = {}): PinnerRow => ({
  role: 'member',
  permissions: null,
  anonymousSession: null,
  user: { role: 'USER' },
  ...overrides,
});

const readerOf = (row: PinnerRow) => {
  const findFirst = jest.fn(async () => row);
  return { prisma: { participant: { findFirst } } as unknown as MessagePinReader, findFirst };
};

const group = (overrides: Partial<ConversationWriteStateRow> = {}): ConversationWriteStateRow => ({
  type: 'group', isActive: true, closedAt: null, isAnnouncementChannel: false, defaultWriteRole: 'everyone', ...overrides,
});

const registered = { userId: '65f0000000000000000000a1', isAnonymous: false } as const;
const guest = { userId: '65f0000000000000000000b1', participantId: '65f0000000000000000000b1', isAnonymous: true } as const;

const admit = (conversation: ConversationWriteStateRow | null, row: PinnerRow, caller: { userId?: string; participantId?: string; isAnonymous: boolean } = registered) => {
  const { prisma, findFirst } = readerOf(row);
  return { verdict: admitMessagePin(prisma, { conversation, conversationId: CONVERSATION_ID, caller, now: NOW }), findFirst };
};

describe('admitMessagePin — le droit d’écrire, pour épingler comme pour désépingler (#11219)', () => {
  it('un groupe ouvert à tous : le membre épingle, sans qu’aucune ligne ne soit lue', async () => {
    const { verdict, findFirst } = admit(group(), pinner());
    expect(await verdict).toEqual({ admitted: true });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('un simple abonné d’un canal d’annonces n’épingle pas : 403', async () => {
    const result = await admit(group({ type: 'broadcast', isAnnouncementChannel: true }), pinner()).verdict;
    expect(isMessagePinRefused(result)).toBe(true);
    expect(result).toMatchObject({ admitted: false, status: 403 });
  });

  it('l’administrateur du canal et le staff de plateforme membre épinglent', async () => {
    const announcements = group({ type: 'broadcast', isAnnouncementChannel: true });
    expect(await admit(announcements, pinner({ role: 'admin' })).verdict).toEqual({ admitted: true });
    expect(await admit(announcements, pinner({ user: { role: 'MODERATOR' } })).verdict).toEqual({ admitted: true });
  });

  it('AUDIT et ANALYST valent un utilisateur ordinaire', async () => {
    const restricted = group({ defaultWriteRole: 'moderator' });
    expect(await admit(restricted, pinner({ user: { role: 'AUDIT' } })).verdict).toMatchObject({ admitted: false, status: 403 });
    expect(await admit(restricted, pinner({ user: { role: 'ANALYST' } })).verdict).toMatchObject({ admitted: false, status: 403 });
  });

  it('une écriture réservée aux modérateurs ferme l’épingle au membre', async () => {
    expect(await admit(group({ defaultWriteRole: 'moderator' }), pinner()).verdict).toMatchObject({ admitted: false, status: 403 });
    expect(await admit(group({ defaultWriteRole: 'moderator' }), pinner({ role: 'moderator' })).verdict).toEqual({ admitted: true });
  });

  it('une conversation close refuse en 410, sans dispense de rôle et sans rien lire', async () => {
    const { verdict, findFirst } = admit(group({ closedAt: new Date('2026-10-19T00:00:00.000Z') }), pinner({ role: 'creator', user: { role: 'BIGBOSS' } }));
    expect(await verdict).toMatchObject({ admitted: false, status: 410 });
    expect(findFirst).not.toHaveBeenCalled();
    expect(await admit(group({ isActive: false }), pinner()).verdict).toMatchObject({ admitted: false, status: 410 });
  });

  it('une participation introuvable sur un conteneur restreint refuse', async () => {
    expect(await admit(group({ isAnnouncementChannel: true }), null).verdict).toMatchObject({ admitted: false, status: 403 });
  });

  it('un tête-à-tête n’a pas de hiérarchie : un canal d’annonces empoisonné n’y ferme rien', async () => {
    expect(await admit(group({ type: 'direct', isAnnouncementChannel: true }), pinner()).verdict).toEqual({ admitted: true });
  });

  it('un invité sans permission d’envoi n’épingle pas, même dans un groupe ouvert', async () => {
    const muted = pinner({ user: null, permissions: { canSendMessages: false } as never });
    expect(await admit(group(), muted, guest).verdict).toMatchObject({ admitted: false, status: 403, code: 'WRITE_NOT_PERMITTED' });
    expect(await admit(group(), pinner({ user: null }), guest).verdict).toEqual({ admitted: true });
  });

  it('l’invité est cherché par sa ligne de participation, jamais par un userId', async () => {
    const { verdict, findFirst } = admit(group(), pinner({ user: null }), guest);
    await verdict;
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ conversationId: CONVERSATION_ID, id: guest.participantId }) }));
  });
});
