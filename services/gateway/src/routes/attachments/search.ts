/**
 * GET /attachments/search — un média, à travers TOUTES les conversations du
 * lecteur, sans nommer de conversation (#5170).
 *
 * Suite de #4962 (resserrée sur les Liens) : le groupe Médias de l'écran de
 * recherche v3 n'avait aucune route — seul `GET /conversations/:id/attachments`
 * existe, scopé à UNE conversation.
 *
 * Cette route COMPOSE trois garanties de périmètre déjà éprouvées, jamais ne
 * les réécrit :
 *   1. Appartenance — `prisma.participant.findMany({ userId, isActive: true })`,
 *      même patron que `attachments/metadata.ts` et `conversations/search.ts`.
 *   2. Plancher d'historique multi-conversations — `loadHistoryFloorsOrFail` +
 *      `historyFloorClause` (`services/historyFloor.ts`), fail-CLOSED : une
 *      conversation dont le plancher est illisible est retirée de l'ensemble,
 *      jamais servie sans borne.
 *   3. Masquage personnel multi-conversations —
 *      `loadPersonalHistoryHidingByConversation` (`services/personalHistoryFilter.ts`),
 *      appliqué APRÈS le keyset, comme `/sync`.
 *
 * Et EN ÉCRIT une quatrième, qui n'existait pas sous forme réutilisable :
 *   4. Exclusion du contenu PROTÉGÉ (éphémère / vue unique / flouté / chiffré,
 *      niveau MESSAGE **et** niveau PIÈCE JOINTE). `protectedPreview()` /
 *      `maskedAttachment()` (`services/notifications/NotificationService.ts`)
 *      composent un texte de placeholder, jamais une clause Prisma — mais leur
 *      PRÉDICAT (le booléen qu'ils calculent avant de composer un texte) est
 *      la même question qu'ici : « ce contenu a-t-il le droit d'être vu ? ».
 *      Il est donc RÉUTILISÉ, jamais réimplémenté, comme second passage
 *      fail-CLOSED après un premier filtre `where` sur les colonnes que Prisma
 *      sait interroger nativement (booléens, `isEncrypted`, présence
 *      d'`expiresAt`) — le bitfield `effectFlags` n'a pas d'opérateur Prisma
 *      côté Mongo, donc son cas (un bit posé sans que le booléen jumeau le
 *      soit) ne peut être fermé qu'en mémoire, sur la ligne déjà chargée.
 *
 * Décision prise à l'implémentation (l'issue la posait ouverte) : seul
 * `originalName` est cherché, jamais la transcription d'un vocal. Élargir à la
 * transcription agrandit la surface de recherche exactement au moment où
 * l'exclusion du protégé doit être la plus stricte — hors périmètre de ce lot,
 * à rouvrir sur demande produit.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { UnifiedAuthRequest, isRegisteredUser } from '../../middleware/auth';
import { sendSuccess, sendForbidden, sendInternalError } from '../../utils/response.js';
import { buildCursorPaginationMeta } from '../../utils/pagination';
import { HISTORY_FLOOR_PARTICIPANT_SELECT, loadHistoryFloorsOrFail, historyFloorClause } from '../../services/historyFloor';
import { loadPersonalHistoryHidingByConversation } from '../../services/personalHistoryFilter';
import { protectedPreview, maskedAttachment } from '../../services/notifications/NotificationService';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import type { AttachmentSearchQuery } from './types';

const logger = enhancedLogger.child({ module: 'AttachmentSearchRoutes' });

/**
 * Le contrat SERVI — `conversationAttachmentListItemSchema`
 * (`attachments/metadata.ts`) plus `conversationId` : seul champ neuf, requis
 * ici parce que les résultats traversent PLUSIEURS conversations (« aller au
 * message » exige de savoir laquelle), quand la liste scopée à une seule
 * conversation n'a jamais eu à le dire.
 */
const crossConversationAttachmentItemSchema = {
  type: 'object',
  description: 'Attachment found across every conversation the caller is a member of',
  properties: {
    id: { type: 'string', description: 'Attachment ID' },
    fileName: { type: 'string', description: 'Filename' },
    mimeType: { type: 'string', description: 'MIME type' },
    fileSize: { type: 'number', description: 'File size' },
    fileUrl: { type: 'string', description: 'File URL' },
    thumbnailUrl: { type: 'string', nullable: true, description: 'Thumbnail URL' },
    duration: { type: 'number', nullable: true, description: 'Duration (audio/video)' },
    messageId: { type: 'string', nullable: true, description: 'Message this attachment belongs to — target of « go to message »' },
    originalName: { type: 'string', description: 'Original filename, as displayed' },
    uploadedBy: { type: 'string', description: 'Uploader id — gates the delete affordance' },
    createdAt: { type: 'string', description: 'Upload date (ISO 8601)' },
    width: { type: 'number', nullable: true, description: 'Image/video width (px)' },
    height: { type: 'number', nullable: true, description: 'Image/video height (px)' },
    conversationId: { type: 'string', description: 'Conversation this attachment was found in' },
  },
} as const;

/** Ce que la requête charge — le socle servi, plus tout ce que le filtre de protection doit lire. */
const searchAttachmentSelect = {
  id: true,
  messageId: true,
  fileName: true,
  originalName: true,
  mimeType: true,
  fileSize: true,
  fileUrl: true,
  thumbnailUrl: true,
  duration: true,
  uploadedBy: true,
  createdAt: true,
  width: true,
  height: true,
  // Protection PIÈCE JOINTE — indépendante de celle du message porteur.
  isViewOnce: true,
  isBlurred: true,
  effectFlags: true,
  message: {
    select: {
      conversationId: true,
      createdAt: true,
      isEncrypted: true,
      isViewOnce: true,
      isBlurred: true,
      effectFlags: true,
      expiresAt: true,
    },
  },
} as const;

type SearchAttachmentRow = {
  id: string;
  messageId: string | null;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
  thumbnailUrl: string | null;
  duration: number | null;
  uploadedBy: string;
  createdAt: Date;
  width: number | null;
  height: number | null;
  isViewOnce: boolean;
  isBlurred: boolean;
  effectFlags: number;
  message: {
    conversationId: string;
    createdAt: Date;
    isEncrypted: boolean;
    isViewOnce: boolean;
    isBlurred: boolean;
    effectFlags: number;
    expiresAt: Date | null;
  } | null;
};

/**
 * Un message est PROTÉGÉ (éphémère/vue unique/flouté/chiffré) — même prédicat
 * que la bannière de notification, réutilisé plutôt que réécrit.
 */
function messageIsProtected(message: SearchAttachmentRow['message']): boolean {
  if (!message) return true; // relation absente : rien à servir, fail-CLOSED.
  return protectedPreview({
    messageType: null,
    isEncrypted: message.isEncrypted,
    isViewOnce: message.isViewOnce,
    isBlurred: message.isBlurred,
    effectFlags: message.effectFlags,
    expiresAt: message.expiresAt,
  }) !== null;
}

/**
 * Ce que le `where` Prisma peut fermer NATIVEMENT (booléens, `isEncrypted`,
 * présence d'`expiresAt`) — `effectFlags` n'a pas d'opérateur bitwise côté
 * connecteur Mongo, d'où le second passage en mémoire (`messageIsProtected` /
 * `maskedAttachment`) sur les lignes déjà chargées, qui ferme le cas d'un bit
 * posé sans que le booléen jumeau le soit.
 *
 * `expiresAt` : un message ÉPHÉMÈRE a `expiresAt` PRÉSENT et non nul —
 * `isSet: true` est nécessaire sur le connecteur Mongo, où un champ ABSENT ne
 * matche ni `null` ni `NOT null` (cf. `services/gateway/CLAUDE.md`,
 * `ExpiredMessagesCleanupService`). La négation de « présent et non nul » est
 * donc l'OR de ses deux négations : absent, OU présent-et-nul.
 */
function messageProtectionWhereExclusion(): Record<string, unknown> {
  return {
    isViewOnce: false,
    isBlurred: false,
    isEncrypted: false,
    OR: [{ expiresAt: { isSet: false } }, { expiresAt: null }],
  };
}

export function registerAttachmentSearchRoutes(
  fastify: FastifyInstance,
  authRequired: any,
  prisma: PrismaClient
) {
  fastify.get<{ Querystring: AttachmentSearchQuery }>('/attachments/search', {
    onRequest: [authRequired],
    schema: {
      description: 'Search attachments by original filename across every conversation the caller is a member of. Never returns a result from a conversation the caller cannot read, a message hidden via clear-history/delete-for-me, or a message/attachment that is view-once, blurred, ephemeral or encrypted. Cursor pagination only.',
      tags: ['attachments'],
      summary: 'Search attachments across all conversations',
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', minLength: 1, description: 'Case-insensitive substring filter on the original filename' },
          cursor: { type: 'string', description: 'Opaque keyset cursor — the `id` of the last item of the previous page' },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 50, description: 'Maximum number of attachments to return' },
        },
      },
      response: {
        200: {
          description: 'Attachments matching the query',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                attachments: { type: 'array', items: crossConversationAttachmentItemSchema },
              },
            },
            pagination: {
              type: 'object',
              properties: {
                limit: { type: 'number' },
                hasMore: { type: 'boolean' },
                nextCursor: { type: 'string', nullable: true },
              },
            },
          },
        },
        403: { description: 'Registered user required', ...errorResponseSchema },
        500: { description: 'Internal server error', ...errorResponseSchema },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!isRegisteredUser(authContext)) {
        return sendForbidden(reply, 'Utilisateur enregistré requis');
      }
      const userId = authContext.registeredUser!.id;
      const query = request.query as AttachmentSearchQuery;
      const limit = query.limit ?? 50;
      const q = query.q.trim();

      if (q.length === 0) {
        return sendSuccess(reply, { attachments: [] }, {
          pagination: { limit, hasMore: false, nextCursor: null },
        });
      }

      // 1. Appartenance — mêmes bornes que `conversations/search.ts`. `take`
      // littéral requis par `unbounded-findmany-guard.test.ts` (#4165 critère
      // 4) : un nouveau site ne rejoint pas la dette gelée
      // (`conversations/search.ts`, `sync/membership.ts`). 5000 est un plafond
      // de PROTECTION, jamais un pagination produit — aucun lecteur réel
      // n'appartient à autant de conversations actives ; le jour où c'est
      // mesuré faux, la borne se relève, elle ne se retire pas.
      const memberships = await prisma.participant.findMany({
        where: { userId, isActive: true },
        select: { conversationId: true, ...HISTORY_FLOOR_PARTICIPANT_SELECT },
        take: 5000,
      });
      if (memberships.length === 0) {
        return sendSuccess(reply, { attachments: [] }, {
          pagination: { limit, hasMore: false, nextCursor: null },
        });
      }

      // 2. Plancher d'historique — fail-CLOSED : une conversation illisible sort
      // de l'ensemble plutôt que d'être servie sans borne.
      const { floors, unreadableConversationIds } = await loadHistoryFloorsOrFail(prisma, memberships);
      const unreadable = new Set(unreadableConversationIds);
      const conversationIds = memberships
        .map((m) => m.conversationId)
        .filter((id) => !unreadable.has(id));
      if (conversationIds.length === 0) {
        return sendSuccess(reply, { attachments: [] }, {
          pagination: { limit, hasMore: false, nextCursor: null },
        });
      }
      const historyFloor = historyFloorClause(conversationIds, floors);

      // Curseur keyset sur `createdAt` de la PIÈCE JOINTE — opaque, résolu SANS
      // le `where` courant, même idiome que `GET /links`.
      let cursorCreatedAt: Date | null = null;
      if (typeof query.cursor === 'string' && query.cursor.length > 0) {
        const cursorRow = await prisma.messageAttachment.findFirst({
          where: { id: query.cursor },
          select: { createdAt: true },
        });
        cursorCreatedAt = cursorRow?.createdAt ?? null;
      }

      const rows = (await prisma.messageAttachment.findMany({
        where: {
          originalName: { contains: q, mode: 'insensitive' },
          // Protection PIÈCE JOINTE — booléens seuls, fermés nativement.
          isViewOnce: false,
          isBlurred: false,
          message: {
            conversationId: { in: [...conversationIds] },
            deletedAt: null,
            ...historyFloor,
            ...messageProtectionWhereExclusion(),
          },
          ...(cursorCreatedAt ? { createdAt: { lt: cursorCreatedAt } } : {}),
        },
        select: searchAttachmentSelect,
        orderBy: { createdAt: 'desc' },
        take: limit,
      })) as unknown as SearchAttachmentRow[];

      // 3. Masquage personnel — appliqué APRÈS le keyset, comme `/sync`.
      const hidingByConversation = await loadPersonalHistoryHidingByConversation(prisma, {
        userId,
        conversationIds,
      });

      // 4. Second passage fail-CLOSED : ce que le `where` ne peut pas fermer
      // nativement (le bitfield `effectFlags`) se ferme ici, sur les lignes
      // déjà chargées — même prédicat que la bannière de notification.
      const visible = rows.filter((row) => {
        if (messageIsProtected(row.message)) return false;
        if (maskedAttachment({ isViewOnce: row.isViewOnce, isBlurred: row.isBlurred, effectFlags: row.effectFlags })) return false;
        if (!row.message) return false;
        const hiding = hidingByConversation.get(row.message.conversationId);
        if (!hiding) return true;
        if (row.messageId && hiding.hiddenMessageIds.includes(row.messageId)) return false;
        return hiding.clearHistoryBefore === null || row.message.createdAt >= hiding.clearHistoryBefore;
      });

      const attachments = visible.map((row) => ({
        id: row.id,
        messageId: row.messageId,
        fileName: row.fileName,
        originalName: row.originalName,
        mimeType: row.mimeType,
        fileSize: row.fileSize,
        fileUrl: row.fileUrl,
        thumbnailUrl: row.thumbnailUrl,
        duration: row.duration,
        uploadedBy: row.uploadedBy,
        createdAt: row.createdAt,
        width: row.width,
        height: row.height,
        conversationId: row.message!.conversationId,
      }));

      // `hasMore`/`nextCursor` se lisent sur la page BRUTE (avant le masquage
      // personnel et le second passage de protection) : le dernier élément de
      // cette page reste le bon curseur pour continuer, qu'il ait ou non
      // survécu aux deux filtres qui s'appliquent après le keyset — sans quoi
      // un élément masqué ferait sauter ou boucler la pagination suivante.
      const pagination = buildCursorPaginationMeta(
        limit,
        rows.length,
        rows.length > 0 ? rows[rows.length - 1].id : null
      );

      return sendSuccess(reply, { attachments }, { pagination });
    } catch (error) {
      logger.error('Error searching attachments', error as Error);
      return sendInternalError(reply, 'Erreur lors de la recherche de pièces jointes');
    }
  });
}
