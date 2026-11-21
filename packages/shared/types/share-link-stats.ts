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

/**
 * L'E-MAIL D'UN INVITÉ, MASQUÉ (#19283) — la ligne « e-mail fourni b•••@•••.sn »
 * de la planche Lien-Partage. Le gestionnaire d'un lien apprend qu'un invité a
 * laissé une adresse, jamais laquelle : première lettre du nom, extension du
 * domaine, et trois points médians fixes de chaque côté — ni la longueur du nom
 * ni le domaine ne partent. Plus fermé que le masque du parrainage
 * (`ma•••••@gmail.com`) : là l'adresse est celle que l'invitant a lui-même
 * tapée ; ici c'est un tiers qui l'a donnée à la conversation, pas au
 * gestionnaire du lien, et un domaine d'entreprise suffit à l'identifier.
 */
const EMAIL_MASK = '•••';

export function maskGuestEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim() ?? '';
  if (trimmed === '') return null;
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return EMAIL_MASK;
  const first = trimmed.charAt(0).toLowerCase();
  const domain = trimmed.slice(at + 1).toLowerCase();
  const dot = domain.lastIndexOf('.');
  const extension = dot >= 0 && dot < domain.length - 1 ? domain.slice(dot + 1) : null;
  return extension === null
    ? `${first}${EMAIL_MASK}@${EMAIL_MASK}`
    : `${first}${EMAIL_MASK}@${EMAIL_MASK}.${extension}`;
}

/**
 * Ce qu'une arrivée ajoute pour son gestionnaire (#19283), additif et
 * facultatif au décodage (un serveur plus ancien ne les sert pas) :
 * - `userId` : le compte d'un arrivant INSCRIT, pour « Voir la fiche » (qui
 *   passe ensuite par la loi des cercles comme toute fiche) ; `null` pour un
 *   invité ;
 * - `emailMasked` : l'adresse qu'un invité a laissée en entrant, masquée par
 *   {@link maskGuestEmail} ; `null` sans adresse et pour un inscrit — l'e-mail
 *   d'un compte ne se lit jamais ici.
 */
const arrivalOwnerFields = {
  userId: z.string().nullable().optional(),
  emailMasked: z.string().nullable().optional(),
};

const arrivalOwnerJsonProperties = {
  userId: { type: 'string', nullable: true, description: 'Account of a registered arrival (to open its profile), null for a guest' },
  emailMasked: { type: 'string', nullable: true, description: 'Masked e-mail a guest left when joining (b•••@•••.sn), never the address; null otherwise' },
} as const;

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
  ...arrivalOwnerFields,
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
          ...arrivalOwnerJsonProperties,
        },
      },
    },
  },
} as const;

/**
 * LA LISTE COMPLÈTE DES ARRIVÉES D'UN LIEN (#7813) — `GET
 * /api/v1/links/:linkId/arrivals?cursor=&limit=`, mêmes lecteurs que les
 * statistiques. Une arrivée n'y porte QUE ce que la ligne affiche : nom, visage,
 * badge « sans compte », pays, langue et date — et, pour son gestionnaire, le
 * compte d'un inscrit et l'e-mail masqué d'un invité (#19283). Jamais la présence. Le visage (`avatar`, #12571) est AJOUTÉ
 * à la page — additif, un ancien client l'ignore — pour que la liste complète
 * montre la photo que les arrivées récentes montraient déjà, aux mêmes lecteurs.
 *
 * Le curseur est opaque et stable (`joinedAt` puis identifiant, décroissants) :
 * une arrivée nouvelle pendant le défilement ne décale aucune page.
 */
export const SHARE_LINK_ARRIVALS_PAGE_DEFAULT = 30;
export const SHARE_LINK_ARRIVALS_PAGE_MAX = 100;

export const shareLinkArrivalEntrySchema = z.object({
  displayName: z.string(),
  /** Une référence de média (`resolveParticipantAvatar`), ou `null` sans photo. */
  avatar: z.string().nullable(),
  isAnonymous: z.boolean(),
  /** ISO 3166-1 alpha-2, majuscules — `null` si inconnu. */
  country: z.string().nullable(),
  language: z.string().nullable(),
  /** Instant ISO 8601. */
  joinedAt: z.string(),
  ...arrivalOwnerFields,
});

export type ShareLinkArrivalEntry = z.infer<typeof shareLinkArrivalEntrySchema>;

export const shareLinkArrivalsPageSchema = z.object({
  arrivals: z.array(shareLinkArrivalEntrySchema).max(SHARE_LINK_ARRIVALS_PAGE_MAX),
  nextCursor: z.string().nullable(),
});

export type ShareLinkArrivalsPage = z.infer<typeof shareLinkArrivalsPageSchema>;

export const shareLinkArrivalsPageJsonSchema = {
  type: 'object',
  required: ['arrivals', 'nextCursor'],
  properties: {
    arrivals: {
      type: 'array',
      maxItems: SHARE_LINK_ARRIVALS_PAGE_MAX,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['displayName', 'avatar', 'isAnonymous', 'country', 'language', 'joinedAt'],
        properties: {
          displayName: { type: 'string' },
          avatar: { type: 'string', nullable: true, description: 'Media reference of the participant picture, null without one' },
          isAnonymous: { type: 'boolean' },
          country: { type: 'string', nullable: true, description: 'ISO 3166-1 alpha-2' },
          language: { type: 'string', nullable: true },
          joinedAt: { type: 'string', format: 'date-time' },
          ...arrivalOwnerJsonProperties,
        },
      },
    },
    nextCursor: { type: 'string', nullable: true, description: 'Opaque cursor of the next page, null on the last one' },
  },
} as const;
