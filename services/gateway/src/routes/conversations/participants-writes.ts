import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { invalidateParticipantLookup } from '../../utils/participant-lookup-cache';
import { postJoinSystemMessage } from '../../services/conversations/joinSystemMessage';
import {
  PARTICIPANT_RIGHT_NAMES,
  NEW_MEMBER_PERMISSIONS,
  type ParticipantRightName,
} from '../../services/participantRights';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { emitConversationMemberCountEvent } from '../../socketio/emitConversationMemberCount';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError, sendError } from '../../utils/response';
import {
  resolveConversationEntry,
  REJOIN_PARTICIPANT_STATE
} from '../../services/conversations/conversationEntryAdmission';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { MemberRole } from '@meeshy/shared/types/role-types';
import { actorHasMinimumRole } from '../../utils/conversation-authority';
import { recipientLanguage } from '../../utils/recipient-language';
import { appliquerDroitsDeParticipant } from './participant-rights-core';
import { repondreAuRefus } from './utils/participant-geste-reponse';
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

/** Ce qui est arrivé à UN identifiant du lot. */
export type ParticipantAdmissionVerdict = {
  readonly userId: string;
  readonly outcome: 'new' | 'rejoin' | 'already-member' | 'banned' | 'not-found';
  readonly participantId?: string;
};

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
   * L'admission d'UNE personne — tout ce que l'ancien handler faisait pour son
   * unique `userId`, à l'identique : écriture (création ou rejoin), avis
   * d'arrivée dans le fil, `conversation:joined` en salle, effectif absolu aux
   * rooms personnelles, auto-join des sockets, `conversation:new` à l'arrivant,
   * et les deux notifications.
   *
   * Elle rend un VERDICT plutôt que d'écrire une réponse : c'est ce qui permet
   * à un refus de ne pas emporter le lot.
   */
  async function admitOneParticipant(options: {
    conversationId: string;
    conversation: { isActive: boolean | null; closedAt: Date | null } | null;
    userId: string;
    currentUserId: string | undefined;
  }): Promise<ParticipantAdmissionVerdict> {
    const { conversationId, conversation, userId, currentUserId } = options;

    const userToAdd = await prisma.user.findFirst({ where: { id: userId } });
    if (!userToAdd) return { userId, outcome: 'not-found' };

    // Le `findFirst({ isActive: true })` qui précédait ne pouvait PAS voir la
    // ligne d'un banni (bannir écrit `isActive: false`) : le `create` lui
    // fabriquait une ligne neuve et active, ce qui défaisait le bannissement
    // sans passer par `POST …/unban` — laquelle exige le rang `admin` là où
    // cette route s'ouvre aussi aux `moderator`, et écrit une trace. Voir
    // `services/conversations/conversationEntryAdmission.ts`.
    const entry = await resolveConversationEntry({ prisma, conversationId, userId, conversation });

    if (entry.outcome === 'closed') return { userId, outcome: 'not-found' };
    if (entry.outcome === 'banned') return { userId, outcome: 'banned' };
    if (entry.outcome === 'already-member') return { userId, outcome: 'already-member' };

    // #4174 — la table de droits vient du site UNIQUE
    // (`services/participantRights.ts`), partagé avec `POST …/invite`.
    // C'est la table de CE handler qui a été retenue : la variante de
    // l'autre porte fermait `canSendVideos`/`canSendAudios` en laissant
    // `canSendFiles` ouvert, donc ne fermait rien — un fichier peut être
    // une vidéo.
    const addedMemberFields = {
      type: 'user',
      displayName: userToAdd.displayName ?? userToAdd.username ?? `${userToAdd.firstName ?? ''} ${userToAdd.lastName ?? ''}`.trim(),
      avatar: userToAdd.avatar,
      role: 'member',
      // #4662 — `Participant.language` est la colonne que ses lecteurs prennent
      // pour la langue du membre quand aucun prisme `User` ne se résout
      // (`resolveParticipantLanguage`, `offlineParticipantQueue`). La poser
      // depuis `systemLanguage` NU y inscrivait le repli du site pour tout
      // compte dont la langue vit au rang 2, 3 ou 4 — le cas NOMINAL dès que la
      // locale appareil (rang 4) diffère de la langue applicative. Le repli
      // reste un PARAMÈTRE du site : `'en'` est celui de cette porte, et
      // trancher « quelle langue pour un compte sans AUCUNE préférence ? » est
      // un arbitrage produit, pas un correctif de Prisme.
      language: recipientLanguage(userToAdd, 'en'),
      permissions: { ...NEW_MEMBER_PERMISSIONS }
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
      // compte DÉJÀ. L'incrémenter en plus le mettrait en trop.
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
      // `+ 1` parce que l'éventail ÉCARTE l'arrivant : il est actif depuis
      // l'écriture juste au-dessus, donc il compte, mais il ne figure pas dans
      // `audience`. Une seconde requête ne rendrait rien de plus.
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

    return { userId, outcome: entry.outcome === 'rejoin' ? 'rejoin' : 'new', participantId: joinedParticipantId };
  }

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
                        enum: ['new', 'rejoin', 'already-member', 'banned', 'not-found'],
                        description: 'What happened to THIS identifier'
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
        select: { isActive: true, closedAt: true },
      });
      if (conversation && (conversation.isActive === false || conversation.closedAt)) {
        return sendError(reply, 410, 'Cette conversation est terminée');
      }

      // SÉQUENTIEL, et ce n'est pas une négligence : deux admissions
      // concurrentes sur la même conversation liraient le même effectif et
      // émettraient deux fois le même total. L'éventail de diffusion n'est pas
      // mécanique — chaque tour a ses destinataires et son compte.
      const results: ParticipantAdmissionVerdict[] = [];
      for (const userId of demandes.userIds) {
        results.push(await admitOneParticipant({ conversationId, conversation, userId, currentUserId }));
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

