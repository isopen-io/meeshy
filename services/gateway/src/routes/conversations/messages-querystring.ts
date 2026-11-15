/**
 * **LE CONTRAT DE REQUÊTE DE `GET /conversations/:id/messages`** — extrait de
 * `messages-list.ts` pour être ÉPROUVABLE (#6994), exactement comme #6857 l'a
 * fait pour la route sœur `GET /conversations`.
 *
 * Le schéma vivait en ligne dans la déclaration de route : un témoin qui
 * voulait mesurer ce que la frontière ANNONCE devait monter tout le module —
 * donc Prisma, l'authentification et la moitié de la passerelle — pour poser
 * une question qui ne dépend d'aucun d'eux. L'extraction ne change rien à la
 * route ; elle rend la frontière interrogeable.
 *
 * ## Pourquoi les bornes sont une CONSTANTE, pas deux littéraux
 *
 * La description disait « default 20 » et taisait `maxLimit: 50` ; la route
 * sœur annonçait « max 50, default 15 » pour un handler qui appliquait
 * `{ defaultLimit: 30, maxLimit: 100 }`. Ces écarts ne viennent pas d'une
 * étourderie : ils viennent de ce qu'une borne était écrite DEUX FOIS, à deux
 * endroits qu'aucun lien ne rapprochait. Le schéma interpole donc la constante
 * que le handler passe à `validatePagination` — changer l'une sans l'autre
 * n'est plus possible.
 *
 * ## Pourquoi `before` porte désormais un `pattern`
 *
 * Il est décrit comme un **identifiant de message**, et c'est ce qu'il est :
 * le handler le résout par `findFirst({ where: { id: before, conversationId } })`.
 * Le schéma annonçait un **timestamp**. Un client qui lisait cette phrase
 * envoyait une date — que le handler ne trouvait pas, sans poser de filtre,
 * resservant alors sa page récente **sans erreur**. Le client bouclait sur la
 * même page en croyant paginer : un SUCCÈS TROMPEUR, la seule forme de panne
 * qu'aucun journal ne montre.
 *
 * Le `pattern` est la garde DÉCLARATIVE de ce contrat, appliquée par Fastify
 * avant que le handler n'existe — la route sœur le porte depuis #6857 pour la
 * même raison, et son doc-comment dit déjà que « les deux curseurs de la même
 * route doivent se comporter pareil ». C'est cette phrase qu'on honore.
 */

import { MESSAGES_VIEW_QUERY_PROPERTIES } from './messages-list-views';
import { OBJECT_ID_PATTERN } from './list-querystring';

/**
 * Les bornes de pagination de CETTE route — la seule source, lue par le schéma
 * (pour sa description) et par le handler (`validatePagination`).
 */
export const MESSAGES_LIST_PAGINATION = { defaultLimit: 20, maxLimit: 50 } as const;

export const messagesListQuerystringSchema = {
  type: 'object',
  properties: {
    limit: {
      type: 'string',
      description: `Maximum number of messages to return (max ${MESSAGES_LIST_PAGINATION.maxLimit}, default ${MESSAGES_LIST_PAGINATION.defaultLimit})`,
    },
    offset: { type: 'string', description: 'Number of messages to skip (default 0)' },
    before: {
      type: 'string',
      pattern: OBJECT_ID_PATTERN,
      description:
        'Cursor for pagination: get messages before this MESSAGE ID (resolved to its createdAt). Must be a 24-character hexadecimal identifier — NOT a timestamp.',
    },
    after: {
      type: 'string',
      description:
        'Forward watermark (ISO8601): get messages created strictly after this instant, ascending. For local-first incremental gap backfill.',
    },
    around: { type: 'string', description: 'Load messages around this messageId (for search jump)' },
    replyToId: {
      type: 'string',
      description:
        "#4177 — filtre la collection aux réponses de CE message (fil de réponses), côté serveur. Absent jusqu'ici : AJV retirait silencieusement le paramètre, et ThreadRepliesLoader (iOS) recevait le fil ENTIER de la conversation.",
    },
    include_reactions: {
      type: 'string',
      enum: ['true', 'false'],
      description:
        "#4177 — Accepté pour compatibilité, SANS EFFET : le détail brut des réactions n'a jamais atteint aucun client (messageSchema ne le déclare pas, fast-json-stringify le retirait). reactionSummary et reactionCount, seuls champs réellement servis, sont toujours inclus.",
    },
    include_translations: { type: 'string', enum: ['true', 'false'], description: 'Include translations (default true)' },
    include_status: {
      type: 'string',
      enum: ['true', 'false'],
      description:
        'Accepté pour compatibilité, sans effet. Les accusés NOMINATIFS par participant ne sont pas servis par cette liste — `messageSchema` ne les déclare pas, donc fast-json-stringify les a toujours retirés, et les charger revenait à payer une relation par page pour un tableau jeté. Les coches se peignent avec les compteurs agrégés déjà présents sur chaque message (deliveredCount / readCount / recipientCount), qui appliquent le gate showReadReceipts. Pour le détail nominatif, utiliser GET /conversations/:id/statuses, qui applique ce même gate.',
    },
    include_replies: { type: 'string', enum: ['true', 'false'], description: 'Include replyTo message details (default true)' },
    languages: {
      type: 'string',
      description:
        'Comma-separated Prisme languages (e.g. "fr,en"). When set, only these languages are serialized in BOTH text and audio translations; absent = all languages. Bandwidth opt-in.',
    },
    ...MESSAGES_VIEW_QUERY_PROPERTIES,
  },
} as const;
