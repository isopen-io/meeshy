/**
 * Configurer une conversation depuis l'administration, SANS en être membre
 * (#7845, #7999) — trois gestes :
 *
 * | adresse | geste |
 * |---|---|
 * | `PATCH /admin/conversations/:conversationId` | métadonnées, réglages, archive, fermeture |
 * | `PATCH /admin/conversations/:conversationId/participants/:userId` | rang d'un membre |
 * | `POST /admin/conversations/:conversationId/participants/:userId/remove` | retrait d'un membre |
 *
 * ## Le trou qu'ils comblent
 *
 * Les routes de MEMBRE (`PUT|PATCH /conversations/:id`,
 * `PATCH …/participants/:userId/role`, `DELETE …/participants/:userId`)
 * exigent que l'acteur soit DANS la conversation — « une fois dans »
 * (`utils/conversation-authority.ts`). C'est juste pour elles : le rang de
 * plateforme n'y est qu'un surclassement d'un membre. Mais un administrateur
 * qui instruit un signalement sur un groupe dont il n'est pas membre y
 * recevait 403, et n'avait d'autre recours que de s'y inviter — c'est-à-dire
 * d'apparaître dans la liste des membres et d'en recevoir les messages.
 *
 * ## Les gardes
 *
 * `requirePermission('canManageConversations')` pour le manifeste,
 * `requireAdminRank()` pour exclure MODERATOR — le patron de
 * `conversations-sovereign.ts`, et pour la même raison : la permission est
 * aussi portée par MODERATOR, et configurer n'importe quelle conversation de
 * l'instance n'est pas un geste de modération de contenu.
 *
 * Un MOTIF écrit (dix caractères au moins) est exigé AU SCHÉMA, et consigné
 * dans `AdminAuditLog` avec le détail avant / après : un geste fait au nom de
 * la plateforme dans l'espace des membres laisse une trace qui dit pourquoi.
 *
 * ## Les règles, identiques à la route de membre
 *
 * La composition des champs est PARTAGÉE (`composeConversationUpdate`,
 * `broadcastConversationUpdated`) ; les refus aussi : la conversation globale
 * ne se modifie pas, un tête-à-tête n'a pas de hiérarchie d'écriture, et la
 * traduction automatique ne se rallume pas sur un fil chiffré de bout en bout
 * — le serveur n'en lit pas le texte, il n'a rien à traduire.
 *
 * ## Le créateur
 *
 * Ses droits restent au-dessus de tout rang de plateforme : on ne le rétrograde
 * pas, on ne le retire pas. Un administrateur peut ARCHIVER ou FERMER une
 * conversation — des gestes sur le conteneur — sans exproprier celui qui l'a
 * ouverte.
 *
 * ## Ce qui n'est PAS posté
 *
 * L'avis de vie du groupe (« X a retiré Y », #7593) : son acteur est une
 * PARTICIPATION (`senderParticipantId`), et l'administrateur n'en a pas.
 * Fabriquer un avis au nom de personne serait mentir aux membres ; les
 * événements temps réel, eux, partent tous.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isMemberCreator } from '@meeshy/shared/types/role-types';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { updateConversationRequestSchema } from '@meeshy/shared/types/api-schemas';
import { serializeConversationParticipant } from '@meeshy/shared/utils/participant-helpers';
import { requireAdminRank, requireHierarchy, requirePermission, withAudit } from '../../middleware/authorize';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { invalidateParticipantLookup } from '../../utils/participant-lookup-cache';
import { emitConversationMemberCountEvent } from '../../socketio/emitConversationMemberCount';
import { endConversationMembership } from '../../socketio/endConversationMembership';
import { announceConversationClosed } from '../../socketio/announceConversationClosed';
import { deactivateShareLinksOnClose } from '../../services/conversations/shareLinkClosure';
import {
  composeConversationUpdate,
  broadcastConversationUpdated,
  type ConversationMetadataBody,
} from '../../services/conversations/conversation-metadata-update';
import { announceParticipantRoleUpdated } from '../conversations/participant-role-core';
import { participantListUserSelect } from '../conversations/utils/participant-projection';
import { CONVERSATION_METADATA_SELECT, serveConversationMetadata } from './conversation-metadata';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response';
import { logError } from '../../utils/logger.js';
import {
  conversationConfigurationSuccess,
  conversationMemberRoleSuccess,
  conversationMemberRemovalSuccess, adminErrorResponses, userIdParams } from './admin-conversation-response-schemas';

/** Même seuil que la lecture souveraine des messages. */
const MOTIF_MINIMAL = 10;

const motif = { type: 'string', minLength: MOTIF_MINIMAL, maxLength: 500 } as const;

/**
 * La liste des champs qu'un administrateur peut écrire. `propertyNames` et non
 * `additionalProperties: false` : sous la configuration AJV de Fastify
 * (`removeAdditional: true`), le second RETIRE en silence une clé inconnue — un
 * `{ type: 'direct' }` deviendrait un corps vide, donc un 200 qui n'a rien
 * fait. `propertyNames` REFUSE, et c'est ce qu'une frontière doit faire.
 */
const CHAMPS_ADMIS = [
  ...Object.keys(updateConversationRequestSchema.properties),
  'isActive',
  'closed',
  'reason',
] as const;

const corpsDeConfiguration = {
  type: 'object',
  required: ['reason'],
  propertyNames: { enum: CHAMPS_ADMIS },
  properties: {
    ...updateConversationRequestSchema.properties,
    isActive: { type: 'boolean', description: 'false = archiver, true = restaurer' },
    closed: { type: 'boolean', description: 'true = fermer à l\'écriture (closedAt/closedBy), false = rouvrir' },
    reason: motif,
  },
} as const;

const REGLAGES_DE_HIERARCHIE = ['defaultWriteRole', 'isAnnouncementChannel', 'slowModeSeconds'] as const;

type CorpsDeConfiguration = ConversationMetadataBody & {
  readonly isActive?: boolean;
  readonly closed?: boolean;
  readonly reason: string;
};

const SELECT_ECRITURE = {
  ...CONVERSATION_METADATA_SELECT,
  closedBy: true,
  participants: { select: { id: true, userId: true, isActive: true } },
} as const;

/**
 * `:userId` reprend le motif ObjectId de {@link userIdParams} : un identifiant
 * malformé est refusé en 400 au schéma, avant que la garde de hiérarchie ne le
 * remette à Prisma — qui lèverait, et rendrait un 500 à l'administrateur.
 */
const params = (noms: readonly string[]) => ({
  type: 'object',
  required: [...noms],
  properties: Object.fromEntries(
    noms.map((nom) => [nom, nom === 'userId' ? userIdParams.properties.userId : { type: 'string' }])
  ),
});

function acteurId(request: FastifyRequest): string {
  const ctx = (request as UnifiedAuthRequest).authContext;
  return ctx.userId ?? ctx.registeredUser?.id ?? '';
}

/** La conversation globale se reconnaît à son identifiant ou à son type, jamais à l'adresse seule. */
const estGlobale = (conv: { identifier: string; type: string }): boolean =>
  conv.identifier === 'meeshy' || conv.type === 'global';

function io(fastify: FastifyInstance) {
  const manager = fastify.socketIOHandler?.getManager?.();
  return { manager, io: manager?.getIO() };
}

type Cible = { readonly conversationId: string };

/** Résout l'adresse (id ou identifiant lisible) ; `null` = introuvable, `'meeshy'` = refus. */
async function resoudre(fastify: FastifyInstance, adresse: string): Promise<Cible | 'meeshy' | null> {
  if (adresse === 'meeshy') return 'meeshy';
  const conversationId = await resolveConversationId(fastify.prisma, adresse);
  return conversationId ? { conversationId } : null;
}

export function registerConversationSettingsSovereignRoutes(fastify: FastifyInstance): void {
  const gardes = [fastify.authenticate, requirePermission('canManageConversations'), requireAdminRank()];
  // Les deux gestes sur un MEMBRE écrivent sur un compte nommé : la
  // hiérarchie de plateforme s'y applique comme à toute écriture d'admin sur
  // un utilisateur (#4154) — un ADMIN ne retire ni ne rétrograde un BIGBOSS.
  // Elles courent en `preHandler`, APRÈS la validation du schéma : c'est elle
  // qui refuse un `:userId` malformé avant que la garde ne le lise.
  const gardesSurMembre = [...gardes, requireHierarchy({ param: 'userId' })];

  fastify.patch<{ Params: { conversationId: string }; Body: CorpsDeConfiguration }>('/admin/conversations/:conversationId', {
    onRequest: gardes,
    schema: {
      description:
        "Configure une conversation SANS en être membre : métadonnées, réglages, archive, fermeture. Rang d'administration, " +
        'motif obligatoire, trace AdminAuditLog. #7845.',
      tags: ['admin'],
      summary: 'Configure a conversation (admin)',
      params: params(['conversationId']),
      body: corpsDeConfiguration,
      response: { 200: conversationConfigurationSuccess, ...adminErrorResponses },
    },
  }, (request, reply) => configurer(request, reply));

  async function configurer(
    request: FastifyRequest<{ Params: { conversationId: string }; Body: CorpsDeConfiguration }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const cible = await resoudre(fastify, request.params.conversationId);
      if (cible === 'meeshy') return sendForbidden(reply, 'The global conversation cannot be modified');
      if (!cible) return sendNotFound(reply, 'Conversation not found');
      const { conversationId } = cible;

      const avant = await fastify.prisma.conversation.findUnique({ where: { id: conversationId }, select: SELECT_ECRITURE });
      if (!avant) return sendNotFound(reply, 'Conversation not found');
      if (estGlobale(avant)) return sendForbidden(reply, 'The global conversation cannot be modified');

      const { isActive, closed, reason, ...metadonnees } = request.body;

      if (avant.type === 'direct' && REGLAGES_DE_HIERARCHIE.some((champ) => metadonnees[champ] !== undefined)) {
        return sendForbidden(reply, 'Un tête-à-tête n\'a pas de hiérarchie d\'écriture : ces réglages ne s\'y appliquent pas');
      }
      if (avant.encryptionMode === 'e2ee' && metadonnees.autoTranslateEnabled === true) {
        return sendBadRequest(reply, 'Auto-translation cannot be enabled on an end-to-end encrypted conversation', {
          code: 'E2EE_NO_TRANSLATION',
        });
      }

      const { updateData, changedFields } = composeConversationUpdate(metadonnees);
      const maintenant = new Date();
      const adminId = acteurId(request);
      // Refermer un fil déjà fermé ne réécrit ni la date ni l'auteur de la
      // fermeture : l'histoire du conteneur garde son premier geste.
      const ferme = closed === true && !avant.closedAt;
      const data = {
        ...updateData,
        ...(isActive !== undefined && { isActive }),
        ...(ferme && { closedAt: maintenant, closedBy: adminId }),
        ...(closed === false && { closedAt: null, closedBy: null }),
      };

      if (Object.keys(data).length === 0) {
        const { participants: _p, closedBy: _c, ...ligne } = avant;
        return sendSuccess(reply, serveConversationMetadata(ligne));
      }

      const ecriture = fastify.prisma.conversation.update({ where: { id: conversationId }, data, select: SELECT_ECRITURE });
      // Fermer éteint aussi les liens de partage encore actifs, dans la MÊME
      // transaction (#3740) : un lien qui reste actif sur un fil fermé est un
      // contrôle qui ment.
      const apres = ferme
        ? (await fastify.prisma.$transaction([ecriture, deactivateShareLinksOnClose(fastify.prisma, conversationId)]))[0]
        : await ecriture;

      const { manager, io: serveur } = io(fastify);
      if (Object.keys(changedFields).length > 0) {
        broadcastConversationUpdated({
          io: serveur,
          conversationId,
          participants: apres.participants,
          changedFields,
          updatedBy: adminId,
        });
      }
      if (ferme) {
        announceConversationClosed({
          io: serveur,
          manager,
          conversationId,
          participants: apres.participants.filter((p) => p.isActive),
          closedBy: adminId,
          closedAt: maintenant,
        });
      }

      const avantParChamp: Record<string, unknown> = { ...avant, closed: avant.closedAt !== null };
      const demandes: Record<string, unknown> = { ...data, ...(closed !== undefined && { closed }) };
      const changes = Object.fromEntries(
        Object.keys(demandes)
          .filter((cle) => cle !== 'closedAt' && cle !== 'closedBy')
          .map((cle) => [cle, { before: avantParChamp[cle] ?? null, after: demandes[cle] }])
      );
      await withAudit(request, {
        action: 'ADMIN_CONVERSATION_UPDATED',
        entity: 'Conversation',
        entityId: conversationId,
        reason,
        changes,
      });

      const { participants: _p, closedBy: _c, ...ligne } = apres;
      return sendSuccess(reply, serveConversationMetadata(ligne));
    } catch (error) {
      logError(fastify.log, 'Error configuring conversation (admin)', error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to update conversation' });
    }
  }

  /**
   * Charge la conversation et la participation ACTIVE de la cible — le socle
   * commun des deux gestes sur un membre. Le refus est rendu tel quel.
   */
  async function membreActif(reply: FastifyReply, adresse: string, userId: string) {
    const cible = await resoudre(fastify, adresse);
    if (cible === 'meeshy') { sendForbidden(reply, 'The global conversation cannot be modified'); return null; }
    if (!cible) { sendNotFound(reply, 'Conversation not found'); return null; }

    const conversation = await fastify.prisma.conversation.findUnique({
      where: { id: cible.conversationId },
      select: { id: true, identifier: true, type: true },
    });
    if (!conversation) { sendNotFound(reply, 'Conversation not found'); return null; }
    if (estGlobale(conversation)) { sendForbidden(reply, 'The global conversation cannot be modified'); return null; }

    const participant = await fastify.prisma.participant.findFirst({
      where: { conversationId: conversation.id, userId, isActive: true },
      select: { id: true, userId: true, role: true, displayName: true, isActive: true },
    });
    if (!participant) { sendNotFound(reply, 'Participant not found or inactive'); return null; }
    if (isMemberCreator(participant.role ?? 'member')) {
      sendForbidden(reply, 'Les droits du créateur restent au-dessus de tout rang : il ne se rétrograde ni ne se retire', {
        code: 'CREATOR_PROTECTED',
      });
      return null;
    }
    return { conversationId: conversation.id, participant };
  }

  fastify.patch<{
    Params: { conversationId: string; userId: string };
    Body: { role: 'admin' | 'moderator' | 'member'; reason: string };
  }>('/admin/conversations/:conversationId/participants/:userId', {
    preHandler: gardesSurMembre,
    schema: {
      description: "Change le rang d'un membre dans une conversation, sans en être membre. Le créateur est protégé. #7845.",
      tags: ['admin'],
      summary: "Change a member's conversation role (admin)",
      params: params(['conversationId', 'userId']),
      body: {
        type: 'object',
        required: ['role', 'reason'],
        properties: { role: { type: 'string', enum: ['admin', 'moderator', 'member'] }, reason: motif },
      },
      response: { 200: conversationMemberRoleSuccess, ...adminErrorResponses },
    },
  }, async (request, reply) => {
    try {
      const { conversationId: adresse, userId } = request.params;
      const { role, reason } = request.body;
      const trouve = await membreActif(reply, adresse, userId);
      if (!trouve) return;
      const { conversationId, participant } = trouve;

      await fastify.prisma.participant.update({ where: { id: participant.id }, data: { role } });
      invalidateParticipantLookup(participant.id, conversationId);

      const relu = await fastify.prisma.participant.findUnique({ where: { id: participant.id }, include: participantListUserSelect });
      const adminId = acteurId(request);
      announceParticipantRoleUpdated({
        manager: fastify.socketIOHandler?.getManager?.(),
        conversationId,
        targetUserId: userId,
        newRole: role,
        updatedBy: adminId,
        participant: relu ? serializeConversationParticipant(relu) : null,
      });

      await withAudit(request, {
        action: 'ADMIN_CONVERSATION_MEMBER_ROLE_CHANGED',
        entity: 'Conversation',
        entityId: conversationId,
        userId,
        reason,
        changes: { role: { before: participant.role, after: role } },
      });

      return sendSuccess(reply, { conversationId, userId, participantId: participant.id, role });
    } catch (error) {
      logError(fastify.log, 'Error changing member role (admin)', error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to change member role' });
    }
  });

  fastify.post<{
    Params: { conversationId: string; userId: string };
    Body: { reason: string };
  }>('/admin/conversations/:conversationId/participants/:userId/remove', {
    preHandler: gardesSurMembre,
    schema: {
      description: "Retire un membre d'une conversation, sans en être membre. Le créateur est protégé. #7845.",
      tags: ['admin'],
      summary: 'Remove a member from a conversation (admin)',
      params: params(['conversationId', 'userId']),
      body: { type: 'object', required: ['reason'], properties: { reason: motif } },
      response: { 200: conversationMemberRemovalSuccess, ...adminErrorResponses },
    },
  }, async (request, reply) => {
    try {
      const { conversationId: adresse, userId } = request.params;
      const trouve = await membreActif(reply, adresse, userId);
      if (!trouve) return;
      const { conversationId, participant } = trouve;

      const leftAt = new Date();
      await fastify.prisma.participant.update({ where: { id: participant.id }, data: { isActive: false, leftAt } });
      invalidateParticipantLookup(participant.id, conversationId);

      const { manager, io: serveur } = io(fastify);
      if (serveur) {
        // Même fanout que le retrait par un membre (`participant-removal.ts`) :
        // l'effectif ABSOLU aux restants ET au retiré, qui ferme la chaîne —
        // ses appareils posés sur la liste doivent apprendre qu'il est sorti.
        const restants = await fastify.prisma.participant.findMany({
          where: { conversationId, isActive: true },
          select: { id: true, userId: true, role: true, user: { select: { role: true } } },
        });
        emitConversationMemberCountEvent({
          io: serveur,
          conversationId,
          participants: [...restants, { id: participant.id, userId: participant.userId }],
          event: SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT,
          payload: {
            conversationId,
            // La cible est trouvée PAR son `userId` : c'est toujours un compte.
            participantId: participant.id,
            userId: participant.userId,
            displayName: participant.displayName ?? '',
            leftAt: leftAt.toISOString(),
          },
          memberCount: restants.length,
        });
      }
      await endConversationMembership({ io: serveur, manager, conversationId, userId: participant.userId ?? participant.id });

      await withAudit(request, {
        action: 'ADMIN_CONVERSATION_MEMBER_REMOVED',
        entity: 'Conversation',
        entityId: conversationId,
        userId,
        reason: request.body.reason,
        changes: { isActive: { before: true, after: false } },
      });

      return sendSuccess(reply, { conversationId, userId, participantId: participant.id, removed: true });
    } catch (error) {
      logError(fastify.log, 'Error removing member (admin)', error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to remove member' });
    }
  });
}
