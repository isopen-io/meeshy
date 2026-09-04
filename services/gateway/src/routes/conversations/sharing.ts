import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { memberRoleCasings, MemberRole } from '@meeshy/shared/types/role-types';
import { actorHasMinimumRole } from '../../utils/conversation-authority';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { createError, sendErrorResponse } from '@meeshy/shared/utils/errors';
import { UnifiedAuthRequest } from '../../middleware/auth';
import {
  conversationSchema,
  conversationParticipantSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { canAccessConversation } from './utils/access-control';
// #4169 — `resolveConversationId`, la génération d'identifiants, la garde 410
// et la garde de RANG ne vivent plus ici : `mintConversationShareLink` est
// désormais la porte UNIQUE de création d'un lien, partagée avec `POST
// /links` (`routes/links/creation.ts`). Ce fichier n'en est plus qu'un
// ADAPTATEUR mince — voir le commentaire du handler `/new-link` plus bas.
import { mintConversationShareLink } from '../links/utils/share-link-mint';
import { sendSuccess, sendBadRequest, sendUnauthorized, sendForbidden, sendNotFound, sendInternalError, sendError } from '../../utils/response';
import { invalidateParticipantLookup } from '../../utils/participant-lookup-cache';
import { postJoinSystemMessage } from '../../services/conversations/joinSystemMessage';
import { NEW_MEMBER_PERMISSIONS } from '../../services/participantRights';
import {
  resolveConversationEntry,
  REJOIN_PARTICIPANT_STATE
} from '../../services/conversations/conversationEntryAdmission';
// #4353 — `POST /conversations/join/:linkId` DÉLÈGUE désormais à la loi
// d'admission UNIQUE (#4167, `services/conversations/linkAdmission.ts`) via
// `performLinkJoin`, exactement comme `POST /anonymous/join/:linkId`
// (`routes/anonymous.ts`) — ce fichier ne recopie plus AUCUN contrôle sur le
// lien (`isActive`, `expiresAt`, `maxUses`, `allowedIpRanges`, …) : la garde
// `link-admission-single-source-guard.test.ts` interdit d'y revenir.
import { performLinkJoin, resolveClientIp } from './link-admission';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { serializeConversationParticipant } from '@meeshy/shared/utils/participant-helpers';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import { viewerFromRequest } from '../users/presence-gate';
import { depreciee } from '../../utils/deprecation';
import { apiPath } from '@meeshy/shared/api/prefix';
const logger = enhancedLogger.child({ module: 'ConversationSharingRoutes' });

/**
 * L'enveloppe rendue par `POST /conversations/:id/new-link`.
 *
 * Exportée pour être exerçable : un test de route mocke `sendSuccess` et
 * n'exerce donc JAMAIS le schéma de réponse — or c'est là que vivait le défaut.
 *
 * Ce schéma déclarait `data: { properties: { link: { type: 'object' } } }`,
 * ce qui se trompait deux fois sur la seule clé nommée : `link` est la chaîne
 * de l'URL d'invitation (sérialisée contre un schéma d'objet, elle sortait
 * `{}`), et `code` / `shareLink` n'étaient pas déclarés du tout, donc retirés.
 * La création rendait `{"success":true,"data":{"link":{}}}` — ni lien, ni code,
 * ni réglages.
 *
 * Les trois clients créent aujourd'hui leurs liens par `POST /links`, ce qui a
 * laissé le défaut vivre sans victime. La porte reste servie : elle doit rendre
 * ce qu'elle produit.
 */
export const conversationShareLinkResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        link: { type: 'string', description: "URL d'invitation complète (`${FRONTEND_URL}/chat/:code`)" },
        code: { type: 'string', description: "Code d'invitation — la part rejouable du lien" },
        shareLink: {
          type: 'object',
          description: 'Le lien de partage créé, avec les réglages retenus',
          properties: {
            id: { type: 'string' },
            linkId: { type: 'string' },
            name: { type: 'string', nullable: true },
            description: { type: 'string', nullable: true },
            maxUses: { type: 'number', nullable: true },
            expiresAt: { type: 'string', format: 'date-time', nullable: true },
            allowAnonymousMessages: { type: 'boolean' },
            allowAnonymousFiles: { type: 'boolean' },
            allowAnonymousImages: { type: 'boolean' },
            allowViewHistory: { type: 'boolean' },
            requireNickname: { type: 'boolean' },
            requireEmail: { type: 'boolean' }
          }
        }
      }
    }
  }
} as const;

/**
 * Enregistre les routes de partage et d'invitation
 */
export function registerSharingRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  optionalAuth: any,
  requiredAuth: any
) {
  fastify.post<{
    Params: { id: string };
    Body: {
      name?: string;
      description?: string;
      maxUses?: number;
      maxConcurrentUsers?: number;
      maxUniqueSessions?: number;
      expiresAt?: string;
      allowAnonymousMessages?: boolean;
      allowAnonymousFiles?: boolean;
      allowAnonymousImages?: boolean;
      allowViewHistory?: boolean;
      requireAccount?: boolean;
      requireNickname?: boolean;
      requireEmail?: boolean;
      requireBirthday?: boolean;
      allowedCountries?: string[];
      allowedLanguages?: string[];
      allowedIpRanges?: string[];
    };
  }>('/conversations/:id/new-link', {
    schema: {
      description: 'Create a new shareable invitation link for a conversation with configurable permissions',
      tags: ['conversations', 'links'],
      summary: 'Create share link',
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
          name: { type: 'string', description: 'Link name for identification' },
          description: { type: 'string', description: 'Link description' },
          maxUses: { type: 'number', description: 'Maximum number of times link can be used' },
          maxConcurrentUsers: { type: 'number', description: 'Maximum concurrent users via this link' },
          maxUniqueSessions: { type: 'number', description: 'Maximum unique sessions' },
          expiresAt: { type: 'string', format: 'date-time', description: 'Link expiration date' },
          allowAnonymousMessages: { type: 'boolean', description: 'Allow anonymous users to send messages' },
          allowAnonymousFiles: { type: 'boolean', description: 'Allow anonymous users to send files' },
          allowAnonymousImages: { type: 'boolean', description: 'Allow anonymous users to send images' },
          allowViewHistory: { type: 'boolean', description: 'Allow viewing message history' },
          // #4169 — parité de police avec `POST /links` : ces deux champs
          // étaient ACCEPTÉS par la route cible et silencieusement IGNORÉS
          // ici, sans que rien ne le signale à l'appelant.
          requireAccount: { type: 'boolean', description: 'Require a registered account for anonymous users' },
          requireNickname: { type: 'boolean', description: 'Require nickname for anonymous users' },
          requireEmail: { type: 'boolean', description: 'Require email for anonymous users' },
          requireBirthday: { type: 'boolean', description: 'Require birthday for anonymous users' },
          // #4354 — ACCEPTÉ VIDE, REFUSÉ NON VIDE. Le champ n'est plus
          // appliqué (#4167 : pas de base GeoIP), mais dix liens sur dix
          // l'envoient à vide : un refus sur sa PRÉSENCE casserait toute
          // création jusqu'à la mise à jour des clients. `maxItems: 0` refuse
          // exactement là où l'utilisateur serait trompé — quand il DEMANDE
          // une restriction.
          allowedCountries: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 0,
            description: "INERTE (#4167) — aucun filtre par pays n'est appliqué ; une valeur non vide est refusée"
          },
          allowedLanguages: { type: 'array', items: { type: 'string' }, description: 'Allowed language codes' },
          allowedIpRanges: { type: 'array', items: { type: 'string' }, description: 'Allowed IP ranges' }
        }
      },
      response: {
        200: conversationShareLinkResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        // #4169 — l'adaptateur applique désormais la garde 410 (fil clos) de
        // `POST /links` : la déclarer ici évite qu'un statut réel du contrat
        // sorte non documenté, comme `/links` le fait déjà pour ce même code.
        410: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    // #4169 critère de fin #6 — l'adresse reste un ALIAS FONCTIONNEL (le web
    // l'appelle encore, `links.service.ts:53`) mais n'est plus la porte
    // canonique : `POST /links` l'est. `onRequest` court avant TOUTE garde
    // (auth, rang) pour que l'annonce parte même sur un refus — l'appelant
    // qui échoue est celui qui a le plus besoin de savoir migrer.
    onRequest: [depreciee({ depuis: '2026-08-29', successeur: apiPath('/links') })],
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const body = request.body || {};
      const authRequest = request as UnifiedAuthRequest;
      const currentUserId = authRequest.authContext.userId;

      // Résout l'acteur (rôle de PLATEFORME) avant de déléguer : cette route
      // n'appelle pas `isRegisteredUser`, elle relit directement la ligne
      // `User` et échoue fermé si elle n'existe pas — comportement inchangé
      // par #4169, préservé tel quel.
      const user = await prisma.user.findUnique({
        where: { id: currentUserId },
        select: { role: true }
      });

      // #4856 — `currentUserId` vient du JWT de l'appelant, jamais d'un
      // identifiant qu'il choisit : une absence ici ne dit rien sur un TIERS,
      // elle décrit son PROPRE compte (jeton valide, ligne `User` disparue —
      // suppression de compte, incohérence de données). Aucun anti-oracle
      // n'est en jeu, et le schéma de la route déclare déjà 404.
      if (!user) {
        return sendNotFound(reply, 'User not found');
      }

      // #4169 — tout le reste (résolution de l'identifiant de conversation,
      // garde 410 sur fil clos, refus des conversations `direct`, BIGBOSS ou
      // ADMIN sur `global`, et — la garde qui MANQUAIT ici — au moins
      // MODERATOR sur les autres types, génération des identifiants,
      // écriture du lien, notification aux admins/créateur) est désormais LA
      // SEULE responsabilité de `mintConversationShareLink`, partagée avec
      // `POST /links` (`routes/links/creation.ts:179`). Cette route n'en est
      // plus qu'un ADAPTATEUR : elle traduit sa forme de requête (l'id de
      // conversation arrive en PARAMÈTRE, pas au corps) et restitue sa forme
      // de réponse historique (`{link, code, shareLink}`), que
      // `apps/web/services/conversations/links.service.ts:53` consomme
      // encore — durcir cette porte ne casse donc aucun appelant existant,
      // il ne fait que refuser ce qu'elle n'aurait jamais dû accepter.
      const result = await mintConversationShareLink({
        prisma,
        reply,
        log: logger,
        notificationService: fastify.notificationService,
        socketIOHandler: fastify.socketIOHandler,
        userId: currentUserId,
        userRole: user.role,
        input: { conversationId: id, ...body }
      });
      if (!result) return; // La réponse d'erreur est déjà partie.

      // Retour compatible avec le frontend de service conversations (string du lien complet).
      // `/chat/:linkId` est l'URL canonique (la page qui ouvre la conversation
      // dans la vue courante) ; `/join/:linkId` ne survit qu'en 308 pour les
      // liens déjà en circulation — un lien neuf ne prend pas le détour.
      const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3100'}/chat/${result.linkId}`;
      return sendSuccess(reply, {
        link: inviteLink,
        code: result.linkId,
        shareLink: {
          id: result.shareLink.id,
          linkId: result.linkId,
          name: result.shareLink.name,
          description: result.shareLink.description,
          maxUses: result.shareLink.maxUses,
          expiresAt: result.shareLink.expiresAt,
          allowAnonymousMessages: result.shareLink.allowAnonymousMessages,
          allowAnonymousFiles: result.shareLink.allowAnonymousFiles,
          allowAnonymousImages: result.shareLink.allowAnonymousImages,
          allowViewHistory: result.shareLink.allowViewHistory,
          requireNickname: result.shareLink.requireNickname,
          requireEmail: result.shareLink.requireEmail
        }
      });

    } catch (error) {
      logger.error('Error creating new conversation link', error as Error);
      return sendInternalError(reply, 'Error creating link');
    }
  });

  // `PATCH /conversations/:id` VIVAIT ICI, en jumeau du `PUT` de `core.ts`.
  // Les deux ont dérivé comme dérivent deux exemplaires d'un même geste : celui-ci
  // n'acceptait que `title`/`description`/`type`, laissait n'importe quel membre
  // actif renommer le groupe, et n'émettait AUCUN `conversation:updated`. Le web lui
  // postait `avatar` et `banner` — non déclarés, donc ignorés en silence sous une
  // réponse 200 : l'interface annonçait « bannière mise à jour » et rien n'était
  // écrit (mesuré en production le 2026-08-24).
  //
  // Le handler de `core.ts` sert désormais les DEUX verbes. Ne pas réintroduire de
  // route de modification ici : les métadonnées d'une conversation ont un seul point
  // d'écriture, et `conversation-update-route.test.ts` le garde sur PUT comme sur PATCH.
  // Récupérer les liens de partage d'une conversation (pour les admins)
  //
  // #4351 — ses deux sœurs (`/new-link` ci-dessus, `/join/:linkId` plus bas)
  // annoncent déjà leur successeur ; cette porte ne le faisait pas alors
  // qu'elle a un successeur STRICT et déjà servi : `GET /links?conversationId=`
  // (`routes/links/user.ts`, #4170) rend le MÊME filtre modérateur/membre —
  // `viewerIsModerator` en `meta` plutôt qu'en racine — SANS le défaut
  // `creatorId` corrigé ailleurs (cf. commentaire de `links/user.ts`), et EN
  // PLUS une vraie pagination (celle-ci lit `findMany` sans `take`/`skip` :
  // elle rend TOUT lien de la conversation, non borné). `onRequest` court
  // avant `preValidation` pour que l'annonce parte même sur un refus (403 non
  // membre) — voir `utils/deprecation.ts`.
  fastify.get('/conversations/:conversationId/links', {
    schema: {
      description: 'Get all shareable links for a conversation (moderators see all links, members see only their own)',
      tags: ['conversations', 'links'],
      summary: 'Get conversation share links',
      params: {
        type: 'object',
        required: ['conversationId'],
        properties: {
          conversationId: { type: 'string', description: 'Conversation ID' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  linkId: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  maxUses: { type: 'number' },
                  currentUses: { type: 'number' },
                  expiresAt: { type: 'string', format: 'date-time' },
                  isActive: { type: 'boolean' },
                  createdAt: { type: 'string', format: 'date-time' }
                }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    onRequest: [depreciee({
      depuis: '2026-08-30',
      successeur: (request) => apiPath(`/links?conversationId=${(request.params as { conversationId: string }).conversationId}`),
    })],
    preValidation: [requiredAuth]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier que l'utilisateur est membre de la conversation
      const membership = await prisma.participant.findFirst({
        where: {
          conversationId,
          userId,
          isActive: true
        }
      });

      if (!membership) {
        return sendForbidden(reply, 'You must be a member of this conversation to see its sharing links');
      }

      // Vérifier si l'utilisateur est modérateur/admin de la conversation
      // « toute la visibilité de la conversation » (#3941) : un administrateur
      // de la plateforme voit TOUS les liens, pas seulement les siens.
      const isModerator = actorHasMinimumRole(
        {
          conversationRole: membership.role,
          platformRole: authRequest.authContext.registeredUser?.role,
        },
        MemberRole.MODERATOR,
      );

      // Filtrer les liens selon les droits:
      // - Modérateurs: voient TOUS les liens
      // - Membres normaux: voient uniquement leurs propres liens
      const links = await prisma.conversationShareLink.findMany({
        where: {
          conversationId,
          // #4170 -- `creatorId` N'EXISTE PAS sur ConversationShareLink. Le schema
          // declare `createdBy` ; `creator` n'est que le nom de la RELATION, et
          // Prisma leve sur un champ inconnu. Le catch-all rendait donc 500, et un
          // membre non-moderateur ne pouvait JAMAIS lister ses propres liens par
          // cette porte -- un filtre d'autorisation qui echoue en refusant tout est
          // silencieux : il ressemble a une panne, jamais a un droit mal ecrit.
          ...(isModerator ? {} : { createdBy: userId })
        },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              displayName: true,
              avatar: true
            }
          },
          conversation: {
            select: {
              id: true,
              title: true,
              type: true
            }
          },
        },
        orderBy: { createdAt: 'desc' }
      });

      // NOTE: Cannot use sendSuccess() — response includes a top-level `isModerator`
      // field that iOS SDK (ConversationLinksResponse) and web parse at root level.
      // Migration to sendSuccess requires a coordinated client update (breaking change).
      return reply.send({
        success: true,
        data: links.map(l => ({ ...l, participantCount: l.currentUses })),
        isModerator
      });
    } catch (error) {
      logger.error('Error fetching conversation links', error as Error);
      return sendInternalError(reply, 'Error retrieving conversation links');
    }
  });

  // Route pour rejoindre une conversation via un lien partagé (utilisateurs authentifiés)
  //
  // #4353 — cette route DÉLÈGUE désormais à `performLinkJoin()`
  // (`./link-admission`), le cœur partagé livré par #4167 : la loi d'admission UNIQUE
  // (`admitLinkEntry`) est désormais évaluée pour cette porte AUSSI —
  // `maxUses` (incrément ATOMIQUE), `maxConcurrentUsers`, `maxUniqueSessions`,
  // `allowedIpRanges`, `requireAccount`, `isConversationClosed`. Avant ce lot,
  // cette route ne contrôlait que `isActive` et `expiresAt` : pour le MÊME
  // lien, à la MÊME seconde, un inscrit entrait là où un invité était refusé.
  //
  // L'auto-jonction à la room Socket.IO et les notifications aux
  // administrateurs/créateurs NE relèvent PAS de la loi d'admission — elles ne
  // vivent nulle part ailleurs dans le dépôt (ni dans `performLinkJoin`, ni
  // dans `admitLinkEntry`) et sont reportées TELLES QUELLES depuis l'ancien
  // corps, dans la branche `joined` (`new`/`rejoin`) — jamais pour
  // `already-member`, exactement comme avant. L'annonce dans le fil
  // (`postJoinSystemMessage`), elle, est désormais posée PAR le cœur partagé
  // (`joinAsRegistered`) — la rejouer ici la doublerait.
  fastify.post('/conversations/join/:linkId', {
    schema: {
      description: 'Join a conversation using an invitation link - validates link permissions and adds user as member',
      tags: ['conversations', 'links'],
      summary: 'Join conversation via link',
      params: {
        type: 'object',
        required: ['linkId'],
        properties: {
          linkId: { type: 'string', description: 'Share link ID to join conversation' }
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
                message: { type: 'string' },
                conversationId: { type: 'string' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        // #4353 — la loi d'admission unique refuse désormais aussi sur
        // `maxUses`/`maxConcurrentUsers`/`maxUniqueSessions` (409
        // LINK_EXHAUSTED) : les déclarer évite qu'un statut réel du contrat
        // sorte non documenté, comme `/new-link` (#4169) et
        // `/links/:key/members` (#4167) le font déjà pour 410/409.
        409: errorResponseSchema,
        410: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    // #4167/#4353 — désormais un ADAPTATEUR MINCE au sens exact où
    // `anonymous.ts` (#4167) l'entend pour ses trois routes-sœurs : elle ne
    // fait plus que traduire sa forme de requête/réponse historique vers le
    // cœur partagé (`POST /links/:key/members`). `onRequest` court avant
    // TOUTE garde (auth comprise) pour que l'annonce parte même sur un refus
    // — un appelant qui échoue est celui qui a le plus besoin de savoir
    // migrer. Le successeur porte un paramètre (`:linkId` → `:key`), donc une
    // FONCTION de la requête, comme pour `/anonymous/join/:linkId`.
    onRequest: [depreciee({
      depuis: '2026-08-30',
      successeur: (request) => apiPath(`/links/${(request.params as { linkId: string }).linkId}/members`),
    })],
    preValidation: [requiredAuth]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { linkId } = request.params as { linkId: string };
      const authRequest = request as UnifiedAuthRequest;
      const userToken = authRequest.authContext;

      if (!userToken) {
        return sendUnauthorized(reply, 'Authentification requise');
      }

      // Cette route n'a jamais eu de corps de requête (contrairement à `POST
      // /links/:key/members`) : la langue et l'email que `performLinkJoin`
      // compare respectivement à `allowedLanguages`/`requireEmail` viennent
      // donc du COMPTE de l'appelant. `email` est `@unique` et non nul sur
      // `User` — un lien `requireEmail` est satisfait sans jamais solliciter
      // l'appelant.
      // #4662 — les QUATRE rangs, jamais `systemLanguage` seul. C'est cette
      // langue que `performLinkJoin` compare à `allowedLanguages` : chargée au
      // rang 1 nu, elle REFUSAIT l'entrée à un lecteur dont la langue admise
      // vit au rang 2, 3 ou 4, en lui opposant le repli du site. Et c'est le
      // `select` qui décidait, pas l'appel — une projection étroite rend la
      // descente impossible EN AVAL sans qu'aucun témoin de rang ne rougisse.
      const requester = await prisma.user.findUnique({
        where: { id: userToken.userId },
        select: { email: true, ...RECIPIENT_LANG_SELECT }
      });

      const result = await performLinkJoin({
        prisma,
        key: linkId,
        authContext: userToken,
        requestIp: resolveClientIp(request),
        profile: {
          firstName: '',
          lastName: '',
          email: requester?.email,
          language: normalizeLanguageForDedup(recipientLanguage(requester, 'fr')),
        },
        broadcast: (message, conversationId) =>
          fastify.socketIOHandler?.getManager()?.broadcastMessage(message as never, conversationId)
            ?? Promise.resolve()
      });

      switch (result.kind) {
        case 'not-found':
          return sendNotFound(reply, 'Lien de conversation introuvable');

        case 'refused':
          // `admitLinkEntry` rend le statut ET le code — même mapping que
          // `POST /anonymous/join/:linkId` et `POST /links/:key/members` :
          // `LINK_EXPIRED` (410, lien inactif OU expiré), `CONVERSATION_CLOSED`
          // (410), `LINK_EXHAUSTED` (409 — NEUF sur cette porte, le défaut de
          // tête de #4353), `REGION_NOT_ALLOWED` (403 — NEUF), `ACCOUNT_REQUIRED`
          // (403 — inatteignable ici, un inscrit a toujours un compte) et
          // `BANNED` (403). Les statuts pour les motifs déjà gardés par
          // l'ancien corps (inactif/expiré, clos, banni) sont préservés à
          // l'identique ; seul `error` porte désormais un CODE stable plutôt
          // qu'une phrase française — écart assumé, cf. rapport de livraison.
          return sendError(reply, result.refusal.status, result.refusal.code, { message: result.refusal.message });

        case 'validation':
          return sendBadRequest(reply, result.message);

        case 'language-not-allowed':
          return sendError(reply, 403, 'LANGUAGE_NOT_ALLOWED', { message: 'Langue non autorisée pour ce lien' });

        case 'username-taken':
          // Inatteignable sur cette porte : `requireNickname` (seul chemin vers
          // `username-taken`) est gardé par `identity.kind === 'guest'` dans
          // `performLinkJoin`, et cette route n'admet que des inscrits
          // (`preValidation: [requiredAuth]`). Géré pour l'exhaustivité du
          // type — fail-closed plutôt qu'omis.
          return sendError(reply, 409, 'USERNAME_TAKEN_IN_CONVERSATION', {
            message: 'Ce nom d\'utilisateur est déjà utilisé dans cette conversation',
            details: { suggestedNickname: result.suggestion }
          });

        case 'joined': {
          if (result.outcome === 'already-member') {
            logger.info('Utilisateur déjà membre', { conversationId: result.shareLink.conversationId });
            return sendSuccess(reply, { message: 'Vous êtes déjà membre de cette conversation', conversationId: result.shareLink.conversationId });
          }

          // ── PRÉSERVÉ TEL QUEL — hors de la loi d'admission (voir doc-tête) ──

          // Auto-join the joining user's currently-connected sockets to the
          // conversation room so they receive message:new events immediately
          // without a reconnect (mirrors POST /conversations/:id/participants).
          const joinSocketManager = fastify.socketIOHandler?.getManager();
          if (joinSocketManager) {
            joinSocketManager.joinUserToConversationRoom(userToken.userId, result.shareLink.conversationId).catch(
              (err: unknown) => logger.error('Failed to auto-join link joiner to conversation room', err as Error)
            );
          }

          // Envoyer des notifications
          const notificationService = fastify.notificationService;
          if (notificationService) {
            try {
              // Récupérer les informations de l'utilisateur qui rejoint
              const joiningUser = await prisma.user.findUnique({
                where: { id: userToken.userId },
                select: {
                  username: true,
                  displayName: true,
                  avatar: true
                }
              });

              if (joiningUser) {
                // 1. Notification de confirmation pour l'utilisateur qui rejoint
                await notificationService.createMemberJoinedNotification({
                  recipientUserId: userToken.userId,
                  newMemberUserId: userToken.userId,
                  conversationId: result.shareLink.conversationId,
                  joinMethod: 'via_link'
                });

                // 2. Notifier les admins et créateurs de la conversation
                const adminsAndCreators = await prisma.participant.findMany({
                  where: {
                    conversationId: result.shareLink.conversationId,
                    // Un `where` Prisma ne replie pas la casse (#4008) : sans les
                    // deux graphies, les admins du salon global — écrits en
                    // majuscules par l'ancien `InitService` — n'étaient prévenus
                    // d'aucune arrivée.
                    role: { in: memberRoleCasings(['admin', 'creator']) },
                    isActive: true,
                    userId: { not: userToken.userId } // Ne pas notifier l'utilisateur lui-même
                  },
                  select: { userId: true }
                });

                // Une seule diffusion pour tous les administrateurs. La boucle
                // `await` qui précédait tenait la réponse « vous avez rejoint »
                // jusqu'à ce que le dernier d'entre eux soit notifié, et relisait
                // par destinataire un contexte identique pour tous.
                const adminUserIds = adminsAndCreators
                  .map((member) => member.userId)
                  .filter((id): id is string => !!id);
                if (adminUserIds.length > 0) {
                  const notified = await notificationService.createMemberJoinedNotificationsBatch(adminUserIds, {
                    newMemberUserId: userToken.userId,
                    conversationId: result.shareLink.conversationId,
                    joinMethod: 'via_link'
                  });
                  logger.debug('Notifications membre rejoint envoyées', { notified, audience: adminUserIds.length });
                }

                logger.debug('Notification confirmation envoyée');
              }
            } catch (notifError) {
              logger.error('Erreur envoi notifications de jointure', notifError as Error);
              // Ne pas bloquer la jointure
            }
          }
          // ── FIN DU BLOC PRÉSERVÉ ──

          logger.info('Réponse succès join', { conversationId: result.shareLink.conversationId });
          return sendSuccess(reply, { message: 'Vous avez rejoint la conversation avec succès', conversationId: result.shareLink.conversationId });
        }
      }

    } catch (error) {
      logger.error('Error joining conversation via link', error as Error);
      return sendInternalError(reply, 'Erreur lors de la jointure de la conversation');
    }
  });

  // Route pour inviter un utilisateur à une conversation
  fastify.post('/conversations/:id/invite', {
    schema: {
      description: 'Invite a user to join a conversation - creates membership and sends notification',
      tags: ['conversations', 'participants'],
      summary: 'Invite user to conversation',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID' }
        }
      },
      body: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', description: 'ID of user to invite' }
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
                message: { type: 'string', example: 'User invited successfully' },
                // `membership` déclaré / `member` envoyé : le nouvel adhérent
                // n'a JAMAIS atteint le fil. Aligné sur le nom que portent ses
                // deux voisines (`PATCH …/role`, la liste) — on ne casse pas un
                // contrat qui n'a jamais été honoré.
                participant: conversationParticipantSchema
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
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'User not authenticated');
      }

      const { id: conversationId } = request.params as { id: string };
      const { userId } = request.body as { userId: string };
      const inviterId = authContext.userId;

      // Vérifier que la conversation existe
      const conversation = await fastify.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          participants: {
            where: { isActive: true, type: 'user' },
            select: {
              id: true,
              userId: true,
              role: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  role: true
                }
              }
            }
          }
        }
      });

      if (!conversation) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Vérifier que l'inviteur est membre de la conversation
      const inviterMember = conversation.participants.find(m => m.userId === inviterId);
      if (!inviterMember) {
        return sendForbidden(reply, 'Vous n\'êtes pas membre de cette conversation');
      }

      // #4557 — **MODERATOR, le même plancher que `POST …/participants`.**
      //
      // Cette porte exigeait ADMIN pour un geste dont l'autre se contente d'un
      // modérateur, alors que les deux produisent la MÊME ligne : ni l'une ni
      // l'autre ne crée d'invitation EN ATTENTE — elles écrivent un
      // `Participant` immédiatement ACTIF, `role: 'member'`, avec la table
      // `NEW_MEMBER_PERMISSIONS` du site unique (#4174), par le même
      // `resolveConversationEntry`. « Inviter » nomme ici un ajout direct.
      //
      // Le rang plus haut ne retenait donc rien : un modérateur à qui cette
      // porte refusait quelqu'un l'ajoutait par l'autre, dans la seconde, avec
      // les mêmes droits et un éventail de diffusion PLUS complet. C'était une
      // incohérence (dimension 6), pas une protection.
      //
      // L'alignement se fait vers le BAS, seul sens non régressif : monter
      // `participants` à ADMIN retirerait aux modérateurs une capacité VIVANTE
      // — les trois clients passent par cette porte-là — pour fermer une porte
      // que plus aucun client n'appelle. Le plancher LUI-MÊME (un modérateur
      // peut-il ajouter ?) est inchangé ; le déplacer serait une décision
      // produit. Gardé par `conversation-new-member-rights-parity.test.ts`,
      // qui COMPARE les deux portes — un témoin posé sur une seule ne pourrait
      // pas rougir d'une redivergence.
      const canInvite = actorHasMinimumRole(
        {
          conversationRole: inviterMember.role,
          platformRole: authContext.registeredUser.role,
        },
        MemberRole.MODERATOR,
      );

      if (!canInvite) {
        return sendForbidden(reply, 'Vous n\'avez pas les permissions pour inviter des utilisateurs');
      }

      // Vérifier que l'utilisateur à inviter existe
      const userToInvite = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          displayName: true,
          firstName: true,
          lastName: true,
          deactivatedAt: true
        }
      });

      if (!userToInvite) {
        return sendNotFound(reply, 'User not found');
      }

      // `conversation.participants` est chargé avec `where: { isActive: true }` :
      // il ne pouvait donc PAS voir la ligne d'un banni ni celle d'un ancien
      // membre, et le `create` qui suit leur fabriquait une ligne neuve et
      // active — un bannissement défait sans passer par `POST …/unban`, plus une
      // seconde ligne `Participant` pour la même paire.
      const entry = await resolveConversationEntry({
        prisma: fastify.prisma,
        conversationId,
        userId,
        // Déjà chargée pour vérifier l'appartenance de l'inviteur — inviter dans
        // un fil terminé donnait une ligne active dans une conversation que
        // `GET /conversations` ne rend plus et où le premier message est refusé.
        conversation,
      });

      if (entry.outcome === 'closed') {
        return sendError(reply, 410, 'Cette conversation est terminée');
      }

      if (entry.outcome === 'banned') {
        return sendForbidden(reply, 'This user is banned from the conversation — lift the ban first');
      }

      if (entry.outcome === 'already-member') {
        return sendBadRequest(reply, 'This user is already a member of the conversation');
      }

      // #4174 — la table de droits vient du site UNIQUE
      // (`services/participantRights.ts`). Elle était écrite ICI, et elle
      // DIFFÉRAIT de celle que `POST …/participants` posait pour le même
      // geste : `canSendVideos` et `canSendAudios` y valaient `false`. Le
      // même utilisateur, ajouté au même groupe, recevait donc des droits
      // différents selon le bouton employé — alors que les deux portes
      // partagent le résolveur d'admission, produisent la même ligne de rôle
      // `member`, et sont déclenchées par le même écran.
      const invitedMemberFields = {
        type: 'user',
        displayName: userToInvite.displayName || userToInvite.username,
        role: 'member',
        permissions: { ...NEW_MEMBER_PERMISSIONS }
      };

      // La mise en garde qui vivait ici — « ne rien charger qu'aucune surface ne
      // sert, sinon le jour où la dérive `member`/`membership` est corrigée, la
      // présence brute d'un invité part sur le fil » — est LEVÉE, parce que le
      // jour est arrivé et que le gate arrive avec. Le rang ne part plus jamais
      // brut : `serializeConversationParticipant` est le seul chemin vers le fil,
      // et il exige qu'on lui passe la visibilité.
      const invitedMemberInclude = {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
            systemLanguage: true,
            regionalLanguage: true,
            customDestinationLanguage: true,
            createdAt: true,
            updatedAt: true
          }
        }
      };

      const newMember = entry.outcome === 'rejoin' && entry.participantId
        ? await fastify.prisma.participant.update({
            where: { id: entry.participantId },
            data: { ...invitedMemberFields, ...REJOIN_PARTICIPANT_STATE },
            include: invitedMemberInclude
          })
        : await fastify.prisma.participant.create({
            data: {
              conversationId: conversationId,
              userId: userId,
              ...invitedMemberFields,
              joinedAt: new Date(),
              isActive: true
            },
            include: invitedMemberInclude
          });

      if (entry.outcome === 'rejoin' && entry.participantId) {
        invalidateParticipantLookup(entry.participantId, conversationId);
      }

      // Annoncer l'arrivée — troisième des quatre portes, même loi.
      await postJoinSystemMessage(
        {
          prisma: fastify.prisma,
          broadcast: (message, targetConversationId) =>
            fastify.socketIOHandler?.getManager()?.broadcastMessage(message as never, targetConversationId)
              ?? Promise.resolve()
        },
        {
          conversationId,
          participantId: newMember.id,
          displayName: invitedMemberFields.displayName,
          isAnonymous: false,
          viaShareLink: false
        }
      );

      // Auto-join the invited user's currently-connected sockets to the
      // conversation room so they receive message:new events immediately
      // without a reconnect (mirrors POST /conversations/:id/participants).
      const inviteSocketManager = fastify.socketIOHandler?.getManager();
      if (inviteSocketManager) {
        inviteSocketManager.joinUserToConversationRoom(userId, conversationId).catch(
          (err: unknown) => logger.error('Failed to auto-join invited user to conversation room', err as Error)
        );
      }

      // Envoyer une notification à l'utilisateur invité
      const notificationService = fastify.notificationService;
      if (notificationService) {
        try {
          // Récupérer les informations de l'inviteur
          const inviter = await fastify.prisma.user.findUnique({
            where: { id: inviterId },
            select: {
              username: true,
              displayName: true,
              avatar: true
            }
          });

          if (inviter) {
            await notificationService.createConversationInviteNotification({
              invitedUserId: userId,
              inviterId: inviterId,
              inviterUsername: inviter.displayName || inviter.username,
              inviterAvatar: inviter.avatar || undefined,
              conversationId: conversationId,
              conversationTitle: conversation.title,
              conversationType: conversation.type
            });
            logger.debug('Notification invitation envoyée');
          }
        } catch (notifError) {
          logger.error('Erreur envoi notification invitation', notifError as Error);
          // Ne pas bloquer l'invitation
        }
      }

      // PERFORMANCE: Invalider le cache d'autocomplete car la liste des membres a changé
      const mentionService = fastify.mentionService;
      if (mentionService) {
        try {
          await mentionService.invalidateCacheForConversation(conversationId);
          logger.debug('Cache autocomplete invalidé');
        } catch (cacheError) {
          logger.error('Erreur invalidation cache', cacheError as Error);
          // Ne pas bloquer l'invitation
        }
      }

      // Régime STRICT (2026-08-25) : partager une conversation n'ouvre plus
      // rien — la réponse à l'inviteur montre la présence de l'invité selon
      // SA propre autorisation (soi/ADMIN+/ami), jamais sur la seule
      // co-participation qu'il vient de créer.
      const inviteViewer = viewerFromRequest(request);
      const invitePresenceVis = await getPresenceVisibilityService(prisma).resolveForTarget(
        inviteViewer,
        { id: userId, deactivatedAt: userToInvite.deactivatedAt ?? null }
      );

      return sendSuccess(reply, {
        participant: serializeConversationParticipant(newMember, {
          presence: invitePresenceVis
        }),
        message: `${userToInvite.displayName || userToInvite.username} a été invité à la conversation`
      });

    } catch (error) {
      logger.error('Erreur invitation', error as Error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
