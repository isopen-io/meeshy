/**
 * La liste complète des commentaires d'un post, et les réponses d'un
 * commentaire, ne servent plus ceux d'un auteur qu'un blocage sépare du
 * lecteur, dans un sens comme dans l'autre (#20205, suivi de #16894).
 *
 * Le double Prisma APPLIQUE le `where` reçu (postId, parentId, authorId,
 * AND / OR, `take`) : un filtre posé après la lecture laisserait une page
 * courte, et un filtre absent servirait la ligne — les deux se voient ici.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PostCommentService } from '../../../../services/PostCommentService';

type Row = {
  id: string;
  postId: string;
  parentId: string | null;
  authorId: string;
  createdAt: Date;
};

type Where = Record<string, unknown>;

const matchesField = (row: Row, key: string, cond: unknown): boolean => {
  const value = (row as Record<string, unknown>)[key];
  if (cond === null) return value === null || value === undefined;
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
  if (typeof cond !== 'object') return value === cond;
  const c = cond as Record<string, unknown>;
  if ('isSet' in c) return c.isSet === false ? value === undefined : value !== undefined;
  if ('notIn' in c) return !(c.notIn as unknown[]).includes(value);
  if ('in' in c) return (c.in as unknown[]).includes(value);
  if ('lt' in c) return value instanceof Date && value < (c.lt as Date);
  if ('gt' in c) return value instanceof Date && value > (c.gt as Date);
  return true;
};

const matches = (row: Row, where: Where): boolean =>
  Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return (cond as Where[]).every((w) => matches(row, w));
    if (key === 'OR') return (cond as Where[]).some((w) => matches(row, w));
    if (key === 'deletedAt') return true;
    return matchesField(row, key, cond);
  });

const makeStore = (options: {
  rows: readonly Row[];
  blockedByViewer?: readonly string[];
  blockersOfViewer?: readonly string[];
  blockLookupFails?: boolean;
}) => {
  const asServed = (row: Row) => ({
    id: row.id,
    content: `texte de ${row.authorId}`,
    originalLanguage: 'fr',
    translations: [],
    likeCount: 0,
    replyCount: 0,
    reactionCount: 0,
    effectFlags: 0,
    parentId: row.parentId,
    createdAt: row.createdAt,
    metadata: null,
    postId: row.postId,
    author: { id: row.authorId, username: row.authorId, displayName: row.authorId, avatar: null },
    media: [],
  });
  const failOr = <T>(value: T) =>
    options.blockLookupFails ? Promise.reject(new Error('base indisponible')) : Promise.resolve(value);
  const prisma = {
    postComment: {
      findMany: async ({ where, take }: { where: Where; take: number }) =>
        options.rows.filter((row) => matches(row, where)).slice(0, take).map(asServed),
      findFirst: async ({ where }: { where: Where }) => {
        const row = options.rows.find((r) => matches(r, where));
        return row ? { id: row.id, authorId: row.authorId } : null;
      },
    },
    commentReaction: { findMany: async () => [] },
    user: {
      findMany: async () => failOr((options.blockersOfViewer ?? []).map((id) => ({ id }))),
      findUnique: async () => failOr({ blockedUserIds: [...(options.blockedByViewer ?? [])] }),
    },
  };
  return new PostCommentService(prisma as unknown as PrismaClient);
};

const POST = '6900000000000000000000a1';
const at = (minute: number) => new Date(Date.UTC(2026, 10, 21, 12, minute));
const topLevel = (id: string, authorId: string, minute: number): Row => ({
  id, postId: POST, parentId: null, authorId, createdAt: at(minute),
});
const replyTo = (parentId: string, id: string, authorId: string, minute: number): Row => ({
  id, postId: POST, parentId, authorId, createdAt: at(minute),
});

const authorsOf = (items: ReadonlyArray<{ author: { id: string } }>) => items.map((c) => c.author.id);

describe('GET /posts/:id/comments — la liste complète tait l\'auteur séparé (#20205)', () => {
  const rows = [
    topLevel('c1', 'alice', 1),
    topLevel('c2', 'bloque', 2),
    topLevel('c3', 'bloqueur', 3),
    topLevel('c4', 'carol', 4),
  ];

  it('n\'écarte personne pour un lecteur qui n\'a bloqué personne', async () => {
    const service = makeStore({ rows });
    const page = await service.getComments(POST, undefined, 20, 'lecteur');
    expect(authorsOf(page.items)).toEqual(['carol', 'bloqueur', 'bloque', 'alice']);
  });

  it('écarte l\'auteur que le lecteur a bloqué', async () => {
    const service = makeStore({ rows, blockedByViewer: ['bloque'] });
    const page = await service.getComments(POST, undefined, 20, 'lecteur');
    expect(authorsOf(page.items)).not.toContain('bloque');
  });

  it('écarte l\'auteur qui a bloqué le lecteur (l\'autre sens)', async () => {
    const service = makeStore({ rows, blockersOfViewer: ['bloqueur'] });
    const page = await service.getComments(POST, undefined, 20, 'lecteur');
    expect(authorsOf(page.items)).not.toContain('bloqueur');
  });

  it('écarte DANS la requête : la page reste pleine et `hasMore` reste juste', async () => {
    const service = makeStore({ rows, blockedByViewer: ['bloque'], blockersOfViewer: ['bloqueur'] });
    const page = await service.getComments(POST, undefined, 2, 'lecteur');
    expect(authorsOf(page.items)).toEqual(['carol', 'alice']);
    expect(page.hasMore).toBe(false);
  });

  it('échoue fermé : une lecture des blocages qui lève fait échouer la liste', async () => {
    const service = makeStore({ rows, blockLookupFails: true });
    await expect(service.getComments(POST, undefined, 20, 'lecteur')).rejects.toThrow();
  });
});

describe('GET /posts/:id/comments/:commentId/replies — les réponses taisent l\'auteur séparé (#20205)', () => {
  const rows = [
    topLevel('p1', 'alice', 1),
    replyTo('p1', 'r1', 'bob', 2),
    replyTo('p1', 'r2', 'bloque', 3),
    replyTo('p1', 'r3', 'bloqueur', 4),
    topLevel('p2', 'bloque', 5),
    replyTo('p2', 'r4', 'carol', 6),
  ];

  it('écarte les réponses des auteurs séparés, dans les deux sens', async () => {
    const service = makeStore({ rows, blockedByViewer: ['bloque'], blockersOfViewer: ['bloqueur'] });
    const page = await service.getReplies('p1', undefined, 20, 'lecteur');
    expect(authorsOf(page.items)).toEqual(['bob']);
  });

  it('ne sert aucune réponse sous le commentaire d\'un auteur séparé', async () => {
    const service = makeStore({ rows, blockedByViewer: ['bloque'] });
    const page = await service.getReplies('p2', undefined, 20, 'lecteur');
    expect(page).toEqual({ items: [], nextCursor: null, hasMore: false });
  });

  it('sert toutes les réponses à un lecteur qui n\'a bloqué personne', async () => {
    const service = makeStore({ rows });
    const page = await service.getReplies('p1', undefined, 20, 'lecteur');
    expect(authorsOf(page.items)).toEqual(['bob', 'bloque', 'bloqueur']);
  });
});
