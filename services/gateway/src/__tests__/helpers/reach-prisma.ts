/**
 * Un Prisma en mémoire pour la PORTÉE d'un post (#10483) : posts et leurs
 * compteurs (loi MongoDB du `$add`, via `mongo-post-counter-store`), lignes
 * `AnonymousPostOpen` (unicité `(postId, sessionKey)` → P2002), `PostView`,
 * `PostImpression`, invités (`Participant.sessionTokenHash`).
 *
 * Les clauses `where` sont ÉVALUÉES (`matchesWhere` : égalité, `null`, `in`,
 * `not`, `lt`, `isSet`, `OR`, `AND`) et `take` est appliqué : un témoin
 * contrôle la requête que le code envoie réellement, pas celle que le faux
 * suppose. Un opérateur inconnu lève — un faux qui l'ignorerait serait vert
 * sur n'importe quelle requête.
 *
 * Chaque écriture est JOURNALISÉE en entier (`writes`) : les témoins de
 * confidentialité y cherchent ce qui ne doit jamais être écrit — une valeur
 * brute de X-Session-Token, une empreinte d'adresse.
 */
import { jest } from '@jest/globals';
import { hashSessionToken } from '../../utils/session-token';
import { makeMongoPostCounterStore, type StoredPost } from './mongo-post-counter-store';

export type ReachPost = {
  readonly id: string;
  readonly authorId?: string;
  readonly type?: string;
  readonly visibility?: string;
  readonly deletedAt?: Date | null;
  readonly expiresAt?: Date | null;
  readonly repostOfId?: string | null;
  readonly originalRepostOfId?: string | null;
  readonly author?: { isActive: boolean; deletedAt: Date | null; deactivatedAt: Date | null };
} & Record<string, unknown>;

export type ReachGuest = { readonly id: string; readonly sessionTokens: readonly string[] };

type Open = { postId: string; sessionKey: string; durationMs?: number; expiresAt?: Date };

const ACTIVE_AUTHOR = { isActive: true, deletedAt: null, deactivatedAt: null };

type Row = Record<string, unknown>;

const OPERATORS = new Set(['in', 'not', 'lt', 'isSet', 'equals']);

const isOperatorObject = (condition: unknown): condition is Record<string, unknown> =>
  condition !== null && typeof condition === 'object' && !(condition instanceof Date) && !Array.isArray(condition);

const sameValue = (a: unknown, b: unknown): boolean =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;

/** La loi Prisma/MongoDB d'un champ : `null` ≠ absent, `isSet: false` = absent. */
const matchesField = (value: unknown, condition: unknown): boolean => {
  if (condition === null) return value === null;
  if (!isOperatorObject(condition)) return sameValue(value, condition);
  return Object.entries(condition).every(([operator, operand]) => {
    if (!OPERATORS.has(operator)) throw new Error(`reach-prisma : opérateur non pris en charge « ${operator} »`);
    if (operator === 'isSet') return (value !== undefined) === operand;
    if (operator === 'in') return (operand as unknown[]).some((candidate) => sameValue(value, candidate));
    if (operator === 'not') return operand === null ? value !== null && value !== undefined : !matchesField(value, operand);
    if (operator === 'lt') return typeof value === 'number' && value < (operand as number);
    return matchesField(value, operand);
  });
};

export const matchesWhere = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Row[]).some((clause) => matchesWhere(row, clause));
    if (key === 'AND') return (condition as Row[]).every((clause) => matchesWhere(row, clause));
    return matchesField(row[key], condition);
  });

/**
 * Ce que la v2 lit en plus (#10499) : le consentement d'analyse des comptes,
 * les commentaires (leur post), les notifications (leur destinataire).
 */
export type ReachWorld = {
  readonly consentedUserIds?: readonly string[];
  /** Comptes qui ont RETIRÉ l'analyse côté serveur (`analyticsConsentWithdrawnAt` posé). */
  readonly withdrawnUserIds?: readonly string[];
  readonly comments?: readonly { readonly id: string; readonly postId: string }[];
  readonly notifications?: readonly { readonly id: string; readonly userId: string }[];
};

/** Les collections dont l'`insert` brut tient l'index unique PARTIEL de `eventKey`. */
const idOf = (value: unknown): string =>
  typeof value === 'object' && value !== null && '$oid' in value ? String((value as { $oid: unknown }).$oid) : String(value);

const KEYED_COLLECTIONS = new Set(['ContentEvent', 'PostImpression']);

export function makeReachPrisma(posts: readonly ReachPost[], guests: readonly ReachGuest[] = [], world: ReachWorld = {}) {
  // `deletedAt` ABSENT, comme un post vivant en base : `NOT_DELETED` vaut
  // `{ isSet: false }`, et un `null` explicite ne le satisferait pas.
  const store = makeMongoPostCounterStore(posts.map((post) => ({
    authorId: 'author',
    visibility: 'PUBLIC',
    expiresAt: null,
    repostOfId: null,
    originalRepostOfId: null,
    type: 'POST',
    ...post,
  }) as StoredPost));
  const writes: unknown[] = [];
  const opens: Open[] = [];
  const postViews: { id: string; postId: string; userId: string; duration?: number; surface?: string }[] = [];
  const ids = () => posts.map((post) => post.id);
  const impressions: Record<string, unknown>[] = [];
  const contentEvents: Record<string, unknown>[] = [];
  const rawInserts: { collection: string; count: number }[] = [];
  const collections: Record<string, Record<string, unknown>[]> = { ContentEvent: contentEvents, PostImpression: impressions };

  /** `insert` non ordonné : un doublon de `eventKey` (chaîne) lève E11000 pour CETTE ligne, les autres passent. */
  const rawInsert = (collection: string, documents: Record<string, unknown>[]) => {
    rawInserts.push({ collection, count: documents.length });
    const rows = collections[collection];
    const writeErrors = documents.flatMap((document, index) => {
      const key = document.eventKey;
      if (typeof key === 'string' && rows.some((existing) => existing.eventKey === key)) {
        return [{ index, code: 11000, errmsg: 'E11000 duplicate key error' }];
      }
      rows.push({ ...document });
      return [];
    });
    return { ok: 1, n: documents.length - writeErrors.length, ...(writeErrors.length > 0 ? { writeErrors } : {}) };
  };

  const record = (model: string, op: string, args: unknown) => writes.push({ model, op, args });

  /** `delete` par clé d'événement (`eventKey: { $in }`) et, s'il est donné, par `action`. */
  const rawDelete = (collection: string, deletes: { q: Record<string, unknown> }[]) => {
    const rows = collections[collection];
    const before = rows.length;
    deletes.forEach(({ q }) => {
      const keys = new Set(((q.eventKey as { $in?: string[] } | undefined)?.$in) ?? []);
      const kept = rows.filter((row) => !(keys.has(row.eventKey as string) && (q.action === undefined || row.action === q.action)));
      rows.splice(0, rows.length, ...kept);
    });
    return { ok: 1, n: before - rows.length };
  };
  const row = (id: string) => store.read(id) as (Record<string, unknown> & { id: string }) | undefined;

  const project = (post: Record<string, unknown> & { id: string }) => {
    const parent = typeof post.repostOfId === 'string' ? row(post.repostOfId) : undefined;
    // Prisma rend `null` pour un champ facultatif ABSENT qu'on sélectionne.
    return {
      ...post,
      deletedAt: post.deletedAt ?? null,
      visibilityUserIds: [] as string[],
      author: (post.author as object | undefined) ?? ACTIVE_AUTHOR,
      repostOf: parent
        ? { visibility: parent.visibility, deletedAt: parent.deletedAt ?? null, expiresAt: parent.expiresAt ?? null }
        : null,
    };
  };

  const prisma = {
    post: {
      findMany: jest.fn(async ({ where, take }: { where: Row; take?: number }) => {
        const found = ids().map(row)
          .filter((p): p is Row & { id: string } => p !== undefined && matchesWhere(p, where))
          .slice(0, take ?? Number.POSITIVE_INFINITY);
        return found.map(project);
      }),
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        const post = row(where.id);
        return post ? project(post) : null;
      }),
      update: store.update,
      updateMany: store.updateMany,
    },
    anonymousPostOpen: {
      create: jest.fn(async ({ data }: { data: Open }) => {
        record('anonymousPostOpen', 'create', data);
        if (opens.some((o) => o.postId === data.postId && o.sessionKey === data.sessionKey)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        opens.push({ ...data });
        return data;
      }),
      updateMany: jest.fn(async (args: { where: Row; data: Partial<Open> }) => {
        record('anonymousPostOpen', 'updateMany', args);
        const targets = opens.filter((o) => matchesWhere(o as Row, args.where));
        targets.forEach((target) => Object.assign(target, args.data));
        return { count: targets.length };
      }),
    },
    postView: {
      findUnique: jest.fn(async ({ where }: { where: { postId_userId: { postId: string; userId: string } } }) =>
        postViews.find((v) => v.postId === where.postId_userId.postId && v.userId === where.postId_userId.userId) ?? null),
      create: jest.fn(async ({ data }: { data: { postId: string; userId: string; duration?: number; surface?: string } }) => {
        record('postView', 'create', data);
        if (postViews.some((v) => v.postId === data.postId && v.userId === data.userId)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const created = { id: `postview-${postViews.length + 1}`, ...data };
        postViews.push(created);
        return created;
      }),
      update: jest.fn(async (args: { where: { id: string }; data: { duration?: number } }) => {
        record('postView', 'update', args);
        const index = postViews.findIndex((v) => v.id === args.where.id);
        if (index < 0) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
        postViews[index] = { ...postViews[index], ...args.data };
        return postViews[index];
      }),
    },
    postImpression: {
      createMany: jest.fn(async (args: { data: Record<string, unknown>[] }) => {
        record('postImpression', 'createMany', args);
        impressions.push(...args.data);
        return { count: args.data.length };
      }),
      // Les lignes à clé arrivent par `$runCommandRaw` en JSON étendu (`{ $oid }`) :
      // une ligne se compare sur ses identifiants NUS, quelle que soit sa voie d'écriture.
      findFirst: jest.fn(async ({ where }: { where: { postId: string; userId: string } }) =>
        impressions.find((row) => idOf(row.postId) === where.postId && idOf(row.userId) === where.userId) ?? null),
      findMany: jest.fn(async ({ where }: { where: { userId: string; postId: { in: string[] }; source?: string } }) =>
        impressions
          .map((row, index) => ({ row, index }))
          .filter(({ row }) => idOf(row.userId) === where.userId && where.postId.in.includes(idOf(row.postId))
            && (where.source === undefined || row.source === where.source))
          .map(({ row, index }) => ({ id: String(row.id ?? `impression-${index}`), postId: idOf(row.postId) }))),
      deleteMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        record('postImpression', 'deleteMany', { where });
        const doomed = new Set(where.id.in);
        const kept = impressions.filter((row, index) => !doomed.has(String(row.id ?? `impression-${index}`)));
        impressions.splice(0, impressions.length, ...kept);
        return { count: doomed.size };
      }),
    },
    participant: {
      findFirst: jest.fn(async ({ where }: { where: { sessionTokenHash: string } }) => {
        const guest = guests.find((g) => g.sessionTokens.some((t) => hashSessionToken(t) === where.sessionTokenHash));
        return guest ? { id: guest.id } : null;
      }),
    },
    friendRequest: { findFirst: jest.fn(async () => null) },
    postMention: { findFirst: jest.fn(async () => null) },
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        (world.consentedUserIds ?? []).includes(where.id)
          ? { analyticsConsentAt: new Date('2026-01-01'), dataProcessingConsentAt: new Date('2026-01-01') }
          : (world.withdrawnUserIds ?? []).includes(where.id)
            ? { analyticsConsentAt: null, dataProcessingConsentAt: new Date('2026-01-01'), analyticsConsentWithdrawnAt: new Date('2026-02-01') }
            : { analyticsConsentAt: null, dataProcessingConsentAt: null }),
    },
    postComment: {
      findMany: jest.fn(async ({ where }: { where: Row }) =>
        (world.comments ?? []).filter((comment) => matchesWhere(comment as Row, where))),
    },
    notification: {
      findMany: jest.fn(async ({ where }: { where: Row }) =>
        (world.notifications ?? []).filter((notification) => matchesWhere(notification as Row, where))
          .map((notification) => ({ id: notification.id }))),
    },
    $runCommandRaw: jest.fn(async (command: Record<string, unknown>) => {
      if (typeof command.insert === 'string' && KEYED_COLLECTIONS.has(command.insert)) {
        record(command.insert, 'insert', command);
        return rawInsert(command.insert, command.documents as Record<string, unknown>[]);
      }
      if (typeof command.delete === 'string' && KEYED_COLLECTIONS.has(command.delete)) {
        record(command.delete, 'delete', command);
        return rawDelete(command.delete, command.deletes as { q: Record<string, unknown> }[]);
      }
      record('post', 'runCommandRaw', command);
      return store.runCommandRaw(command);
    }),
  };

  return { prisma, store, writes, opens, postViews, impressions, contentEvents, rawInserts };
}
