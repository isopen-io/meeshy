/**
 * PostCommentService.addComment — propriété des médias AVANT la création (#9745)
 *
 * Le double de `postMedia` HONORE la clause `where` : un mock qui rend ce qu'on
 * lui dit quel que soit le filtre ne peut pas voir une garde de propriété
 * portée par la requête, et c'est exactement là que vivait le défaut.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { PostCommentService } from '../../../services/PostCommentService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

type Row = Record<string, unknown>;

const matchesCondition = (value: unknown, condition: unknown): boolean => {
  if (condition === null || typeof condition !== 'object') return value === condition;
  const clause = condition as Row;
  if ('in' in clause) return (clause.in as unknown[]).includes(value);
  if ('isSet' in clause) return (value !== undefined) === clause.isSet;
  if ('startsWith' in clause) return typeof value === 'string' && value.startsWith(clause.startsWith as string);
  return false;
};

const matches = (row: Row, where: Row = {}): boolean =>
  Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') return (condition as Row[]).every((sub) => matches(row, sub));
    if (key === 'OR') return (condition as Row[]).some((sub) => matches(row, sub));
    return matchesCondition(row[key], condition);
  });

const noopTrackingLinks = {
  collectContentTrackingLinks: jest.fn().mockResolvedValue([]),
} as any;

const ALICE = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BOB = 'bbbbbbbbbbbbbbbbbbbbbbbb';

const pendingMedia = (id: string, uploaderId: string | null, extra: Row = {}): Row => ({
  id, uploaderId, postId: null, mimeType: 'image/jpeg', fileUrl: `http://x/${id}`, ...extra,
});

const buildWorld = (seed: readonly Row[], hooks: { onCommentCreate?: (media: Row[]) => void } = {}) => {
  const state = { media: seed.map((row) => ({ ...row })), comments: [] as Row[] };
  const counters = { postUpdates: 0, transactions: 0 };

  const prisma: any = {
    post: {
      findFirst: async () => ({ id: 'post-1' }),
      update: async () => { counters.postUpdates += 1; return {}; },
    },
    postComment: {
      findFirst: async () => null,
      update: async () => ({}),
      create: async ({ data }: { data: Row }) => {
        const created = {
          id: `c-${state.comments.length + 1}`, translations: null, likeCount: 0, replyCount: 0,
          createdAt: new Date('2026-10-09T00:00:00Z'), metadata: null,
          author: { id: data.authorId, username: 'u', displayName: 'U', avatar: null },
          ...data,
        };
        state.comments = [...state.comments, created];
        hooks.onCommentCreate?.(state.media);
        return created;
      },
    },
    postMedia: {
      findMany: async ({ where }: { where?: Row }) => state.media.filter((row) => matches(row, where)),
      findFirst: async ({ where }: { where?: Row }) => state.media.find((row) => matches(row, where)) ?? null,
      update: async () => ({}),
      updateMany: async ({ where, data }: { where?: Row; data: Row }) => {
        const hit = state.media.filter((row) => matches(row, where));
        hit.forEach((row) => Object.assign(row, data));
        return { count: hit.length };
      },
    },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      counters.transactions += 1;
      const snapshot = { media: state.media.map((row) => ({ ...row })), comments: [...state.comments] };
      try {
        return await work(prisma);
      } catch (error) {
        state.media = snapshot.media;
        state.comments = snapshot.comments;
        throw error;
      }
    },
  };

  return {
    service: new PostCommentService(prisma as PrismaClient, noopTrackingLinks),
    state,
    counters,
  };
};

describe('PostCommentService.addComment — un média appartient à l’auteur de la requête, AVANT la création (#9745)', () => {
  it('REFUSE le commentaire de B qui porte un média téléversé par A — rien n’est créé', async () => {
    const { service, state, counters } = buildWorld([pendingMedia('m-alice', ALICE)]);

    await expect(service.addComment('post-1', BOB, 'le texte de A', { mediaIds: ['m-alice'] }))
      .rejects.toThrow('MEDIA_NOT_AVAILABLE');

    expect(state.comments).toEqual([]);
    expect(state.media[0].commentId).toBeUndefined();
    expect(counters.postUpdates).toBe(0);
  });

  it('REFUSE le lot ENTIER quand UN seul média est à quelqu’un d’autre', async () => {
    const { service, state } = buildWorld([pendingMedia('m-bob', BOB), pendingMedia('m-alice', ALICE)]);

    await expect(service.addComment('post-1', BOB, 'deux pièces', { mediaIds: ['m-bob', 'm-alice'] }))
      .rejects.toThrow('MEDIA_NOT_AVAILABLE');

    expect(state.comments).toEqual([]);
    expect(state.media.map((row) => row.commentId)).toEqual([undefined, undefined]);
  });

  it('REFUSE un média SANS propriétaire connu, et un id qui n’existe pas', async () => {
    const { service, state } = buildWorld([pendingMedia('m-orphelin', null)]);

    await expect(service.addComment('post-1', BOB, 'hi', { mediaIds: ['m-orphelin'] }))
      .rejects.toThrow('MEDIA_NOT_AVAILABLE');
    await expect(service.addComment('post-1', BOB, 'hi', { mediaIds: ['m-fantome'] }))
      .rejects.toThrow('MEDIA_NOT_AVAILABLE');

    expect(state.comments).toEqual([]);
  });

  it('REFUSE un média à soi mais déjà porté par une autre publication', async () => {
    const { service, state } = buildWorld([pendingMedia('m-pris', BOB, { postId: 'post-ailleurs' })]);

    await expect(service.addComment('post-1', BOB, 'hi', { mediaIds: ['m-pris'] }))
      .rejects.toThrow('MEDIA_NOT_AVAILABLE');

    expect(state.comments).toEqual([]);
    expect(state.media[0].postId).toBe('post-ailleurs');
  });

  it('ANNULE la création quand le média est pris ENTRE la vérification et la réclamation', async () => {
    const { service, state, counters } = buildWorld([pendingMedia('m-bob', BOB)], {
      onCommentCreate: (media) => { media[0].commentId = 'c-concurrent'; },
    });

    await expect(service.addComment('post-1', BOB, 'course', { mediaIds: ['m-bob'] }))
      .rejects.toThrow('MEDIA_NOT_AVAILABLE');

    expect(counters.transactions).toBe(1);
    expect(state.comments).toEqual([]);
    expect(counters.postUpdates).toBe(0);
  });

  it('ACCEPTE un média bien à soi : le commentaire existe et porte sa pièce', async () => {
    const { service, state, counters } = buildWorld([pendingMedia('m-bob', BOB), pendingMedia('m-alice', ALICE)]);

    const result: any = await service.addComment('post-1', BOB, 'ma photo', { mediaIds: ['m-bob'] });

    expect(state.comments).toHaveLength(1);
    expect(state.media[0].commentId).toBe(result.id);
    expect(state.media[1].commentId).toBeUndefined();
    expect(result.media.map((m: Row) => m.id)).toEqual(['m-bob']);
    expect(counters.postUpdates).toBe(1);
  });

  it('ACCEPTE un commentaire SANS média, sans ouvrir de transaction', async () => {
    const { service, state, counters } = buildWorld([]);

    const result: any = await service.addComment('post-1', BOB, 'juste du texte');

    expect(state.comments).toHaveLength(1);
    expect(result.media).toEqual([]);
    expect(counters.transactions).toBe(0);
  });
});
