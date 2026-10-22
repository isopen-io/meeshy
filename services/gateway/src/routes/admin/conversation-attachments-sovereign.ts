/**
 * `GET /admin/conversations/:conversationId/attachments` — les PIÈCES d'une
 * conversation, en lecture souveraine, sans remonter le fil (#11510).
 *
 * ## Pourquoi une route, et pas les pages de messages
 *
 * L'onglet « Médias » de la lecture d'administration (#11457) tirait ses pièces
 * des pages de messages déjà lues : sur une conversation de milliers de
 * messages pauvre en médias, il fallait charger beaucoup de pages — chacune
 * une lecture journalisée — pour en trouver quelques-uns. Cette route lit les
 * pièces directement, au curseur, et filtre par genre.
 *
 * ## Le même régime que la lecture des messages, à l'identique
 *
 * - rang d'administration par-dessus `canManageConversations` (MODERATOR porte
 *   la permission, pas le rang) ;
 * - motif écrit, sauf pour le rang souverain (`requireReasonUnlessSovereign`),
 *   borné en haut au schéma : il est recopié dans l'audit à chaque page ;
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
 * ## La requête s'ANCRE sur un index — celui des MESSAGES
 *
 * `MessageAttachment` ne porte ni `conversationId`, ni index sur `createdAt`
 * ni sur `mimeType` (ses seuls index : `messageId`, `uploadedBy`, `filePath`,
 * `thumbnailPath`). Une première forme paginait la table des pièces sous un
 * filtre de RELATION (`message: { conversationId }`) : sur MongoDB, Prisma le
 * résout par jointure sur chaque document, donc chaque page balayait la
 * collection ENTIÈRE des pièces de l'instance avant de trier en mémoire —
 * invisible en staging, et exactement la lenteur que #11510 prétendait retirer.
 *
 * La route pagine donc les PORTEURS, sur `Message` et son index
 * `(conversationId, deletedAt, createdAt)`, et charge les pièces SOUS eux —
 * Prisma les lit par `messageId IN (…)`, l'index que la table des pièces A. Le
 * filtre par genre se pose aux DEUX niveaux : `attachments: { some: clause }`
 * retient les porteurs qui en ont au moins une, et le `where` imbriqué ne
 * charge que celles-là. Le coût d'une page reste borné par les messages de LA
 * conversation (la jointure de `some` ne sort pas de l'index), jamais par la
 * taille de l'instance — c'est le régime de l'index de membre (`view=media`,
 * `messages-media-kinds.ts`), qui pose la même clause sur le même index.
 *
 * ## La pagination
 *
 * Curseur opaque sur l'ordre TOTAL `(createdAt desc, id desc)` du PORTEUR
 * (`utils/cursor-pagination.ts`). `limit` borne les porteurs, pas les pièces :
 * un envoi groupé de dix photos sort entier dans sa page, jamais coupé en deux.
 * Sous un porteur, les pièces viennent dans l'ordre `(createdAt desc, id desc)`.
 * Un curseur illisible est REFUSÉ en 400 : le défilement infini ne peut pas
 * réparer un jeton, et re-servir la première page en silence rendrait deux
 * fois ce qu'il a déjà peint.
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
import { withOrphanedSenderRepair } from '../../services/messaging/withOrphanedSenderRepair';
import { MESSAGE_ATTACHMENT_ORDER } from '../../services/attachments/attachmentIncludes';
import { clauseDeTypeDuGenre, GENRES_DE_PIECE, type GenreDePiece } from '../conversations/messages-media-kinds';
import { conversationIdParams } from './admin-conversation-response-schemas';
import { messageContentIsProtected, messageContentProtectionSelect } from './media-protection';
import {
  servedAttachment,
  sovereignAttachmentSchema,
  sovereignAttachmentSelect,
  sovereignSenderSchema,
  sovereignSenderSelect,
} from './sovereign-message-projection';

const REASON_MIN_LENGTH = 10;
/** La borne HAUTE du motif — il est recopié dans `AdminAuditLog.metadata` à chaque page servie. */
const REASON_MAX_LENGTH = 500;
const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 100;

/** L'ordre TOTAL des PORTEURS — la dernière clé est l'`id`, sinon deux messages nés dans la même milliseconde se sautent. */
const ORDRE_DES_PORTEURS: CursorSort = [
  { field: 'createdAt', direction: 'desc', kind: 'date' },
  { field: 'id', direction: 'desc', kind: 'objectId' },
];


// ---------------------------------------------------------------------------
// LE `select`
// ---------------------------------------------------------------------------

/** Le genre, en clause de pièce — `{}` quand tous les genres entrent (« au moins une pièce »). */
const clauseDuGenre = (kind: GenreDePiece | undefined): Prisma.MessageAttachmentWhereInput =>
  kind === undefined ? {} : clauseDeTypeDuGenre(kind);

/**
 * Le PORTEUR et ses pièces : les six colonnes que `messageContentIsProtected`
 * exige (une garde se mesure sur la requête — une colonne absente rend le
 * prédicat muet), ce que l'index affiche, et SOUS lui les pièces du genre
 * demandé, sous le `select` partagé. `deletedAt` et `conversationId` sont
 * portés par le `where`, pas servis.
 */
export function sovereignAttachmentPageSelect(kind: GenreDePiece | undefined) {
  return {
    id: true,
    createdAt: true,
    senderId: true,
    ...messageContentProtectionSelect,
    sender: { select: sovereignSenderSelect },
    attachments: {
      where: clauseDuGenre(kind),
      orderBy: MESSAGE_ATTACHMENT_ORDER,
      select: sovereignAttachmentSelect,
    },
  } satisfies Prisma.MessageSelect;
}

export type SovereignPorteurRow = Prisma.MessageGetPayload<{
  select: ReturnType<typeof sovereignAttachmentPageSelect>;
}>;

// ---------------------------------------------------------------------------
// LA PROJECTION
// ---------------------------------------------------------------------------

/**
 * Les pièces d'un porteur, servies sous LA projection de la lecture souveraine —
 * chacune avec le même porteur réduit, et le verdict de protection du message
 * appliqué à toutes.
 */
export function piecesServiesDuPorteur(row: SovereignPorteurRow) {
  const protege = messageContentIsProtected(row);
  const porteur = {
    id: row.id,
    createdAt: row.createdAt,
    // Résolu en `User.id`, comme la lecture des messages : les clients
    // comparent `senderId` à un compte, le brut restant servi à côté.
    senderId: row.sender?.userId ?? row.sender?.user?.id ?? row.senderId,
    senderParticipantId: row.senderId,
    sender: row.sender,
    isProtected: protege,
  };
  return row.attachments.map((piece) => ({ ...servedAttachment(piece, protege), message: porteur }));
}

// ---------------------------------------------------------------------------
// LE SCHÉMA DE RÉPONSE
// ---------------------------------------------------------------------------

const porteurSchema = {
  type: 'object',
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
      params: conversationIdParams,
      querystring: {
        type: 'object',
        properties: {
          cursor: cursorQueryProperty,
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: MAX_LIMIT,
            default: DEFAULT_LIMIT,
            description: 'Nombre de messages PORTEURS par page — toutes les pièces d\'un porteur sortent dans sa page',
          },
          kind: {
            type: 'string',
            enum: [...GENRES_DE_PIECE],
            description: 'Genre de pièce (visual, audio, document, contact) ; absent = tous les genres',
          },
          reason: {
            type: 'string',
            maxLength: REASON_MAX_LENGTH,
            description:
              'Motif écrit de la lecture (10 caractères minimum s\'il est fourni, 500 au plus ; facultatif pour le rang souverain), consigné dans AdminAuditLog',
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

      if (cursor !== undefined && decodePageCursor(cursor, ORDRE_DES_PORTEURS) === null) {
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
      // Et un porteur sans pièce du genre n'a rien à donner à la pellicule.
      const where: Prisma.MessageWhereInput = {
        conversationId,
        deletedAt: null,
        attachments: { some: clauseDuGenre(kind) },
      };
      const requete = cursorQuery({ sort: ORDRE_DES_PORTEURS, cursor, limit, where });

      // `Message.sender` est une relation REQUISE : un expéditeur disparu ferait
      // rejeter toute la page (#6516) ; la portée est connue, la conversation du chemin.
      const rows = await withOrphanedSenderRepair({ prisma: fastify.prisma, conversationIds: [conversationId] }, () =>
        fastify.prisma.message.findMany({
          where: requete.where,
          select: sovereignAttachmentPageSelect(kind),
          orderBy: requete.orderBy,
          take: requete.take,
        }),
      );

      const servie = cursorPage({ sort: ORDRE_DES_PORTEURS, rows, limit });
      const data = servie.page.flatMap(piecesServiesDuPorteur);

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
