/**
 * `GET /admin/conversations/:conversationId` — la fiche d'une conversation
 * (#8876, § 6.6).
 *
 * Un verbe NEUF sur un chemin qui existe déjà (`PATCH` le configure, `…/participants`
 * et `…/messages` le lisent) : le catalogue d'adresses n'y gagne aucune entrée. La
 * liste (`GET /admin/conversations`) disait « il y a une conversation » ; la fiche
 * dit ce qu'elle EST — qui la porte, à quelle communauté elle appartient, qui l'a
 * fermée, combien de liens y mènent, si l'agent y est actif.
 *
 * ## La porte, à l'identique de la liste
 *
 * `canManageConversations` ET `requireAdminRank()` — BIGBOSS, ADMIN. MODERATOR
 * porte la permission mais pas le rang, et la directive du 2026-09-16 n'ouvre
 * l'inventaire des conversations qu'aux deux rangs : la fiche ne rouvre pas ce
 * que la liste garde fermé.
 *
 * ## Des métadonnées, jamais un contenu
 *
 * Lire ce qui s'y dit reste le geste souverain à part (motif écrit, trace) :
 * `conversation-messages-sovereign.ts`. Les membres servis sont la prévisualisation
 * de la liste (six au plus, leur identité et leur rang), sans présence.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { OBJECT_ID_PATTERN } from '@meeshy/shared/utils/object-id';
import { requireAdminRank, requirePermission } from '../../middleware/authorize';
import { conversationActiveMemberCountSelect } from '../conversations/utils/active-member-count';
import { logError } from '../../utils/logger';
import { sendInternalError, sendNotFound, sendSuccess } from '../../utils/response';
import { conversationMetadataSchema } from './admin-conversation-response-schemas';
import { CONVERSATION_METADATA_SELECT, serveConversationMetadata } from './conversation-metadata';
import { loadAdminPeople } from './oversight-people';
import {
  booleen,
  chaine,
  chaineNulle,
  dateNulle,
  enveloppe,
  nombre,
  personneSchema,
  reponsesEnErreur,
} from './oversight-schemas';

const PARTICIPANTS_PREVIEW = 6;

const participantSchema = {
  type: 'object',
  properties: {
    id: chaine,
    userId: chaineNulle,
    type: chaineNulle,
    displayName: chaineNulle,
    avatar: chaineNulle,
    role: chaineNulle,
    joinedAt: dateNulle,
    isActive: booleen,
  },
} as const;

const ficheSchema = {
  type: 'object',
  properties: {
    ...conversationMetadataSchema.properties,
    community: {
      type: 'object',
      nullable: true,
      properties: { id: chaine, name: chaine, identifier: chaine },
    },
    closedBy: personneSchema,
    participantsPreview: { type: 'array', items: participantSchema },
    shareLinkCount: nombre,
    agentEnabled: booleen,
  },
} as const;

const FICHE_SELECT = {
  ...CONVERSATION_METADATA_SELECT,
  // `_count` est REMPLACÉ, pas fusionné : on garde le compte de membres actifs de
  // la liste (la colonne `memberCount` est morte) et on ajoute les liens.
  _count: { select: { ...conversationActiveMemberCountSelect, shareLinks: true } },
  closedBy: true,
  community: { select: { id: true, name: true, identifier: true } },
  participants: {
    where: { isActive: true },
    take: PARTICIPANTS_PREVIEW,
    orderBy: { joinedAt: 'asc' },
    select: {
      id: true,
      userId: true,
      type: true,
      displayName: true,
      avatar: true,
      role: true,
      joinedAt: true,
      isActive: true,
    },
  },
} as const;

export function registerConversationFicheRoute(fastify: FastifyInstance): void {
  fastify.get(
    '/admin/conversations/:conversationId',
    {
      onRequest: [fastify.authenticate, requirePermission('canManageConversations'), requireAdminRank()],
      schema: {
        description:
          "La fiche d'une conversation : métadonnées, communauté, personne qui l'a fermée, six premiers membres, liens de partage, agent. MÉTADONNÉES seules, aucun contenu de message. canManageConversations + rang d'administration. #8876.",
        tags: ['admin'],
        summary: 'Get one conversation (admin)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['conversationId'],
          properties: { conversationId: { type: 'string', pattern: OBJECT_ID_PATTERN } },
        },
        response: { 200: enveloppe(ficheSchema), ...reponsesEnErreur },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { conversationId } = request.params as { conversationId: string };

        const row = await fastify.prisma.conversation.findUnique({
          where: { id: conversationId },
          select: FICHE_SELECT,
        });
        if (!row) return sendNotFound(reply, 'Conversation introuvable');

        const { closedBy, community, participants, _count, ...metadata } = row;
        const [people, agent] = await Promise.all([
          loadAdminPeople(fastify.prisma, [closedBy]),
          fastify.prisma.agentConfig.findUnique({ where: { conversationId }, select: { enabled: true } }),
        ]);

        return sendSuccess(reply, {
          ...serveConversationMetadata({ ...metadata, _count }),
          community,
          closedBy: closedBy ? (people.get(closedBy) ?? null) : null,
          participantsPreview: participants,
          shareLinkCount: _count.shareLinks,
          agentEnabled: agent?.enabled ?? false,
        });
      } catch (error) {
        logError(fastify.log, 'Get admin conversation error:', error);
        return sendInternalError(reply, 'Erreur lors de la lecture de la conversation');
      }
    }
  );
}
