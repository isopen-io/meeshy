/**
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  resolveConversationEntry,
  REJOIN_PARTICIPANT_STATE,
  type ConversationEntryReader,
} from '../../../../services/conversations/conversationEntryAdmission';

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';

/**
 * Le conteneur vivant, énoncé plutôt que sous-entendu : chaque cas ci-dessous
 * dit dans QUELLE conversation il se place, et les décisions qu'ils décrivent
 * ne valent que dans celle-là.
 */
const OPEN_CONVERSATION = { isActive: true, closedAt: null };

type Row = {
  id: string;
  isActive?: boolean | null;
  bannedAt?: Date | null;
  joinedAt?: Date | null;
};

function readerOf(rows: Row[]): ConversationEntryReader & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    participant: {
      findMany: jest.fn(async (args: unknown) => {
        calls.push(args);
        return rows;
      }) as ConversationEntryReader['participant']['findMany'],
    },
  };
}

const activeRow = (id: string): Row => ({ id, isActive: true, bannedAt: null, joinedAt: new Date('2026-01-01') });
const departedRow = (id: string, joinedAt = new Date('2026-01-01')): Row => ({
  id,
  isActive: false,
  bannedAt: null,
  joinedAt,
});
const bannedRow = (id: string): Row => ({
  id,
  isActive: false,
  bannedAt: new Date('2026-02-01'),
  joinedAt: new Date('2026-01-01'),
});

describe('resolveConversationEntry', () => {
  it('rend `create` quand la paire (conversation, utilisateur) n\'a aucune ligne', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([]),
      conversationId: CONV_ID,
      userId: USER_ID,
      conversation: OPEN_CONVERSATION,
    });

    expect(decision).toEqual({ outcome: 'create' });
  });

  it('n\'expose aucun participantId sur `create` — il n\'y a rien à désigner', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([]),
      conversationId: CONV_ID,
      userId: USER_ID,
      conversation: OPEN_CONVERSATION,
    });

    expect(decision.participantId).toBeUndefined();
  });

  it('rend `already-member` quand une ligne active existe', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([activeRow('p-active')]),
      conversationId: CONV_ID,
      userId: USER_ID,
      conversation: OPEN_CONVERSATION,
    });

    expect(decision).toEqual({ outcome: 'already-member', participantId: 'p-active' });
  });

  it('rend `rejoin` sur la ligne laissée par un départ, plutôt que de la dupliquer', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([departedRow('p-left')]),
      conversationId: CONV_ID,
      userId: USER_ID,
      conversation: OPEN_CONVERSATION,
    });

    expect(decision).toEqual({ outcome: 'rejoin', participantId: 'p-left' });
  });

  it('rend `banned` — un bannissement laisse `isActive: false`, donc il se lit sur `bannedAt` et non sur l\'activité', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([bannedRow('p-banned')]),
      conversationId: CONV_ID,
      userId: USER_ID,
      conversation: OPEN_CONVERSATION,
    });

    expect(decision).toEqual({ outcome: 'banned', participantId: 'p-banned' });
  });

  it('fait primer le bannissement sur une ligne active en double — l\'ordre rendu par la base ne décide pas', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([activeRow('p-active'), bannedRow('p-banned')]),
      conversationId: CONV_ID,
      userId: USER_ID,
      conversation: OPEN_CONVERSATION,
    });

    expect(decision).toEqual({ outcome: 'banned', participantId: 'p-banned' });
  });

  it('fait primer l\'appartenance active sur une ligne inactive en double', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([departedRow('p-left'), activeRow('p-active')]),
      conversationId: CONV_ID,
      userId: USER_ID,
      conversation: OPEN_CONVERSATION,
    });

    expect(decision).toEqual({ outcome: 'already-member', participantId: 'p-active' });
  });

  it('réintègre la ligne la plus récemment rejointe quand le défaut historique en a laissé plusieurs', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([
        departedRow('p-old', new Date('2025-05-01')),
        departedRow('p-recent', new Date('2026-03-01')),
      ]),
      conversationId: CONV_ID,
      userId: USER_ID,
      conversation: OPEN_CONVERSATION,
    });

    expect(decision).toEqual({ outcome: 'rejoin', participantId: 'p-recent' });
  });

  it('tolère un `joinedAt` absent sans perdre la ligne datée', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([
        { id: 'p-undated', isActive: false, bannedAt: null },
        departedRow('p-dated', new Date('2026-03-01')),
      ]),
      conversationId: CONV_ID,
      userId: USER_ID,
      conversation: OPEN_CONVERSATION,
    });

    expect(decision).toEqual({ outcome: 'rejoin', participantId: 'p-dated' });
  });

  it('retient la première ligne quand aucune n\'est datée', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([
        { id: 'p-first', isActive: false, bannedAt: null },
        { id: 'p-second', isActive: false, bannedAt: null },
      ]),
      conversationId: CONV_ID,
      userId: USER_ID,
      conversation: OPEN_CONVERSATION,
    });

    expect(decision).toEqual({ outcome: 'rejoin', participantId: 'p-first' });
  });

  it('interroge la paire SANS filtrer sur `isActive` — c\'est l\'état lu qui décide, pas le `where`', async () => {
    const reader = readerOf([]);
    await resolveConversationEntry({ prisma: reader, conversationId: CONV_ID, userId: USER_ID, conversation: OPEN_CONVERSATION });

    expect(reader.calls).toHaveLength(1);
    expect(reader.calls[0]).toEqual({
      where: { conversationId: CONV_ID, userId: USER_ID },
      select: { id: true, isActive: true, bannedAt: true, joinedAt: true },
    });
  });

  it('laisse remonter l\'échec de lecture — une base illisible ne doit pas produire un `create` qui doublerait la ligne', async () => {
    const reader: ConversationEntryReader = {
      participant: {
        findMany: jest.fn(async () => {
          throw new Error('mongo down');
        }) as unknown as ConversationEntryReader['participant']['findMany'],
      },
    };

    await expect(
      resolveConversationEntry({ prisma: reader, conversationId: CONV_ID, userId: USER_ID, conversation: OPEN_CONVERSATION })
    ).rejects.toThrow('mongo down');
  });
});

describe("resolveConversationEntry — l'état du conteneur", () => {
  it('refuse l\'entrée dans une conversation fermée par les écrivains actuels (`closedAt` posé)', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([]),
      conversationId: CONV_ID,
      userId: USER_ID,
      conversation: { isActive: false, closedAt: new Date('2026-03-01') },
    });

    expect(decision).toEqual({ outcome: 'closed' });
  });

  it('refuse aussi sur `isActive: false` SEUL — les lignes fermées par l\'ancien `leave.ts` n\'ont pas de `closedAt`, et rien ne les rétro-remplit', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([]),
      conversationId: CONV_ID,
      userId: USER_ID,
      conversation: { isActive: false, closedAt: null },
    });

    expect(decision).toEqual({ outcome: 'closed' });
  });

  it('refuse sur `closedAt` SEUL — la seconde colonne n\'est pas de la ceinture, elle décide quand la première ment', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([]),
      conversationId: CONV_ID,
      userId: USER_ID,
      conversation: { isActive: true, closedAt: new Date('2026-03-01') },
    });

    expect(decision).toEqual({ outcome: 'closed' });
  });

  it('ne peut RENDRE aucune décision d\'écriture sur un fil terminé — ni `create`, ni `rejoin`, ni `already-member`', async () => {
    const outcomes = await Promise.all(
      [[], [activeRow('p1')], [departedRow('p1')], [bannedRow('p1')]].map((rows) =>
        resolveConversationEntry({
          prisma: readerOf(rows),
          conversationId: CONV_ID,
          userId: USER_ID,
          conversation: { isActive: false, closedAt: new Date('2026-03-01') },
        }).then((d) => d.outcome)
      )
    );

    expect(outcomes).toEqual(['closed', 'closed', 'closed', 'closed']);
  });

  it('ne lit AUCUNE ligne `Participant` sur un fil terminé — la question « que faire de la ligne déjà là » ne se pose pas', async () => {
    const reader = readerOf([departedRow('p1')]);

    await resolveConversationEntry({
      prisma: reader,
      conversationId: CONV_ID,
      userId: USER_ID,
      conversation: { isActive: false, closedAt: new Date('2026-03-01') },
    });

    expect(reader.calls).toHaveLength(0);
  });

  it('reste permissif quand l\'appelant n\'a pas trouvé la conversation — c\'est son 404 à lui, pas un refus d\'entrée', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([]),
      conversationId: CONV_ID,
      userId: USER_ID,
      conversation: null,
    });

    expect(decision).toEqual({ outcome: 'create' });
  });

  it('CONTRE-ÉPREUVE — un conteneur vivant laisse les quatre décisions intactes', async () => {
    const outcomes = await Promise.all(
      [[], [activeRow('p1')], [departedRow('p1')], [bannedRow('p1')]].map((rows) =>
        resolveConversationEntry({
          prisma: readerOf(rows),
          conversationId: CONV_ID,
          userId: USER_ID,
          conversation: OPEN_CONVERSATION,
        }).then((d) => d.outcome)
      )
    );

    expect(outcomes).toEqual(['create', 'already-member', 'rejoin', 'banned']);
  });
});

describe('REJOIN_PARTICIPANT_STATE', () => {
  /**
   * `historyVisibleFrom` a rejoint la remise à zéro : c'est un octroi (ou une
   * restriction) accordé à UNE arrivée, et il PRIME sur tout sauf le rang admin
   * (rang 2 du plancher, avant le droit figé et avant le lien). Le laisser
   * survivre à un départ faisait qu'un membre exclu puis ré-ajouté rentrait avec
   * la borne d'une venue périmée, que ni son nouveau rôle ni son nouveau lien ne
   * pouvaient corriger — le rang 2 les court-circuite tous les deux.
   */
  it('rouvre l\'appartenance, efface la date de départ ET l\'octroi d\'historique — `joinedAt` reste celui de la première venue', () => {
    expect(REJOIN_PARTICIPANT_STATE).toEqual({ isActive: true, leftAt: null, historyVisibleFrom: null });
  });
});
