import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createUnifiedAuthMiddleware, type UnifiedAuthRequest } from '../middleware/auth';
import { SequenceService } from '../services/SequenceService';
import { computeETag, ifNoneMatchMatches } from '../utils/etag';

/**
 * SyncEngine unifié (spec §7, sous-tâche A3.1) — endpoint delta `/sync`
 * read-only, collection PILOTE `messages`.
 *
 * A3.1 a livré : validation Zod, la collection `messages` (added / modified /
 * deleted par watermark `since`, cap 1000, tri ASC), `hasGap` exact via
 * `SequenceService.currentSeq` (A1), ETag/304, RLS participant-only.
 *
 * A3.2 ajoute la PAGINATION CURSOR : keyset composite `(updatedAt, id)` (resp.
 * `(deletedAt, id)`) — pas un cursor id-only, car `updatedAt` n'est PAS monotone
 * avec l'id (un vieux message ré-édité a un updatedAt récent mais un id ancien).
 * Le tiebreaker `id` garantit qu'une page reprend EXACTEMENT après la précédente,
 * même sur des `updatedAt` égaux (que le watermark temporel raterait). Le token
 * est opaque (base64url d'un JSON versionné) et encode la position des DEUX
 * streams ; un stream épuisé conserve sa clé (report) pour ne rien re-livrer.
 */

const MAX_ITEMS_PER_COLLECTION = 1000;
const GAP_THRESHOLD = 10_000;
const SUPPORTED_COLLECTIONS = ['messages'] as const;

type CursorKey = { u: string; i: string };
export type SyncCursor = { c?: CursorKey; d?: CursorKey };

/** Encode une position keyset en token opaque (base64url JSON versionné). */
export function encodeSyncCursor(cursor: SyncCursor): string {
  const payload: Record<string, unknown> = { v: 1 };
  if (cursor.c) payload.c = cursor.c;
  if (cursor.d) payload.d = cursor.d;
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/** Décode un token opaque ; jette sur version/forme/date invalide (→ 400). */
export function decodeSyncCursor(token: string): SyncCursor {
  const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
    v?: unknown;
    c?: unknown;
    d?: unknown;
  };
  if (parsed.v !== 1) throw new Error('unsupported cursor version');
  const key = (v: unknown): CursorKey | undefined => {
    if (v === undefined) return undefined;
    if (typeof v !== 'object' || v === null) throw new Error('malformed cursor key');
    const { u, i } = v as Record<string, unknown>;
    if (typeof u !== 'string' || typeof i !== 'string') throw new Error('malformed cursor key');
    if (Number.isNaN(new Date(u).getTime())) throw new Error('malformed cursor date');
    return { u, i };
  };
  const out: SyncCursor = {};
  const c = key(parsed.c);
  const d = key(parsed.d);
  if (c) out.c = c;
  if (d) out.d = d;
  return out;
}

const syncQuerySchema = z.object({
  since: z.string().datetime({ offset: true }),
  collections: z.string().min(1),
  seq: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(MAX_ITEMS_PER_COLLECTION).optional(),
  scope: z.string().optional(),
  cursor: z.string().optional(),
});

type SyncMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

type DeletedRef = { id: string; conversationId: string; deletedAt: Date };

const messageSelect = {
  id: true,
  conversationId: true,
  senderId: true,
  content: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function syncRoutes(fastify: FastifyInstance): Promise<void> {
  const prisma = fastify.prisma;
  const sequenceService = new SequenceService(prisma);
  const requiredAuth = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false,
  });

  fastify.get('/sync', { preValidation: [requiredAuth] }, async (request, reply) => {
    const parsed = syncQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_QUERY', message: parsed.error.issues[0]?.message ?? 'Invalid query' },
      });
    }
    const { since, collections, seq, limit, scope, cursor } = parsed.data;

    const requested = collections.split(',').map((c) => c.trim()).filter(Boolean);
    const unknown = requested.filter(
      (c) => !(SUPPORTED_COLLECTIONS as readonly string[]).includes(c),
    );
    if (unknown.length > 0) {
      return reply.status(400).send({
        success: false,
        error: { code: 'UNSUPPORTED_COLLECTION', message: `Unsupported collections: ${unknown.join(', ')}` },
      });
    }

    // Décodage strict du cursor (opaque) AVANT toute requête — un token corrompu
    // est un bug client, on le surface en 400 plutôt que de repartir de zéro.
    let syncCursor: SyncCursor | undefined;
    if (cursor !== undefined) {
      try {
        syncCursor = decodeSyncCursor(cursor);
      } catch {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_CURSOR', message: 'Malformed cursor' },
        });
      }
    }

    const authRequest = request as UnifiedAuthRequest;
    const userId = authRequest.authContext.userId;
    const sinceDate = new Date(since);
    const cap = Math.min(limit ?? MAX_ITEMS_PER_COLLECTION, MAX_ITEMS_PER_COLLECTION);

    // Gap detection EXACTE (A1) : le client annonce le dernier `_seq` vu ; si
    // le serveur a émis > GAP_THRESHOLD events depuis, le delta temporel ne
    // suffit plus → full resync requis.
    const checkpointSeq = await sequenceService.currentSeq(userId);
    const hasGap = seq !== undefined && seq < checkpointSeq - GAP_THRESHOLD;

    const collectionsResult: Record<string, unknown> = {};
    if (requested.includes('messages')) {
      collectionsResult.messages = hasGap
        ? { added: [], modified: [], deleted: [], truncated: false, nextCursor: null }
        : await syncMessages({ prisma, userId, sinceDate, cap, scope, cursor: syncCursor });
    }

    const messagesCol = collectionsResult.messages as { nextCursor?: string | null } | undefined;

    const payload = {
      checkpoint: new Date().toISOString(),
      checkpointSeq,
      collections: collectionsResult,
      hasMore: Object.values(collectionsResult).some(
        (c) => (c as { truncated?: boolean }).truncated === true,
      ),
      // Pilote mono-collection : le token top-level EST celui de `messages`.
      // Multi-collection (A6) le namespacera par collection.
      nextCursor: messagesCol?.nextCursor ?? null,
      hasGap,
      gapAction: hasGap ? 'full_resync_required' : null,
    };

    // ETag déterministe (§7.3 : sha256 de userId + checkpointSeq +
    // collectionsHash) — EXCLUT le `checkpoint` wall-clock pour rester stable
    // entre deux appels identiques (sinon un 304 ne pourrait jamais matcher).
    // Cache-Control no-store : le contenu (collections) est capturé par le
    // hash, donc un 304 ne sert jamais de périmé.
    const etag = computeETag({ userId, checkpointSeq, collections: collectionsResult, hasGap });
    reply.header('Cache-Control', 'no-store');
    reply.header('ETag', etag);
    if (ifNoneMatchMatches(request.headers['if-none-match'], etag)) {
      return reply.status(304).send();
    }
    return reply.send({ success: true, data: payload });
  });
}

async function syncMessages(opts: {
  prisma: FastifyInstance['prisma'];
  userId: string;
  sinceDate: Date;
  cap: number;
  scope?: string;
  cursor?: SyncCursor;
}): Promise<{
  added: SyncMessage[];
  modified: SyncMessage[];
  deleted: DeletedRef[];
  truncated: boolean;
  nextCursor: string | null;
}> {
  const { prisma, userId, sinceDate, cap, scope, cursor } = opts;

  // RLS : uniquement les conversations où l'utilisateur est participant actif.
  const memberships = await prisma.participant.findMany({
    where: { userId, isActive: true, ...(scope ? { conversationId: scope } : {}) },
    select: { conversationId: true },
  });
  const conversationIds = memberships.map((m) => m.conversationId);
  if (conversationIds.length === 0) {
    return { added: [], modified: [], deleted: [], truncated: false, nextCursor: null };
  }

  // CHANGED — non supprimés modifiés depuis `since`. Keyset `(updatedAt, id)` :
  // à la 1re page on part du floor `since` ; ensuite on reprend STRICTEMENT après
  // la position du cursor (le tiebreaker `id` évite trou/doublon sur updatedAt égal).
  const changedRows = await prisma.message.findMany({
    where: {
      conversationId: { in: conversationIds },
      deletedAt: null,
      ...(cursor?.c
        ? {
            OR: [
              { updatedAt: { gt: new Date(cursor.c.u) } },
              { updatedAt: new Date(cursor.c.u), id: { gt: cursor.c.i } },
            ],
          }
        : { updatedAt: { gt: sinceDate } }),
    },
    select: messageSelect,
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    take: cap + 1,
  });
  const changedTruncated = changedRows.length > cap;
  const changedPage = changedTruncated ? changedRows.slice(0, cap) : changedRows;

  // added = créé après `since` ; modified = pré-existant mais modifié.
  const added = changedPage.filter((m) => m.createdAt > sinceDate);
  const modified = changedPage.filter((m) => m.createdAt <= sinceDate);

  // DELETED — tombstones supprimés depuis `since`. Même keyset `(deletedAt, id)`
  // avec cap+1 : le stream tombstones est désormais paginé (A3.1 le tronquait
  // silencieusement à `cap` sans signal — trou corrigé).
  const deletedRows = await prisma.message.findMany({
    where: {
      conversationId: { in: conversationIds },
      ...(cursor?.d
        ? {
            OR: [
              { deletedAt: { gt: new Date(cursor.d.u) } },
              { deletedAt: new Date(cursor.d.u), id: { gt: cursor.d.i } },
            ],
          }
        : { deletedAt: { gt: sinceDate } }),
    },
    select: { id: true, conversationId: true, deletedAt: true },
    orderBy: [{ deletedAt: 'asc' }, { id: 'asc' }],
    take: cap + 1,
  });
  const deletedTruncated = deletedRows.length > cap;
  const deletedPage = deletedTruncated ? deletedRows.slice(0, cap) : deletedRows;
  const deleted: DeletedRef[] = deletedPage.map((d) => ({
    id: d.id,
    conversationId: d.conversationId,
    deletedAt: d.deletedAt as Date,
  }));

  const truncated = changedTruncated || deletedTruncated;

  // Report par stream : on avance la clé si cette page a livré des items, sinon
  // on conserve la clé entrante — un stream épuisé reste sur sa dernière position
  // pour que la requête keyset suivante ne re-livre ni ne saute rien.
  const lastChanged = changedPage[changedPage.length - 1];
  const lastDeleted = deletedPage[deletedPage.length - 1];
  const cKey: CursorKey | undefined = lastChanged
    ? { u: lastChanged.updatedAt.toISOString(), i: lastChanged.id }
    : cursor?.c;
  const dKey: CursorKey | undefined = lastDeleted
    ? { u: (lastDeleted.deletedAt as Date).toISOString(), i: lastDeleted.id }
    : cursor?.d;
  const nextKey: SyncCursor = {};
  if (cKey) nextKey.c = cKey;
  if (dKey) nextKey.d = dKey;
  const nextCursor = truncated ? encodeSyncCursor(nextKey) : null;

  return { added, modified, deleted, truncated, nextCursor };
}

// Fastify request typing helper for tests / callers that need the query shape.
export type SyncRequest = FastifyRequest<{
  Querystring: z.infer<typeof syncQuerySchema>;
}>;
