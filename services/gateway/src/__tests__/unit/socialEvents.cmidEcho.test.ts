/**
 * Parité U1 pour STORY/STATUS (lot 7, tâche 7.1 — « les deux dettes SERVEUR
 * que la file exige »).
 *
 * `broadcastPostCreated` échoue déjà `clientMutationId` (U1, cf.
 * `SocialEventsHandler.test.ts`) pour qu'un auteur hors-ligne réconcilie son
 * post optimiste (clé = cmid) avec le post serveur sur `post:created`. Les
 * jumeaux `broadcastStoryCreated`/`broadcastStatusCreated` n'avaient pas ce
 * 3e paramètre : republier une STORY/STATUS via `POST /posts` alors qu'on
 * est hors-ligne ne pouvait jamais réconcilier — le client dupliquait.
 *
 * `fast-json-stringify` ne s'applique pas ici (payload Socket.IO, pas REST),
 * mais le PRINCIPE demeure : ce que Jest voit dans `.mock.calls` et ce qui
 * VOYAGE réellement sur le fil peuvent diverger (`toHaveBeenCalledWith`
 * traite une clé absente et une clé `undefined` comme équivalentes — cf.
 * `SocialEventsHandler.test.ts:143`). Ce fichier vérifie donc le payload
 * SÉRIALISÉ (`JSON.parse(JSON.stringify(...))`, ce que fait réellement
 * l'encodeur Socket.IO), pas seulement l'objet JS passé au mock.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { SocialEventsHandler } from '../../socketio/handlers/SocialEventsHandler';
import type { Post } from '@meeshy/shared/types/post';

function createMockIO() {
  const mockEmit = jest.fn();
  const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
  return { to: mockTo, emit: mockEmit };
}

function createMockPrisma() {
  return {
    friendRequest: { findMany: jest.fn().mockResolvedValue([]) },
    communityMember: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
}

function createMockPost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    authorId: AUTHOR_ID,
    type: 'POST',
    visibility: 'PUBLIC',
    content: 'Hello world',
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    shareCount: 0,
    isPinned: false,
    isEdited: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Post;
}

const AUTHOR_ID = 'user-author-cmid-1';

describe('SocialEventsHandler — STORY/STATUS echo clientMutationId (U1 parity)', () => {
  let handler: SocialEventsHandler;
  let mockIO: ReturnType<typeof createMockIO>;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIO = createMockIO();
    mockPrisma = createMockPrisma();
    handler = new SocialEventsHandler({ io: mockIO as any, prisma: mockPrisma });
  });

  describe('broadcastStoryCreated', () => {
    it('la charge SÉRIALISÉE porte clientMutationId quand fourni', async () => {
      const story = createMockPost({ id: 'story-cmid-1', type: 'STORY' });

      await handler.broadcastStoryCreated(story, AUTHOR_ID, 'cmid_offline_story');

      const wire = JSON.parse(JSON.stringify(mockIO.emit.mock.calls[0][1]));
      expect(wire.clientMutationId).toBe('cmid_offline_story');
      expect(mockIO.emit.mock.calls[0][0]).toBe(SERVER_EVENTS.STORY_CREATED);
    });

    it("la charge SÉRIALISÉE ne porte PAS la clé clientMutationId sans cmid fourni", async () => {
      const story = createMockPost({ id: 'story-nocmid-1', type: 'STORY' });

      await handler.broadcastStoryCreated(story, AUTHOR_ID);

      const wire = JSON.parse(JSON.stringify(mockIO.emit.mock.calls[0][1]));
      expect('clientMutationId' in wire).toBe(false);
    });
  });

  describe('broadcastStatusCreated', () => {
    it('la charge SÉRIALISÉE porte clientMutationId quand fourni', async () => {
      const status = createMockPost({ id: 'status-cmid-1', type: 'STATUS' });

      await handler.broadcastStatusCreated(status, AUTHOR_ID, 'cmid_offline_status');

      const wire = JSON.parse(JSON.stringify(mockIO.emit.mock.calls[0][1]));
      expect(wire.clientMutationId).toBe('cmid_offline_status');
      expect(mockIO.emit.mock.calls[0][0]).toBe(SERVER_EVENTS.STATUS_CREATED);
    });

    it("la charge SÉRIALISÉE ne porte PAS la clé clientMutationId sans cmid fourni", async () => {
      const status = createMockPost({ id: 'status-nocmid-1', type: 'STATUS' });

      await handler.broadcastStatusCreated(status, AUTHOR_ID);

      const wire = JSON.parse(JSON.stringify(mockIO.emit.mock.calls[0][1]));
      expect('clientMutationId' in wire).toBe(false);
    });
  });
});
