/**
 * `/conversations/:conversationId/receipts` — la COLLECTION unique des accusés
 * de réception et de lecture (#4349, suivi de #4179).
 *
 * Un accusé s'écrivait par SIX portes et se lisait par QUATRE, chacune avec sa
 * version des mêmes gardes — donc son trou : seule `delivery-receipt` vérifiait
 * qu'un `messageId` appartient à la conversation et n'est pas de l'appelant ;
 * deux lectures sur quatre appliquaient le plancher ; `markedCount` nommait DEUX
 * grandeurs ; `type: 'delivered'` n'avait aucune branche, d'où un 500.
 *
 * ## Une fusion qui RECOPIE recrée le doublon qu'elle prétend fermer
 *
 * Les unités PARTAGÉES vivent ici et les portes historiques deviennent des
 * adaptateurs : {@link resolveReceiptReader} (conversation, appartenance,
 * plancher paresseux), {@link applyReceipt} (gardes, marquage, diffusion,
 * `markedCount`) et {@link readReceipts} (`detail`, `filter`, `cursor`,
 * cardinalité). Un adaptateur ne re-décide RIEN : il traduit des paramètres
 * (`:id` contre `:conversationId`, un `type` implicite dans le chemin) et remet
 * en forme la charge HISTORIQUE que ses clients décodent déjà — en refaire une
 * garde serait la septième copie.
 *
 * ## `markedCount` a UNE définition : le nombre RÉELLEMENT FIGÉ
 *
 * `markMessagesAsRead` / `markMessagesAsReceived` rendent le compte que
 * `freezeMessageStatus` a écrit ; c'est CE nombre qui sort des cinq portes.
 * Avant, `mark-read` et `mark-as-read` servaient sous ce nom, en mode FENÊTRE,
 * le compte de NON-LUS d'AVANT marquage — voisin mais distinct (il inclut le
 * lu-mais-non-figé, exclut ce que `caughtUpToMessageId` fige sans compter, et ne
 * dit rien de la LIVRAISON). Le badge a désormais sa clé, `unreadCount`, APRÈS
 * le marquage.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest, RouteGenericInterface } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { z } from 'zod';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import {
  createUnifiedAuthMiddleware,
  type UnifiedAuthContext,
  type UnifiedAuthRequest,
} from '../../middleware/auth';
import { MessageReadStatusService } from '../../services/MessageReadStatusService';
import { PrivacyPreferencesService } from '../../services/PrivacyPreferencesService';
import { ConversationBridgeService } from '../../services/ConversationBridgeService';
import { broadcastReadStatus } from '../../socketio/broadcastReadStatus';
import type { ConversationRoomEmitter } from '../../socketio/emitToConversationParticipants';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { resolveCallerParticipant } from './utils/access-control';
import { historyReaderFromAuthContext, loadReaderHistoryFloor } from '../../services/historyFloor';
import { MarkReadBodySchema } from '../../validation/messages-schemas';
import {
  sendBadRequest,
  sendForbidden,
  sendInternalError,
  sendNotFound,
  sendSuccess,
} from '../../utils/response.js';
import { sendWithETag } from '../../utils/etag';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'ConversationReceiptsRoutes' });

// ── Cardinalités — bornées des DEUX côtés (#4349 critère 3) ───────────────────
/**
 * Plafond d'ÉCRITURE, aligné sur `MarkReadBodySchema.messageIds` — la seule
 * borne qui existait avant ce lot, et qui ne couvrait que deux portes sur six.
 */
export const RECEIPTS_MAX_WRITE_MESSAGE_IDS = 200;

/**
 * Plafond de LECTURE, strictement inférieur à l'écriture : une lecture porte
 * plus par requête (tout ce qui vient d'apparaître à l'écran) qu'une écriture,
 * qui ne porte que ce qu'UN lecteur a réellement vu.
 */
export const RECEIPTS_MAX_READ_MESSAGE_IDS = 100;

/** Page nominative (`detail=people`) : défaut, plafond. */
export const RECEIPTS_PEOPLE_DEFAULT_LIMIT = 20;
export const RECEIPTS_PEOPLE_MAX_LIMIT = 100;
/** `scope=recent` : combien de messages récents la collection résout d'elle-même. */
export const RECEIPTS_RECENT_SCOPE_SIZE = 50;
/** Débit des écritures : 120/min par COMPTE (#4349 critère 6). */
export const RECEIPTS_WRITE_RATE_LIMIT_MAX = 120;

// ── Contrats ──────────────────────────────────────────────────────────────────
export type ReceiptType = 'read' | 'received' | 'delivered';

export interface ReceiptParams { conversationId: string; }
/** Le chemin historique `POST /conversations/:id/mark-read` nomme son paramètre `id`. */
export interface ReceiptAliasParams { id: string; }
export interface DeliveryReceiptAliasParams { conversationId: string; messageId: string; }
export interface MessageReadStatusAliasParams { messageId: string; }
export interface ReadStatusesAliasQuery { messageIds?: string; }

export interface ReceiptsQuery {
  messageIds?: string;
  scope?: 'recent';
  detail?: 'summary' | 'people';
  filter?: 'all' | 'read' | 'delivered' | 'unread';
  cursor?: string;
  limit?: number;
}

/**
 * Le corps de l'écriture unique : `MarkReadBodySchema` — déjà `.strict()`, déjà
 * borné à 200 ids et 200 langues — ÉTENDU d'un `type` plutôt que recopié, pour
 * que les deux formes ne divergent pas sur ce qu'un client a le droit de dire.
 */
export const ReceiptWriteBodySchema = MarkReadBodySchema.extend({
  type: z.enum(['read', 'received', 'delivered']),
});

export type ReceiptWriteBody = z.infer<typeof ReceiptWriteBodySchema>;

export interface ReceiptOutcome {
  readonly type: ReceiptType;
  /** Entrées RÉELLEMENT figées par cet appel. Jamais un décompte de non-lus. */
  readonly markedCount: number;
  /** Le badge APRÈS marquage — la grandeur que `markedCount` ne nomme pas. */
  readonly unreadCount: number;
  /**
   * Ids rapportés ayant survécu aux gardes et n'appartenant pas à l'appelant —
   * `null` quand l'appel n'en rapportait AUCUN (mode fenêtre), ce qui n'est pas
   * « zéro ». Hors contrat de fil : sert aux adaptateurs qui distinguent « rien
   * à faire » de « fait », comme `delivery-receipt` depuis toujours.
   */
  readonly targetedCount: number | null;
}

export type ReceiptFailure = { readonly ok: false; readonly status: 400 | 403 | 404; readonly reason: string };

export type ReceiptReader = {
  readonly ok: true;
  readonly conversationId: string;
  readonly membership: { id: string; role: string };
  /**
   * PARESSEUX et mémoïsé : le plancher coûte une lecture `Participant` (parfois
   * plus une de lien), et le chemin FENÊTRE — corps vide des clients déjà
   * distribués — n'a aucun id à lui confronter.
   */
  readonly historyFloor: () => Promise<Date | null>;
};

export interface ReceiptContext {
  readonly prisma: PrismaClient;
  readonly readStatusService: MessageReadStatusService;
  readonly privacyPreferencesService: PrivacyPreferencesService;
  readonly bridgeService: ConversationBridgeService;
  /** Lus à l'APPEL : les deux sont décorés APRÈS l'enregistrement des routes. */
  readonly io: () => ConversationRoomEmitter | null | undefined;
  readonly notificationService: () => FastifyInstance['notificationService'] | undefined;
}

/**
 * Les collaborateurs, construits UNE fois par enregistrement de plugin — comme
 * `messageReadStatusRoutes` le fait déjà, et non PAR REQUÊTE comme `mark-read`,
 * qui ré-importait le module de service à chaque appel.
 */
export function receiptContext(fastify: FastifyInstance, prisma: PrismaClient): ReceiptContext {
  return {
    prisma,
    readStatusService: new MessageReadStatusService(prisma),
    privacyPreferencesService: new PrivacyPreferencesService(prisma),
    bridgeService: new ConversationBridgeService(prisma),
    io: () => fastify.socketIOHandler?.getManager?.()?.getIO(),
    notificationService: () => fastify.notificationService,
  };
}

// ── Débit — 120/min, clé `user:`, hook `preHandler` ───────────────────────────
/**
 * Le seul dimensionnement du débit des accusés, partagé par les cinq portes
 * d'écriture.
 *
 * `hook: 'preHandler'` — sans quoi la clé « par compte » est une FICTION :
 * `config.rateLimit` s'évalue par défaut à `onRequest`, AVANT `preValidation`,
 * donc avant que l'auth ne pose `authContext` ; le `keyGenerator` y reçoit
 * `undefined` et retombe sur `ip:${request.ip}`. Plusieurs comptes derrière une
 * même sortie (mobile, bureau, NAT) partagent un crédit prévu pour un seul, et
 * un compte à plusieurs adresses en obtient autant. Mesuré deux fois (#4334, #4347).
 *
 * `skipOnError: false` — `registerGlobalRateLimiter` pose `skipOnError: true`,
 * valeur GLOBALE qu'@fastify/rate-limit fusionne dans toute config qui ne la
 * redéclare pas : un Redis indisponible ouvrirait ces portes en grand.
 *
 * Aucun `isLocalIp` — une exemption fondée sur la FORME d'une adresse a déjà
 * neutralisé les limiteurs d'authentification du dépôt (#4137). Et 120, non 30 :
 * à 30, une conversation animée épuisait SEULE le quota que `mark-as-received`
 * et `mark-as-read` PARTAGENT, faisant rejeter des accusés de LECTURE.
 */
export function createReceiptWriteRateLimitConfig(): object {
  return {
    max: RECEIPTS_WRITE_RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    hook: 'preHandler' as const,
    skipOnError: false,
    keyGenerator: (request: FastifyRequest) => {
      const authContext = (request as UnifiedAuthRequest).authContext;
      return `receipts:user:${authContext?.userId ?? `ip:${request.ip}`}`;
    },
    errorResponseBuilder: () => ({
      success: false,
      error: 'Too many read-receipt updates. Please slow down.',
      statusCode: 429,
    }),
  };
}

// ── Les gardes COMMUNES (#4349 critère 3) ─────────────────────────────────────
const failure = (status: 400 | 403 | 404, reason: string): ReceiptFailure =>
  ({ ok: false, status, reason });

/** Le seul site où un échec de garde devient une réponse HTTP. */
export function sendReceiptFailure(reply: FastifyReply, result: ReceiptFailure): void {
  if (result.status === 404) return sendNotFound(reply, result.reason);
  if (result.status === 403) return sendForbidden(reply, result.reason);
  return sendBadRequest(reply, result.reason);
}

/**
 * La porte d'entrée COMMUNE des écritures et des lectures : conversation,
 * appartenance, plancher d'historique. Avant ce lot chacune des dix portes en
 * tenait sa version, et trois ne regardaient jamais le plancher.
 */
export async function resolveReceiptReader(
  ctx: ReceiptContext,
  authContext: UnifiedAuthContext,
  conversationRef: string
): Promise<ReceiptReader | ReceiptFailure> {
  const conversationId = await resolveConversationId(ctx.prisma, conversationRef);
  if (!conversationId) return failure(404, 'Conversation non trouvée');
  return resolveReceiptReaderFor(ctx, authContext, conversationId, conversationRef);
}

/**
 * La seule règle d'accès que `canAccessConversation` portait EN PLUS de
 * l'appartenance — ici SANS requête, puisqu'elle est pure. `mark-read` y passait
 * là où ses quatre sœurs ne consultaient que `resolveCallerParticipant` ; hors
 * `meeshy` les deux rendent le même verdict, au prix d'une lecture de plus. La
 * conversation GLOBALE, elle, n'admet AUCUN invité de lien — règle désormais
 * appliquée par les CINQ écritures : convergence vers la garde la plus FORTE.
 */
function globalConversationRefusesGuest(
  authContext: UnifiedAuthContext,
  conversationId: string,
  conversationRef?: string
): boolean {
  const isGlobal = conversationId === 'meeshy' || conversationRef === 'meeshy';
  if (!isGlobal) return false;
  return authContext?.isAnonymous === true || authContext?.type === 'anonymous';
}

/**
 * La même porte pour un appelant qui tient DÉJÀ un `Conversation.id` résolu —
 * l'adaptateur de `GET /messages/:messageId/read-status`, qui l'a lu sur la
 * ligne du message. `resolveConversationId` traduit un IDENTIFIANT (`"meeshy"`,
 * `mshy_…`) en ObjectId : il n'a rien à dire d'un ObjectId.
 */
export async function resolveReceiptReaderFor(
  ctx: ReceiptContext,
  authContext: UnifiedAuthContext,
  conversationId: string,
  conversationRef?: string
): Promise<ReceiptReader | ReceiptFailure> {
  if (globalConversationRefusesGuest(authContext, conversationId, conversationRef)) {
    return failure(403, 'Accès non autorisé à cette conversation');
  }

  const membership = await resolveCallerParticipant(ctx.prisma, authContext, conversationId);
  if (!membership) return failure(403, 'Accès non autorisé à cette conversation');

  let pending: Promise<Date | null> | undefined;
  return {
    ok: true,
    conversationId,
    membership,
    historyFloor: () => {
      pending ??= loadReaderHistoryFloor(ctx.prisma, {
        conversationId,
        reader: historyReaderFromAuthContext(authContext),
      });
      return pending;
    },
  };
}

export interface VettedMessages {
  readonly ok: true;
  /** Les ids retenus : dans la conversation, vivants, au-dessus du plancher, pas de l'appelant. */
  readonly targeted: readonly string[];
}

/**
 * L'anti-spoof GÉNÉRALISÉ — la garde que seule `delivery-receipt` portait.
 *
 * Deux refus et une exclusion, et l'écart est délibéré :
 *
 * - id INCONNU, SUPPRIMÉ ou d'une AUTRE conversation ⇒ REFUS (404) : le silence
 *   encouragerait la forge, et `_advanceCursor` accepte un `createdAt`
 *   arbitraire sans jamais filtrer par conversation ;
 * - id ANTÉRIEUR au plancher ⇒ REFUS (404), même verdict et même texte qu'une
 *   absence : « n'existe pas » et « pas encore visible » restent indiscernables ;
 * - id dont l'appelant est l'EXPÉDITEUR ⇒ simple EXCLUSION : le client rapporte
 *   ce qu'il a AFFICHÉ, ses propres bulles comprises. `freezeMessageStatus` les
 *   écarte déjà (`senderId: { not: participantId }`) et `delivery-receipt`
 *   répondait « aucune action requise » ; refuser le lot casserait un cas normal.
 */
export async function vetReportedMessages(
  ctx: ReceiptContext,
  reader: ReceiptReader,
  messageIds: readonly string[]
): Promise<VettedMessages | ReceiptFailure> {
  if (messageIds.length === 0) return { ok: true, targeted: [] };
  if (messageIds.length > RECEIPTS_MAX_WRITE_MESSAGE_IDS) {
    return failure(400, `Trop de messageIds (maximum ${RECEIPTS_MAX_WRITE_MESSAGE_IDS})`);
  }

  const unique = [...new Set(messageIds)];
  const rows =
    (await ctx.prisma.message.findMany({
      where: { id: { in: unique }, conversationId: reader.conversationId, deletedAt: null },
      select: { id: true, senderId: true, createdAt: true },
      // La borne est DÉJÀ portée par le `in` (`unique` est refusé au-dessus de
      // RECEIPTS_MAX_WRITE_MESSAGE_IDS, juste au-dessus). Le `take` la rend
      // VISIBLE : le cliquet des `findMany` non bornés ne lit pas le `where`,
      // et une borne qu'un seul humain peut voir n'est pas une borne.
      take: RECEIPTS_MAX_WRITE_MESSAGE_IDS,
    })) ?? [];

  // Fail-CLOSED : une lecture qui n'a pas rendu AUTANT de lignes que d'ids
  // demandés n'a pas prouvé leur appartenance, quelle qu'en soit la raison.
  if (rows.length !== unique.length) return failure(404, 'Message non trouvé');

  const floor = await reader.historyFloor();
  if (floor && rows.some((row) => row.createdAt < floor)) {
    return failure(404, 'Message non trouvé');
  }

  const targeted = rows.filter((row) => row.senderId !== reader.membership.id).map((row) => row.id);
  return { ok: true, targeted };
}

// ── L'ÉCRITURE — l'unité partagée par les cinq portes ─────────────────────────
export interface ApplyReceiptParams {
  readonly authContext: UnifiedAuthContext;
  readonly conversationRef: string;
  readonly type: ReceiptType;
  readonly messageIds?: readonly string[];
  readonly caughtUpToMessageId?: string;
  readonly language?: string;
  readonly messageLanguages?: Readonly<Record<string, string>>;
}

/**
 * L'écriture unique. Les cinq portes passent ICI — aucune ne marque, ne diffuse
 * ni ne compte pour son compte.
 *
 * | `type` | ce qu'il avance | diffusé comme |
 * |---|---|---|
 * | `read` | le curseur de LECTURE (et, par implication, celui de livraison) | `read` |
 * | `received` | le curseur de LIVRAISON, toute la conversation | `received` |
 * | `delivered` | le curseur de LIVRAISON, borné aux messages RAPPORTÉS | `received` |
 *
 * `delivered` est la forme PAR MESSAGE de `received` — ce que fait déjà
 * `POST …/messages/:messageId/delivery-receipt` (NSE iOS, destinataire hors
 * ligne). Avant, le mot était accepté par `MessageStatusBodySchema` sans AUCUNE
 * branche : le gestionnaire sortait sans `reply`, que Fastify 5 transforme en
 * 500 (critère 5). `read` et `received` restent DISTINCTS — livré depuis
 * longtemps n'est pas lu —, d'où l'impossibilité de dériver `markedCount`.
 */
export async function applyReceipt(
  ctx: ReceiptContext,
  params: ApplyReceiptParams
): Promise<{ ok: true; outcome: ReceiptOutcome } | ReceiptFailure> {
  const reader = await resolveReceiptReader(ctx, params.authContext, params.conversationRef);
  if (reader.ok === false) return reader;

  const { conversationId, membership } = reader;
  const isAnonymous = params.authContext?.isAnonymous === true || params.authContext?.type === 'anonymous';
  const actorKey = params.authContext?.userId as string;

  const reported = params.messageIds;
  const hasReport = reported !== undefined || params.caughtUpToMessageId !== undefined;

  // Le raccourci « aucun non-lu → ne rien figer » ne vaut QUE sans rapport : le
  // curseur peut buter sur un trou et annoncer 0 pendant que le client affiche
  // des messages situés APRÈS. Il ne saute jamais la cascade notifications — une
  // réaction ou une mention sur un message DÉJÀ lu en a créé une, badge à 0.
  if (params.type === 'read' && !hasReport) {
    const before = await ctx.readStatusService.getUnreadCount(membership.id, conversationId);
    if (before === 0) {
      Promise.resolve(
        ctx.notificationService()?.markConversationNotificationsAsRead?.(actorKey, conversationId)
      ).catch(() => {});
      return { ok: true, outcome: { type: params.type, markedCount: 0, unreadCount: 0, targetedCount: 0 } };
    }
  }

  let targeted: readonly string[] | undefined;
  if (reported !== undefined) {
    const vetted = await vetReportedMessages(ctx, reader, reported);
    if (vetted.ok === false) return vetted;
    targeted = vetted.targeted;
  }

  // « Rien à acquitter » : tout le lot RAPPORTÉ appartenait à l'appelant —
  // l'early-return de `delivery-receipt` (« Aucune action requise »), GÉNÉRALISÉ.
  // Ni écriture ni diffusion : un accusé de soi à soi n'apprend rien à personne.
  // Le lot doit être NON VIDE — `messageIds: []` dit « rien n'a été affiché »,
  // que `freezeMessageStatus` traite déjà comme significatif.
  const nothingToAcknowledge =
    reported !== undefined && reported.length > 0 &&
    targeted !== undefined && targeted.length === 0 &&
    params.caughtUpToMessageId === undefined;
  if (nothingToAcknowledge) {
    const unread = await ctx.readStatusService.getUnreadCount(membership.id, conversationId);
    return { ok: true, outcome: { type: params.type, markedCount: 0, unreadCount: unread, targetedCount: 0 } };
  }

  // `caughtUpToMessageId` passe la MÊME garde d'appartenance : il alimente
  // `_advanceCursor` avec `resetUnreadCount: true`, donc un id forgé d'une autre
  // conversation y remettrait un badge à zéro sur une date arbitraire. Seule
  // différence : rattraper jusqu'à SON PROPRE dernier message est légitime,
  // l'exclusion « expéditeur » ne s'applique donc pas ici.
  if (params.caughtUpToMessageId !== undefined) {
    const belongs = await ctx.prisma.message.findFirst({
      where: { id: params.caughtUpToMessageId, conversationId, deletedAt: null },
      select: { id: true, createdAt: true },
    });
    if (!belongs) return failure(404, 'Message non trouvé');
    const floor = await reader.historyFloor();
    if (floor && belongs.createdAt < floor) return failure(404, 'Message non trouvé');
  }

  const markedCount = await markFor(ctx, {
    type: params.type,
    participantId: membership.id,
    conversationId,
    targeted,
    caughtUpToMessageId: params.caughtUpToMessageId,
    language: params.language,
    messageLanguages: params.messageLanguages,
  });

  // La diffusion est best-effort : un accroc Socket.IO ne doit jamais faire
  // échouer un marquage déjà écrit en base.
  try {
    await broadcastReadStatus(
      {
        io: ctx.io(),
        prisma: ctx.prisma,
        readStatusService: ctx.readStatusService,
        privacyPreferencesService: ctx.privacyPreferencesService,
        bridgeService: ctx.bridgeService,
      },
      {
        conversationId,
        participantId: membership.id,
        userId: actorKey,
        isAnonymous,
        type: params.type === 'read' ? 'read' : 'received',
      }
    );
  } catch (error) {
    logger.error('Erreur lors de la diffusion Socket.IO', error as Error);
  }

  const unreadCount = await ctx.readStatusService.getUnreadCount(membership.id, conversationId);
  return {
    ok: true,
    outcome: { type: params.type, markedCount, unreadCount, targetedCount: targeted?.length ?? null },
  };
}

type MarkArgs = {
  readonly type: ReceiptType;
  readonly participantId: string;
  readonly conversationId: string;
  readonly targeted?: readonly string[];
  readonly caughtUpToMessageId?: string;
  readonly language?: string;
  readonly messageLanguages?: Readonly<Record<string, string>>;
};

async function markFor(ctx: ReceiptContext, args: MarkArgs): Promise<number> {
  if (args.type === 'read') {
    const exact =
      args.targeted !== undefined ||
      args.caughtUpToMessageId !== undefined ||
      args.language !== undefined ||
      args.messageLanguages !== undefined;
    return ctx.readStatusService.markMessagesAsRead(
      args.participantId,
      args.conversationId,
      undefined,
      exact
        ? {
            messageIds: args.targeted,
            language: args.language,
            messageLanguages: args.messageLanguages,
            caughtUpToMessageId: args.caughtUpToMessageId,
          }
        : undefined
    );
  }

  // `received` : toute la conversation, en une passe. `delivered` sans aucun id
  // rapporté retombe DÉLIBÉRÉMENT sur cette forme — les deux mots nomment le
  // même curseur, seule la borne change.
  if (args.type === 'received' || args.targeted === undefined) {
    return ctx.readStatusService.markMessagesAsReceived(args.participantId, args.conversationId);
  }

  // Tout ce qui était rapporté appartenait à l'appelant : rien à livrer, et
  // surtout pas un balayage de toute la conversation qu'on n'a pas demandé.
  if (args.targeted.length === 0) return 0;

  // `delivered` : la forme PAR MESSAGE. Le service dédoublonne par
  // `(participant, conversation, message)`, donc un lot rejoué ne compte pas
  // deux fois.
  let total = 0;
  for (const messageId of args.targeted) {
    total += await ctx.readStatusService.markMessagesAsReceived(
      args.participantId,
      args.conversationId,
      messageId
    );
  }
  return total;
}

// ── La LECTURE — l'unité partagée ─────────────────────────────────────────────
const iso = (value: Date | null | undefined): string | null =>
  value instanceof Date ? value.toISOString() : null;

/** Les dates y sont DÉJÀ des chaînes ISO : la charge décrit le fil, pas la base. */
export interface ReceiptSummaryRow {
  readonly totalMembers: number;
  readonly receivedCount: number;
  readonly readCount: number;
  readonly deliveredToAllAt: string | null;
  readonly readByAllAt: string | null;
}

export interface ReceiptPersonRow {
  readonly participantId: string;
  readonly displayName: string;
  readonly avatar: string | null;
  readonly deliveredAt: string | null;
  readonly receivedAt: string | null;
  readonly readAt: string | null;
  readonly readDevice: string | null;
}
export interface ReceiptsPayload {
  readonly detail: 'summary' | 'people';
  readonly messageIds: readonly string[];
  readonly summary?: Readonly<Record<string, ReceiptSummaryRow>>;
  readonly people?: readonly ReceiptPersonRow[];
  readonly pagination?: {
    readonly total: number;
    readonly limit: number;
    readonly offset: number;
    readonly hasMore: boolean;
    readonly nextCursor: string | null;
  };
}

/**
 * Curseur de page nominative : un DÉCALAGE opaque — opaque parce qu'un client qui
 * fabrique `?offset=` finit par en dépendre, décalage parce que
 * `getMessageStatusDetails` découpe en mémoire (#4179) et qu'un curseur par clé
 * mentirait sur une pagination qui n'en est pas une.
 */
export const encodeReceiptCursor = (offset: number): string =>
  Buffer.from(`offset:${offset}`, 'utf8').toString('base64url');

export function decodeReceiptCursor(cursor: string | undefined): number | null {
  if (!cursor) return 0;
  const match = /^offset:(\d+)$/.exec(Buffer.from(cursor, 'base64url').toString('utf8'));
  return match ? Number(match[1]) : null;
}

/** La requête telle qu'elle arrive, plus l'identité de qui la pose. */
export type ReadReceiptsParams = Readonly<ReceiptsQuery> & {
  readonly authContext: UnifiedAuthContext;
  readonly conversationRef: string;
};

/**
 * La lecture unique : deux formes derrière `detail`, MÊME plancher pour les deux
 * — celui que trois des quatre lectures historiques n'appliquaient pas.
 * `detail=people` passe SYSTÉMATIQUEMENT par `filterReadReceiptVisible`
 * (critère 3) : un accusé NOMINATIF publie une identité et un horodatage, donc
 * `showReadReceipts` de la personne NOMMÉE décide — question qui ne se réécrit à
 * aucun site, l'avoir relue ailleurs l'a déjà fait diverger.
 */
export async function readReceipts(
  ctx: ReceiptContext,
  params: ReadReceiptsParams
): Promise<{ ok: true; payload: ReceiptsPayload } | ReceiptFailure> {
  const reader = await resolveReceiptReader(ctx, params.authContext, params.conversationRef);
  if (reader.ok === false) return reader;

  const detail = params.detail ?? 'summary';
  const floor = await reader.historyFloor();

  const resolved = await resolveRequestedMessageIds(ctx, reader, params, floor);
  if (resolved.ok === false) return resolved;
  const messageIds = resolved.ids;

  if (detail === 'people') return readPeople(ctx, reader, params, messageIds, floor);

  const statusMap = await ctx.readStatusService.getConversationReadStatuses(
    reader.conversationId,
    [...messageIds],
    floor
  );

  const summary: Record<string, ReceiptSummaryRow> = {};
  for (const [messageId, row] of statusMap) {
    const { totalMembers, receivedCount, readCount } = row;
    summary[messageId] = {
      totalMembers,
      receivedCount,
      readCount,
      deliveredToAllAt: iso(row.deliveredToAllAt),
      readByAllAt: iso(row.readByAllAt),
    };
  }
  return { ok: true, payload: { detail: 'summary', messageIds, summary } };
}

async function resolveRequestedMessageIds(
  ctx: ReceiptContext,
  reader: ReceiptReader,
  params: ReadReceiptsParams,
  floor: Date | null
): Promise<{ ok: true; ids: readonly string[] } | ReceiptFailure> {
  if (params.scope === 'recent') {
    const rows = await ctx.prisma.message.findMany({
      where: {
        conversationId: reader.conversationId,
        deletedAt: null,
        ...(floor ? { createdAt: { gte: floor } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: RECEIPTS_RECENT_SCOPE_SIZE,
      select: { id: true },
    });
    return { ok: true, ids: rows.map((row) => row.id) };
  }

  const parsed = (params.messageIds ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (parsed.length === 0) return failure(400, 'Au moins un messageId requis');
  if (parsed.length > RECEIPTS_MAX_READ_MESSAGE_IDS) {
    return failure(400, `Trop de messageIds (maximum ${RECEIPTS_MAX_READ_MESSAGE_IDS})`);
  }
  if (!parsed.every((value) => isValidObjectId(value))) {
    return failure(400, 'Each messageId must be a valid MongoDB ObjectId');
  }
  return { ok: true, ids: parsed };
}

async function readPeople(
  ctx: ReceiptContext,
  reader: ReceiptReader,
  params: ReadReceiptsParams,
  messageIds: readonly string[],
  floor: Date | null
): Promise<{ ok: true; payload: ReceiptsPayload } | ReceiptFailure> {
  if (messageIds.length !== 1) return failure(400, 'detail=people exige exactement un messageId');

  const offset = decodeReceiptCursor(params.cursor);
  if (offset === null) return failure(400, 'Curseur invalide');
  const limit = Math.min(params.limit ?? RECEIPTS_PEOPLE_DEFAULT_LIMIT, RECEIPTS_PEOPLE_MAX_LIMIT);

  let page: Awaited<ReturnType<MessageReadStatusService['getMessageStatusDetails']>>;
  try {
    page = await ctx.readStatusService.getMessageStatusDetails(messageIds[0], {
      offset,
      limit,
      filter: params.filter ?? 'all',
      historyFloor: floor,
    });
  } catch {
    // `getMessageStatusDetails` LÈVE « Message not found » aussi bien pour une
    // ligne absente que pour une ligne sous le plancher — même verdict des deux
    // côtés, exactement pour que les deux restent indiscernables.
    return failure(404, 'Message non trouvé');
  }

  // La garde NOMMÉE par le critère 3. `getMessageStatusDetails` écarte déjà les
  // opt-out en interne ; la repasser ICI la rend observable AU NIVEAU DE LA
  // PORTE — là où le critère la place, et où une future variante de lecture ne
  // pourra pas l'oublier.
  const rows = page.statuses;
  const identities = rows.length
    ? await ctx.prisma.participant.findMany({
        where: { id: { in: rows.map((row) => row.participantId) } },
        select: { id: true, userId: true },
        // Même raison qu'au site d'écriture : `rows` vient d'une page déjà
        // bornée (RECEIPTS_PEOPLE_MAX_LIMIT), le `take` ne fait que le DIRE.
        take: RECEIPTS_PEOPLE_MAX_LIMIT,
      })
    : [];
  const visible = new Set(
    (await ctx.readStatusService.filterReadReceiptVisible(identities)).map((row) => row.id)
  );

  const people: ReceiptPersonRow[] = rows
    .filter((row) => visible.has(row.participantId))
    .map((row) => ({
      participantId: row.participantId,
      displayName: row.displayName,
      avatar: row.avatar ?? null,
      deliveredAt: iso(row.deliveredAt),
      receivedAt: iso(row.receivedAt),
      readAt: iso(row.readAt),
      readDevice: row.readDevice ?? null,
    }));

  const { total, limit: served, offset: from, hasMore } = page.pagination;
  return {
    ok: true,
    payload: {
      detail: 'people',
      messageIds,
      people,
      pagination: {
        total,
        limit: served,
        offset: from,
        hasMore,
        nextCursor: hasMore ? encodeReceiptCursor(offset + limit) : null,
      },
    },
  };
}

// ── Schémas de réponse — DÉCLARÉS, sans quoi fast-json-stringify supprime `data` ───
/** Chaîne NULLABLE — la forme qu'un `Date | null` prend une fois sérialisé. */
const nullableString = { type: 'string', nullable: true } as const;

/** L'enveloppe de succès, DÉCLARÉE : sans `data`, fast-json-stringify la supprime. */
const served = (data: object) =>
  ({ type: 'object', properties: { success: { type: 'boolean' }, data } }) as const;

const FAILURES = {
  400: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
  500: errorResponseSchema,
} as const;

const receiptOutcomeSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['read', 'received', 'delivered'] },
    markedCount: { type: 'number', description: 'Entrées RÉELLEMENT figées par cet appel' },
    unreadCount: { type: 'number', description: 'Badge du lecteur APRÈS marquage' },
  },
} as const;

const receiptsPayloadSchema = {
  type: 'object',
  properties: {
    detail: { type: 'string', enum: ['summary', 'people'] },
    messageIds: { type: 'array', items: { type: 'string' } },
    summary: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          totalMembers: { type: 'number' },
          receivedCount: { type: 'number' },
          readCount: { type: 'number' },
          deliveredToAllAt: nullableString,
          readByAllAt: nullableString,
        },
      },
    },
    people: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          participantId: { type: 'string' },
          displayName: { type: 'string' },
          avatar: nullableString,
          deliveredAt: nullableString,
          receivedAt: nullableString,
          readAt: nullableString,
          readDevice: nullableString,
        },
      },
    },
    pagination: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        limit: { type: 'number' },
        offset: { type: 'number' },
        hasMore: { type: 'boolean' },
        nextCursor: nullableString,
      },
    },
  },
} as const;

const conversationIdParamsSchema = {
  type: 'object',
  required: ['conversationId'],
  properties: { conversationId: { type: 'string', description: 'Conversation ID or identifier' } },
} as const;

/**
 * Options PARTAGÉES des deux adresses canoniques, exportées pour que le montage
 * et ses témoins lisent le MÊME objet.
 */
export const postReceiptsRouteSharedOptions = {
  config: { rateLimit: createReceiptWriteRateLimitConfig() },
  schema: {
    description: "Écrit un accusé pour l'appelant. `type` choisit la branche.",
    tags: ['conversations', 'receipts'],
    summary: 'Écrire un accusé',
    params: conversationIdParamsSchema,
    body: {
      type: 'object',
      required: ['type'],
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['read', 'received', 'delivered'] },
        messageIds: { type: 'array', items: { type: 'string' }, maxItems: RECEIPTS_MAX_WRITE_MESSAGE_IDS },
        caughtUpToMessageId: { type: 'string' },
        language: { type: 'string' },
        messageLanguages: { type: 'object', additionalProperties: { type: 'string' } },
      },
    },
    response: { 200: served(receiptOutcomeSchema), ...FAILURES },
  },
} as const;

export const getReceiptsRouteSharedOptions = {
  schema: {
    description:
      "Lit les accusés. `detail=summary` rend une carte par messageId ; `detail=people` la liste nominative paginée d'UN message.",
    tags: ['conversations', 'receipts'],
    summary: 'Lire les accusés',
    params: conversationIdParamsSchema,
    querystring: {
      type: 'object',
      properties: {
        messageIds: { type: 'string', description: 'Liste CSV, 1..100 — requise sauf scope=recent' },
        scope: { type: 'string', enum: ['recent'] },
        detail: { type: 'string', enum: ['summary', 'people'] },
        filter: { type: 'string', enum: ['all', 'read', 'delivered', 'unread'] },
        cursor: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: RECEIPTS_PEOPLE_MAX_LIMIT },
      },
    },
    response: { 200: served(receiptsPayloadSchema), ...FAILURES },
  },
} as const;

// ── Les gestionnaires — un par porte, tous adossés aux deux unités ci-dessus ───
const authContextOf = (request: FastifyRequest): UnifiedAuthContext =>
  (request as UnifiedAuthRequest).authContext;

type Handler<G extends RouteGenericInterface = RouteGenericInterface> = (
  request: FastifyRequest<G>,
  reply: FastifyReply
) => Promise<void>;

export interface ReceiptHandlers {
  readonly postReceipts: Handler<{ Params: ReceiptParams; Body: ReceiptWriteBody }>;
  readonly getReceipts: Handler<{ Params: ReceiptParams; Querystring: ReceiptsQuery }>;
  /** UNE référence pour DEUX adresses : `mark-read` et `mark-as-read`. */
  readonly markReadAlias: Handler;
  readonly markReceivedAlias: Handler;
  readonly deliveryReceiptAlias: Handler;
  readonly messageReadStatusAlias: Handler;
  readonly conversationReadStatusesAlias: Handler;
}

/** Les SEPT gestionnaires, construits une fois par plugin — jamais recopiés. */
export function receiptHandlers(ctx: ReceiptContext): ReceiptHandlers {
  const conversationRefOf = (request: FastifyRequest): string => {
    const params = request.params as Partial<ReceiptParams & ReceiptAliasParams>;
    return params.conversationId ?? params.id ?? '';
  };

  const write = async (
    request: FastifyRequest,
    reply: FastifyReply,
    params: Omit<ApplyReceiptParams, 'authContext' | 'conversationRef'>
  ): Promise<{ outcome: ReceiptOutcome } | null> => {
    const result = await applyReceipt(ctx, {
      ...params,
      authContext: authContextOf(request),
      conversationRef: conversationRefOf(request),
    });
    if (result.ok === false) {
      sendReceiptFailure(reply, result);
      return null;
    }
    return { outcome: result.outcome };
  };

  /** ABSENT = client déjà distribué → repli fenêtre. Jamais un lot VIDE. */
  const parseLegacyReadBody = (
    request: FastifyRequest
  ): z.infer<typeof MarkReadBodySchema> | null | 'invalid' => {
    if (request.body === undefined || request.body === null) return null;
    const parsed = MarkReadBodySchema.safeParse(request.body);
    return parsed.success ? parsed.data : 'invalid';
  };

  /**
   * Le `try/catch` des SEPT portes, écrit UNE fois : sept copies, ce sont sept
   * occasions d'oublier le `catch` — et un rejet non gardé sort en 500 MUET,
   * sans la ligne de journal qui dirait pourquoi.
   */
  const guarded = <G extends RouteGenericInterface>(
    journal: string,
    servi: string,
    fn: Handler<G>
  ): Handler<G> =>
    async (request, reply) => {
      try {
        await fn(request, reply);
      } catch (error) {
        logger.error(journal, error as Error);
        sendInternalError(reply, servi);
      }
    };

  return {
    postReceipts: guarded("Error writing receipt", "Erreur lors de l'écriture de l'accusé",
      async (request, reply) => {
        const parsed = ReceiptWriteBodySchema.safeParse(request.body);
        if (!parsed.success) return sendBadRequest(reply, "Corps de requête invalide pour l'accusé");
        const done = await write(request, reply, {
          type: parsed.data.type,
          messageIds: parsed.data.messageIds,
          caughtUpToMessageId: parsed.data.caughtUpToMessageId,
          language: parsed.data.language,
          messageLanguages: parsed.data.messageLanguages,
        });
        if (!done) return;
        const { type, markedCount, unreadCount } = done.outcome;
        sendSuccess(reply, { type, markedCount, unreadCount });
      }),

    getReceipts: guarded('Error reading receipts', 'Erreur lors de la lecture des accusés',
      async (request, reply) => {
        const query = request.query;
        const result = await readReceipts(ctx, {
          authContext: authContextOf(request),
          conversationRef: conversationRefOf(request),
          messageIds: query.messageIds,
          scope: query.scope,
          detail: query.detail,
          filter: query.filter,
          cursor: query.cursor,
          limit: query.limit,
        });
        if (result.ok === false) return sendReceiptFailure(reply, result);
        if (sendWithETag(request, reply, result.payload)) return;
        sendSuccess(reply, result.payload);
      }),

    /**
     * ADAPTATEUR — `POST /conversations/:id/mark-read` ET `…/mark-as-read` : UN
     * gestionnaire pour DEUX adresses, qui faisaient déjà le même geste avec le
     * même schéma de corps — la duplication littérale relevée par #4179.
     */
    markReadAlias: guarded('Error marking messages as read',
      'Erreur lors du marquage des messages comme lus',
      async (request, reply) => {
        const body = parseLegacyReadBody(request);
        if (body === 'invalid') {
          return sendBadRequest(reply, 'Corps de requête invalide pour le marquage de lecture');
        }
        const done = await write(request, reply, {
          type: 'read',
          messageIds: body?.messageIds,
          caughtUpToMessageId: body?.caughtUpToMessageId,
          language: body?.language,
          messageLanguages: body?.messageLanguages,
        });
        if (done) sendSuccess(reply, { markedCount: done.outcome.markedCount });
      }),

    /** ADAPTATEUR — `POST /conversations/:conversationId/mark-as-received`. */
    markReceivedAlias: guarded('Error marking messages as received',
      'Erreur lors de la mise à jour du statut de réception',
      async (request, reply) => {
        const done = await write(request, reply, { type: 'received' });
        if (done) sendSuccess(reply, { markedCount: done.outcome.markedCount });
      }),

    /**
     * ADAPTATEUR — `…/messages/:messageId/delivery-receipt`, la porte la mieux
     * gardée d'avant #4179 : c'est SON anti-spoof qui a été généralisé, pas une
     * garde inventée. Charge utile historique inchangée — la NSE iOS la décode.
     */
    deliveryReceiptAlias: guarded('Error processing delivery receipt',
      'Erreur lors de la mise à jour du statut de livraison',
      async (request, reply) => {
        const { messageId } = request.params as DeliveryReceiptAliasParams;
        const done = await write(request, reply, { type: 'delivered', messageIds: [messageId] });
        if (!done) return;
        sendSuccess(reply, {
          message: done.outcome.targetedCount === 0
            ? 'Aucune action requise'
            : 'Message marqué comme livré',
        });
      }),

    /**
     * ADAPTATEUR — `GET /messages/:messageId/read-status`. Charge utile inchangée
     * (l'agrégat de `getMessageReadStatus` ; #4179 c.9 la voue à `detail=summary`
     * côté CLIENT, hors territoire) ; ce qui est PARTAGÉ, ce sont les gardes.
     */
    messageReadStatusAlias: guarded('Error fetching message read status',
      'Erreur lors de la récupération du statut de lecture',
      async (request, reply) => {
        const { messageId } = request.params as MessageReadStatusAliasParams;
        const message = await ctx.prisma.message.findUnique({
          where: { id: messageId },
          select: { id: true, conversationId: true, createdAt: true },
        });
        if (!message) return sendNotFound(reply, 'Message non trouvé');

        const reader = await resolveReceiptReaderFor(ctx, authContextOf(request), message.conversationId);
        if (reader.ok === false) {
          return sendReceiptFailure(
            reply,
            reader.status === 403 ? failure(403, 'Accès non autorisé à ce message') : reader
          );
        }

        const floor = await reader.historyFloor();
        if (floor && message.createdAt < floor) return sendNotFound(reply, 'Message non trouvé');

        sendSuccess(reply, await ctx.readStatusService.getMessageReadStatus(messageId, message.conversationId));
      }),

    /**
     * ADAPTATEUR — `GET /conversations/:conversationId/read-statuses` : même
     * calcul que `detail=summary`, remis dans sa forme historique — la carte NUE
     * `messageId → agrégat`, sans l'enveloppe `{ detail, messageIds }`.
     */
    conversationReadStatusesAlias: guarded('Error fetching conversation read statuses',
      'Erreur lors de la récupération des statuts de lecture',
      async (request, reply) => {
        const query = request.query as ReadStatusesAliasQuery;
        const result = await readReceipts(ctx, {
          authContext: authContextOf(request),
          conversationRef: conversationRefOf(request),
          messageIds: query.messageIds,
          detail: 'summary',
        });
        if (result.ok === false) return sendReceiptFailure(reply, result);
        sendSuccess(reply, result.payload.summary ?? {});
      }),
  };
}

// ── Le plugin — DEUX routes, l'écriture et la lecture ─────────────────────────
/**
 * `allowAnonymous: true` — un invité de lien est un participant de plein droit :
 * il lit, envoie, réagit, et le serveur COMPTE ses non-lus. Lui fermer la seule
 * opération qui REMET SON BADGE À ZÉRO ne pouvait que faire monter ce badge, et
 * `requireAuth: true` reste : « authentifié, avec ou sans compte ».
 */
export async function conversationReceiptsRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  if (!prisma) {
    logger.error('Missing required service: prisma');
    return;
  }

  const requiredAuth = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: true,
  });

  const handlers = receiptHandlers(receiptContext(fastify, prisma));

  fastify.post<{ Params: ReceiptParams; Body: ReceiptWriteBody }>(
    '/conversations/:conversationId/receipts',
    { ...postReceiptsRouteSharedOptions, preValidation: [requiredAuth] },
    handlers.postReceipts
  );

  fastify.get<{ Params: ReceiptParams; Querystring: ReceiptsQuery }>(
    '/conversations/:conversationId/receipts',
    { ...getReceiptsRouteSharedOptions, preValidation: [requiredAuth] },
    handlers.getReceipts
  );
}
