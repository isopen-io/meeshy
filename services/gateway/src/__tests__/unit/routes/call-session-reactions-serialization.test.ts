/**
 * La fiche d'un appel sert les réactions comptées (#8439) et ne sert JAMAIS la
 * liste des invitations (#8433) : qui a été invité — et qui n'a pas répondu —
 * ne regarde pas les membres de la conversation.
 */

import { describe, it, expect } from '@jest/globals';
import fastJsonStringify from 'fast-json-stringify';
import { callSessionSchema } from '@meeshy/shared/types/api-schemas';
import { toCallSessionResponse } from '../../../utils/call-session-response.js';

const sessionRow = (overrides: Record<string, unknown> = {}) => ({
  id: '507f1f77bcf86cd799439031',
  conversationId: '507f1f77bcf86cd799439032',
  initiatorId: '507f1f77bcf86cd799439033',
  mode: 'p2p',
  status: 'ended',
  participants: [],
  invitedUserIds: ['507f1f77bcf86cd799439034'],
  reactionCounts: { '👍': 4, '🔥': 1, '💩': 7 },
  ...overrides,
});

const serialize = (payload: unknown): Record<string, unknown> =>
  JSON.parse(fastJsonStringify(callSessionSchema as never)(payload));

describe('fiche d’appel — réactions et invitations', () => {
  it('sert les comptes par emoji de la liste blanche', () => {
    const out = serialize(toCallSessionResponse(sessionRow()));

    expect(out.reactionCounts).toEqual({ '👍': 4, '🔥': 1 });
  });

  it('sert un objet vide quand personne n’a réagi', () => {
    const out = serialize(toCallSessionResponse(sessionRow({ reactionCounts: null })));

    expect(out.reactionCounts).toEqual({});
  });

  it('ne sert pas la liste des invitations', () => {
    const out = serialize(toCallSessionResponse(sessionRow()));

    expect(out.invitedUserIds).toBeUndefined();
  });
});
