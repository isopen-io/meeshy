/**
 * Le nom d'un participant du résumé d'appel se lit À LA LECTURE (#18242 B2).
 *
 * `Message.metadata` ne persiste que les `userId` : un nom figé ne suivrait ni
 * un renommage ni une purge. La passerelle compose le nom que la conversation
 * montre AUJOURD'HUI — l'ordre canonique de la passerelle : surnom de
 * conversation, copie du participant, nom du compte, « Prénom Nom », pseudo —
 * et sert « Compte supprimé » pour un compte purgé. Une requête par page.
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import { withCallSummaryParticipantNames } from '../callSummaryParticipantNames';

const CONV = '6650000000000000000000c1';
const OTHER_CONV = '6650000000000000000000c2';

type Account = {
  readonly displayName: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly username: string;
};

type ParticipantRow = {
  readonly conversationId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly nickname: string | null;
  readonly user: Account | null;
};

const account = (overrides: Partial<Account> = {}): Account => ({
  displayName: null,
  firstName: null,
  lastName: null,
  username: 'someone',
  ...overrides
});

const member = (userId: string, overrides: Partial<Omit<ParticipantRow, 'userId'>> = {}): ParticipantRow => ({
  conversationId: CONV,
  userId,
  displayName: '',
  nickname: null,
  user: account(),
  ...overrides
});

const summary = (participants: ReadonlyArray<Record<string, unknown>>, overrides: Record<string, unknown> = {}) => ({
  id: 'm-call',
  conversationId: CONV,
  content: 'Appel vidéo · 04:32',
  metadata: { kind: 'call', callId: 'c1', initiatorId: 'u_moi', outcome: 'completed', participants },
  ...overrides
});

const prismaWith = (rows: ReadonlyArray<ParticipantRow> | Error) => {
  const findMany = jest.fn(async (_args: unknown): Promise<ReadonlyArray<ParticipantRow>> => {
    if (rows instanceof Error) throw rows;
    return rows;
  });
  return { prisma: { participant: { findMany } } as never, findMany };
};

const servedOf = (row: { readonly metadata?: unknown }) =>
  (row.metadata as { readonly participants?: unknown }).participants;

describe('withCallSummaryParticipantNames — le nom suit le compte, jamais le message', () => {
  it('un participant RENOMMÉ après l\'appel est servi sous son nouveau nom — ancien résumé au nom figé compris', async () => {
    const { prisma } = prismaWith([
      member('u_awa', { displayName: 'Awa Renommée' }),
      member('u_karim', { displayName: 'Karim Nouveau' })
    ]);

    const [served] = await withCallSummaryParticipantNames(prisma, [
      summary([{ userId: 'u_awa' }, { userId: 'u_karim', displayName: 'Karim (nom figé)' }])
    ]);

    expect(servedOf(served)).toEqual([
      { userId: 'u_awa', displayName: 'Awa Renommée' },
      { userId: 'u_karim', displayName: 'Karim Nouveau' }
    ]);
  });

  it('un participant PURGÉ (non expéditeur) est servi « Compte supprimé », même s\'il gardait un surnom', async () => {
    const { prisma } = prismaWith([
      member('u_awa', { displayName: 'Compte supprimé', nickname: 'Awawa', user: account({ firstName: 'Compte', lastName: 'supprimé' }) })
    ]);

    const [served] = await withCallSummaryParticipantNames(prisma, [
      summary([{ userId: 'u_awa', displayName: 'Awa (nom figé)' }, { userId: 'u_disparu' }])
    ]);

    expect(servedOf(served)).toEqual([
      { userId: 'u_awa', displayName: 'Compte supprimé' },
      { userId: 'u_disparu', displayName: 'Compte supprimé' }
    ]);
  });

  it('compose le nom comme le reste de la conversation : surnom, copie du participant, compte, Prénom Nom, pseudo', async () => {
    const { prisma } = prismaWith([
      member('u_1', { nickname: 'Surnom', displayName: 'Copie', user: account({ displayName: 'Compte' }) }),
      member('u_2', { displayName: 'Copie 2', user: account({ displayName: 'Compte 2' }) }),
      member('u_3', { displayName: '  ', user: account({ displayName: 'Compte 3' }) }),
      member('u_4', { user: account({ firstName: 'Lina', lastName: 'Diallo' }) }),
      member('u_5', { user: account({ username: 'karim_k' }) })
    ]);

    const [served] = await withCallSummaryParticipantNames(prisma, [
      summary(['u_1', 'u_2', 'u_3', 'u_4', 'u_5'].map((userId) => ({ userId })))
    ]);

    expect((servedOf(served) as ReadonlyArray<{ displayName: string }>).map((entry) => entry.displayName))
      .toEqual(['Surnom', 'Copie 2', 'Compte 3', 'Lina Diallo', 'karim_k']);
  });

  it('UNE requête pour la page, bornée à ses conversations et à ses comptes, sans aucune coordonnée', async () => {
    const { prisma, findMany } = prismaWith([
      member('u_awa', { displayName: 'Awa' }),
      member('u_awa', { conversationId: OTHER_CONV, displayName: 'Awa ailleurs' })
    ]);

    const served = await withCallSummaryParticipantNames(prisma, [
      summary([{ userId: 'u_awa' }]),
      summary([{ userId: 'u_awa' }], { id: 'm-2', conversationId: OTHER_CONV })
    ]);

    expect(findMany).toHaveBeenCalledTimes(1);
    const query = findMany.mock.calls[0][0] as { where: unknown; select: unknown };
    expect(query.where).toEqual({ conversationId: { in: [CONV, OTHER_CONV] }, userId: { in: ['u_awa'] } });
    expect(JSON.stringify(query.select)).not.toMatch(/email|phone|password|isOnline|lastActiveAt/i);
    expect(served.map(servedOf)).toEqual([
      [{ userId: 'u_awa', displayName: 'Awa' }],
      [{ userId: 'u_awa', displayName: 'Awa ailleurs' }]
    ]);
  });

  it('laisse intacts les autres messages et ne lit rien quand la page ne porte aucun participant d\'appel', async () => {
    const { prisma, findMany } = prismaWith([]);
    const plain = { id: 'm-1', conversationId: CONV, metadata: { kind: 'member-joined', participantId: 'p' } };
    const live = { id: 'm-2', conversationId: CONV, metadata: { kind: 'call-live', callId: 'c' } };

    const served = await withCallSummaryParticipantNames(prisma, [plain, live, { id: 'm-3', conversationId: CONV }]);

    expect(served[0]).toBe(plain);
    expect(served[1]).toBe(live);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('une page sans `conversationId` par ligne (lien de partage) prend celui du lien', async () => {
    const { prisma, findMany } = prismaWith([member('u_awa', { displayName: 'Awa' })]);
    const { conversationId: _omitted, ...withoutConversation } = summary([{ userId: 'u_awa' }]);

    const [served] = await withCallSummaryParticipantNames(prisma, [withoutConversation], { conversationId: CONV });

    expect(servedOf(served)).toEqual([{ userId: 'u_awa', displayName: 'Awa' }]);
    expect((findMany.mock.calls[0][0] as { where: unknown }).where).toEqual({ conversationId: { in: [CONV] }, userId: { in: ['u_awa'] } });
  });

  it('une panne de lecture sert le résumé SANS la ligne — jamais un nom figé', async () => {
    const { prisma } = prismaWith(new Error('mongo down'));
    const stored = summary([{ userId: 'u_awa', displayName: 'Awa (nom figé)' }]);

    const [served] = await withCallSummaryParticipantNames(prisma, [stored]);

    expect('participants' in (served.metadata as object)).toBe(false);
    expect(served.metadata).toMatchObject({ kind: 'call', callId: 'c1', outcome: 'completed' });
    expect(served.content).toBe(stored.content);
  });
});
