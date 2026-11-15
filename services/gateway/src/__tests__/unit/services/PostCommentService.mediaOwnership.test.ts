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
import { MutationLogService, MutationLogDuplicate } from '../../../services/MutationLogService';
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

type Hooks = {
  readonly onCommentCreate?: (media: Row[]) => void;
  /** Fait lever une écriture PRÉCISE — jamais « tout », qui ne prouverait que la survie à un harnais mort. */
  readonly failing?: { readonly postUpdate?: boolean; readonly parentUpdate?: boolean; readonly mediaOrder?: boolean };
};

/**
 * Double STRICT (#9745, B5) : le client remis à la transaction (`tx`) est un
 * objet DISTINCT du client racine, et tout appel au client racine PENDANT la
 * transaction est consigné dans `outsideTransaction` puis lève. Un service qui
 * écrirait par `this.prisma` au lieu de `tx` — donc hors de l'annulation —
 * fait rougir, là où un double passant `prisma` lui-même restait vert.
 */
const buildWorld = (seed: readonly Row[], hooks: Hooks = {}) => {
  const state = { media: seed.map((row) => ({ ...row })), comments: [] as Row[], journal: [] as Row[] };
  const counters = { postUpdates: 0, parentUpdates: 0, transactions: 0 };
  const outsideTransaction: string[] = [];
  const transaction = { open: false };
  const journalRow = (where: any) => state.journal.find((row) =>
    row.userId === where.userId_clientMutationId.userId
    && row.clientMutationId === where.userId_clientMutationId.clientMutationId);

  const models: Record<string, Record<string, (args?: any) => Promise<unknown>>> = {
    post: {
      findFirst: async () => ({ id: 'post-1' }),
      update: async () => {
        if (hooks.failing?.postUpdate) throw new Error('post.update indisponible');
        counters.postUpdates += 1;
        return {};
      },
    },
    postComment: {
      findFirst: async ({ where }: { where: Row }) => state.comments.find((row) => row.id === where.id) ?? null,
      update: async () => {
        if (hooks.failing?.parentUpdate) throw new Error('postComment.update indisponible');
        counters.parentUpdates += 1;
        return {};
      },
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
      findMany: async ({ where }: { where?: Row }) => state.media
        .filter((row) => matches(row, where))
        .sort((left, right) => ((left.order as number) ?? 0) - ((right.order as number) ?? 0)),
      findFirst: async ({ where }: { where?: Row }) => state.media.find((row) => matches(row, where)) ?? null,
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = state.media.find((candidate) => candidate.id === where.id);
        if (row) Object.assign(row, data);
        return row ?? {};
      },
      updateMany: async ({ where, data }: { where?: Row; data: Row }) => {
        if ('order' in data && hooks.failing?.mediaOrder) throw new Error('postMedia.updateMany(order) indisponible');
        const hit = state.media.filter((row) => matches(row, where));
        hit.forEach((row) => Object.assign(row, data));
        return { count: hit.length };
      },
    },
    mutationLog: {
      findUnique: async ({ where }: { where: Row }) => journalRow(where) ?? null,
      create: async ({ data }: { data: Row }) => {
        if (state.journal.some((row) => row.userId === data.userId && row.clientMutationId === data.clientMutationId)) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        state.journal = [...state.journal, { resultId: null, createdAt: new Date(), ...data }];
        return data;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => Object.assign(journalRow(where) ?? {}, data),
      delete: async ({ where }: { where: Row }) => {
        const gone = journalRow(where);
        state.journal = state.journal.filter((row) => row !== gone);
        return gone ?? {};
      },
    },
  };

  const rootOnly = (model: string, method: string, call: (args?: any) => Promise<unknown>) => async (args?: any) => {
    if (transaction.open) {
      outsideTransaction.push(`${model}.${method}`);
      throw new Error(`${model}.${method} appelé HORS de la transaction ouverte`);
    }
    return call(args);
  };
  const root = Object.fromEntries(Object.entries(models).map(([model, methods]) => [
    model,
    Object.fromEntries(Object.entries(methods).map(([method, call]) => [method, rootOnly(model, method, call)])),
  ]));

  const prisma: any = {
    ...root,
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      counters.transactions += 1;
      const snapshot = { media: state.media.map((row) => ({ ...row })), comments: [...state.comments] };
      transaction.open = true;
      try {
        return await work(models);
      } catch (error) {
        state.media = snapshot.media;
        state.comments = snapshot.comments;
        throw error;
      } finally {
        transaction.open = false;
      }
    },
  };

  return {
    service: new PostCommentService(prisma as PrismaClient, noopTrackingLinks),
    journal: new MutationLogService(prisma as PrismaClient),
    state,
    counters,
    outsideTransaction,
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

  it('REFUSE, sans rien créer, un auteur absent ou qui n’est pas un identifiant de compte', async () => {
    const { service, state } = buildWorld([pendingMedia('m-bob', BOB), pendingMedia('m-orphelin', null)]);

    await expect(service.addComment('post-1', undefined as unknown as string, 'x', { mediaIds: ['m-bob'] }))
      .rejects.toThrow('MEDIA_OWNER_REQUIRED');
    await expect(service.addComment('post-1', 'anonymous', 'x', { mediaIds: ['m-orphelin'] }))
      .rejects.toThrow('MEDIA_OWNER_REQUIRED');

    expect(state.comments).toEqual([]);
    expect(state.media.map((row) => row.commentId)).toEqual([undefined, undefined]);
  });
});

describe('PostCommentService.addComment — la transaction porte TOUT ce qui fait le commentaire (#9745, B5)', () => {
  it('n’écrit RIEN par le client racine tant que la transaction est ouverte', async () => {
    const { service, outsideTransaction } = buildWorld([pendingMedia('m-bob', BOB, { mimeType: 'audio/mp4' })]);

    await service.addComment('post-1', BOB, 'vocal', {
      mediaIds: ['m-bob'],
      mobileTranscription: { text: 'bonjour', language: 'fr' } as any,
    });

    expect(outsideTransaction).toEqual([]);
  });

  it('rend les médias dans l’ordre DEMANDÉ, gravé avec la réclamation', async () => {
    const { service, state } = buildWorld([pendingMedia('m-1', BOB), pendingMedia('m-2', BOB)]);

    const result: any = await service.addComment('post-1', BOB, 'deux', { mediaIds: ['m-2', 'm-1'] });

    expect(result.media.map((m: Row) => m.id)).toEqual(['m-2', 'm-1']);
    expect(state.media.map((row) => [row.id, row.order])).toEqual([['m-1', 1], ['m-2', 0]]);
  });

  it('ANNULE tout quand le rang ne s’écrit pas : ni commentaire, ni média pris', async () => {
    const { service, state, counters } = buildWorld([pendingMedia('m-bob', BOB)], { failing: { mediaOrder: true } });

    await expect(service.addComment('post-1', BOB, 'rang', { mediaIds: ['m-bob'] })).rejects.toThrow('indisponible');

    expect(state.comments).toEqual([]);
    expect(state.media[0].commentId).toBeUndefined();
    expect(counters.postUpdates).toBe(0);
  });
});

describe('PostCommentService.addComment — une fois né, le commentaire est RENDU (#9745, B1)', () => {
  it('rend le commentaire et ses médias quand le compteur du post ne s’écrit pas', async () => {
    const { service, state } = buildWorld([pendingMedia('m-bob', BOB)], { failing: { postUpdate: true } });

    const result: any = await service.addComment('post-1', BOB, 'né', { mediaIds: ['m-bob'] });

    expect(state.comments.map((row) => row.id)).toEqual([result.id]);
    expect(result.media.map((m: Row) => m.id)).toEqual(['m-bob']);
  });

  it('rend un commentaire SANS média quand ses compteurs ne s’écrivent pas — et compte quand même le parent', async () => {
    const { service, state, counters } = buildWorld([], { failing: { postUpdate: true } });
    const parent: any = await service.addComment('post-1', ALICE, 'parent');

    const result: any = await service.addComment('post-1', BOB, 'réponse', { parentId: parent.id });

    expect(state.comments.map((row) => row.id)).toEqual([parent.id, result.id]);
    expect(counters.parentUpdates).toBe(1);
  });

  it('rend le commentaire quand le compteur de réponses du parent ne s’écrit pas', async () => {
    const { service, state, counters } = buildWorld([], { failing: { parentUpdate: true } });
    const parent: any = await service.addComment('post-1', ALICE, 'parent');

    const result: any = await service.addComment('post-1', BOB, 'réponse', { parentId: parent.id });

    expect(state.comments).toHaveLength(2);
    expect(result.parentId).toBe(parent.id);
    expect(counters.postUpdates).toBe(2);
  });

  it('le REJEU sous le même identifiant de mutation désigne le MÊME commentaire — ni refus, ni doublon', async () => {
    const { service, journal, state } = buildWorld([pendingMedia('m-bob', BOB)], { failing: { postUpdate: true } });
    const send = () => journal.recordOrReturn({
      userId: BOB,
      clientMutationId: 'cmid_1',
      kind: 'createComment',
      op: async () => (await service.addComment('post-1', BOB, 'une fois', { mediaIds: ['m-bob'] })) as { id: string },
    });

    const first = await send();
    const replay = await send().catch((error: unknown) => error);

    expect(replay).toBeInstanceOf(MutationLogDuplicate);
    expect((replay as MutationLogDuplicate).resultId).toBe(first.id);
    expect(state.comments).toHaveLength(1);
  });
});
