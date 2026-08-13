import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createUnifiedAuthMiddleware, type UnifiedAuthRequest } from '../middleware/auth';
import { SequenceService } from '../services/SequenceService';
import { computeETag, ifNoneMatchMatches } from '../utils/etag';
import { loadPersonalHistoryHidingByConversation } from '../services/personalHistoryFilter';
import { Prisma } from '@meeshy/shared/prisma/client';
import { attachmentMediaSelect } from '../services/attachments/attachmentIncludes';
import { messageSenderUserSelect } from './conversations/utils/message-sender-select';
import { logger } from '../utils/logger';

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

/**
 * Retrait appliqué au `checkpoint` rendu au client, en millisecondes.
 *
 * `checkpoint` est un WATERMARK : le client le renvoie en `since` au tour
 * suivant, et la borne serveur est STRICTE (`updatedAt > since`). Tout ce qui
 * n'est pas dans CETTE réponse mais porte un `updatedAt` antérieur au
 * checkpoint tombe donc dans un trou DÉFINITIF — le client ne le redemandera
 * jamais.
 *
 * Deux fenêtres produisent exactement cela, et le retrait couvre les deux :
 *
 * 1. Le checkpoint était pris APRÈS les lectures : toute ligne écrite entre la
 *    requête et l'horodatage était invisible ici et exclue du tour suivant.
 *    Corrigé en ancrant le checkpoint au DÉBUT du handler.
 * 2. `@updatedAt` est estampillé par Prisma à la CONSTRUCTION de l'écriture,
 *    pas à son commit. Une ligne estampillée T peut n'être visible qu'à T+δ :
 *    un checkpoint pris même avant nos lectures laisserait passer les
 *    écritures en vol. Seul un retrait ferme cette seconde fenêtre.
 *
 * Le coût est une RELECTURE bornée (les changements des dernières secondes
 * reviennent une fois de plus), que le client déduplique par `id`. C'est la
 * seule direction sûre, et c'est la règle que le SDK iOS documente déjà côté
 * client (`SyncWatermark` : « la fenêtre ne saute jamais une mise à jour
 * réelle, au pire elle en relit »).
 */
export const SYNC_CHECKPOINT_LAG_MS = 5_000;

const MAX_ITEMS_PER_COLLECTION = 1000;
const GAP_THRESHOLD = 10_000;
const SUPPORTED_COLLECTIONS = ['messages'] as const;

type CursorKey = { u: string; i: string };
/**
 * Position keyset des TROIS streams de la collection `messages` :
 * `c` = modifiés, `d` = supprimés pour TOUS, `h` = masqués pour CE lecteur.
 *
 * `h` est resté absent longtemps, et son absence n'était pas un oubli de
 * pagination : le stream lui-même n'existait pas. Voir `syncHiddenTombstones`.
 */
export type SyncCursor = { c?: CursorKey; d?: CursorKey; h?: CursorKey };

/** Encode une position keyset en token opaque (base64url JSON versionné). */
export function encodeSyncCursor(cursor: SyncCursor): string {
  const payload: Record<string, unknown> = { v: 1 };
  if (cursor.c) payload.c = cursor.c;
  if (cursor.d) payload.d = cursor.d;
  if (cursor.h) payload.h = cursor.h;
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Décode un token opaque ; jette sur version/forme/date invalide (→ 400).
 *
 * `h` reste FACULTATIF sous la même version 1 : un client déjà en vol porte un
 * token sans lui, et le rejeter ferait repartir sa fenêtre de zéro pour un
 * champ purement additif. Un `h` absent démarre simplement son stream au
 * plancher `since`, ce qui est la position correcte pour un client qui n'avait
 * jamais rien reçu de ce stream.
 */
export function decodeSyncCursor(token: string): SyncCursor {
  const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
    v?: unknown;
    c?: unknown;
    d?: unknown;
    h?: unknown;
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
  const h = key(parsed.h);
  if (c) out.c = c;
  if (d) out.d = d;
  if (h) out.h = h;
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

type DeletedRef = { id: string; conversationId: string; deletedAt: Date };

/**
 * Ce que le client DOIT recevoir pour pouvoir écrire une ligne rendable dans sa
 * base locale.
 *
 * Le select de `/sync` s'est longtemps limité à six champs (`id`,
 * `conversationId`, `senderId`, `content`, `createdAt`, `updatedAt`). Un client
 * qui appliquerait `added`/`modified` sur cette base écrirait des lignes qu'il
 * ne peut pas afficher : sans `translations` ni `originalLanguage`, la
 * résolution du Prisme Linguistique n'a RIEN à résoudre et le message
 * s'affiche dans la langue de l'expéditeur ; sans `attachments`, la bulle perd
 * sa pièce jointe ; sans `clientMessageId`, la réconciliation optimiste ne peut
 * pas apparier sa ligne et duplique la bulle.
 *
 * Cette liste est le contrat, et le témoin de forme l'oppose au select réel :
 * une projection amaigrie pour économiser de la bande passante doit d'abord
 * faire rougir un test plutôt que rendre le rattrapage inapplicable en silence.
 */
export const SYNC_MESSAGE_RENDERABLE_KEYS = [
  'id',
  'conversationId',
  'senderId',
  'content',
  'clientMessageId',
  'originalLanguage',
  'translations',
  'messageType',
  'metadata',
  'isEdited',
  'editedAt',
  'replyToId',
  'reactionSummary',
  'reactionCount',
  'attachments',
  'sender',
  'createdAt',
  'updatedAt',
] as const;

/**
 * Projection du stream `changed`. `Prisma.validator` fait échouer le BUILD sur
 * un nom de champ périmé, là où un objet nu échouerait à l'exécution.
 *
 * `attachments` et le bloc `user` de l'expéditeur reprennent les formes
 * canoniques du dépôt (`attachmentMediaSelect`, `messageSenderUserSelect`)
 * plutôt que d'en recopier une variante — c'est exactement la dérive que
 * `attachmentIncludes.ts` documente en tête de fichier.
 */
export const syncMessageSelect = Prisma.validator<Prisma.MessageSelect>()({
  id: true,
  conversationId: true,
  senderId: true,
  content: true,
  clientMessageId: true,
  originalLanguage: true,
  translations: true,
  messageType: true,
  messageSource: true,
  metadata: true,
  isEdited: true,
  editedAt: true,
  replyToId: true,
  reactionSummary: true,
  reactionCount: true,
  validatedMentions: true,
  createdAt: true,
  updatedAt: true,
  attachments: { select: attachmentMediaSelect },
  sender: {
    select: {
      id: true,
      userId: true,
      displayName: true,
      avatar: true,
      type: true,
      role: true,
      language: true,
      user: { select: messageSenderUserSelect },
    },
  },
});

type SyncMessage = Prisma.MessageGetPayload<{ select: typeof syncMessageSelect }>;

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

    // Watermark rendu au client — voir SYNC_CHECKPOINT_LAG_MS. Ancré AVANT
    // toute lecture puis retiré du lag, et jamais RECULÉ sous le `since` déjà
    // acquitté : un watermark qui régresse rejouerait sans fin une fenêtre
    // déjà livrée à un client qui interroge plus souvent que le lag.
    const checkpoint = new Date(
      Math.max(sinceDate.getTime(), Date.now() - SYNC_CHECKPOINT_LAG_MS)
    );

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

    const hasMore = Object.values(collectionsResult).some(
      (c) => (c as { truncated?: boolean }).truncated === true,
    );

    // Une page TRONQUÉE n'a pas livré toute la fenêtre, et le reste est un
    // ARRIÉRÉ : ses `updatedAt` sont ANTÉRIEURS au checkpoint. Avancer le
    // watermark ici affirmerait une couverture non démontrée, et le client qui
    // l'adopterait perdrait tout l'arriéré d'un coup — définitivement, la
    // borne serveur étant stricte. Le watermark reste donc où il est : la
    // suite se réclame par `nextCursor`, et seule la page qui CLÔT le parcours
    // (`hasMore: false`) rend un checkpoint adoptable. Même règle que
    // `SyncWatermark.advancedAfterDeltaPage` côté SDK iOS.
    const payload = {
      checkpoint: (hasMore ? sinceDate : checkpoint).toISOString(),
      checkpointSeq,
      collections: collectionsResult,
      hasMore,
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

/**
 * Le stream des disparitions PERSONNELLES — `UserMessageDeletion`, c'est-à-dire
 * « supprimer pour moi ».
 *
 * Pourquoi un TROISIÈME stream et pas un `where` de plus. Le stream `changed`
 * applique déjà le masquage : un message masqué en est simplement RETIRÉ. Or un
 * retrait ne dit rien — c'est la leçon 234, une lecture plus bas. Le client qui
 * détient déjà la bulle ne re-lit pas la fenêtre où elle n'apparaît plus ; il
 * ne la re-lit jamais, et la bulle reste. Le filtre de lecture ne peut que
 * rétrécir ce qu'une NOUVELLE requête rend, il n'a aucune prise sur une ligne
 * déjà écrite chez le client. La disparition avait donc besoin d'un vocabulaire
 * à elle, exactement comme les tombstones de la liste de conversations.
 *
 * Deux détails que le tri et la pagination rendent non négociables :
 *
 * - **La table interrogée n'est pas `Message`.** Un `delete-for-me` n'écrit QUE
 *   la ligne `UserMessageDeletion` ; `Message.updatedAt` ne bouge pas. Un
 *   stream qui interrogerait le MESSAGE ne verrait jamais ces disparitions —
 *   c'est le corollaire « chercher quelle TABLE l'événement a touchée » de la
 *   leçon 234, et il s'applique ici mot pour mot.
 * - **L'id SERVI et l'id du CURSEUR sont deux ids différents.** Le client
 *   indexe par message, donc la tombstone porte `messageId`. Le keyset, lui,
 *   ordonne les lignes de `UserMessageDeletion` et doit donc départager par
 *   l'id de CETTE table : deux masquages estampillés à la même milliseconde
 *   (un lot de 100 en écrit exactement autant) se départagent par la ligne, pas
 *   par le message qu'elle désigne.
 *
 * Ce que ce stream ne portera JAMAIS : le retour en vue (`restore-for-me`). Il
 * SUPPRIME la ligne, donc il ne reste rien à interroger « depuis `since` », et
 * le client qui avait retiré la bulle n'en détient plus le contenu de toute
 * façon. Une apparition ne s'écrit pas comme une tombstone inversée : elle
 * voyage en temps réel (`MESSAGE_RESTORED_FOR_ME`, une ADRESSE à relire), et un
 * appareil hors ligne au moment du restore la retrouve à sa prochaine lecture
 * du fil — où le filtre de `personalHistoryFilter` ne la masque plus.
 */
async function syncHiddenTombstones(opts: {
  prisma: FastifyInstance['prisma'];
  userId: string;
  sinceDate: Date;
  conversationIds: readonly string[];
  cap: number;
  cursor?: CursorKey;
}): Promise<{ tombstones: DeletedRef[]; truncated: boolean; nextKey: CursorKey | undefined }> {
  const { prisma, userId, sinceDate, conversationIds, cap, cursor } = opts;

  try {
    const rows = await prisma.userMessageDeletion.findMany({
      where: {
        userId,
        message: { conversationId: { in: [...conversationIds] } },
        ...(cursor
          ? {
              OR: [
                { deletedAt: { gt: new Date(cursor.u) } },
                { deletedAt: new Date(cursor.u), id: { gt: cursor.i } },
              ],
            }
          : { deletedAt: { gt: sinceDate } }),
      },
      select: {
        id: true,
        deletedAt: true,
        messageId: true,
        message: { select: { conversationId: true } },
      },
      orderBy: [{ deletedAt: 'asc' }, { id: 'asc' }],
      take: cap + 1,
    });

    const truncated = rows.length > cap;
    const page = truncated ? rows.slice(0, cap) : rows;
    const last = page[page.length - 1];

    return {
      tombstones: page.map((row) => ({
        id: row.messageId,
        conversationId: row.message.conversationId,
        deletedAt: row.deletedAt,
      })),
      truncated,
      nextKey: last ? { u: last.deletedAt.toISOString(), i: last.id } : cursor,
    };
  } catch (error) {
    // Même posture que les tombstones de la liste de conversations : servir le
    // rattrapage reste le produit, en retirer une bulle est une courtoisie. On
    // ne fait donc PAS échouer `/sync` — on rend « je ne peux pas affirmer
    // l'exhaustivité » (`truncated`), ce que le client traduit par « redemande
    // depuis la même position », et le curseur reste où il était pour que la
    // reprise ne saute rien.
    logger.warn('[sync] personal hiding tombstones unavailable, page announced truncated', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { tombstones: [], truncated: true, nextKey: cursor };
  }
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
    select: syncMessageSelect,
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    take: cap + 1,
  });
  const changedTruncated = changedRows.length > cap;
  const changedPage = changedTruncated ? changedRows.slice(0, cap) : changedRows;

  // Le masquage personnel s'applique APRÈS le keyset, jamais dedans : le
  // curseur `(updatedAt, id)` doit rester ancré sur la dernière ligne LUE,
  // sinon une page entièrement masquée ferait reculer la position et la
  // synchronisation boucherait sur place. Filtrer la livraison suffit — c'est
  // le seul stream où un message masqué reviendrait sans que l'utilisateur ait
  // rien demandé, la synchronisation étant déclenchée par l'app, pas par lui.
  const hidingByConversation = await loadPersonalHistoryHidingByConversation(prisma, {
    userId,
    conversationIds,
  });
  const visible = hidingByConversation.size === 0
    ? changedPage
    : changedPage.filter((m) => {
        const hiding = hidingByConversation.get(m.conversationId);
        if (!hiding) return true;
        if (hiding.hiddenMessageIds.includes(m.id)) return false;
        return hiding.clearHistoryBefore === null || m.createdAt >= hiding.clearHistoryBefore;
      });

  // added = créé après `since` ; modified = pré-existant mais modifié.
  const added = visible.filter((m) => m.createdAt > sinceDate);
  const modified = visible.filter((m) => m.createdAt <= sinceDate);

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
  const globalTombstones: DeletedRef[] = deletedPage.map((d) => ({
    id: d.id,
    conversationId: d.conversationId,
    deletedAt: d.deletedAt as Date,
  }));

  // HIDDEN — disparitions PERSONNELLES. Servies dans le MÊME tableau que les
  // suppressions globales : côté client le geste est identique (retirer la
  // bulle), et deux tableaux auraient obligé chaque client à écrire deux fois
  // le même retrait. La distinction reste lisible sur le serveur, où elle porte
  // — deux tables, deux keysets.
  const hidden = await syncHiddenTombstones({
    prisma,
    userId,
    sinceDate,
    conversationIds,
    cap,
    cursor: cursor?.h,
  });

  // Un message peut être masqué pour moi PUIS supprimé pour tous : il sort des
  // deux streams. Dédupliquer par message évite d'annoncer deux fois la même
  // disparition, la première rencontrée (la plus ancienne après tri) gagnant.
  const deleted: DeletedRef[] = [...globalTombstones, ...hidden.tombstones]
    .sort((a, b) => a.deletedAt.getTime() - b.deletedAt.getTime() || a.id.localeCompare(b.id))
    .filter((ref, index, all) => all.findIndex((other) => other.id === ref.id) === index);

  const truncated = changedTruncated || deletedTruncated || hidden.truncated;

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
  if (hidden.nextKey) nextKey.h = hidden.nextKey;
  const nextCursor = truncated ? encodeSyncCursor(nextKey) : null;

  return { added, modified, deleted, truncated, nextCursor };
}

// Fastify request typing helper for tests / callers that need the query shape.
export type SyncRequest = FastifyRequest<{
  Querystring: z.infer<typeof syncQuerySchema>;
}>;
