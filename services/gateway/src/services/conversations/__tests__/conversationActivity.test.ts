/**
 * **TOUTE ACTIVITÉ REMONTE LA CONVERSATION EN TÊTE, POUR TOUS** (#9026).
 *
 * `recordConversationActivity` écrit `Conversation.lastActivityAt` de façon
 * MONOTONE (une activité plus ancienne, arrivée en retard, ne recule jamais la
 * ligne) ; `announceConversationActivity` l'écrit puis sert le rang à chaque
 * participant par `conversation:updated`. Best-effort : l'action est déjà
 * commise, une panne se journalise et ne lève jamais.
 *
 * ─── Pourquoi le double ÉVALUE le `where` contre des documents (#19800) ──────
 *
 * Le double de ce fichier appliquait le `where` À LA MAIN, et son type de ligne
 * — `{ lastActivityAt: Date | null }` — ne savait pas REPRÉSENTER l'état
 * nominal : une conversation dont la colonne est ABSENTE, ce que les TREIZE
 * chemins de création du dépôt produisent tous, aucun n'écrivant
 * `Conversation.lastActivityAt`. Sa
 * branche `filter === null ⇒ current === null` tenait donc l'absence pour une
 * égalité, ce que MongoDB ne fait pas, et les cinq alimenteurs de l'axe
 * « activité » ont été inertes POUR TOUTES LES CONVERSATIONS avec six témoins
 * verts au-dessus.
 *
 * Les lignes sont désormais des documents nus et le `where` est évalué par
 * `matchesMongoWhere`, le double qui honore la seule règle qui compte ici : une
 * clé absente de l'objet est absente du document.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

import { announceConversationActivity, recordConversationActivity } from '../conversationActivity';
import { matchesMongoWhere, type MongoDocument } from '../../../__tests__/helpers/mongo-where';

const CONVERSATION_ID = '507f1f77bcf86cd799439011';
const AT = new Date('2026-10-01T10:00:00.000Z');
const LAST_MESSAGE_AT = new Date('2026-10-01T09:00:00.000Z');

type Emitted = { room: string; event: string; payload: Record<string, unknown> };

/**
 * Le document d'une conversation, tel que la base le porte. La forme NOMINALE
 * — celle que produisent les TREIZE chemins de création du dépôt — n'a PAS de clé
 * `lastActivityAt` : `absente()` la rend, `nulle()` rend l'autre « pas encore »,
 * celui qu'un chemin a explicitement remis à zéro.
 */
type Row = MongoDocument & { lastActivityAt?: Date | null };

const absente = (): Row => ({ id: CONVERSATION_ID, lastMessageAt: LAST_MESSAGE_AT });
const nulle = (): Row => ({ id: CONVERSATION_ID, lastMessageAt: LAST_MESSAGE_AT, lastActivityAt: null });
const datee = (at: Date): Row => ({ id: CONVERSATION_ID, lastMessageAt: LAST_MESSAGE_AT, lastActivityAt: at });

const lue = (row: Row): Date | null => (row.lastActivityAt ?? null);

/** Un Prisma qui ÉVALUE le `where` monotone contre le document en mémoire. */
function makePrisma(row: Row) {
  const updateMany = jest.fn(async (args: { where: MongoDocument; data: MongoDocument }) => {
    if (!matchesMongoWhere(row, args.where)) return { count: 0 };
    Object.assign(row, args.data);
    return { count: 1 };
  });
  return {
    conversation: {
      updateMany,
      findUnique: jest.fn(async () => ({
        lastReactionId: null,
        activeCallId: null,
        lastMessageAt: LAST_MESSAGE_AT,
        lastActivityAt: lue(row),
      })),
    },
    message: { findUnique: jest.fn(async () => null) },
    reaction: { findUnique: jest.fn(async () => null) },
    callSession: { findUnique: jest.fn(async () => null) },
    participant: {
      findMany: jest.fn(async () => [
        { id: 'p-bob', userId: 'u-bob', joinedAt: new Date('2026-01-01'), user: { systemLanguage: 'fr', role: 'USER' } },
        { id: 'p-guest', userId: null, joinedAt: new Date('2026-01-01'), user: null },
      ]),
    },
    conversationShareLink: { findMany: jest.fn(async () => []) },
  };
}

const makeIo = (sink: Emitted[]) => ({
  to: (room: string) => ({
    emit: (event: string, payload: Record<string, unknown>) => {
      sink.push({ room, event, payload });
    },
  }),
});

describe('recordConversationActivity — écriture monotone', () => {
  /**
   * LE témoin du lot #19800, et le seul des deux qui pouvait tomber : la
   * conversation à la forme NOMINALE, dont aucun chemin de création n'a écrit la
   * colonne. Avant la troisième branche du `where`, `updateMany` n'appariait
   * RIEN ici — donc la première écriture ne pouvait jamais avoir lieu, donc la
   * colonne restait absente pour toujours, sur toutes les conversations.
   */
  it('pose lastActivityAt sur une conversation dont la colonne est ABSENTE (la forme que la création produit)', async () => {
    const row = absente();
    const prisma = makePrisma(row);

    await recordConversationActivity({ prisma: prisma as never, conversationId: CONVERSATION_ID, at: AT });

    expect(lue(row)).toEqual(AT);
  });

  /**
   * Sa JUMELLE, gardée côte à côte pour qu'elle ne se relise jamais comme une
   * garde : une fixture qui pose `lastActivityAt: null` explicitement passait
   * DÉJÀ avant le correctif — l'égalité nue apparie ce document-là. C'est
   * exactement la paire du cycle 181 (#19755), sur une autre colonne.
   */
  it('pose lastActivityAt sur une conversation dont la colonne est NULLE (le témoin qui ne pouvait pas tomber)', async () => {
    const row = nulle();

    await recordConversationActivity({ prisma: makePrisma(row) as never, conversationId: CONVERSATION_ID, at: AT });

    expect(lue(row)).toEqual(AT);
  });

  it('fait avancer une activité plus ancienne', async () => {
    const row = datee(new Date('2026-10-01T08:00:00.000Z'));

    await recordConversationActivity({ prisma: makePrisma(row) as never, conversationId: CONVERSATION_ID, at: AT });

    expect(lue(row)).toEqual(AT);
  });

  it('ne recule JAMAIS une activité plus récente (arrivée en retard)', async () => {
    const later = new Date('2026-10-01T11:00:00.000Z');
    const row = datee(later);

    await recordConversationActivity({ prisma: makePrisma(row) as never, conversationId: CONVERSATION_ID, at: AT });

    expect(lue(row)).toEqual(later);
  });

  /**
   * L'activité du MÊME instant ne réécrit rien, et c'est la propriété qui rend
   * deux activités concurrentes convergentes : `lt` est STRICT, donc le second
   * appel d'une même milliseconde est un no-op, jamais une écriture qui écrase.
   */
  it('n’écrit pas deux fois le MÊME instant (le `lt` est strict)', async () => {
    const row = datee(AT);
    const prisma = makePrisma(row);

    await recordConversationActivity({ prisma: prisma as never, conversationId: CONVERSATION_ID, at: AT });

    expect(await prisma.conversation.updateMany.mock.results[0].value).toEqual({ count: 0 });
    expect(lue(row)).toEqual(AT);
  });

  it('ne lève jamais : une panne de base est avalée', async () => {
    const prisma = makePrisma(absente());
    prisma.conversation.updateMany.mockRejectedValueOnce(new Error('down') as never);

    await expect(
      recordConversationActivity({ prisma: prisma as never, conversationId: CONVERSATION_ID, at: AT }),
    ).resolves.toBeUndefined();
  });
});

describe('announceConversationActivity — le rang servi à chaque participant', () => {
  it('écrit l’activité puis pousse listRankAt dans la room personnelle de CHAQUE participant (invité compris)', async () => {
    const row = absente();
    const emitted: Emitted[] = [];

    await announceConversationActivity({
      prisma: makePrisma(row) as never,
      io: makeIo(emitted) as never,
      conversationId: CONVERSATION_ID,
      at: AT,
      updatedByUserId: 'u-alice',
    });

    expect(lue(row)).toEqual(AT);
    expect(emitted.map((e) => e.room).sort()).toEqual(['user:p-guest', 'user:u-bob']);
    for (const { event, payload } of emitted) {
      expect(event).toBe(SERVER_EVENTS.CONVERSATION_UPDATED);
      expect(payload).toMatchObject({ conversationId: CONVERSATION_ID, listRankAt: AT.toISOString(), updatedBy: { id: 'u-alice' } });
    }
  });

  it('écrit l’activité même sans io (la remontée survit au rechargement)', async () => {
    const row = absente();

    await announceConversationActivity({
      prisma: makePrisma(row) as never,
      io: null,
      conversationId: CONVERSATION_ID,
      at: AT,
      updatedByUserId: 'u-alice',
    });

    expect(lue(row)).toEqual(AT);
  });
});
