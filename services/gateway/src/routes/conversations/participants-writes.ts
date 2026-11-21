import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import {
  admitConversationMember,
  type MemberAdmissionPorts,
  type ParticipantAdmissionVerdict,
  type ParticipantInviteEngagement,
} from '../../services/conversations/memberAdmission';
import { noticeActor } from '../../services/conversations/conversationNotice';
import {
  PARTICIPANT_RIGHT_NAMES,
  type ParticipantRightName,
} from '../../services/participantRights';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError, sendError } from '../../utils/response';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { MemberRole } from '@meeshy/shared/types/role-types';
import { actorHasMinimumRole } from '@meeshy/shared/utils/conversation-authority';
import { appliquerDroitsDeParticipant } from './participant-rights-core';
import { registerParticipantPatchRoute } from './participant-patch';
import { repondreAuRefus } from './utils/participant-geste-reponse';
import { EngagementService } from '../../services/engagement/EngagementService';
import { newMemberRefusal } from '../../services/conversations/newMemberAdmission';
import { loadSalonCommunity } from '../../services/conversations/communityMembershipSync';
const logger = enhancedLogger.child({ module: 'ConversationParticipantWriteRoutes' });

/**
 * Le plafond d'un lot d'ajout (#4557).
 *
 * Cinquante, parce que l'admission est SÉQUENTIELLE et que chaque tour émet son
 * propre éventail : un lot sans plafond ferait d'un appel HTTP une boucle de
 * diffusion sans borne. Le nombre est déclaré ICI, lu par le schéma de la route
 * ET par la normalisation — un plafond écrit deux fois est un plafond qui
 * diverge.
 */
export const MAX_PARTICIPANTS_PER_CALL = 50;

export type { ParticipantAdmissionVerdict } from '../../services/conversations/memberAdmission';

/**
 * Lit le corps d'un ajout, sous ses DEUX formes, et rend la liste à admettre.
 *
 * `userId` (forme historique) et `userIds[]` (le lot) donnent la même chose :
 * une liste dédoublonnée, non vide, bornée. Le dédoublonnage n'est pas un
 * confort — deux fois le même identifiant dans un lot produirait deux
 * admissions, donc deux avis d'arrivée pour une seule personne.
 *
 * PURE et exportée : c'est la moitié du contrat qu'un témoin peut interroger
 * sans monter Fastify ni Prisma.
 */
export function normalizeParticipantBatch(
  body: { userId?: unknown; userIds?: unknown } | null | undefined
): { userIds: string[]; single: boolean; error?: undefined } | { userIds: string[]; single: boolean; error: string } {
  const enLot = Array.isArray(body?.userIds);
  const brut: unknown[] = enLot
    ? body!.userIds as unknown[]
    : (body?.userId === undefined || body?.userId === null ? [] : [body.userId]);
  const single = !enLot;

  const propres = brut
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

  if (propres.length !== brut.length) {
    return { userIds: [], single, error: 'userIds must contain non-empty strings' };
  }
  const uniques = [...new Set(propres)];
  if (uniques.length === 0) {
    return { userIds: [], single, error: 'userId or userIds is required' };
  }
  // Le plafond se mesure sur la liste DÉDOUBLONNÉE : refuser cinquante et une
  // entrées dont deux identiques punirait une saisie que le serveur ramène de
  // toute façon à cinquante.
  if (uniques.length > MAX_PARTICIPANTS_PER_CALL) {
    return { userIds: [], single, error: `userIds accepts at most ${MAX_PARTICIPANTS_PER_CALL} entries` };
  }
  return { userIds: uniques, single };
}

/**
 * Routes d'ÉCRITURE des participants — `PATCH .../participants/:participantId/rights`
 * (droits d'un visiteur sans compte + octroi d'historique par date) et
 * `POST .../participants` (ajout d'un participant). Voir `participants.ts`,
 * qui reste le point d'entrée de `registerParticipantsRoutes` et appelle
 * `registerParticipantWriteRoutes` juste après les routes de lecture, dans
 * l'ordre original des routes. Extrait le 2026-08-30 (#4284) pour ramener
 * `participants.ts` sous le budget de taille — pur déplacement, aucun
 * comportement changé.
 *
 * **#4713 — le geste des DROITS n'est plus écrit ici.** Tout ce qui décide
 * (autorité, lecture, écriture du delta, éventails) vit dans
 * `participant-rights-core.ts` et s'appelle SANS Fastify ; ce fichier n'en
 * garde que le schéma, l'authentification et la traduction du verdict. Le geste
 * d'ADMISSION (`POST …/participants`), lui, reste entier ici : #4713 extrait,
 * il ne fusionne pas — la route unifiée est un autre lot (#4176).
 */

export type { ParticipantInviteEngagement } from '../../services/conversations/memberAdmission';

export function registerParticipantWriteRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any,
  engagement: ParticipantInviteEngagement = new EngagementService(prisma)
) {
  /**
   * L'adresse UNIQUE où un participant se change — `PATCH
   * …/participants/:participantKey` (#4176). Elle vit dans son propre fichier
   * (`participant-patch.ts`) et s'enregistre ICI plutôt que depuis la coquille
   * `participants.ts` : celle-ci COMPOSE, elle n'implémente pas, et la route
   * fusionnée est une route d'ÉCRITURE de participant comme les deux
   * ci-dessous. L'ordre d'enregistrement n'entre dans aucune décision — Fastify
   * apparie par arbre radix, et les quatre alias portent un segment de plus.
   */
  registerParticipantPatchRoute(fastify, prisma, requiredAuth);

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
   *
   * Le TRAVAIL est dans `appliquerDroitsDeParticipant`
   * (`participant-rights-core.ts`) : ce gestionnaire déclare, authentifie et
   * traduit, rien d'autre.
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
      const verdict = await appliquerDroitsDeParticipant({
        prisma,
        conversationIdentifier: request.params.id,
        participantId: request.params.participantId,
        authContext: (request as UnifiedAuthRequest).authContext,
        body: request.body,
        socketIO: fastify.socketIOHandler,
      });

      if (verdict.genre === 'refus') return repondreAuRefus(reply, verdict);

      return sendSuccess(reply, verdict.donnees);
    } catch (error) {
      logger.error('Error updating participant rights', error as Error);
      return sendInternalError(reply, 'Internal server error');
    }
  });


  /**
   * **Un verdict par identifiant, jamais un échec en bloc (#4557).**
   *
   * Le web invitait N personnes par N appels (`invite-user-modal.tsx`, un
   * `Promise.all` d'un `POST …/invite` par personne). Chacun repayait la
   * résolution de conversation, la vérification de rang de l'appelant, l'avis
   * d'arrivée et l'éventail de diffusion — et surtout, **un seul refus dans le
   * lot n'était pas distinguable d'une panne**, côté client : `Promise.all`
   * rejette au premier échec, et l'écran ne savait pas dire QUI n'était pas
   * passé.
   *
   * D'où la forme retenue : le corps accepte `userIds[]` (≤ 50) et la réponse
   * porte un verdict par identifiant. Les refus qui portent sur la
   * CONVERSATION ou sur l'APPELANT restent des refus de requête (410, 403) —
   * ils sont les mêmes pour tout le lot, et les diluer en cinquante verdicts
   * identiques ferait passer pour un résultat partiel ce qui n'a rien produit.
   *
   * `userId` reste accepté et rend le même corps : les trois clients y sont
   * encore, et le champ `message` qu'ils lisent est conservé.
   */
  fastify.post<{
    Params: { id: string };
    Body: { userId?: string; userIds?: string[] };
  }>('/conversations/:id/participants', {
    schema: {
      description: 'Add one or many participants to a conversation - requires moderator role',
      tags: ['conversations', 'participants'],
      summary: 'Add participants',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      body: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'Single user to add (legacy form, still served)' },
          userIds: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: MAX_PARTICIPANTS_PER_CALL,
            description: `Users to add in one call (max ${MAX_PARTICIPANTS_PER_CALL})`
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
                // `participant` était déclaré ici SANS producteur : le handler
                // ne renvoie que `message`. Retiré plutôt que fabriqué —
                // l'inventaire cesse de promettre un champ qui n'a jamais existé
                // (même traitement que `users/profile.ts|permissions`, cycle 91 bis §5).
                message: { type: 'string', example: 'Participant ajouté avec succès' },
                // #4557 — le verdict, par identifiant. DÉCLARÉ, sans quoi
                // fast-json-stringify le retirerait de chaque réponse et le
                // client resterait aveugle au refus partiel qu'on vient de lui
                // rendre lisible.
                results: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      userId: { type: 'string' },
                      outcome: {
                        type: 'string',
                        enum: ['new', 'rejoin', 'already-member', 'banned', 'not-found', 'community-forbidden'],
                        description: 'What happened to THIS identifier'
                      },
                      // Produit par `admitOneParticipant`, porté par
                      // `ParticipantAdmissionVerdict`, asserté par
                      // `participants-batch-add.test.ts` — et pourtant nommé
                      // par AUCUN schéma : fast-json-stringify le retirait de
                      // chaque réponse. L'aîné le « prouvait » parce qu'il
                      // attestait l'objet POSÉ, du bon côté du sérialiseur.
                      // C'est le miroir exact du `participant` déclaré sans
                      // producteur retiré au-dessus : ici un producteur sans
                      // déclaration. Absent d'un refus — un refus n'a pas de
                      // ligne à nommer. Mesuré par
                      // `participants-batch-served-body.test.ts`, qui lit
                      // l'octet servi.
                      participantId: {
                        type: 'string',
                        description: 'The Participant row written for THIS identifier (admissions only)'
                      }
                    }
                  }
                }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        410: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const currentUserId = authRequest.authContext.userId;

      const demandes = normalizeParticipantBatch(request.body);
      if (demandes.error) return sendBadRequest(reply, demandes.error);

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

      // La conversation est lue UNE fois pour tout le lot : son état est le
      // même pour chaque identifiant, et une conversation close refuse la
      // requête ENTIÈRE plutôt que de rendre cinquante verdicts identiques.
      //
      // La SEULE des trois portes qui ne tenait pas déjà l'état de la
      // conversation : elle n'autorisait que sur le rang de l'appelant, et un
      // rang survit à la clôture (fermer n'écrit sur AUCUNE ligne
      // `Participant`). Un admin restait donc capable d'ajouter des gens à un
      // fil terminé. Deux colonnes, cf. `conversationWriteAdmission`.
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { isActive: true, closedAt: true, communityId: true, type: true, encryptionMode: true },
      });
      if (conversation && (conversation.isActive === false || conversation.closedAt)) {
        return sendError(reply, 410, 'Cette conversation est terminée');
      }
      // #17117 — un seul membre Meeshy dans une conversation externe ; #16188 —
      // un tête-à-tête chiffré de bout en bout reste à deux.
      const closedToNewMembers = conversation ? newMemberRefusal(conversation) : null;
      if (closedToNewMembers) {
        return sendError(reply, 409, closedToNewMembers.message, { code: closedToNewMembers.code });
      }

      // SÉQUENTIEL, et ce n'est pas une négligence : deux admissions
      // concurrentes sur la même conversation liraient le même effectif et
      // émettraient deux fois le même total. L'éventail de diffusion n'est pas
      // mécanique — chaque tour a ses destinataires et son compte.
      const community = await loadSalonCommunity(prisma, { communityId: conversation?.communityId, actorId: currentUserId });
      const socketManager = fastify.socketIOHandler?.getManager();
      const ports: MemberAdmissionPorts = {
        prisma,
        io: socketManager?.getIO(),
        joinRoom: socketManager ? (userId, target) => socketManager.joinUserToConversationRoom(userId, target) : null,
        broadcastMessage: (message, target) => socketManager?.broadcastMessage(message as never, target) ?? Promise.resolve(),
        notificationService: fastify.notificationService,
        engagement,
      };
      const results: ParticipantAdmissionVerdict[] = [];
      for (const userId of demandes.userIds) {
        results.push(await admitConversationMember(ports, {
          conversationId, conversation, userId, currentUserId, addedBy: noticeActor(currentUserParticipant), community,
        }));
      }

      // **La forme historique garde son contrat d'ERREUR** — et ce n'est pas
      // une timidité. Les trois clients déployés appellent avec `userId` et
      // lisent le 400/403 pour dire « déjà membre » / « banni » : leur rendre
      // un 200 dont le refus vit dans un champ qu'ils ne lisent pas
      // transformerait un refus en succès à l'écran, sur toutes les versions
      // installées. Le verdict par personne est un contrat NEUF, réservé à la
      // forme neuve ; l'ancienne le reçoit en plus, jamais à la place.
      if (demandes.single && results.length === 1) {
        const seul = results[0];
        if (seul.outcome === 'not-found') return sendNotFound(reply, 'User not found');
        if (seul.outcome === 'community-forbidden') {
          return sendForbidden(reply, 'Only admins and moderators can add people to a private community', { code: 'COMMUNITY_INVITE_FORBIDDEN' });
        }
        if (seul.outcome === 'banned') {
          return sendForbidden(reply, 'Cet utilisateur est banni de la conversation — levez le bannissement d\'abord');
        }
        if (seul.outcome === 'already-member') {
          return sendBadRequest(reply, 'L\'utilisateur est déjà membre de cette conversation');
        }
      }

      const ajoutes = results.filter((r) => r.outcome === 'new' || r.outcome === 'rejoin').length;
      return sendSuccess(reply, {
        message: ajoutes === results.length
          ? 'Participant ajouté avec succès'
          : `${ajoutes}/${results.length} participant(s) ajouté(s)`,
        results,
      });

    } catch (error) {
      logger.error('Error adding participant', error as Error);
      return sendInternalError(reply, 'Erreur lors de l\'ajout du participant');
    }
  });
}

