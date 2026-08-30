import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { canAccessConversation } from './utils/access-control';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { invalidateParticipantLookup } from '../../utils/participant-lookup-cache';
import { postJoinSystemMessage } from '../../services/conversations/joinSystemMessage';
import {
  disclosableEntryRights,
  resolveEntryRights,
  PARTICIPANT_RIGHT_NAMES,
  type ParticipantRightName,
} from '../../services/participantRights';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { emitConversationMemberCountEvent } from '../../socketio/emitConversationMemberCount';
import { participantUserRooms } from '../../socketio/emitToConversationParticipants';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError, sendError } from '../../utils/response';
import {
  resolveConversationEntry,
  REJOIN_PARTICIPANT_STATE
} from '../../services/conversations/conversationEntryAdmission';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { hasMinimumMemberRole, memberRoleCasings, MemberRole } from '@meeshy/shared/types/role-types';
import { actorHasMinimumRole } from '../../utils/conversation-authority';
import { z } from 'zod';
const logger = enhancedLogger.child({ module: 'ConversationParticipantWriteRoutes' });

/**
 * Routes d'ÉCRITURE des participants — `PATCH .../participants/:participantId/rights`
 * (droits d'un visiteur sans compte + octroi d'historique par date) et
 * `POST .../participants` (ajout d'un participant). Voir `participants.ts`,
 * qui reste le point d'entrée de `registerParticipantsRoutes` et appelle
 * `registerParticipantWriteRoutes` juste après les routes de lecture, dans
 * l'ordre original des routes. Extrait le 2026-08-30 (#4284) pour ramener
 * `participants.ts` sous le budget de taille — pur déplacement, aucun
 * comportement changé.
 */

/**
 * Les rangs qui font un HÔTE de la conversation, tels qu'un `where` Prisma peut
 * les matcher. DÉRIVÉS de la hiérarchie plutôt que retapés : un rang ajouté
 * au-dessus de `moderator` en fera partie sans qu'on ait à y penser, et le
 * dépôt n'a qu'UNE autorité sur « qui est au-dessus de qui »
 * (`hasMinimumMemberRole`).
 *
 * Les DEUX casses y figurent, et ce n'est pas une précaution : le filtre part
 * en BASE, où un `in` Prisma ne connaît pas `mode: 'insensitive'`.
 * `Participant.role` s'écrit en minuscules depuis #3875, mais les lignes
 * écrites AVANT portent encore `'ADMIN'`/`'CREATOR'` tant que
 * `scripts/migrations/normalize-participant-role-casing.ts` n'a pas tourné en
 * production — et le symptôme d'un filtre trop étroit est un administrateur
 * qui ne reçoit tout simplement PAS l'événement, en silence, sans erreur.
 * Deux lignes plus haut, la garde du demandeur replie déjà la casse
 * (`viewerRole.toLowerCase()`) : le filtre de base ne doit pas être le seul
 * endroit du fichier qui l'ignore.
 */
const CONVERSATION_HOST_ROLE_MATCHES: readonly string[] = memberRoleCasings(
  Object.values(MemberRole).filter((role) => hasMinimumMemberRole(role, MemberRole.MODERATOR)),
);

/**
 * `PATCH …/rights` : un instant ISO 8601 (décalage admis), `null` pour retirer,
 * absent pour ne rien dire.
 *
 * Borné au PRÉSENT. Le plancher est un `createdAt: { gte: date }` : une date à
 * venir n'exclut pas seulement le passé, elle exclut aussi les messages À
 * VENIR — y compris ceux que l'intéressé écrit lui-même. Sans cette borne,
 * « ouvrir l'historique depuis le 1er janvier prochain » rendait le participant
 * AVEUGLE à toute la conversation, silencieusement : un mute déguisé en octroi,
 * qu'aucune erreur ne signalait à l'administrateur qui venait de l'écrire.
 */
const HISTORY_VISIBLE_FROM_BODY = z.iso
  .datetime({ offset: true, error: 'historyVisibleFrom must be an ISO 8601 date-time or null' })
  .refine((value) => Date.parse(value) <= Date.now(), {
    error: 'historyVisibleFrom must not be in the future: a future floor hides every message, including the participant\'s own',
  })
  .nullable()
  .optional();

export function registerParticipantWriteRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  /**
   * Les droits d'un visiteur sans compte, pilotés par l'hôte.
   *
   * Figer les conditions d'entrée au join a retiré à l'hôte un levier : décocher
   * `allowViewHistory` sur son lien ne referme plus rien à qui est déjà entré.
   * Cette route est son remplaçant, et elle est plus fine — elle vise UNE
   * personne, là où le lien visait tous ceux qui l'avaient emprunté.
   *
   * `AnonymousRightsOverride` existait dans le schéma et était lu par
   * `middleware/auth.ts` depuis toujours, sans qu'aucun code ne l'écrive nulle
   * part. Ceci est son premier écrivain.
   *
   * `historyVisibleFrom` est le second levier, et il vaut pour TOUT participant,
   * inscrit compris : un administrateur ouvre l'historique depuis une DATE —
   * jamais depuis un message, qui se supprime — et `null` retire l'octroi. La
   * lecture le respecte partout par `services/historyFloor`.
   */
  fastify.patch<{
    Params: { id: string; participantId: string };
    Body: Partial<Record<ParticipantRightName, boolean>> & { historyVisibleFrom?: string | null };
  }>('/conversations/:id/participants/:participantId/rights', {
    schema: {
      description: 'Grant or revoke a no-account visitor\'s rights in this conversation, and/or grant history by DATE to any participant (`historyVisibleFrom`: ISO 8601, or null to revoke). Admins/moderators only. The boolean override is a DELTA: a right the body does not name keeps following the value frozen at join time.',
      tags: ['conversations', 'participants'],
      summary: 'Update a participant\'s rights',
      params: {
        type: 'object',
        required: ['id', 'participantId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          participantId: { type: 'string', description: 'Participant ID (not a User ID)' }
        }
      },
      body: {
        type: 'object',
        minProperties: 1,
        additionalProperties: false,
        properties: {
          ...Object.fromEntries(
            PARTICIPANT_RIGHT_NAMES.map((name) => [name, { type: 'boolean' }])
          ),
          historyVisibleFrom: {
            type: ['string', 'null'],
            description: 'ISO 8601 instant from which this participant may read the history (any participant, account or not); null revokes the grant. Must not be in the future — a future floor hides every message, including the participant\'s own. Writable by conversation admins and creators only.'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                participantId: { type: 'string' },
                conversationId: { type: 'string' },
                rights: {
                  type: 'object',
                  description: 'Resolved rights after the write — an state, not the delta',
                  properties: Object.fromEntries(
                    PARTICIPANT_RIGHT_NAMES.map((name) => [name, { type: 'boolean' }])
                  )
                },
                historyVisibleFrom: { type: 'string', format: 'date-time', nullable: true, description: 'The history grant by date now in force (null = none)' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id, participantId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const currentUserId = authRequest.authContext?.userId;

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Access denied: you are not a member of this conversation', { code: 'CONVERSATION_ACCESS_DENIED' });
      }

      // Le corps est filtré sur la liste des droits CONNUS avant tout le reste :
      // ce qui n'y figure pas ne doit jamais atteindre `anonymousSession.rights`,
      // où Prisma l'écrirait sans broncher — un type composite Mongo n'a pas de
      // colonne à violer.
      const body = (request.body ?? {}) as Record<string, unknown>;
      const requested = PARTICIPANT_RIGHT_NAMES
        .filter((name) => typeof body[name] === 'boolean')
        .map((name) => [name, body[name] as boolean] as const);

      // L'octroi par date : `undefined` = non nommé, `null` = retiré, sinon
      // une date. Validé ici parce que le schéma Fastify ne sait dire qu'une
      // chaîne ou `null` — pas qu'elle est un instant.
      const historyGrant = HISTORY_VISIBLE_FROM_BODY.safeParse(body.historyVisibleFrom);
      if (!historyGrant.success) {
        return sendBadRequest(
          reply,
          historyGrant.error.issues[0]?.message ?? 'historyVisibleFrom must be an ISO 8601 date-time or null',
          { code: 'INVALID_HISTORY_VISIBLE_FROM' }
        );
      }
      const historyVisibleFrom: Date | null | undefined =
        historyGrant.data === undefined ? undefined : historyGrant.data === null ? null : new Date(historyGrant.data);

      if (requested.length === 0 && historyVisibleFrom === undefined) {
        return sendBadRequest(reply, 'No known right named in the request body');
      }

      const viewerRow = currentUserId
        ? await prisma.participant.findFirst({
            where: authRequest.authContext?.isAnonymous
              ? { id: currentUserId, conversationId, isActive: true }
              : { userId: currentUserId, conversationId, isActive: true },
            select: { role: true }
          })
        : null;

      const viewerActor = {
        conversationRole: viewerRow?.role,
        platformRole: authRequest.authContext?.registeredUser?.role,
      };
      if (!actorHasMinimumRole(viewerActor, MemberRole.MODERATOR)) {
        return sendForbidden(reply, 'Only conversation admins and moderators may change a visitor\'s rights');
      }

      // L'octroi par DATE n'est pas un droit d'entrée de plus : il OUVRE ce qui
      // précède l'arrivée, et la règle produit le réserve à un ADMINISTRATEUR de
      // la conversation. Un modérateur est lui-même BORNÉ par le plancher — le
      // rang 1 de `historyFloorFor` exige `admin`, pas `moderator` — donc écrire
      // ce champ lui donnait le moyen de se l'ouvrir À LUI-MÊME, sur sa propre
      // ligne. La garde porte sur le CHAMP, pas sur la route : les droits
      // booléens que ce même endpoint lui confie ne franchissent aucun plancher
      // et restent à sa portée.
      if (historyVisibleFrom !== undefined && !actorHasMinimumRole(viewerActor, MemberRole.ADMIN)) {
        return sendForbidden(
          reply,
          'Only conversation admins may grant or revoke history access by date',
          { code: 'HISTORY_GRANT_REQUIRES_ADMIN' }
        );
      }

      const target = await prisma.participant.findFirst({
        where: { id: participantId, conversationId, isActive: true }
      });

      if (!target) {
        return sendNotFound(reply, 'Participant not found in this conversation');
      }

      // La surcharge BOOLÉENNE vit dans `anonymousSession`, qu'un participant
      // inscrit n'a pas. Refuser explicitement vaut mieux qu'écrire une session
      // anonyme sur quelqu'un qui a un compte. L'octroi par date, lui, est un
      // scalaire de la ligne participant et vaut pour tous.
      if (requested.length > 0 && target.type !== 'anonymous') {
        return sendBadRequest(reply, 'Only no-account participants carry an entry-rights override', { code: 'PARTICIPANT_HAS_ACCOUNT' });
      }

      // La surcharge est un DELTA. Un droit ramené à sa valeur du join voit son
      // entrée EFFACÉE plutôt que réécrite à l'identique : une surcharge qui
      // recopie le join cesse de le suivre, et l'hôte perd tout moyen de revenir
      // en arrière.
      const priorRights = { ...(target.anonymousSession?.rights ?? {}) } as Record<string, boolean>;
      const joinPermissions = target.permissions as unknown as Record<string, boolean | undefined>;

      for (const [name, value] of requested) {
        if (joinPermissions?.[name] === value) {
          delete priorRights[name];
        } else {
          priorRights[name] = value;
        }
      }

      const updated = await prisma.participant.update({
        where: { id: target.id },
        data: {
          ...(requested.length > 0
            ? { anonymousSession: { ...target.anonymousSession, rights: priorRights } }
            : {}),
          ...(historyVisibleFrom !== undefined ? { historyVisibleFrom } : {})
        }
      });

      const rights = resolveEntryRights(updated ?? target, priorRights);
      const grantedFrom: Date | null =
        historyVisibleFrom !== undefined ? historyVisibleFrom : (target.historyVisibleFrom ?? null);

      // Deux audiences, DEUX charges — décision porteur #3898 (option b),
      // même patron que `presence-audience.ts` : `historyVisibleFrom` est un
      // fait de MODÉRATION (« l'hôte a octroyé l'historique à X depuis le
      // 3 mars »), pas un fait de conversation ordinaire. La room de
      // conversation entière ne le voit plus ; seuls les AUTRES HÔTES
      // (admin/moderator/creator) et l'INTÉRESSÉ lui-même le reçoivent, sur
      // leur room personnelle.
      //
      // Contrat client : un hôte connecté ET dans la room de conversation
      // reçoit DEUX événements pour le même changement, et **leur ordre ne se
      // suppose pas** — la charge réduite part d'ailleurs en PREMIER ici, une
      // lecture Prisma la séparant des rooms personnelles. Ce qui tient le
      // contrat n'est donc pas un rang mais la forme : la charge réduite
      // n'AFFIRME rien sur l'octroi (clé ABSENTE, jamais `null`), donc un
      // client qui discrimine sur la PRÉSENCE de la clé converge vers le même
      // état quel que soit l'ordre d'arrivée. Les deux consommateurs le font
      // (`carriesHistoryGrant` côté iOS, `!== undefined` côté web) ; Android
      // n'a pas de consommateur. Un client qui recopierait la valeur
      // INCONDITIONNELLEMENT effacerait l'octroi — c'est la règle du § « Un
      // champ que le client lit AUTORITATIVEMENT n'est plus optionnel pour
      // l'émetteur » (CLAUDE.md), appliquée ici.
      const manager = fastify.socketIOHandler?.getManager();
      const io = manager?.getIO();

      // Le middleware d'auth met en cache la ligne participant : sans
      // invalidation, le prochain envoi de ce visiteur serait arbitré sur ses
      // anciens droits pendant toute la durée du cache.
      //
      // Posée AVANT la diffusion, jamais après : l'écriture est acquise, et
      // tout ce qui suit est accessoire. La laisser derrière l'éventail la
      // rendait otage d'une lecture Prisma et d'un `.emit()` — dont le dépôt
      // dit lui-même qu'il LÈVE quand l'adaptateur ou l'encodeur est en défaut
      // (`emitWithSeq`). Même ordre que `_emitPresenceSnapshot`, qui place le
      // durable HORS de son `try`.
      manager?.invalidateParticipantCache?.(target.id, conversationId);

      try {
        if (io) {
          const fullPayload = {
            conversationId,
            participantId: target.id,
            updatedBy: currentUserId ?? '',
            rights,
            historyVisibleFrom: grantedFrom ? grantedFrom.toISOString() : null
          };
          // La clé est ABSENTE, jamais `null` : `null` dirait « octroi
          // retiré », ce que la room de conversation n'a pas à savoir.
          //
          // `rights.canViewHistory` part avec lui (#4009, décision porteur
          // 2026-08-27) : c'est le MÊME fait de modération — « qui a le droit
          // de voir l'historique » — dit sous une autre forme. #3898 n'avait
          // nommé que la date, et le booléen voisin, dans le même objet, avait
          // continué son chemin vers la room entière.
          const { historyVisibleFrom: _omitted, rights: fullRights, ...rest } = fullPayload;
          // #4056 — la loi est partagée avec la fiche REST. La room n'héberge
          // pas : `viewerHostsTheRoom: false`.
          const roomPayload = { ...rest, rights: disclosableEntryRights(fullRights, false) };

          io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, roomPayload);

          // La room personnelle porte le `User.id` d'un inscrit et le
          // `Participant.id` d'un visiteur sans compte — même clé que
          // `participantUserRoomTargets`. L'intéressé reçoit toujours la charge
          // complète : c'est SA date.
          io.to(ROOMS.user(target.userId ?? target.id)).emit(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, fullPayload);

          // Les AUTRES hôtes (admin/moderator/creator) de la conversation — pour
          // qu'ils voient le changement, sans l'exposer à la room entière. Un
          // hôte qui est AUSSI l'intéressé (rare : un admin octroie l'historique
          // à un autre admin) reçoit deux fois la même charge sur sa room —
          // idempotent, jamais faux.
          const hosts = await prisma.participant.findMany({
            where: { conversationId, isActive: true, role: { in: [...CONVERSATION_HOST_ROLE_MATCHES] } },
            select: { id: true, userId: true }
          });
          for (const room of participantUserRooms(hosts)) {
            io.to(room).emit(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, fullPayload);
          }
        }
      } catch (error) {
        // La diffusion est ACCESSOIRE : l'écriture est persistée et le cache
        // déjà invalidé. Rendre 500 ici annoncerait à l'hôte que son geste a
        // échoué alors qu'il a pris effet — et le ferait rejouer.
        logger.warn('participant rights broadcast failed', {
          conversationId,
          participantId: target.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }

      return sendSuccess(reply, {
        participantId: target.id,
        conversationId,
        rights,
        historyVisibleFrom: grantedFrom ? grantedFrom.toISOString() : null
      });
    } catch (error) {
      logger.error('Error updating participant rights', error as Error);
      return sendInternalError(reply, 'Internal server error');
    }
  });

  fastify.post<{
    Params: { id: string };
    Body: { userId: string };
  }>('/conversations/:id/participants', {
    schema: {
      description: 'Add a participant to a conversation - requires admin/moderator role',
      tags: ['conversations', 'participants'],
      summary: 'Add participant',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      body: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', description: 'User ID to add to conversation' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                // `participant` était déclaré ici SANS producteur : le handler
                // ne renvoie que `message`. Retiré plutôt que fabriqué —
                // l'inventaire cesse de promettre un champ qui n'a jamais existé
                // (même traitement que `users/profile.ts|permissions`, cycle 91 bis §5).
                message: { type: 'string', example: 'Participant ajouté avec succès' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { userId } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const currentUserId = authRequest.authContext.userId;

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      const currentUserParticipant = await prisma.participant.findFirst({
        where: {
          conversationId: conversationId,
          userId: currentUserId,
          isActive: true
        }
      });

      if (!currentUserParticipant) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      if (!actorHasMinimumRole(
        {
          conversationRole: currentUserParticipant.role,
          platformRole: authRequest.authContext.registeredUser?.role,
        },
        MemberRole.MODERATOR,
      )) {
        return sendForbidden(reply, 'Only admins and moderators can add participants');
      }

      const userToAdd = await prisma.user.findFirst({
        where: { id: userId }
      });

      if (!userToAdd) {
        return sendNotFound(reply, 'User not found');
      }

      // Le `findFirst({ isActive: true })` qui précédait ne pouvait PAS voir la
      // ligne d'un banni (bannir écrit `isActive: false`) : le `create` lui
      // fabriquait une ligne neuve et active, ce qui défaisait le bannissement
      // sans passer par `POST …/unban` — laquelle exige le rang `admin` là où
      // cette route s'ouvre aussi aux `moderator`, et écrit une trace. Voir
      // `services/conversations/conversationEntryAdmission.ts`.
      // La SEULE des trois portes qui ne tenait pas déjà l'état de la
      // conversation : elle n'autorisait que sur le rang de l'appelant, et un
      // rang survit à la clôture (fermer n'écrit sur AUCUNE ligne
      // `Participant`). Un admin restait donc capable d'ajouter des gens à un
      // fil terminé. Deux colonnes, cf. `conversationWriteAdmission`.
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { isActive: true, closedAt: true },
      });

      const entry = await resolveConversationEntry({ prisma, conversationId, userId, conversation });

      if (entry.outcome === 'closed') {
        return sendError(reply, 410, 'Cette conversation est terminée');
      }

      if (entry.outcome === 'banned') {
        return sendForbidden(reply, 'Cet utilisateur est banni de la conversation — levez le bannissement d\'abord');
      }

      if (entry.outcome === 'already-member') {
        return sendBadRequest(reply, 'L\'utilisateur est déjà membre de cette conversation');
      }

      const addedMemberFields = {
        type: 'user',
        displayName: userToAdd.displayName ?? userToAdd.username ?? `${userToAdd.firstName ?? ''} ${userToAdd.lastName ?? ''}`.trim(),
        avatar: userToAdd.avatar,
        role: 'member',
        language: userToAdd.systemLanguage ?? 'en',
        permissions: {
          canSendMessages: true,
          canSendFiles: true,
          canSendImages: true,
          canSendAudios: true,
          canSendVideos: true,
          canSendLocations: false,
          canSendLinks: false,
          // Un membre ajouté après coup lit depuis son arrivée ; un
          // administrateur lui ouvre l'avant par date (`historyVisibleFrom`).
          canViewHistory: false
        }
      };

      // Partagé par l'écriture et l'emit, comme `leftAt` sur le chemin du
      // départ : les deux doivent s'accorder. Un rejoin conserve son `joinedAt`
      // d'origine en base — l'événement, lui, date l'ADHÉSION qu'il annonce,
      // c'est-à-dire maintenant.
      const joinedAt = new Date();

      let joinedParticipantId: string;
      if (entry.outcome === 'rejoin' && entry.participantId) {
        const rejoined = await prisma.participant.update({
          where: { id: entry.participantId },
          data: { ...addedMemberFields, ...REJOIN_PARTICIPANT_STATE }
        });
        joinedParticipantId = rejoined.id;
        invalidateParticipantLookup(entry.participantId, conversationId);
      } else {
        const created = await prisma.participant.create({
          data: {
            conversationId: conversationId,
            userId: userId,
            ...addedMemberFields,
            joinedAt
          }
        });
        joinedParticipantId = created.id;
      }

      // Annoncer l'arrivée — quatrième et dernière porte, même loi. Une entrée
      // qui ne se voit pas dans le fil est une entrée que les présents
      // découvrent au premier message de l'arrivant.
      await postJoinSystemMessage(
        {
          prisma,
          broadcast: (message, targetConversationId) =>
            fastify.socketIOHandler?.getManager()?.broadcastMessage(message as never, targetConversationId)
              ?? Promise.resolve()
        },
        {
          conversationId,
          participantId: joinedParticipantId,
          displayName: addedMemberFields.displayName,
          isAnonymous: false,
          viaShareLink: false
        }
      );

      // R6-1 — broadcast so other members' devices refresh the participant list
      // in real time (the POST previously created the row silently → stale member
      // lists until manual reload). Mirrors the role-update emit below.
      // conversation:joined feeds ParticipantsView (invalidate+reload) and
      // ConversationSyncEngine (participants cache invalidate) on iOS.
      const socketManager = fastify.socketIOHandler?.getManager();
      const io = socketManager?.getIO();
      if (io) {
        io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.CONVERSATION_JOINED, {
          conversationId,
          userId,
        });

        // `conversation:joined` ci-dessus ne peut PAS porter l'effectif : le
        // même nom, le même payload `{conversationId, userId}`, servent l'ack
        // self-only qu'un socket reçoit en REJOIGNANT LA ROOM
        // (`ConversationHandler`) — que produit chaque ouverture de fil, et qui
        // ne change aucune appartenance. Compter dessus gonflerait le compteur
        // à chaque ouverture ; c'est pourquoi aucun client n'incrémentait, et
        // pourquoi son effectif ne pouvait que DÉRIVER VERS LE BAS (départ −1,
        // bannissement −1, ajout rien).
        //
        // D'où l'événement dédié, symétrique de `conversation:participant-left`
        // jusque dans son payload, et adressé comme lui aux rooms PERSONNELLES :
        // le compteur se lit sur l'écran de liste, que ses lecteurs regardent
        // précisément quand ils ne sont pas dans la room de conversation.
        //
        // Le nouvel arrivant est ÉCARTÉ de l'éventail : il reçoit
        // `CONVERSATION_NEW` ci-dessous, dont l'effectif vient du serveur et le
        // compte DÉJÀ. L'incrémenter en plus le mettrait en trop. (Le client
        // écarte la même identité de son côté — l'auto-join de room ci-dessous
        // est asynchrone et pourrait le faire entrer dans la room de
        // conversation avant cet emit.)
        const audience = await prisma.participant.findMany({
          where: { conversationId, isActive: true, NOT: { userId } },
          // `role` et `user.role` en plus : les deux titres qui ouvrent
          // l'effectif ENTIER (`canViewExactMemberCount`), que le fanout doit
          // connaître PAR DESTINATAIRE — un broadcast ne portait qu'une
          // présentation, et c'était la plafonnée, pour tout le monde.
          select: { id: true, userId: true, role: true, user: { select: { role: true } } },
        });
        // Compte ABSOLU plutôt qu'un delta : un client qui incrémente ne se
        // rattrape jamais d'un événement manqué (hors ligne, trou de
        // reconnexion), et les deux clients PERSISTENT la dérive (cache disque
        // iOS, `staleTime: Infinity` web). Un total se rattrape au suivant.
        //
        // `+ 1` parce que l'éventail ÉCARTE l'arrivant (voir ci-dessus) : il est
        // actif depuis l'écriture juste au-dessus, donc il compte, mais il ne
        // figure pas dans `audience`. Une seconde requête ne rendrait rien de
        // plus.
        //
        // Deux chaînes disjointes : « 199+ » pour la room, l'effectif ENTIER
        // pour les lecteurs autorisés. Un broadcast unique ne portait que la
        // présentation plafonnée, et écrasait donc chez l'admin du groupe la
        // valeur exacte que le REST venait de lui servir.
        emitConversationMemberCountEvent({
          io,
          conversationId,
          participants: audience,
          event: SERVER_EVENTS.CONVERSATION_PARTICIPANT_JOINED,
          payload: {
            conversationId,
            userId,
            displayName: addedMemberFields.displayName,
            joinedAt: joinedAt.toISOString(),
          },
          memberCount: audience.length + 1,
        });
      }
      // Auto-join the added user's currently-connected sockets to the conversation
      // room so they receive message:new events immediately without a reconnect.
      if (socketManager) {
        socketManager.joinUserToConversationRoom(userId, conversationId).catch(
          (err: unknown) => logger.error('Failed to auto-join added user to conversation room', err as Error)
        );
      }
      // Emit CONVERSATION_NEW to the added user's room so connected clients
      // (iOS: ConversationListViewModel.conversationNew handler) discover the
      // conversation immediately without waiting for a push notification.
      if (io) {
        try {
          const conv = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { type: true, title: true, createdAt: true },
          });
          const allParticipantIds = await prisma.participant.findMany({
            where: { conversationId, isActive: true },
            select: { userId: true },
          }).then(rows => rows.map(r => r.userId).filter((id): id is string => !!id));
          if (conv) {
            io.to(ROOMS.user(userId)).emit(SERVER_EVENTS.CONVERSATION_NEW, {
              conversationId,
              conversationType: conv.type,
              title: conv.title ?? null,
              creatorId: currentUserId ?? userId,
              participantIds: allParticipantIds,
              createdAt: conv.createdAt instanceof Date ? conv.createdAt.toISOString() : String(conv.createdAt),
            });
          }
        } catch (err) {
          logger.warn('Failed to emit CONVERSATION_NEW to added user', { userId, conversationId, err });
        }
      }

      const notificationService = fastify.notificationService;
      if (notificationService) {
        notificationService.createAddedToConversationNotification({
          recipientUserId: userId,
          addedByUserId: currentUserId,
          conversationId,
        }).catch((err: unknown) => logger.error('Notification error added', err as Error));

        const existingMembers = await prisma.participant.findMany({
          where: { conversationId, isActive: true, type: 'user', userId: { notIn: [userId, currentUserId!] } },
          select: { userId: true },
        });
        // Une seule diffusion pour toute l'audience : le profil du nouveau
        // membre, la conversation et l'effectif sont les mêmes pour chacun, et
        // le mute se demande en une requête. La boucle d'appels unitaires qui
        // précédait les relisait par destinataire.
        const recipientUserIds = existingMembers
          .map((member) => member.userId)
          .filter((id): id is string => !!id);
        if (recipientUserIds.length > 0) {
          notificationService.createMemberJoinedNotificationsBatch(recipientUserIds, {
            newMemberUserId: userId,
            conversationId,
            joinMethod: 'invited' as const,
          }).catch((err: unknown) => logger.error('Notification error joined', err as Error));
        }
      }

      return sendSuccess(reply, { message: 'Participant ajouté avec succès' });

    } catch (error) {
      logger.error('Error adding participant', error as Error);
      return sendInternalError(reply, 'Erreur lors de l\'ajout du participant');
    }
  });
}
