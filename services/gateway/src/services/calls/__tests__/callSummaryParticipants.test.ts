/**
 * Qui a PRIS PART à l'appel, pour la carte du fil (#17868, #18242 B1).
 *
 * iOS et Android émettent `call:join` dès la SONNERIE : une ligne
 * `CallParticipant` existe pour qui a seulement sonné, et un refus la ferme
 * (`leftAt`). `CallSession.answeredAt` est porté par l'appel entier : un seul
 * décroché ne fait entrer personne d'autre. Seul `CallParticipant.answeredAt`
 * dit qui a décroché ; l'initiateur d'un appel décroché compte. Un DUO
 * décroché compte ses deux bouts (seul le destinataire peut y décrocher), et un
 * appel dont aucune ligne ne porte la clé garde la liste d'avant — sans horloge
 * (#18242 B-1).
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockWarn = jest.fn();
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: mockWarn, error: jest.fn(), debug: jest.fn() }
}));

import { resolveCallSummaryParticipantIds } from '../callSummaryParticipants';
import { findManyIn, type MongoDocument } from '../../../__tests__/helpers/mongo-where';

const CALL = '64b7f0c2a1b2c3d4e5f60718';
const RING = new Date('2026-11-14T10:00:00.000Z');
const ANSWER = new Date('2026-11-14T10:00:05.000Z');
const LATER = new Date('2026-11-14T10:03:00.000Z');

type Line = {
  readonly role?: 'initiator' | 'participant';
  readonly answeredAt?: Date | null;
  readonly leftAt?: Date | null;
};

/**
 * Une ligne `CallParticipant` telle que MongoDB la garde : `answeredAt: null`
 * quand le code qui marque l'a créée, la clé ABSENTE quand elle vient d'avant
 * le champ (ou d'un réplica ancien) — `{ answeredAt: undefined }` l'omet.
 */
const row = (userId: string | null, line: Line = {}, order = 0): MongoDocument => {
  const { answeredAt, ...rest } = { role: 'participant' as const, answeredAt: null, leftAt: null, ...line };
  return {
    id: `line-${userId ?? 'sans-compte'}-${order}`,
    callSessionId: CALL,
    joinedAt: new Date(RING.getTime() + order),
    ...rest,
    ...(answeredAt === undefined ? {} : { answeredAt }),
    participant: { userId }
  };
};

const initiator = (line: Line = {}): MongoDocument => row('u_moi', { role: 'initiator', ...line });

const prismaWith = (rows: ReadonlyArray<MongoDocument> | Error) => {
  const documents = findManyIn(rows instanceof Error ? [] : rows);
  const findMany = jest.fn((args: Parameters<typeof documents.findMany>[0]) =>
    rows instanceof Error ? Promise.reject(rows) : documents.findMany(args)
  );
  return { prisma: { callParticipant: { findMany } } as never, findMany };
};

const groupCall = { id: CALL, answeredAt: ANSWER, invitedUserIds: [], conversation: { type: 'group' } };
const duoCall = { id: CALL, answeredAt: new Date('2026-11-20T10:00:05.000Z'), invitedUserIds: [], conversation: { type: 'direct' } };

describe('resolveCallSummaryParticipantIds — seuls ceux qui ont DÉCROCHÉ', () => {
  beforeEach(() => mockWarn.mockClear());

  it('groupe de trois : Karim rejoint à la sonnerie puis refuse, Awa décroche ⇒ Karim absent', async () => {
    const { prisma } = prismaWith([
      initiator(),
      row('u_karim', { leftAt: RING }, 1),
      row('u_awa', { answeredAt: ANSWER }, 2)
    ]);

    expect(await resolveCallSummaryParticipantIds(prisma, groupCall)).toEqual(['u_moi', 'u_awa']);
  });

  it('une sonnerie IGNORÉE pendant que les autres parlent ne fait pas un participant', async () => {
    const { prisma } = prismaWith([
      initiator({ answeredAt: ANSWER }),
      row('u_karim', {}, 1),
      row('u_awa', { answeredAt: ANSWER }, 2)
    ]);

    expect(await resolveCallSummaryParticipantIds(prisma, groupCall)).toEqual(['u_moi', 'u_awa']);
  });

  it('un refus TARDIF (après le décroché d\'Awa) ne fait pas un participant', async () => {
    const { prisma } = prismaWith([
      initiator(),
      row('u_awa', { answeredAt: ANSWER }, 1),
      row('u_karim', { leftAt: LATER }, 2)
    ]);

    expect(await resolveCallSummaryParticipantIds(prisma, groupCall)).toEqual(['u_moi', 'u_awa']);
  });

  it('garde l\'ordre d\'arrivée et lit dans l\'ordre de `joinedAt`', async () => {
    const { prisma, findMany } = prismaWith([
      row('u_awa', { answeredAt: ANSWER }, 2),
      initiator(),
      row('u_lina', { answeredAt: LATER }, 1)
    ]);

    expect(await resolveCallSummaryParticipantIds(prisma, groupCall)).toEqual(['u_moi', 'u_lina', 'u_awa']);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { callSessionId: CALL },
      orderBy: { joinedAt: 'asc' }
    }));
  });

  it('un appel jamais décroché n\'a aucun participant à nommer, et ne lit rien', async () => {
    const { prisma, findMany } = prismaWith([initiator(), row('u_karim')]);

    expect(await resolveCallSummaryParticipantIds(prisma, { ...groupCall, answeredAt: null })).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('B-1 — un DUO décroché nomme les deux bouts, même quand aucune ligne ne porte la marque (promotion tardive, écriture perdue, réplica ancien)', async () => {
    const { prisma } = prismaWith([initiator({ answeredAt: undefined }), row('u_karim', { answeredAt: undefined }, 1)]);

    expect(await resolveCallSummaryParticipantIds(prisma, duoCall)).toEqual(['u_moi', 'u_karim']);
  });

  it('B-1 — un DUO décroché nomme les deux bouts quand la marque du destinataire s\'est perdue (lignes du nouveau code, `answeredAt: null`)', async () => {
    const { prisma } = prismaWith([initiator(), row('u_karim', {}, 1)]);

    expect(await resolveCallSummaryParticipantIds(prisma, duoCall)).toEqual(['u_moi', 'u_karim']);
  });

  it('un duo où quelqu\'un a été INVITÉ n\'est plus un duo : la sonnerie refusée ne compte pas', async () => {
    const { prisma } = prismaWith([initiator(), row('u_karim', { leftAt: RING }, 1), row('u_awa', { answeredAt: ANSWER }, 2)]);

    expect(await resolveCallSummaryParticipantIds(prisma, { ...duoCall, invitedUserIds: ['u_awa'] })).toEqual(['u_moi', 'u_awa']);
  });

  it('un appel NON SUIVI (aucune ligne ne porte la clé) garde la liste d\'avant, quelle que soit sa date, sans alerte', async () => {
    const { prisma } = prismaWith([
      initiator({ answeredAt: undefined }),
      row('u_karim', { answeredAt: undefined }, 1),
      row('u_awa', { answeredAt: undefined }, 2)
    ]);

    expect(await resolveCallSummaryParticipantIds(prisma, { ...groupCall, answeredAt: new Date('2026-12-01T10:00:00.000Z') })).toEqual(['u_moi', 'u_karim', 'u_awa']);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('un appel SUIVI sans aucune ligne marquée ne retombe PAS sur l\'ancienne liste : l\'initiateur seul, et une alerte à l\'écriture du résumé', async () => {
    const { prisma } = prismaWith([initiator(), row('u_karim', {}, 1), row('u_awa', { answeredAt: undefined }, 2)]);

    expect(await resolveCallSummaryParticipantIds(prisma, groupCall)).toEqual(['u_moi']);
    expect(mockWarn).toHaveBeenCalledWith(expect.stringMatching(/answered call has a participant without an answer mark/i), expect.objectContaining({ callId: CALL }));
  });

  it('#18453 — un appel de groupe suivi et décroché normalement (Karim a sonné, Awa a décroché) n\'alerte pas', async () => {
    const { prisma } = prismaWith([initiator({ answeredAt: ANSWER }), row('u_karim', {}, 1), row('u_awa', { answeredAt: ANSWER }, 2)]);

    expect(await resolveCallSummaryParticipantIds(prisma, groupCall)).toEqual(['u_moi', 'u_awa']);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('#18453 — lignes MIXTES (une ligne d\'avant le champ dans un appel suivi) : la ligne sans la clé sort de la liste, et l\'alerte le dit', async () => {
    const { prisma } = prismaWith([initiator({ answeredAt: ANSWER }), row('u_karim', { answeredAt: undefined }, 1), row('u_awa', { answeredAt: ANSWER }, 2)]);

    expect(await resolveCallSummaryParticipantIds(prisma, groupCall)).toEqual(['u_moi', 'u_awa']);
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringMatching(/answered call has a participant without an answer mark/i),
      expect.objectContaining({ callId: CALL, missing: ['lines-without-answer-key'] })
    );
  });

  it('#18453 — un duo devenu groupe (Awa invitée, jamais venue) puis revenu à deux : Karim seul a pu décrocher, sa marque manque, l\'alerte le dit même si l\'initiateur est marqué', async () => {
    const { prisma } = prismaWith([initiator({ answeredAt: ANSWER }), row('u_karim', {}, 1)]);

    expect(await resolveCallSummaryParticipantIds(prisma, { ...duoCall, invitedUserIds: ['u_awa'] })).toEqual(['u_moi']);
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringMatching(/answered call has a participant without an answer mark/i),
      expect.objectContaining({ callId: CALL, duo: false, missing: ['no-answerer-marked'] })
    );
  });

  it('écarte une ligne sans compte, une ligne orpheline et le second appareil d\'un même compte', async () => {
    const { prisma } = prismaWith([
      initiator(),
      row(null, { answeredAt: ANSWER }, 1),
      { ...row('u_x', {}, 2), participant: null },
      row('u_awa', { answeredAt: ANSWER }, 3),
      row('u_awa', { answeredAt: LATER }, 4)
    ]);

    expect(await resolveCallSummaryParticipantIds(prisma, groupCall)).toEqual(['u_moi', 'u_awa']);
  });

  it('ne demande que le compte : ni nom, ni e-mail, ni numéro', async () => {
    const { prisma, findMany } = prismaWith([initiator()]);

    await resolveCallSummaryParticipantIds(prisma, groupCall);

    expect(JSON.stringify(findMany.mock.calls)).not.toMatch(/displayName|email|phone|password/i);
  });

  it('une panne de lecture REMONTE : c\'est l\'appelant qui décide de reprendre ou de servir sans la ligne', async () => {
    const { prisma } = prismaWith(new Error('mongo down'));

    await expect(resolveCallSummaryParticipantIds(prisma, groupCall)).rejects.toThrow('mongo down');
  });
});
