/**
 * `GET /admin/conversations/:conversationId/attachments` — les PIÈCES d'une
 * conversation, en lecture souveraine, sans remonter le fil (#11510).
 *
 * ## Pourquoi une route, et pas les pages de messages
 *
 * L'onglet « Médias » de la lecture d'administration (#11457) tirait ses pièces
 * des pages de messages déjà lues : sur une conversation de milliers de
 * messages pauvre en médias, il fallait charger beaucoup de pages — chacune
 * une lecture journalisée — pour en trouver quelques-uns. Cette route lit la
 * table des pièces directement, au curseur, et filtre par genre.
 *
 * ## Le même régime que la lecture des messages, à l'identique
 *
 * - rang d'administration par-dessus `canManageConversations` (MODERATOR porte
 *   la permission, pas le rang) ;
 * - motif écrit, sauf pour le rang souverain (`requireReasonUnlessSovereign`) ;
 * - UNE ligne `AdminAuditLog` par page servie, via `withAudit` ;
 * - LA MÊME projection de protection : `servedAttachment` et
 *   `messageContentIsProtected` sont APPELÉS (`sovereign-message-projection.ts`,
 *   `media-protection.ts`), jamais recopiés. Une pièce protégée — par ses
 *   propres drapeaux, ou par ceux du message qui la porte — reste LISTÉE et
 *   rend son voile : ni URL, ni vignette, ni `thumbHash`, ni variantes, ni
 *   transcription, ni pistes.
 *
 * ## Ce que la route sert de PLUS que la pièce
 *
 * Le PORTEUR, réduit à ce qu'un index a besoin de dire : son identifiant (pour
 * « voir dans le fil »), son horloge et son expéditeur (la ligne « qui, quand »
 * de chaque élément), et son verdict de protection. Aucun texte, aucune
 * traduction : le fil est la seule surface qui les sert.
 *
 * ## La pagination
 *
 * Curseur opaque sur l'ordre TOTAL `(createdAt desc, id desc)` de la pièce
 * (`utils/cursor-pagination.ts`). Un curseur illisible est REFUSÉ en 400 : le
 * défilement infini ne peut pas réparer un jeton, et re-servir la première
 * page en silence rendrait deux fois ce qu'il a déjà peint.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Prisma } from '@meeshy/shared/prisma/client';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { requireAdminRank, requirePermission, withAudit } from '../../middleware/authorize';
import { requireReasonUnlessSovereign } from '../../middleware/sovereign-reason';
import { UnifiedAuthRequest } from '../../middleware/auth';
import {
  cursorPage,
  cursorPaginationSchema,
  cursorQuery,
  cursorQueryProperty,
  decodePageCursor,
  type CursorSort,
} from '../../utils/cursor-pagination';
import { sendSuccess, sendBadRequest, sendNotFound, sendInternalError } from '../../utils/response';
import { logError } from '../../utils/logger.js';
import { clauseDeTypeDuGenre, GENRES_DE_PIECE, type GenreDePiece } from '../conversations/messages-media-kinds';
import { messageContentIsProtected, messageContentProtectionSelect } from './media-protection';
import {
  servedAttachment,
  sovereignAttachmentSchema,
  sovereignAttachmentSelect,
  sovereignSenderSchema,
  sovereignSenderSelect,
} from './sovereign-message-projection';

const REASON_MIN_LENGTH = 10;
const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 100;

/** L'ordre TOTAL de la route — la dernière clé est l'`id`, sinon deux pièces nées dans la même milliseconde se sautent. */
const ORDRE_DES_PIECES: CursorSort = [
  { field: 'createdAt', direction: 'desc', kind: 'date' },
  { field: 'id', direction: 'desc', kind: 'string' },
];

// ---------------------------------------------------------------------------
// LE `select`
// ---------------------------------------------------------------------------

/**
 * Le PORTEUR d'une pièce : les six colonnes que `messageContentIsProtected`
 * exige (une garde se mesure sur la requête — une colonne absente rend le
 * prédicat muet), plus ce que l'index affiche. `deletedAt` et `conversationId`
 * sont portés par le `where`, pas servis.
 */
const porteurSelect = {
  id: true,
  conversationId: true,
  createdAt: true,
  senderId: true,
  ...messageContentProtectionSelect,
  sender: { select: sovereignSenderSelect },
} as const;

export const sovereignAttachmentPageSelect = Prisma.validator<Prisma.MessageAttachmentSelect>()({
  ...sovereignAttachmentSelect,
  message: { select: porteurSelect },
});

export type SovereignAttachmentPageRow = Prisma.MessageAttachmentGetPayload<{
  select: typeof sovereignAttachmentPageSelect;
}>;

// ---------------------------------------------------------------------------
// LA PROJECTION
// ---------------------------------------------------------------------------

/**
 * Une pièce et son porteur, servis sous LA projection de la lecture souveraine.
 *
 * Un porteur ABSENT (une pièce orpheline, que le `where` ne devrait jamais
 * laisser passer) vaut PROTÉGÉ : une porte de confidentialité échoue en
 * montrant moins, jamais en montrant plus.
 */
export function mapSovereignAttachmentRow(row: SovereignAttachmentPageRow) {
  const porteur = row.message;
  const protege = porteur === null || messageContentIsProtected(porteur);
  return {
    ...servedAttachment(row, protege),
    message:
      porteur === null
        ? null
        : {
            id: porteur.id,
            createdAt: porteur.createdAt,
            // Résolu en `User.id`, comme la lecture des messages : les clients
            // comparent `senderId` à un compte, le brut restant servi à côté.
            senderId: porteur.sender?.userId ?? porteur.sender?.user?.id ?? porteur.senderId,
            senderParticipantId: porteur.senderId,
            sender: porteur.sender,
            isProtected: protege,
          },
  };
}

// ---------------------------------------------------------------------------
// LE SCHÉMA DE RÉPONSE
// ---------------------------------------------------------------------------

const porteurSchema = {
  type: 'object',
  nullable: true,
  properties: {
    id: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    senderId: { type: 'string', nullable: true },
    senderParticipantId: { type: 'string', nullable: true },
    sender: sovereignSenderSchema,
    isProtected: { type: 'boolean' },
  },
} as const;

export const sovereignAttachmentPageItemSchema = {
  type: 'object',
  properties: {
    ...sovereignAttachmentSchema.properties,
    message: porteurSchema,
  },
} as const;

// ---------------------------------------------------------------------------
// LA ROUTE
// ---------------------------------------------------------------------------

type Query = { cursor?: string; limit?: number; kind?: GenreDePiece; reason?: string };

export function registerConversationAttachmentsSovereignRoute(fastify: FastifyInstance): void {
  fastify.get<{
    Params: { conversationId: string };
    Querystring: Query;
  }>('/admin/conversations/:conversationId/attachments', {
    onRequest: [fastify.authenticate, requirePermission('canManageConversations'), requireAdminRank()],
    preHandler: [requireReasonUnlessSovereign({ source: 'querystring', min: REASON_MIN_LENGTH })],
    schema: {
      description:
        'Liste les pièces jointes d\'une conversation privée, au curseur et par genre, sous la projection de ' +
        'protection de la lecture souveraine. Rang d\'administration ; motif écrit obligatoire sauf pour le rang ' +
        'souverain ; geste tracé — #11510.',
      tags: ['admin'],
      summary: 'List a private conversation\'s attachments (sovereign)',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          cursor: cursorQueryProperty,
          limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
          kind: {
            type: 'string',
            enum: [...GENRES_DE_PIECE],
            description: 'Genre de pièce (visual, audio, document, contact) ; absent = tous les genres',
          },
          reason: {
            type: 'string',
            description:
              'Motif écrit de la lecture (10 caractères minimum s\'il est fourni ; facultatif pour le rang souverain), consigné dans AdminAuditLog',
          },
        },
      },
      response: {
        200: {
          description: 'Attachments successfully retrieved',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'array', items: sovereignAttachmentPageItemSchema },
            pagination: cursorPaginationSchema,
          },
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      const { cursor, limit = DEFAULT_LIMIT, kind, reason } = request.query as Query;

      if (cursor !== undefined && decodePageCursor(cursor, ORDRE_DES_PIECES) === null) {
        return sendBadRequest(reply, 'INVALID_CURSOR', { message: 'Malformed cursor', code: 'INVALID_CURSOR' });
      }

      const conversation = await fastify.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true },
      });
      if (!conversation) {
        return sendNotFound(reply, 'Conversation non trouvée');
      }

      // Un message SUPPRIMÉ n'est plus servable du tout — ses pièces non plus.
      const where: Prisma.MessageAttachmentWhereInput = {
        message: { conversationId, deletedAt: null },
        ...(kind === undefined ? {} : clauseDeTypeDuGenre(kind)),
      };
      const requete = cursorQuery({ sort: ORDRE_DES_PIECES, cursor, limit, where });

      const rows = await fastify.prisma.messageAttachment.findMany({
        where: requete.where,
        select: sovereignAttachmentPageSelect,
        orderBy: requete.orderBy,
        take: requete.take,
      });

      const servie = cursorPage({ sort: ORDRE_DES_PIECES, rows, limit });
      const data = servie.page.map(mapSovereignAttachmentRow);

      const authContext = (request as UnifiedAuthRequest).authContext;
      await withAudit(request, {
        action: 'ADMIN_CONVERSATION_ATTACHMENTS_VIEWED',
        entity: 'Conversation',
        entityId: conversationId,
        userId: authContext.registeredUser.id,
        reason,
      });

      return sendSuccess(reply, data, { pagination: servie.pagination });
    } catch (error) {
      logError(fastify.log, 'Error fetching sovereign conversation attachments', error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch conversation attachments' });
    }
  });
}
