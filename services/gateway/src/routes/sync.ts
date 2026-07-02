import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createUnifiedAuthMiddleware, type UnifiedAuthRequest } from '../middleware/auth';
import { SequenceService } from '../services/SequenceService';
import { computeETag, ifNoneMatchMatches } from '../utils/etag';

/**
 * SyncEngine unifié (spec §7, sous-tâche A3.1) — endpoint delta `/sync`
 * read-only, collection PILOTE `messages`.
 *
 * A3.1 livre : validation Zod des query params, la collection `messages`
 * (added / modified / deleted par watermark `since`, cap 1000, tri ASC),
 * `hasGap` exact via `SequenceService.currentSeq` (A1), ETag/304, RLS
 * participant-only. A3.2 ajoutera la pagination cursor complète (ici la
 * troncature est signalée par `truncated` + `nextCursor: null`).
 */

const MAX_ITEMS_PER_COLLECTION = 1000;
const GAP_THRESHOLD = 10_000;
const SUPPORTED_COLLECTIONS = ['messages'] as const;

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
    const { since, collections, seq, limit, scope } = parsed.data;

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
        : await syncMessages({ prisma, userId, sinceDate, cap, scope });
    }

    const payload = {
      checkpoint: new Date().toISOString(),
      checkpointSeq,
      collections: collectionsResult,
      hasMore: Object.values(collectionsResult).some(
        (c) => (c as { truncated?: boolean }).truncated === true,
      ),
      nextCursor: null,
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
}): Promise<{
  added: SyncMessage[];
  modified: SyncMessage[];
  deleted: DeletedRef[];
  truncated: boolean;
  nextCursor: null;
}> {
  const { prisma, userId, sinceDate, cap, scope } = opts;

  // RLS : uniquement les conversations où l'utilisateur est participant actif.
  const memberships = await prisma.participant.findMany({
    where: { userId, isActive: true, ...(scope ? { conversationId: scope } : {}) },
    select: { conversationId: true },
  });
  const conversationIds = memberships.map((m) => m.conversationId);
  if (conversationIds.length === 0) {
    return { added: [], modified: [], deleted: [], truncated: false, nextCursor: null };
  }

  // Non supprimés modifiés depuis `since`, triés updatedAt ASC, cap+1 pour
  // détecter la troncature (la pagination cursor viendra en A3.2).
  const changed = await prisma.message.findMany({
    where: {
      conversationId: { in: conversationIds },
      deletedAt: null,
      updatedAt: { gt: sinceDate },
    },
    select: messageSelect,
    orderBy: { updatedAt: 'asc' },
    take: cap + 1,
  });
  const truncated = changed.length > cap;
  const page = truncated ? changed.slice(0, cap) : changed;

  // added = créé après `since` ; modified = pré-existant mais modifié.
  const added = page.filter((m) => m.createdAt > sinceDate);
  const modified = page.filter((m) => m.createdAt <= sinceDate);

  // Tombstones : supprimés depuis `since`, triés deletedAt ASC.
  const deletedRows = await prisma.message.findMany({
    where: {
      conversationId: { in: conversationIds },
      deletedAt: { gt: sinceDate },
    },
    select: { id: true, conversationId: true, deletedAt: true },
    orderBy: { deletedAt: 'asc' },
    take: cap,
  });
  const deleted: DeletedRef[] = deletedRows.map((d) => ({
    id: d.id,
    conversationId: d.conversationId,
    deletedAt: d.deletedAt as Date,
  }));

  return { added, modified, deleted, truncated, nextCursor: null };
}

// Fastify request typing helper for tests / callers that need the query shape.
export type SyncRequest = FastifyRequest<{
  Querystring: z.infer<typeof syncQuerySchema>;
}>;
