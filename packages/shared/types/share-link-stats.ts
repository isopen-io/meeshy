import { z } from 'zod';

import type { ConversationType } from './conversation.js';

/**
 * CE QU'UN LIEN D'INVITATION MONTRE — à l'invité avant d'entrer, et à son
 * auteur une fois qu'il a servi (#7794, #7797).
 *
 * Deux contrats, écrits UNE fois pour les trois lecteurs (passerelle, web,
 * iOS) :
 *
 * - l'APERÇU PUBLIC (`GET /api/v1/anonymous/link/:identifier`) sert le groupe
 *   tel qu'il se présente : titre, description, type, logo (`avatar`) et
 *   bannière (`banner`). Rien qui identifie un MEMBRE — ni nom, ni visage :
 *   l'invité ne voit personne avant d'avoir rejoint ;
 * - les STATISTIQUES DU LIEN (`GET /api/v1/links/:linkId/stats`), réservées à
 *   l'auteur du lien et aux modérateurs de la conversation : visites,
 *   arrivées, arrivées sans compte, répartitions par langue et par pays, et
 *   les vingt dernières arrivées.
 *
 * `avatar` et `banner` sont servis tels que la colonne les porte — exactement
 * comme le détail d'une conversation (`core-detail.ts`) : chaque client compose
 * l'adresse depuis sa base (`resolveAttachmentSrc` web, `resolveMediaURL` iOS).
 */

/** Les types réels d'une conversation — le schéma d'aperçu n'en connaissait que deux. */
export const CONVERSATION_TYPES = ['direct', 'group', 'public', 'global', 'broadcast'] as const satisfies readonly ConversationType[];

type ConversationTypesAreExhaustive = Exclude<ConversationType, (typeof CONVERSATION_TYPES)[number]> extends never ? true : never;
const conversationTypesAreExhaustive: ConversationTypesAreExhaustive = true;
void conversationTypesAreExhaustive;

/** Nombre maximal d'arrivées servies par `recentArrivals`. */
export const SHARE_LINK_RECENT_ARRIVALS_CAP = 20;

export const shareLinkPreviewConversationSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  type: z.enum(CONVERSATION_TYPES),
  avatar: z.string().nullable(),
  banner: z.string().nullable(),
  createdAt: z.string(),
});

export type ShareLinkPreviewConversation = z.infer<typeof shareLinkPreviewConversationSchema>;

export const shareLinkArrivalSchema = z.object({
  participantId: z.string(),
  displayName: z.string(),
  avatar: z.string().nullable(),
  isAnonymous: z.boolean(),
  /** ISO 3166-1 alpha-2, majuscules — `null` si inconnu. */
  country: z.string().nullable(),
  language: z.string().nullable(),
  /** Instant ISO 8601. */
  joinedAt: z.string(),
});

export type ShareLinkArrival = z.infer<typeof shareLinkArrivalSchema>;

export const shareLinkStatsSchema = z.object({
  visits: z.number().int().nonnegative(),
  arrivals: z.number().int().nonnegative(),
  anonymousArrivals: z.number().int().nonnegative(),
  arrivalsByLanguage: z.array(z.object({ language: z.string(), count: z.number().int().positive() })),
  arrivalsByCountry: z.array(z.object({ country: z.string(), count: z.number().int().positive() })),
  recentArrivals: z.array(shareLinkArrivalSchema).max(SHARE_LINK_RECENT_ARRIVALS_CAP),
});

export type ShareLinkStats = z.infer<typeof shareLinkStatsSchema>;

/**
 * Les schémas de RÉPONSE Fastify. Déclarer chaque champ n'est pas de la
 * documentation : `fast-json-stringify` retire en silence toute propriété que
 * le schéma ne nomme pas.
 */
export const shareLinkPreviewConversationJsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string', nullable: true },
    description: { type: 'string', nullable: true },
    type: { type: 'string', enum: [...CONVERSATION_TYPES] },
    avatar: { type: 'string', nullable: true, description: 'Group logo (as stored, composed by the client like any conversation avatar)' },
    banner: { type: 'string', nullable: true, description: 'Group banner (as stored, composed by the client like any conversation banner)' },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

const countEntryJsonSchema = (key: 'language' | 'country') =>
  ({
    type: 'array',
    items: {
      type: 'object',
      required: [key, 'count'],
      properties: { [key]: { type: 'string' }, count: { type: 'integer' } },
    },
  }) as const;

export const shareLinkStatsJsonSchema = {
  type: 'object',
  required: ['visits', 'arrivals', 'anonymousArrivals', 'arrivalsByLanguage', 'arrivalsByCountry', 'recentArrivals'],
  properties: {
    visits: { type: 'integer', description: 'Times the public preview was served for this open link' },
    arrivals: { type: 'integer', description: 'Participants who joined through this link' },
    anonymousArrivals: { type: 'integer', description: 'Of which joined without an account' },
    arrivalsByLanguage: countEntryJsonSchema('language'),
    arrivalsByCountry: countEntryJsonSchema('country'),
    recentArrivals: {
      type: 'array',
      maxItems: SHARE_LINK_RECENT_ARRIVALS_CAP,
      items: {
        type: 'object',
        required: ['participantId', 'displayName', 'avatar', 'isAnonymous', 'country', 'language', 'joinedAt'],
        properties: {
          participantId: { type: 'string' },
          displayName: { type: 'string' },
          avatar: { type: 'string', nullable: true },
          isAnonymous: { type: 'boolean' },
          country: { type: 'string', nullable: true, description: 'ISO 3166-1 alpha-2' },
          language: { type: 'string', nullable: true },
          joinedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
} as const;
