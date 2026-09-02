/**
 * Surface DÉTAIL de `conversations/core.ts` — `GET /conversations/check-identifier/:identifier`,
 * `GET /conversations/:id` et `GET /conversations/:id/analysis`. Extrait de
 * `core.ts` lors du découpage #4284 ; voir `core.ts` pour le point d'entrée
 * `registerCoreRoutes` qui appelle ces registrars.
 */
import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { UnifiedAuthRequest } from '../../middleware/auth';
import {
  conversationResponseSchema,
  errorResponseSchema,
  validationErrorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { canAccessConversation, resolveCallerParticipant } from './utils/access-control';
import { sendSuccess, sendBadRequest, sendUnauthorized, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import { presenceFor, viewerFromRequest } from '../users/presence-gate';
import { generateDefaultConversationTitle } from '@meeshy/shared/utils/conversation-helpers';
import { canViewExactMemberCount, presentMemberCount } from '@meeshy/shared/utils/member-visibility';
import type { ConversationParams } from './types';
import { conversationDetailInclude } from './core-selects';
import {
  parseStrictFieldList,
  selectForFields,
  restrictFields,
  isFieldServed,
  type ColumnPlan,
  type FieldSet,
} from '../../utils/sparse-fieldset';

const logger = enhancedLogger.child({ module: 'conversations/core' });

/**
 * Enregistre `GET /conversations/check-identifier/:identifier`.
 */
export function registerCheckIdentifierRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  // Route pour vérifier la disponibilité d'un identifiant de conversation
  fastify.get('/conversations/check-identifier/:identifier', {
    schema: {
      description: 'Check if a conversation identifier is available for use',
      tags: ['conversations'],
      summary: 'Check identifier availability',
      params: {
        type: 'object',
        required: ['identifier'],
        properties: {
          identifier: { type: 'string', description: 'Conversation identifier to check' }
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
                available: { type: 'boolean', description: 'Whether the identifier is available' },
                identifier: { type: 'string', description: 'The checked identifier' }
              }
            }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { identifier } = request.params as { identifier: string };

      // Vérifier si l'identifiant existe déjà
      const existingConversation = await prisma.conversation.findFirst({
        where: {
          identifier: {
            equals: identifier,
            mode: 'insensitive'
          }
        },
        select: { id: true }
      });

      return sendSuccess(reply, {
        available: !existingConversation,
        identifier
      });
    } catch (error) {
      logger.error('error checking identifier availability', { error });
      return sendInternalError(reply, 'Failed to check identifier availability');
    }
  });
}

/**
 * ## `GET /conversations/{id}` — la liste blanche FERMÉE de ce que la route sert (#4173)
 *
 * ### Ce que la requête chargeait avant
 *
 * La lecture était un `findFirst({ include })`. Un `include` ne nomme rien : il
 * charge TOUTES les colonnes scalaires de `Conversation` — y compris les
 * quatre que le contrat de fil ne déclare pas (`closedAt`, `closedBy`,
 * `firstMessageSentAt`, `activeCallId`), donc que `fast-json-stringify` jetait
 * déjà. Ce littéral les remplace par un `select` qui NOMME ses colonnes : le
 * défaut de la REQUÊTE devient « le nécessaire » sans que le fil bouge d'un
 * octet, ce qui est la seule inversion que trois clients publiés tolèrent
 * (§ `CONVERSATION_DETAIL_SERVED_FIELDS`).
 *
 * ### Deux absences délibérées
 *
 * - **`memberCount` (la colonne)** n'y est pas. L'effectif SERVI vient du
 *   `_count` filtré (`presentMemberCount(_count.participants, …)`), qui écrase
 *   la colonne dénormalisée dans la charge finale : la charger était payer deux
 *   fois pour la valeur qui perd.
 * - **`userPreferences`** n'y est plus. `conversationSchema` — le contrat de
 *   cette route — ne déclare AUCUNE clé `userPreferences` (seul
 *   `conversationMinimalSchema`, celui de la LISTE, la déclare) : la relation
 *   était chargée puis strippée avant d'atteindre le moindre client, une
 *   jointure par ouverture de conversation sur les trois plateformes. Le
 *   témoin `conversation-detail-sparse-fieldset.test.ts` le mesure sur le
 *   schéma lui-même, de sorte que le jour où le contrat la déclarera, il
 *   tombera plutôt que de laisser la route servir un silence.
 */
const conversationDetailColumns = {
  id: true,
  identifier: true,
  type: true,
  title: true,
  description: true,
  avatar: true,
  banner: true,
  communityId: true,
  isActive: true,
  lastMessageAt: true,
  defaultWriteRole: true,
  isAnnouncementChannel: true,
  slowModeSeconds: true,
  createdAt: true,
  updatedAt: true,
  encryptionMode: true,
  encryptionProtocol: true,
  encryptionEnabledAt: true,
  encryptionEnabledBy: true,
  serverEncryptionKeyId: true,
  autoTranslateEnabled: true,
  participants: conversationDetailInclude.participants,
  _count: conversationDetailInclude._count,
} as const;

/**
 * Le vocabulaire FERMÉ de `?fields=` — ce que cette route SERT, et rien d'autre.
 *
 * Un nom absent de cette liste rend **400** (critère 1), et un nom présent ne
 * peut jamais ÉLARGIR ce que la route servait : la liste RESTREINT, elle ne
 * fabrique pas. Les quatre dernières entrées ne sont pas des colonnes — ce sont
 * les valeurs que le gestionnaire COMPOSE (titre par défaut, effectif présenté,
 * rang de l'appelant, compteur de non-lus), et c'est précisément pour elles que
 * la liste vaut d'exister : les nommer permet de ne pas les CALCULER quand
 * personne ne les demande.
 */
export const CONVERSATION_DETAIL_SERVED_FIELDS = [
  'id',
  'identifier',
  'type',
  'title',
  'description',
  'avatar',
  'banner',
  'communityId',
  'isActive',
  'lastMessageAt',
  'defaultWriteRole',
  'isAnnouncementChannel',
  'slowModeSeconds',
  'createdAt',
  'updatedAt',
  'encryptionMode',
  'encryptionProtocol',
  'encryptionEnabledAt',
  'encryptionEnabledBy',
  'serverEncryptionKeyId',
  'autoTranslateEnabled',
  'participants',
  'memberCount',
  'unreadCount',
  'currentUserRole',
] as const;

/**
 * Ce que chaque clé SERVIE coûte en colonnes.
 *
 * Trois entrées disent quelque chose que la relecture du `select` ne montre
 * pas :
 *
 * - **`title` paie ses `participants`.** Le titre d'un groupe sans titre
 *   explicite est COMPOSÉ des noms de ses membres
 *   (`generateDefaultConversationTitle`). Ne pas les charger servirait `null`
 *   là où le client attend un nom — un champ qui MENT, pas un champ absent.
 *   `type` entre pour la même raison : c'est lui qui décide si le titre se
 *   compose (`direct` ⇒ jamais).
 * - **`memberCount` vient du `_count`**, pas de la colonne homonyme.
 * - **`unreadCount` et `currentUserRole` ne coûtent AUCUNE colonne** — ce sont
 *   deux agrégations à part, et le tableau vide est ce qui le déclare. Leur
 *   coût réel se paie en REQUÊTES, gouvernées plus bas par `isFieldServed`.
 */
export const conversationDetailPlan: ColumnPlan<typeof conversationDetailColumns> = {
  full: conversationDetailColumns,
  pinned: ['id'],
  columns: {
    title: ['title', 'type', 'participants'],
    memberCount: ['_count'],
    unreadCount: [],
    currentUserRole: [],
  },
};

/**
 * Ce qui survit à `?fields=` sans y être nommé.
 *
 * `id` d'abord — sans lui la réponse ne dit plus de quoi elle parle.
 * `memberCountCapped` ensuite, et pour une raison de COHÉRENCE plutôt que
 * d'identité : il ne vaut rien seul, il QUALIFIE `memberCount` (« 199+ »). Le
 * gestionnaire ne le produit que quand `memberCount` est servi, donc l'épingler
 * ne peut jamais le faire survivre à l'absence de ce qu'il qualifie.
 */
const CONVERSATION_DETAIL_PINNED = ['id', 'memberCountCapped'] as const;

/**
 * Enregistre `GET /conversations/:id` (détail d'une conversation).
 */
export function registerConversationDetailRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  optionalAuth: any
) {
  // Route pour obtenir une conversation par ID
  fastify.get<{ Params: ConversationParams }>('/conversations/:id', {
    schema: {
      description: 'Get a specific conversation by ID. Supports ?fields= (closed whitelist; an undeclared name is a 400). Absent = the documented default profile, unchanged for published clients.',
      tags: ['conversations'],
      summary: 'Get conversation details',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          // AUCUN `default` ici, et ce n'est pas un oubli : Fastify active
          // `useDefaults` d'AJV, donc un `default` ÉCRIRAIT la valeur dans la
          // query avant le gestionnaire — qui ne pourrait plus distinguer
          // « absent » de « demandé explicitement ». Or c'est exactement la
          // distinction dont il vit : l'absence vaut « le profil par défaut »,
          // et elle appartient au gestionnaire, seul à savoir ce qu'elle veut
          // dire.
          fields: {
            type: 'string',
            description:
              'Comma-separated subset of the served projection (closed whitelist; an undeclared name is a 400). Absent = the documented default profile.'
          }
        }
      },
      response: {
        200: conversationResponseSchema,
        400: validationErrorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth]
  }, async (request, reply) => {
    try {
      const authRequest = request as UnifiedAuthRequest;

      /**
       * PAS DE SESSION ⇒ 401 ; PAS MEMBRE ⇒ 403 (#4789).
       *
       * Le même défaut qu'à `core-list.ts` — voir le doc-comment de ce refus-là
       * pour ce que le 403 coûtait aux clients, mesuré. Cette route porte en
       * plus la DÉMONSTRATION de la distinction : plus bas dans le MÊME
       * handler, le refus de `canAccessConversation` reste
       * `403 CONVERSATION_ACCESS_DENIED`, parce qu'il dit autre chose — « je
       * sais qui tu es et ce n'est pas pour toi ». Les deux refus sont
       * désormais discernables par une valeur MACHINE ; ils ne l'étaient que
       * par la prose anglaise du message.
       *
       * `403` RESTE donc déclaré au schéma de cette route, contrairement à
       * `GET /conversations` où il n'avait plus d'émetteur.
       */
      if (!authRequest.authContext.isAuthenticated) {
        return sendUnauthorized(reply, 'Authentication required to access this conversation', { code: 'UNAUTHORIZED' });
      }

      const { id } = request.params;
      const userId = authRequest.authContext.userId;

      /**
       * La projection est résolue AVANT toute lecture — elle gouverne le
       * `select` Prisma autant que la réponse (#4173, critère 5 a). Une liste
       * analysée après le chargement n'aurait allégé que le fil, c'est-à-dire
       * rien de ce que ce lot vise.
       *
       * Le refus précède la requête pour la même raison : une demande qu'on ne
       * peut pas honorer ne doit pas coûter une lecture.
       */
      const projection = parseStrictFieldList(
        (request.query as { fields?: string }).fields,
        CONVERSATION_DETAIL_SERVED_FIELDS
      );
      if (projection.ok === false) {
        return sendBadRequest(
          reply,
          `Unknown field(s): ${projection.unknown.join(', ')}`,
          {
            code: 'UNKNOWN_FIELD',
            violations: projection.unknown.map((champ) => ({ path: `fields.${champ}`, message: 'Unknown field' })),
          }
        );
      }
      const champs: FieldSet = projection.fields;
      const sertTitre = isFieldServed(champs, 'title');
      const sertParticipants = isFieldServed(champs, 'participants');
      const sertEffectif = isFieldServed(champs, 'memberCount');
      const sertRang = isFieldServed(champs, 'currentUserRole');
      const sertNonLus = isFieldServed(champs, 'unreadCount');

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Vérifier les permissions d'accès
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);

      if (!canAccess) {
          return sendForbidden(reply, 'Access denied: you are not a member of this conversation or it no longer exists', { code: 'CONVERSATION_ACCESS_DENIED' });
      }

      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId },
        select: selectForFields(conversationDetailPlan, champs)
      }) as Record<string, any> | null;

      if (!conversation) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Pour les DMs, pas de titre — le frontend résout le nom de l'interlocuteur.
      // Le plan garantit que `type` et `participants` sont CHARGÉS dès que
      // `title` est servi ; la composition n'est donc jamais aveugle.
      const displayTitle = !sertTitre
        ? undefined
        : conversation.type === 'direct'
          ? (conversation.title || null)
          : (conversation.title && conversation.title.trim() !== ''
              ? conversation.title
              : generateDefaultConversationTitle(
                  (conversation.participants ?? []).map((m: any) => ({
                    id: m.userId,
                    displayName: m.user?.displayName,
                    username: m.user?.username,
                    firstName: m.user?.firstName,
                    lastName: m.user?.lastName
                  })),
                  userId
                ));

      // Calculer le unreadCount pour l'utilisateur courant.
      // `resolveCallerParticipant` et pas un `where: { userId }` ecrit a la main :
      // pour un invite de lien partage, `authContext.userId` PORTE un
      // `Participant.id` (branche anonyme d'`UnifiedAuthService`), donc la clause
      // manuelle comparait un id de participant a la colonne `userId` et ne
      // matchait rien. Le compteur retombait silencieusement a 0 — et ce 0
      // ecrasait ensuite le badge que le socket venait de pousser juste.
      let unreadCount = 0;
      // Le rôle du lecteur DANS cette conversation, pour l'effectif servi plus
      // bas. Il ne peut pas se lire dans `conversation.participants` : cette
      // liste est bornée à `CONVERSATION_DETAIL_PARTICIPANTS_CAP` (100), donc
      // aveugle dans le seul cas où le plafond joue. Le participant appelant est
      // déjà résolu ici pour le compteur de non-lus — il porte le rôle avec lui.
      let callerConversationRole: string | null = null;
      /**
       * LES DEUX AGRÉGATIONS DE CETTE ROUTE, ET LEUR PRIX (#4173, critère 4).
       *
       * `resolveCallerParticipant` est un `findFirst` ; `getUnreadCount` en
       * ajoute deux à trois (curseur de lecture, participant, comptage). Aucune
       * n'est nécessaire à une lecture qui ne sert ni le rang, ni l'effectif
       * PRÉSENTÉ (dont le plafond dépend du rang), ni les non-lus — et un
       * appelant qui ne les demande pas ne doit pas les payer.
       *
       * Le témoin de ce point compte les APPELS au double Prisma : « non servi »
       * et « non calculé » sont deux propriétés distinctes, et seule la seconde
       * économise quelque chose en amont.
       */
      const veutParticipantAppelant = sertRang || sertEffectif || sertNonLus;
      try {
        const participant = veutParticipantAppelant
          ? await resolveCallerParticipant(prisma, authRequest.authContext, conversationId)
          : null;
        if (participant) {
          callerConversationRole = participant.role;
          if (sertNonLus) {
            const { MessageReadStatusService } = await import('../../services/MessageReadStatusService.js');
            const readStatusService = new MessageReadStatusService(prisma);
            unreadCount = await readStatusService.getUnreadCount(participant.id, conversationId);
          }
        }
      } catch (unreadError) {
        logger.warn('failed to compute unreadCount for conversation', { conversationId, error: unreadError });
      }

      // Marquer automatiquement les notifications de cette conversation comme lues —
      // délégué au service (1 seul update Mongo filtré sur context.conversationId,
      // émet notification:counts pour resynchroniser cloche/badge) et fire-and-forget :
      // effet de bord non essentiel, hors du chemin critique de la réponse
      // (même pattern que posts/interactions.ts pour markPostNotificationsAsRead).
      fastify.notificationService
        ?.markConversationNotificationsAsRead(userId, conversationId)
        .catch((notifError: unknown) => {
          logger.error('error marking auto notifications for conversation', { conversationId, error: notifError });
        });

      // NOTE : l'ancien bloc `meta.conversationStats` (getOrCompute + payload)
      // a été retiré — `conversationSchema` ne déclare pas `meta`, donc
      // fast-json-stringify le strippait du wire : calcul DB coûteux
      // (message.groupBy plein scan à froid, TTL 1h) pour un résultat jeté.
      // Les clients consomment les stats via l'event Socket.IO
      // `conversation:stats`, qui se recompute seul (updateOnNewMessage).
      // Même régime strict que la liste : self/ADMIN+/ami (cf. GET /conversations).
      const chargedParticipants: any[] | undefined = conversation.participants;
      /**
       * La présence d'un TIERS ne se sert JAMAIS depuis la colonne brute
       * (directive 2026-08-25) — et `resolveForTargets` est une REQUÊTE de plus.
       *
       * Elle ne se pose que si des participants vont être SERVIS. Les deux
       * conditions ne disent pas la même chose et il faut les deux : `title`
       * CHARGE les participants sans les servir (il en compose le titre par
       * défaut), et résoudre la visibilité d'une liste que personne ne recevra
       * serait payer une requête pour un résultat jeté.
       *
       * Ce n'est PAS un assouplissement de la garde : ne pas servir la liste
       * est plus fermé que la servir masquée. Une garde qu'un `?fields=`
       * pourrait LEVER n'en serait plus une — ici il ne peut que retirer la
       * matière sur laquelle elle s'exerce.
       */
      const gatedParticipants = chargedParticipants === undefined || !sertParticipants
        ? undefined
        : await (async () => {
            const detailPresenceViewer = viewerFromRequest(request);
            const presenceVis = await getPresenceVisibilityService(prisma).resolveForTargets(
              detailPresenceViewer,
              chargedParticipants
                .map((m: any) => m.userId)
                .filter((uid: string | null): uid is string => !!uid)
            );
            return chargedParticipants.map((m: any) => {
              const liveOnline = fastify.presenceChecker?.isOnline(m.userId ?? m.id);
              const vis = presenceFor(detailPresenceViewer, presenceVis, m.userId);
              return {
                ...m,
                isOnline: vis.showOnline ? (liveOnline === undefined ? m.isOnline : liveOnline) : false,
                lastActiveAt: vis.showLastSeenTimestamp ? m.lastActiveAt : null
              };
            });
          })();

      const { _count, participants: _rawParticipants, ...conversationData } = conversation;

      /**
       * La charge est COMPOSÉE de ce qui a été calculé, puis RESTREINTE par la
       * même liste qui a gouverné le `select`.
       *
       * Les deux passes sont nécessaires et ne font pas le même travail : le
       * `select` décide de ce qu'on LIT (donc du coût), la restriction décide
       * de ce qu'on SERT. Une colonne peut être lue sans être servie — `type`
       * l'est dès que `title` est demandé — et c'est la restriction qui empêche
       * ce détour d'élargir la réponse au-delà de ce que l'appelant a nommé.
       */
      const charge: Record<string, unknown> = { ...conversationData };
      if (gatedParticipants !== undefined) charge.participants = gatedParticipants;
      if (sertTitre) charge.title = displayTitle;
      if (sertEffectif) {
        // Même cap 199+ que la liste : deux surfaces, une seule présentation,
        // et le même droit de voir l'effectif ENTIER (`canViewExactMemberCount`).
        Object.assign(charge, presentMemberCount(_count.participants, {
          viewerSeesExactCount: canViewExactMemberCount({
            platformRole: authRequest.authContext.registeredUser?.role ?? null,
            conversationRole: callerConversationRole
          })
        }));
      }
      // Le rang était résolu ici depuis toujours — pour décider du plafond
      // d'effectif juste au-dessus — et n'était pas servi. Les clients
      // ouvrant une conversation par sa fiche (notification, lien) n'avaient
      // donc AUCUN moyen de savoir qu'ils l'administrent. Même clé que la
      // ligne de liste : une seule notion, un seul nom.
      if (sertRang) charge.currentUserRole = callerConversationRole;
      if (sertNonLus) charge.unreadCount = unreadCount;

      return sendSuccess(reply, restrictFields(charge, champs, CONVERSATION_DETAIL_PINNED));

    } catch (error) {
      logger.error('error fetching conversation', { error });
      return sendInternalError(reply, 'Error retrieving conversation');
    }
  });
}

/**
 * Enregistre `GET /conversations/:id/analysis` (analyse agent d'une conversation).
 */
export function registerConversationAnalysisRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  // Route pour obtenir l'analyse agent d'une conversation
  fastify.get<{ Params: ConversationParams }>('/conversations/:id/analysis', {
    schema: {
      description: 'Get agent analysis for a conversation (summary, tone, participant profiles)',
      tags: ['conversations'],
      summary: 'Get conversation analysis',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      response: {
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const authRequest = request as UnifiedAuthRequest;
      const { id } = request.params;
      const userId = authRequest.authContext.userId;

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Access denied');
      }

      const TRAIT_FIELDS_MAP: Record<string, string[]> = {
        communication: ['Verbosity', 'Formality', 'ResponseSpeed', 'InitiativeRate', 'Clarity', 'Argumentation'],
        personality: ['SocialStyle', 'Assertiveness', 'Agreeableness', 'Humor', 'Emotionality', 'Openness', 'Confidence', 'Creativity', 'Patience', 'Adaptability'],
        interpersonal: ['Empathy', 'Politeness', 'Leadership', 'ConflictStyle', 'Supportiveness', 'Diplomacy', 'TrustLevel'],
        emotional: ['EmotionalStability', 'Positivity', 'Sensitivity', 'StressResponse'],
      };

      function buildTraits(role: Record<string, any>) {
        const traits: Record<string, Record<string, { label: string; score: number }>> = {};
        let hasAny = false;
        for (const [cat, fields] of Object.entries(TRAIT_FIELDS_MAP)) {
          const catTraits: Record<string, { label: string; score: number }> = {};
          for (const field of fields) {
            const label = role[`trait${field}`];
            const score = role[`trait${field}Score`];
            if (label != null && score != null) {
              const key = field.charAt(0).toLowerCase() + field.slice(1);
              catTraits[key] = { label, score };
              hasAny = true;
            }
          }
          if (Object.keys(catTraits).length > 0) traits[cat] = catTraits;
        }
        return hasAny ? traits : null;
      }

      const [summary, roles, snapshots] = await Promise.all([
        prisma.agentConversationSummary.findUnique({
          where: { conversationId }
        }),
        prisma.agentUserRole.findMany({
          where: { conversationId },
        }),
        prisma.agentAnalysisSnapshot.findMany({
          where: {
            conversationId,
            snapshotDate: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
          },
          orderBy: { snapshotDate: 'asc' },
        }),
      ]);

      // Enrichir les roles avec username/displayName
      const userIds = roles.map(r => r.userId);
      const users = userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, username: true, firstName: true, lastName: true, avatar: true }
          })
        : [];

      const userMap = new Map(users.map(u => [u.id, u]));

      const participantProfiles = roles.map((role: Record<string, any>) => {
        const user = userMap.get(role.userId);
        return {
          userId: role.userId,
          username: user?.username ?? null,
          displayName: user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.username : null,
          avatar: user?.avatar ?? null,
          personaSummary: role.personaSummary,
          tone: role.tone,
          vocabularyLevel: role.vocabularyLevel,
          typicalLength: role.typicalLength,
          emojiUsage: role.emojiUsage,
          topicsOfExpertise: role.topicsOfExpertise,
          catchphrases: role.catchphrases,
          commonEmojis: role.commonEmojis,
          reactionPatterns: role.reactionPatterns,
          messagesAnalyzed: role.messagesAnalyzed,
          confidence: role.confidence,
          traits: buildTraits(role),
          dominantEmotions: role.dominantEmotions ?? [],
          relationshipMap: role.relationshipMap ?? {},
          sentimentScore: role.sentimentScore ?? null,
          engagementLevel: role.engagementLevel ?? null,
          locked: role.locked,
        };
      });

      return sendSuccess(reply, {
        conversationId,
        summary: summary ? {
          text: summary.summary,
          currentTopics: summary.currentTopics,
          overallTone: summary.overallTone,
          messageCount: summary.messageCount,
          updatedAt: summary.updatedAt,
          healthScore: summary.healthScore ?? null,
          engagementLevel: summary.engagementLevel ?? null,
          conflictLevel: summary.conflictLevel ?? null,
          dynamique: summary.dynamique ?? null,
          dominantEmotions: summary.dominantEmotions ?? [],
        } : null,
        participantProfiles,
        history: snapshots.map(s => ({
          snapshotDate: s.snapshotDate.toISOString(),
          overallTone: s.overallTone,
          healthScore: s.healthScore,
          engagementLevel: s.engagementLevel,
          conflictLevel: s.conflictLevel,
          topTopics: s.topTopics,
          dominantEmotions: s.dominantEmotions,
          messageCountAtSnapshot: s.messageCountAtSnapshot,
          participantSnapshots: s.participantSnapshots,
        })),
      });

    } catch (error) {
      logger.error('error fetching conversation analysis', { error });
      return sendInternalError(reply, 'Error fetching conversation analysis');
    }
  });
}
