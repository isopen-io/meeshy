/**
 * #18556 — la ligne de liste d'un éphémère se juge à l'échéance de CHAQUE
 * lecteur, lue en une requête pour toute l'audience.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { loadPreviewReaderDeadlines, PREVIEW_DEADLINE_SCAN_CAP } from '../previewReaderDeadlines';
import { matchesMongoWhere, type MongoDocument } from '../../../__tests__/helpers/mongo-where';

const D_READER = new Date('2026-11-14T11:50:00.000Z');
const D_PEER = new Date('2026-11-14T11:55:00.000Z');

const duration = {
  id: 'm-1',
  senderId: 'p-sender',
  ephemeralDuration: 30,
  effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL,
  expiresAt: new Date('2026-11-21T12:00:00.000Z'),
  createdAt: new Date('2026-11-14T11:00:00.000Z'),
};

function prismaOf(entries: MongoDocument[]) {
  return {
    messageStatusEntry: {
      findMany: jest.fn(async (args: { where: MongoDocument }) => entries.filter((e) => matchesMongoWhere(e, args.where))),
    },
  };
}

describe('loadPreviewReaderDeadlines (#18556)', () => {
  it('rend D(u) à chaque destinataire et max D(u) à l’expéditeur, en une requête', async () => {
    const prisma = prismaOf([
      { messageId: 'm-1', participantId: 'p-reader', ephemeralExpiresAt: D_READER },
      { messageId: 'm-1', participantId: 'p-peer', ephemeralExpiresAt: D_PEER },
    ]);

    const deadlines = await loadPreviewReaderDeadlines(prisma as never, [
      { participantId: 'p-reader', message: duration },
      { participantId: 'p-peer', message: duration },
      { participantId: 'p-sender', message: duration },
      { participantId: 'p-late', message: duration },
    ]);

    expect(deadlines.get('p-reader')).toEqual(D_READER);
    expect(deadlines.get('p-peer')).toEqual(D_PEER);
    expect(deadlines.get('p-sender')).toEqual(D_PEER);
    expect(deadlines.get('p-late')).toBeUndefined();
    expect(prisma.messageStatusEntry.findMany).toHaveBeenCalledTimes(1);
  });

  it('l’AUTEUR d’une flamme-œil reçoit le feu qui lui a été annoncé — sa propre ligne — et rien tant qu’il ne l’est pas (#18556)', async () => {
    const flame = { ...duration, id: 'm-flame', ephemeralDuration: null, effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ };
    const BURNT = new Date('2026-11-14T11:57:00.000Z');
    const pending = prismaOf([{ messageId: 'm-flame', participantId: 'p-reader', ephemeralExpiresAt: D_READER }]);
    const announced = prismaOf([
      { messageId: 'm-flame', participantId: 'p-reader', ephemeralExpiresAt: D_READER },
      { messageId: 'm-flame', participantId: 'p-sender', ephemeralExpiresAt: BURNT },
    ]);
    const readers = [
      { participantId: 'p-reader', message: flame },
      { participantId: 'p-sender', message: flame },
    ];

    expect((await loadPreviewReaderDeadlines(pending as never, readers)).get('p-sender')).toBeUndefined();
    const deadlines = await loadPreviewReaderDeadlines(announced as never, readers);
    expect(deadlines.get('p-sender')).toEqual(BURNT);
    expect(deadlines.get('p-reader')).toEqual(D_READER);
  });

  it('une tranche PLEINE ne coûte pas sa ligne à un lecteur servi : elle est relue par son couple (#18556)', async () => {
    const strangers = Array.from({ length: PREVIEW_DEADLINE_SCAN_CAP }, (_, index) => ({
      messageId: 'm-1',
      participantId: `p-stranger-${index}`,
      ephemeralExpiresAt: D_PEER,
    }));
    const prisma = prismaOf([...strangers, { messageId: 'm-1', participantId: 'p-reader', ephemeralExpiresAt: D_READER }]);
    prisma.messageStatusEntry.findMany.mockImplementationOnce(async () => strangers);

    const deadlines = await loadPreviewReaderDeadlines(prisma as never, [{ participantId: 'p-reader', message: duration }]);

    expect(deadlines.get('p-reader')).toEqual(D_READER);
    expect(prisma.messageStatusEntry.findMany).toHaveBeenCalledTimes(2);
  });

  it('ne lit rien quand aucun aperçu n’est un éphémère', async () => {
    const prisma = prismaOf([]);

    const deadlines = await loadPreviewReaderDeadlines(prisma as never, [
      { participantId: 'p-reader', message: { ...duration, ephemeralDuration: null, effectFlags: 0 } },
    ]);

    expect(deadlines.size).toBe(0);
    expect(prisma.messageStatusEntry.findMany).not.toHaveBeenCalled();
  });

  it('une lecture qui échoue rend l’IGNORANCE (null), jamais « aucune échéance », et le dit', async () => {
    const prisma = prismaOf([]);
    prisma.messageStatusEntry.findMany.mockRejectedValueOnce(new Error('mongo down'));
    const onError = jest.fn();

    const deadlines = await loadPreviewReaderDeadlines(prisma as never, [{ participantId: 'p-reader', message: duration }], onError);

    expect(deadlines).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
