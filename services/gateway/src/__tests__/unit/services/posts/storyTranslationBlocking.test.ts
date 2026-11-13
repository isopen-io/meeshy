/**
 * @jest-environment node
 *
 * #17209 — les traductions en direct d'une story (`story:translation-updated`,
 * `post:translation-updated`) ne partent jamais vers un compte en relation de
 * blocage avec l'auteur, dans un sens ou dans l'autre, quelle que soit la
 * branche d'audience. Le filtre est celui de la diffusion temps réel des
 * publications (`withoutBlockedRecipients`, `utils/blocking.ts`) : une lecture
 * du blocage qui échoue ne laisse partir que l'auteur.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

jest.mock('../../../../services/posts/communityVisibility', () => ({
  communityPostAudienceIds: jest.fn(async () => ['member-ok', 'blocked-by-author', 'blocker-of-author']),
}));
jest.mock('../../../../services/posts/postAudience', () => ({
  circleAudienceIds: jest.fn(async (_p: unknown, _a: string, visibility: string) =>
    visibility === 'CLOSE' ? ['close-ok', 'blocked-by-author', 'blocker-of-author'] : null),
}));

import { StoryTextObjectTranslationService } from '../../../../services/posts/StoryTextObjectTranslationService';

const AUTHOR = 'author-1';
const BLOCKED_BY_AUTHOR = 'blocked-by-author';
const BLOCKER_OF_AUTHOR = 'blocker-of-author';
const POST_ID = '507f1f77bcf86cd799439011';

type Visibility = 'PUBLIC' | 'FRIENDS' | 'EXCEPT' | 'ONLY' | 'COMMUNITY' | 'CLOSE';

const makePrisma = (params: { visibility: Visibility; blockingFails?: boolean }) => {
  const post = {
    authorId: AUTHOR,
    visibility: params.visibility,
    visibilityUserIds: params.visibility === 'ONLY'
      ? ['only-ok', BLOCKED_BY_AUTHOR, BLOCKER_OF_AUTHOR]
      : params.visibility === 'EXCEPT' ? ['excluded-friend'] : [],
    communityId: params.visibility === 'COMMUNITY' ? 'community-1' : null,
    content: null,
    storyEffects: { textObjects: [{ id: 'mine', text: 'Bonjour' }] },
  };
  const friends = ['friend-ok', 'excluded-friend', BLOCKED_BY_AUTHOR, BLOCKER_OF_AUTHOR];
  const fail = () => Promise.reject(new Error('mongo down'));
  return {
    post: { findUnique: async (_args: unknown) => post },
    friendRequest: {
      findMany: async (_args: unknown) => friends.map((id) => ({ senderId: AUTHOR, receiverId: id })),
    },
    user: {
      findUnique: async (_args: unknown) => (params.blockingFails ? fail() : { blockedUserIds: [BLOCKED_BY_AUTHOR] }),
      findMany: async (args: { where: { id: { in: string[] } } }) =>
        params.blockingFails
          ? fail()
          : args.where.id.in.filter((id) => id === BLOCKER_OF_AUTHOR).map((id) => ({ id })),
    },
    $runCommandRaw: async (_cmd: unknown) => ({ ok: 1 }),
  };
};

const recipientsOf = async (params: { visibility: Visibility; blockingFails?: boolean }) => {
  const rooms = { story: new Set<string>(), post: new Set<string>() };
  const io = {
    to: (room: string) => ({
      emit: (event: string, _payload: unknown) => {
        if (event === SERVER_EVENTS.STORY_TRANSLATION_UPDATED) rooms.story.add(room);
        if (event === SERVER_EVENTS.POST_TRANSLATION_UPDATED) rooms.post.add(room);
      },
    }),
  };
  // @ts-expect-error remise à zéro du singleton privé
  StoryTextObjectTranslationService._shared = null;
  const service = StoryTextObjectTranslationService.init(
    makePrisma(params) as unknown as Parameters<typeof StoryTextObjectTranslationService.init>[0],
    io as unknown as Parameters<typeof StoryTextObjectTranslationService.init>[1],
  );
  await service.handleTranslationCompleted({ postId: POST_ID, textObjectIndex: 0, translations: { en: 'Hello' } });
  return rooms;
};

const feed = (id: string) => ROOMS.feed(id);

describe('traductions en direct d’une story — le blocage ferme l’audience (#17209)', () => {
  const cases: ReadonlyArray<{ visibility: Visibility; admitted: string }> = [
    { visibility: 'PUBLIC', admitted: 'friend-ok' },
    { visibility: 'FRIENDS', admitted: 'friend-ok' },
    { visibility: 'EXCEPT', admitted: 'friend-ok' },
    { visibility: 'ONLY', admitted: 'only-ok' },
    { visibility: 'COMMUNITY', admitted: 'member-ok' },
    { visibility: 'CLOSE', admitted: 'close-ok' },
  ];

  it.each(cases)('$visibility : ni le compte que l’auteur a bloqué ni celui qui l’a bloqué ne reçoit la traduction', async ({ visibility, admitted }) => {
    const rooms = await recipientsOf({ visibility });
    for (const channel of [rooms.story, rooms.post]) {
      expect(channel.has(feed(AUTHOR))).toBe(true);
      expect(channel.has(feed(admitted))).toBe(true);
      expect(channel.has(feed(BLOCKED_BY_AUTHOR))).toBe(false);
      expect(channel.has(feed(BLOCKER_OF_AUTHOR))).toBe(false);
    }
  });

  it.each(cases)('$visibility : une lecture du blocage qui échoue ne laisse partir que l’auteur', async ({ visibility }) => {
    const rooms = await recipientsOf({ visibility, blockingFails: true });
    expect([...rooms.story]).toEqual([feed(AUTHOR)]);
    expect([...rooms.post]).toEqual([feed(AUTHOR)]);
  });
});
