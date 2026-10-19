/**
 * #10945 — une SUGGESTION DE MENTION porte le contour équipé de la personne :
 * lu dans `USER_SELECT` (la même jointure que le nom et l'avatar), résolu en
 * `profileDecor` par `suggestion()`, le site unique qui compose une
 * suggestion. Jamais la colonne brute.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));

import { MentionSuggestionFinder } from '../../../services/mentions/mentionSuggestions';

const RING = { pack: 'contours-essentiels', item: 'filet', origin: 'builtin', contract: null };
const ME = '507f1f77bcf86cd799439099';
const member = (id: string, equippedAvatarRing: string | null) => ({
  user: { id, username: id, firstName: null, lastName: null, displayName: id, avatar: null, equippedAvatarRing },
});

const prisma = () => ({
  conversation: { findUnique: jest.fn<any>(async () => ({ id: 'c1', type: 'group' })) },
  participant: {
    findFirst: jest.fn<any>(async () => ({ id: 'p-me' })),
    findMany: jest.fn<any>(async () => [member('ana', 'contours-essentiels/filet'), member('bob', null)]),
  },
  conversationMessageStats: { findUnique: jest.fn<any>(async () => null) },
  friendRequest: { findMany: jest.fn<any>(async () => []) },
  user: { findMany: jest.fn<any>(async () => []) },
  userPreferences: { findMany: jest.fn<any>(async () => []) },
  userPreference: { findMany: jest.fn<any>(async () => []) },
}) as any;

const cache = { get: async () => null, set: async () => undefined, keys: async () => [], del: async () => undefined } as any;

describe('#10945 — suggestions de mention : le contour de la personne', () => {
  it('sert profileDecor résolu, aucune clé sans contour, jamais la colonne', async () => {
    const db = prisma();
    const suggestions = await new MentionSuggestionFinder(db, cache).forConversation('c1', ME, '');
    const byId = new Map(suggestions.map((s) => [s.id, s as unknown as Record<string, unknown>]));
    expect(byId.get('ana')?.profileDecor).toEqual({ avatarRing: RING });
    expect(byId.get('bob')).not.toHaveProperty('profileDecor');
    expect(JSON.stringify(suggestions)).not.toContain('equippedAvatarRing');
    expect(db.participant.findMany.mock.calls[0][0].include.user.select).toMatchObject({ equippedAvatarRing: true });
  });
});
