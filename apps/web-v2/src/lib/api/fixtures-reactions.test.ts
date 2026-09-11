import { beforeEach, describe, expect, test } from 'bun:test';
import { MAX_REACTIONS_PER_OBJECT, REACTION_LIMIT_REACHED_MESSAGE } from '@meeshy/shared/utils/reaction-limit';

import { fixtureAddReaction, fixtureRemoveReaction, resetFixtureReactionsForTests } from './fixtures-reactions';

beforeEach(() => {
  resetFixtureReactionsForTests();
});

describe('fixtureAddReaction — MIME reactions.ts:132-270', () => {
  test('première pose ⇒ 201, ReactionData', () => {
    const result = fixtureAddReaction({ messageId: 'm1', emoji: '👍' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.status).toBe(201);
    expect(result.data.messageId).toBe('m1');
    expect(result.data.emoji).toBe('👍');
  });

  test('reposer le MÊME emoji ⇒ 200 (unchanged), jamais un second 201', () => {
    fixtureAddReaction({ messageId: 'm1', emoji: '👍' });
    const second = fixtureAddReaction({ messageId: 'm1', emoji: '👍' });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error('unreachable');
    expect(second.status).toBe(200);
  });

  test(`le ${MAX_REACTIONS_PER_OBJECT + 1}ᵉ emoji DIFFÉRENT ⇒ 409, isReactionAllowed de @meeshy/shared`, () => {
    for (let i = 0; i < MAX_REACTIONS_PER_OBJECT; i++) {
      const result = fixtureAddReaction({ messageId: 'm1', emoji: `emoji-${i}` });
      expect(result.ok).toBe(true);
    }
    const refused = fixtureAddReaction({ messageId: 'm1', emoji: 'emoji-over' });
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error('unreachable');
    expect(refused.status).toBe(409);
    expect(refused.error).toBe(REACTION_LIMIT_REACHED_MESSAGE);
  });
});

describe('fixtureRemoveReaction — MIME reactions.ts:279-425', () => {
  test('retirer une réaction posée ⇒ 200', () => {
    fixtureAddReaction({ messageId: 'm1', emoji: '👍' });
    const result = fixtureRemoveReaction({ messageId: 'm1', emoji: '👍' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.status).toBe(200);
  });

  test('retirer une réaction ABSENTE ⇒ 404', () => {
    const result = fixtureRemoveReaction({ messageId: 'm1', emoji: '👍' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.status).toBe(404);
  });

  test('retirer puis reposer ⇒ à nouveau 201 (pas 200)', () => {
    fixtureAddReaction({ messageId: 'm1', emoji: '👍' });
    fixtureRemoveReaction({ messageId: 'm1', emoji: '👍' });
    const result = fixtureAddReaction({ messageId: 'm1', emoji: '👍' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.status).toBe(201);
  });
});
