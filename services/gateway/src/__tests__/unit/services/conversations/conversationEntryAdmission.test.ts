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

type Row = {
  id: string;
  isActive?: boolean | null;
  bannedAt?: Date | null;
  joinedAt?: Date | null;
};

type ConversationState = { isActive?: boolean | null; closedAt?: Date | null } | null;

const OPEN: ConversationState = { isActive: true, closedAt: null };

function readerOf(
  rows: Row[],
  conversation: ConversationState = OPEN
): ConversationEntryReader & { calls: unknown[]; conversationCalls: unknown[] } {
  const calls: unknown[] = [];
  const conversationCalls: unknown[] = [];
  return {
    calls,
    conversationCalls,
    participant: {
      findMany: jest.fn(async (args: unknown) => {
        calls.push(args);
        return rows;
      }) as ConversationEntryReader['participant']['findMany'],
    },
    conversation: {
      findUnique: jest.fn(async (args: unknown) => {
        conversationCalls.push(args);
        return conversation;
      }) as ConversationEntryReader['conversation']['findUnique'],
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
    });

    expect(decision).toEqual({ outcome: 'create' });
  });

  it('n\'expose aucun participantId sur `create` — il n\'y a rien à désigner', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([]),
      conversationId: CONV_ID,
      userId: USER_ID,
    });

    expect(decision.participantId).toBeUndefined();
  });

  it('rend `already-member` quand une ligne active existe', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([activeRow('p-active')]),
      conversationId: CONV_ID,
      userId: USER_ID,
    });

    expect(decision).toEqual({ outcome: 'already-member', participantId: 'p-active' });
  });

  it('rend `rejoin` sur la ligne laissée par un départ, plutôt que de la dupliquer', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([departedRow('p-left')]),
      conversationId: CONV_ID,
      userId: USER_ID,
    });

    expect(decision).toEqual({ outcome: 'rejoin', participantId: 'p-left' });
  });

  it('rend `banned` — un bannissement laisse `isActive: false`, donc il se lit sur `bannedAt` et non sur l\'activité', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([bannedRow('p-banned')]),
      conversationId: CONV_ID,
      userId: USER_ID,
    });

    expect(decision).toEqual({ outcome: 'banned', participantId: 'p-banned' });
  });

  it('fait primer le bannissement sur une ligne active en double — l\'ordre rendu par la base ne décide pas', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([activeRow('p-active'), bannedRow('p-banned')]),
      conversationId: CONV_ID,
      userId: USER_ID,
    });

    expect(decision).toEqual({ outcome: 'banned', participantId: 'p-banned' });
  });

  it('fait primer l\'appartenance active sur une ligne inactive en double', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([departedRow('p-left'), activeRow('p-active')]),
      conversationId: CONV_ID,
      userId: USER_ID,
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
    });

    expect(decision).toEqual({ outcome: 'rejoin', participantId: 'p-first' });
  });

  it('interroge la paire SANS filtrer sur `isActive` — c\'est l\'état lu qui décide, pas le `where`', async () => {
    const reader = readerOf([]);
    await resolveConversationEntry({ prisma: reader, conversationId: CONV_ID, userId: USER_ID });

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
      conversation: {
        findUnique: jest.fn(async () => OPEN) as unknown as ConversationEntryReader['conversation']['findUnique'],
      },
    };

    await expect(
      resolveConversationEntry({ prisma: reader, conversationId: CONV_ID, userId: USER_ID })
    ).rejects.toThrow('mongo down');
  });
});

// ─── L'état TERMINAL de la conversation ───────────────────────────────────────
//
// Le jumeau d'écriture (`conversationWriteAdmission`, règle 1) refuse un message
// dans un fil clos depuis le cycle 31. Personne ne refusait d'y faire ENTRER
// quelqu'un : les quatre portes vérifiaient l'état de la LIGNE et jamais celui
// du CONTENEUR.

describe('resolveConversationEntry — conversation close', () => {
  const CLOSED: ConversationState = { isActive: false, closedAt: new Date('2026-06-01') };

  it('refuse le primo-arrivant — une conversation close n\'admet plus personne', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([], CLOSED),
      conversationId: CONV_ID,
      userId: USER_ID,
    });

    expect(decision).toEqual({ outcome: 'closed' });
  });

  it('refuse la réintégration d\'un ancien membre — revenir dans un fil terminal n\'est pas revenir', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([departedRow('p-left')], CLOSED),
      conversationId: CONV_ID,
      userId: USER_ID,
    });

    expect(decision.outcome).toBe('closed');
  });

  it('lit les DEUX colonnes : une clôture SANS `closedAt` ferme quand même', async () => {
    // Les lignes fermées par l'ancien `leave.ts` (avant cycle 67) portent
    // `isActive: false` et AUCUN `closedAt`, et rien ne les rétro-remplit. Un
    // prédicat qui ne lirait que la date les laisserait admettre.
    const decision = await resolveConversationEntry({
      prisma: readerOf([], { isActive: false, closedAt: null }),
      conversationId: CONV_ID,
      userId: USER_ID,
    });

    expect(decision.outcome).toBe('closed');
  });

  it('ferme aussi sur le seul `closedAt`, sans attendre `isActive: false`', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([], { isActive: true, closedAt: new Date('2026-06-01') }),
      conversationId: CONV_ID,
      userId: USER_ID,
    });

    expect(decision.outcome).toBe('closed');
  });

  it('laisse `banned` l\'emporter — aucune écriture n\'est en jeu, et le refus de sécurité doit garder ses mots', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([bannedRow('p-banned')], CLOSED),
      conversationId: CONV_ID,
      userId: USER_ID,
    });

    expect(decision).toEqual({ outcome: 'banned', participantId: 'p-banned' });
  });

  it('laisse `already-member` l\'emporter — ce cycle ne retire aucune capacité vivante', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([activeRow('p-active')], CLOSED),
      conversationId: CONV_ID,
      userId: USER_ID,
    });

    expect(decision).toEqual({ outcome: 'already-member', participantId: 'p-active' });
  });

  it('ne lit PAS la conversation quand la décision n\'écrit rien — la porte du lien répond « déjà membre » à chaque réouverture', async () => {
    const reader = readerOf([activeRow('p-active')], CLOSED);
    await resolveConversationEntry({ prisma: reader, conversationId: CONV_ID, userId: USER_ID });

    expect(reader.conversationCalls).toHaveLength(0);
  });

  it('ne lit PAS la conversation pour un banni', async () => {
    const reader = readerOf([bannedRow('p-banned')], CLOSED);
    await resolveConversationEntry({ prisma: reader, conversationId: CONV_ID, userId: USER_ID });

    expect(reader.conversationCalls).toHaveLength(0);
  });

  it('ne demande à la conversation QUE son état terminal', async () => {
    const reader = readerOf([], CLOSED);
    await resolveConversationEntry({ prisma: reader, conversationId: CONV_ID, userId: USER_ID });

    expect(reader.conversationCalls).toEqual([
      { where: { id: CONV_ID }, select: { isActive: true, closedAt: true } },
    ]);
  });

  it('admet quand la conversation est vivante — la garde ne ferme pas les portes ouvertes', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([], OPEN),
      conversationId: CONV_ID,
      userId: USER_ID,
    });

    expect(decision).toEqual({ outcome: 'create' });
  });

  it('n\'invente pas une clôture quand la ligne de conversation est introuvable — même sémantique que `isConversationClosed`', async () => {
    const decision = await resolveConversationEntry({
      prisma: readerOf([], null),
      conversationId: CONV_ID,
      userId: USER_ID,
    });

    expect(decision).toEqual({ outcome: 'create' });
  });

  it('laisse remonter l\'échec de lecture de la conversation — un `create` sur une question sans réponse est exactement le défaut', async () => {
    const reader: ConversationEntryReader = {
      participant: {
        findMany: jest.fn(async () => []) as unknown as ConversationEntryReader['participant']['findMany'],
      },
      conversation: {
        findUnique: jest.fn(async () => {
          throw new Error('mongo down');
        }) as unknown as ConversationEntryReader['conversation']['findUnique'],
      },
    };

    await expect(
      resolveConversationEntry({ prisma: reader, conversationId: CONV_ID, userId: USER_ID })
    ).rejects.toThrow('mongo down');
  });
});

describe('REJOIN_PARTICIPANT_STATE', () => {
  it('rouvre l\'appartenance et efface la date de départ, et RIEN d\'autre — `joinedAt` reste celui de la première venue', () => {
    expect(REJOIN_PARTICIPANT_STATE).toEqual({ isActive: true, leftAt: null });
  });
});
