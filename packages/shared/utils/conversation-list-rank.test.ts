import { describe, expect, it } from 'vitest';

import {
  conversationListRank,
  listRankFromColumns,
  reactionTargetKey,
} from './conversation-list-rank';

/**
 * LE RANG D'UNE LIGNE DE LISTE (#7592, directive porteur du 2026-09-23).
 *
 * rang = max(`lastMessageAt`, `lastReaction.createdAt` quand la réaction vise un
 * message du LECTEUR). Le serveur l'applique au tri de `GET /conversations` et
 * le SERT (`listRankAt`) ; les clients trient sur la valeur servie.
 */

const MESSAGE_AT = '2026-09-23T12:07:16.000Z';
const REACTION_AT = '2026-09-23T12:07:24.082Z';
const AUTHOR_USER = '64b000000000000000000001';
const AUTHOR_PARTICIPANT = '64b0000000000000000000a1';
const THIRD_USER = '64b000000000000000000003';

describe('reactionTargetKey', () => {
  it('désigne l’auteur réagi par son User.id quand il en a un', () => {
    expect(reactionTargetKey({ targetSenderUserId: AUTHOR_USER, targetSenderId: AUTHOR_PARTICIPANT })).toBe(AUTHOR_USER);
  });

  it('retombe sur le Participant.id pour un invité', () => {
    expect(reactionTargetKey({ targetSenderUserId: null, targetSenderId: AUTHOR_PARTICIPANT })).toBe(AUTHOR_PARTICIPANT);
  });

  it('ne désigne personne quand le message réagi n’a pas d’auteur connu', () => {
    expect(reactionTargetKey({ targetSenderUserId: null, targetSenderId: null })).toBeNull();
  });
});

describe('conversationListRank', () => {
  const reactionToAuthor = {
    createdAt: REACTION_AT,
    targetSenderUserId: AUTHOR_USER,
    targetSenderId: AUTHOR_PARTICIPANT,
  };

  it('une réaction à MON message fait remonter ma ligne à l’heure de la réaction', () => {
    expect(conversationListRank({ lastMessageAt: MESSAGE_AT, lastReaction: reactionToAuthor }, AUTHOR_USER)).toBe(REACTION_AT);
  });

  it('une réaction entre tiers laisse le rang au dernier message', () => {
    expect(conversationListRank({ lastMessageAt: MESSAGE_AT, lastReaction: reactionToAuthor }, THIRD_USER)).toBe(MESSAGE_AT);
  });

  it('un invité auteur remonte par son Participant.id', () => {
    const guestReaction = { ...reactionToAuthor, targetSenderUserId: null };
    expect(conversationListRank({ lastMessageAt: MESSAGE_AT, lastReaction: guestReaction }, AUTHOR_PARTICIPANT)).toBe(REACTION_AT);
  });

  it('une réaction PLUS ANCIENNE que le dernier message ne fait pas redescendre la ligne', () => {
    const olderReaction = { ...reactionToAuthor, createdAt: '2026-09-23T12:00:00.000Z' };
    expect(conversationListRank({ lastMessageAt: MESSAGE_AT, lastReaction: olderReaction }, AUTHOR_USER)).toBe(MESSAGE_AT);
  });

  it('sans réaction, le rang est le dernier message', () => {
    expect(conversationListRank({ lastMessageAt: MESSAGE_AT, lastReaction: null }, AUTHOR_USER)).toBe(MESSAGE_AT);
  });

  it('sans message ni réaction, il n’y a pas de rang', () => {
    expect(conversationListRank({ lastMessageAt: null }, AUTHOR_USER)).toBeNull();
  });

  it('accepte des Date et rend toujours une chaîne ISO', () => {
    expect(
      conversationListRank(
        { lastMessageAt: new Date(MESSAGE_AT), lastReaction: { ...reactionToAuthor, createdAt: new Date(REACTION_AT) } },
        AUTHOR_USER,
      ),
    ).toBe(REACTION_AT);
  });

  it('un lecteur inconnu ne remonte jamais rien', () => {
    expect(conversationListRank({ lastMessageAt: MESSAGE_AT, lastReaction: reactionToAuthor }, null)).toBe(MESSAGE_AT);
  });
});

describe('listRankFromColumns — la même règle sur les colonnes dénormalisées', () => {
  it('rend le même rang que la forme servie', () => {
    const columns = {
      lastMessageAt: new Date(MESSAGE_AT),
      lastReactionAt: new Date(REACTION_AT),
      lastReactionTargetKey: AUTHOR_USER,
    };
    expect(listRankFromColumns(columns, AUTHOR_USER)?.toISOString()).toBe(REACTION_AT);
    expect(listRankFromColumns(columns, THIRD_USER)?.toISOString()).toBe(MESSAGE_AT);
  });

  it('un champ absent (document hérité) vaut une absence de réaction', () => {
    expect(listRankFromColumns({ lastMessageAt: new Date(MESSAGE_AT) }, AUTHOR_USER)?.toISOString()).toBe(MESSAGE_AT);
    expect(listRankFromColumns({ lastMessageAt: null }, AUTHOR_USER)).toBeNull();
  });
});
