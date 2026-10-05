import { describe, expect, it } from 'vitest';

import {
  conversationListRank,
  listRankFromColumns,
  reactionTargetKey,
} from './conversation-list-rank';

/**
 * LE RANG D'UNE LIGNE DE LISTE (#9026, directive porteur du 2026-10-01, qui
 * remplace la règle PAR LECTEUR de #7592).
 *
 * rang = max(`lastMessageAt`, `lastActivityAt`) — le MÊME pour tous les
 * participants. `lastActivityAt` avance à chaque réaction, appel ou épingle.
 */

const MESSAGE_AT = '2026-09-23T12:07:16.000Z';
const ACTIVITY_AT = '2026-09-23T12:07:24.082Z';
const AUTHOR_USER = '64b000000000000000000001';
const AUTHOR_PARTICIPANT = '64b0000000000000000000a1';

describe('reactionTargetKey', () => {
  it("rend le User.id de l'auteur réagi quand il existe", () => {
    expect(reactionTargetKey({ targetSenderUserId: AUTHOR_USER, targetSenderId: AUTHOR_PARTICIPANT })).toBe(AUTHOR_USER);
  });

  it("rend le Participant.id d'un auteur invité", () => {
    expect(reactionTargetKey({ targetSenderUserId: null, targetSenderId: AUTHOR_PARTICIPANT })).toBe(AUTHOR_PARTICIPANT);
  });

  it('rend null sans auteur', () => {
    expect(reactionTargetKey({ targetSenderUserId: null, targetSenderId: null })).toBeNull();
  });
});

describe('conversationListRank — une activité remonte la ligne pour TOUS', () => {
  it("une activité plus récente que le dernier message donne le rang", () => {
    expect(conversationListRank({ lastMessageAt: MESSAGE_AT, lastActivityAt: ACTIVITY_AT })).toBe(ACTIVITY_AT);
  });

  it('une activité plus ancienne que le dernier message ne recule pas le rang', () => {
    expect(conversationListRank({ lastMessageAt: ACTIVITY_AT, lastActivityAt: MESSAGE_AT })).toBe(ACTIVITY_AT);
  });

  it('sans activité (document antérieur), le rang est le dernier message', () => {
    expect(conversationListRank({ lastMessageAt: MESSAGE_AT, lastActivityAt: null })).toBe(MESSAGE_AT);
    expect(conversationListRank({ lastMessageAt: MESSAGE_AT })).toBe(MESSAGE_AT);
  });

  it('sans message ni activité : null', () => {
    expect(conversationListRank({ lastMessageAt: null })).toBeNull();
  });

  it('une chaîne illisible ne compte pas', () => {
    expect(conversationListRank({ lastMessageAt: MESSAGE_AT, lastActivityAt: 'pas-une-date' })).toBe(MESSAGE_AT);
  });
});

describe('listRankFromColumns — la même règle sur les colonnes dénormalisées', () => {
  it("lit lastActivityAt pour tout lecteur — plus aucune clé de lecteur", () => {
    const columns = { lastMessageAt: new Date(MESSAGE_AT), lastActivityAt: new Date(ACTIVITY_AT) };
    expect(listRankFromColumns(columns)?.toISOString()).toBe(ACTIVITY_AT);
  });

  it("une réaction seule (colonnes #7592) ne remonte plus rien : c'est lastActivityAt qui porte le rang", () => {
    const columns = {
      lastMessageAt: new Date(MESSAGE_AT),
      lastReactionAt: new Date(ACTIVITY_AT),
      lastReactionTargetKey: AUTHOR_USER,
    };
    expect(listRankFromColumns(columns)?.toISOString()).toBe(MESSAGE_AT);
  });

  it('retombe sur lastMessageAt, et null sans rien', () => {
    expect(listRankFromColumns({ lastMessageAt: new Date(MESSAGE_AT) })?.toISOString()).toBe(MESSAGE_AT);
    expect(listRankFromColumns({ lastMessageAt: null })).toBeNull();
  });
});
