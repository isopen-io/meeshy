/**
 * #13350 — les suggestions de mention ne proposent jamais une personne en
 * relation de blocage avec l'appelant, dans un sens ou dans l'autre — ni comme
 * ami, ni comme membre d'une conversation ouverte, ni depuis l'annuaire.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));

import { MentionSuggestionFinder } from '../../../services/mentions/mentionSuggestions';

const MOI = '507f1f77bcf86cd799439099';
const AMI = '507f1f77bcf86cd799439012';
const BLOQUE = '507f1f77bcf86cd799439013';

type BlockLists = Record<string, string[]>;
type UserWhere = { AND?: unknown[]; id?: { in: string[] }; blockedUserIds?: { has: string } };

const person = (id: string, username: string) => ({
  id, username, firstName: null, lastName: null, displayName: username, avatar: null, equippedAvatarRing: null,
});
const PEOPLE = { [AMI]: person(AMI, 'blanche'), [BLOQUE]: person(BLOQUE, 'blaise') };

function fakePrisma(blocks: BlockLists) {
  const blockedOf = (id: string): string[] => blocks[id] ?? [];
  return {
    conversation: { findUnique: jest.fn(async () => ({ id: 'c1', type: 'global' })) },
    participant: {
      findFirst: jest.fn(async () => ({ id: 'p-me' })),
      findMany: jest.fn(async () => [{ user: PEOPLE[AMI] }, { user: PEOPLE[BLOQUE] }]),
    },
    conversationMessageStats: { findUnique: jest.fn(async () => null) },
    friendRequest: {
      findMany: jest.fn(async () => [
        { senderId: MOI, receiverId: AMI, sender: null, receiver: PEOPLE[AMI] },
        { senderId: BLOQUE, receiverId: MOI, sender: PEOPLE[BLOQUE], receiver: null },
      ]),
    },
    post: { findUnique: jest.fn(async () => ({ id: 'p1', authorId: MOI, deletedAt: null, author: null })) },
    postComment: { findMany: jest.fn(async () => []) },
    user: {
      findMany: jest.fn(async ({ where }: { where: UserWhere }) => {
        if (where.AND) {
          const notIn = ((where.AND[1] as { id: { notIn: string[] } }).id.notIn);
          return [PEOPLE[AMI], PEOPLE[BLOQUE]].filter((p) => !notIn.includes(p.id));
        }
        return Object.keys(blocks)
          .filter((id) => (where.id ? where.id.in.includes(id) : true))
          .filter((id) => blockedOf(id).includes(where.blockedUserIds?.has ?? ''))
          .map((id) => ({ id }));
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({ blockedUserIds: blockedOf(where.id) })),
    },
    userPreferences: { findMany: jest.fn(async () => []) },
    userPreference: { findMany: jest.fn(async () => []) },
  } as never;
}

const cache = { get: async () => null, set: async () => undefined, keys: async () => [], del: async () => undefined } as never;

const SENS: Array<[string, BlockLists]> = [
  ["j'ai bloqué l'ami", { [MOI]: [BLOQUE], [BLOQUE]: [], [AMI]: [] }],
  ["l'ami m'a bloqué", { [MOI]: [], [BLOQUE]: [MOI], [AMI]: [] }],
];

describe('#13350 — suggestions de mention sans personne bloquée', () => {
  it.each(SENS)('conversation ouverte (membres, amis) — %s', async (_sens, blocks) => {
    const ids = (await new MentionSuggestionFinder(fakePrisma(blocks), cache).forConversation('c1', MOI, '')).map((s) => s.id);
    expect(ids).toContain(AMI);
    expect(ids).not.toContain(BLOQUE);
  });

  it.each(SENS)("annuaire d'une conversation ouverte — %s", async (_sens, blocks) => {
    const ids = (await new MentionSuggestionFinder(fakePrisma(blocks), cache).forConversation('c1', MOI, 'bl')).map((s) => s.id);
    expect(ids).toContain(AMI);
    expect(ids).not.toContain(BLOQUE);
  });

  it.each(SENS)('mention sous un post (amis, annuaire) — %s', async (_sens, blocks) => {
    const ids = (await new MentionSuggestionFinder(fakePrisma(blocks), cache).forPost('p1', MOI, 'bl')).map((s) => s.id);
    expect(ids).toContain(AMI);
    expect(ids).not.toContain(BLOQUE);
  });
});
