/**
 * #14105 — le plafond QUOTIDIEN des personnes choisies SANS LIEN par auteur.
 *
 * Choisir quelqu'un pour un post `ONLY` lui ouvre le post ; s'il n'a aucun lien
 * avec l'auteur (ni Connaissance et plus, ni conversation directe), rien ne le
 * lui pousse, et il compte à ce plafond. Au-delà, la publication est REFUSÉE
 * (429 clair) sans débiter : l'auteur retire ces personnes ou attend.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { FastifyInstance } from 'fastify';
import { relationPairKey } from '@meeshy/shared/types/relation';

jest.mock('../../../utils/logger-enhanced', () =>
  require('../../../__tests__/helpers/notification-service-doubles').makeLoggerEnhancedModule()
);

import { relationStore } from '../../../__tests__/helpers/user-relation-store';
import {
  ONLY_UNLINKED_DAILY_CAP,
  releaseOnlyUnlinkedBudget,
  spendOnlyUnlinkedBudget,
} from '../onlyUnlinkedBudget';

const AUTEUR = '6100000000000000000000a1';
const CONNAISSANCE = '6100000000000000000000b1';
const CORRESPONDANT = '6100000000000000000000b2';
const SILENCIEUX = '6100000000000000000000b3';
const inconnu = (i: number) => `62${String(i).padStart(22, '0')}`;

function monde(options: { directsDown?: boolean } = {}) {
  const store = relationStore({
    relations: [
      {
        id: 'aa0000000000000000000001',
        ...relationPairKey(AUTEUR, CONNAISSANCE),
        grantedByLow: 'ACQUAINTANCE',
        grantedByHigh: 'ACQUAINTANCE',
        transitions: [],
        updatedAt: new Date(2026, 9, 1),
      },
    ],
    friendRequests: [],
  });
  const directs = [
    { id: 'p-a1', userId: AUTEUR, conversationId: 'dm-1' },
    { id: 'p-b2', userId: CORRESPONDANT, conversationId: 'dm-1' },
    { id: 'p-a2', userId: AUTEUR, conversationId: 'dm-2' },
    { id: 'p-b3', userId: SILENCIEUX, conversationId: 'dm-2' },
  ];
  const messages = [{ senderId: 'p-b2' }, { senderId: 'p-a2' }];
  const prisma = {
    ...store.prisma,
    participant: {
      findMany: async (args: { where: { userId: string | { in: string[] }; conversationId?: { in: string[] } } }) => {
        if (options.directsDown) throw new Error('mongo down');
        const { userId, conversationId } = args.where;
        if (typeof userId === 'string') return directs.filter((row) => row.userId === userId);
        return directs.filter((row) => userId.in.includes(row.userId) && (conversationId?.in ?? []).includes(row.conversationId));
      },
    },
    message: {
      findMany: async (args: { where: { senderId: { in: string[] } } }) =>
        messages.filter((row) => args.where.senderId.in.includes(row.senderId)),
    },
  };
  const fastify = { server: {}, redis: null } as unknown as FastifyInstance;
  const depenser = (chosenIds: string[], previouslyChosen: string[] = []) =>
    spendOnlyUnlinkedBudget({ fastify, prisma: prisma as never, authorId: AUTEUR, chosenIds, previouslyChosen });
  const rendre = (unlinked: number) => releaseOnlyUnlinkedBudget({ fastify, authorId: AUTEUR, unlinked });
  return { depenser, rendre };
}

const foule = (from: number, n: number) => Array.from({ length: n }, (_, i) => inconnu(from + i));

describe('le plafond quotidien des choisis sans lien (#14105)', () => {
  it('vaut 50 par jour et par auteur', () => {
    expect(ONLY_UNLINKED_DAILY_CAP).toBe(50);
  });

  it('les choisis LIÉS (Connaissance, conversation directe) ne comptent pas', async () => {
    const { depenser } = monde();
    const verdict = await depenser([CONNAISSANCE, CORRESPONDANT]);
    expect(verdict).toEqual({ allowed: true, retryAfter: 0, unlinked: 0 });
  });

  it('une conversation directe où la personne n’a JAMAIS écrit n’est pas un lien', async () => {
    const { depenser } = monde();
    expect((await depenser([SILENCIEUX])).unlinked).toBe(1);
  });

  it('des publications CONCURRENTES ne franchissent jamais le plafond ensemble', async () => {
    const { depenser } = monde();
    const verdicts = await Promise.all(Array.from({ length: 10 }, (_, i) => depenser(foule(i * 50, 50))));
    const admis = verdicts.filter((v) => v.allowed).reduce((total, v) => total + v.unlinked, 0);
    expect(admis).toBe(ONLY_UNLINKED_DAILY_CAP);
  });

  it('un débit RENDU (publication échouée en aval) se dépense de nouveau', async () => {
    const { depenser, rendre } = monde();
    expect((await depenser(foule(0, 50))).allowed).toBe(true);
    await rendre(50);
    expect((await depenser(foule(50, 50))).allowed).toBe(true);
  });

  it('jusqu’au plafond, la publication passe ; au-delà, elle est refusée sans débiter', async () => {
    const { depenser } = monde();
    expect((await depenser(foule(0, 30))).allowed).toBe(true);
    const refus = await depenser(foule(30, 21));
    expect(refus.allowed).toBe(false);
    expect(refus.unlinked).toBe(21);
    expect(refus.retryAfter).toBeGreaterThan(0);
    expect((await depenser(foule(30, 20))).allowed).toBe(true);
    expect((await depenser([inconnu(99)])).allowed).toBe(false);
    expect((await depenser([CONNAISSANCE])).allowed).toBe(true);
  });

  it('un choisi DÉJÀ choisi (édition du post) ne compte pas une seconde fois', async () => {
    const { depenser } = monde();
    expect((await depenser(foule(0, 50))).allowed).toBe(true);
    expect((await depenser([...foule(0, 50), CONNAISSANCE], foule(0, 50))).allowed).toBe(true);
  });

  it('une lecture de lien en panne compte chaque choisi comme sans lien', async () => {
    const { depenser } = monde({ directsDown: true });
    expect((await depenser([CONNAISSANCE])).unlinked).toBe(1);
  });
});
