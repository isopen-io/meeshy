import { FastifySchema } from 'fastify';
import { z } from 'zod';
import { OBJECT_ID_REGEX } from '@meeshy/shared/utils/object-id';
import { CONTENT_SURFACES } from '@meeshy/shared/types/content-surfaces';
import { OPEN_ORIGINS, VIEW_PROVENANCES } from '@meeshy/shared/types/content-reach';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { EngagementSessionSchema, DOWNLOAD_SURFACES } from '../posts/types';
import { EventEnvelopeFields, VisibilitySchema } from './eventsV2Schemas';

/**
 * Les schémas des CINQ types de comptage de `POST /social/events` (#4150,
 * #10483), sortis de `events.ts` pour faire place à la v2 (#10500).
 *
 * Chacun garde ses champs OBLIGATOIRES ; les champs d'enveloppe v2 (`eventId`,
 * `occurredAt`, `target`, `listing`, `prism`, `visibility` sur l'impression)
 * y sont FACULTATIFS et un champ v2 malformé est ôté, jamais un refus : ils
 * ne doivent jamais faire perdre le comptage qu'ils accompagnent. Un ancien
 * serveur les retire en silence (objets Zod non stricts).
 */
/**
 * Le contrat de fil de l'alias `POST /posts/:postId/view`.
 *
 * Il vit ICI, avec la branche `view` du point d'ingestion dont il est la
 * PROJECTION historique, plutôt qu'au site de montage : c'est le même
 * événement, dit dans l'ancienne langue (`duration` au lieu de `durationMs`),
 * et les deux formes doivent bouger ensemble ou pas du tout.
 *
 * Annoté `FastifySchema` — et pas laissé à l'inférence. Un littéral exporté est
 * inféré au plus étroit, et le fournisseur de types de Fastify en dérive alors
 * les génériques de la route : `params` devient `{}` (le schéma JSON décrit des
 * propriétés, pas un type TypeScript), ce qui contredit le `Params: PostParams`
 * que le gestionnaire déclare. L'annotation dit ce que la valeur EST — un
 * schéma — plutôt que la forme exacte de son littéral.
 */
export const VIEW_ALIAS_SCHEMA: FastifySchema = {
    params: { type: 'object', required: ['postId'], properties: { postId: { type: 'string' } } },
    // `['object', 'null']` et non `'object'` : les clients appellent cette
    // route SANS corps (une vue n'a rien à dire de plus que son existence),
    // et Fastify remet alors `null`. Un schéma `object` nu refuserait ces
    // appels — la rigueur fermerait une porte qu'elle n'a pas à fermer.
    body: {
      oneOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            duration: {
              type: 'integer',
              minimum: 0,
              maximum: 300_000,
              description: 'Durée de consultation en millisecondes (plafond : 5 minutes)',
            },
          },
        },
      ],
    },
    // Le succès est DÉCLARÉ (#4531) : sans clé `response`, rien n'oblige la
    // charge servie à rester celle qu'on annonce, et le contrat de la route
    // n'existe que dans son handler. Une vue n'a qu'une chose à dire — elle
    // a été enregistrée.
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              viewed: { type: 'boolean', description: 'La vue a été enregistrée' },
            },
          },
        },
      },
      401: errorResponseSchema,
      500: errorResponseSchema,
    },
  };

/** Le plafond du lot — le critère 1 le pose à 200. */
export const SOCIAL_EVENTS_BATCH_CAP = 200;

/**
 * Plafond de `durationMs`, en millisecondes.
 *
 * Cinq minutes : la même borne que `PostService.recordView` applique déjà en
 * aval. Elle est REDITE ici parce qu'une borne d'aval n'est pas une borne — le
 * jour où un second consommateur lit ce champ, il hérite d'un entier libre.
 */
const DUREE_MAX_MS = 300_000;

/**
 * Surfaces qui peuvent produire une impression — le SITE UNIQUE de cette
 * énumération depuis que l'impression a rejoint ce point d'ingestion.
 *
 * Elle a déjà divergé une fois entre la route unitaire et son lot : iOS envoyait
 * `story` à chaque slide révélé, valeur absente des deux listes, donc 400
 * systématique et `impressionCount` figé à 0 sur toutes les stories malgré des
 * vues réelles. Toute nouvelle surface cliente s'ajoute ICI.
 */
export const IMPRESSION_SOURCES = [
  'feed',
  'profile',
  'search',
  'shared_link',
  'notification',
  'detail',
  'story',
  'status',
] as const;

const postId = z.string().regex(OBJECT_ID_REGEX);

/**
 * L'écran d'affichage (#10483) — FACULTATIF : un ancien client ne l'envoie pas,
 * un ancien serveur le retire (objet non strict). Source unique :
 * `CONTENT_SURFACES` (`@meeshy/shared/types/content-surfaces`). Une valeur
 * INCONNUE est ignorée (rangée absente) et le lot passe : un client plus neuf
 * que le serveur, qui déclare un écran que celui-ci ne connaît pas encore, ne
 * doit jamais perdre ses comptes.
 */
const surface = z.enum(CONTENT_SURFACES).optional().catch(undefined);

/**
 * L'ORIGINE d'une ouverture (le listing tapé) et la PROVENANCE d'une vue
 * (#10483, `@meeshy/shared/types/content-reach`) — facultatives, et une valeur
 * INCONNUE est ignorée, jamais un refus du lot, pour la même raison que
 * `surface`.
 */
const origin = z.enum(OPEN_ORIGINS).optional().catch(undefined);
const provenance = z.enum(VIEW_PROVENANCES).optional().catch(undefined);

const ViewEventSchema = z.object({
  ...EventEnvelopeFields,
  type: z.literal('view'),
  postId,
  /**
   * `durationMs` et non `duration` : le nom dit son unité. L'ancienne route
   * lisait `duration` en `(request.body as any) ?? {}` — sans schéma, sans
   * borne, et sans que rien ne dise s'il s'agissait de secondes.
   */
  durationMs: z.number().int().min(0).max(DUREE_MAX_MS).optional(),
  surface,
  provenance,
  origin,
  /**
   * L'IMPRESSION de l'affichage que cette vue constate (#10732) — sa clé et sa
   * source, celles que le client range aussi dans son lot d'impressions. Une
   * vue implique son impression : la passerelle l'écrit sous cette clé si elle
   * manque encore, et le lot qui la porte plus tard est un rejeu. Facultative
   * (un ancien client ne l'envoie pas) ; malformée, elle est ôtée.
   */
  impression: z.object({
    eventId: z.guid(),
    source: z.enum(IMPRESSION_SOURCES),
  }).optional().catch(undefined),
});

/**
 * L'ENGAGEMENT D'OUVERTURE (#10483) — le tap sur un contenu d'un listing, avec
 * son origine. Il ne compte AUCUNE vue : la vue est comptée par l'écran ouvert.
 * Type ADDITIF : un ancien serveur refuse un lot qui le porte (union
 * discriminée), c'est pourquoi les clients l'envoient dans une requête à part.
 */
const OpenEventSchema = z.object({
  ...EventEnvelopeFields,
  type: z.literal('open'),
  postId,
  origin,
});

const ImpressionEventSchema = z.object({
  ...EventEnvelopeFields,
  type: z.literal('impression'),
  postId,
  source: z.enum(IMPRESSION_SOURCES).default('feed'),
  surface,
  /** Visibilité MRC (#10501) — attribut rangé sur la ligne, jamais une condition du comptage. */
  visibility: VisibilitySchema.optional().catch(undefined),
});

const DownloadEventSchema = z.object({
  ...EventEnvelopeFields,
  type: z.literal('download'),
  postId,
  /// Bornes alignées sur `RecordDownloadsSchema` : un poste ne porte jamais 50
  /// médias, la borne est un garde-fou anti-abus, pas une limite produit.
  mediaIds: z.array(z.string()).min(1).max(50),
  surface: z.enum(DOWNLOAD_SURFACES).default('detail'),
});

/**
 * `dwell` REPREND `EngagementSessionSchema` au lieu de le redécrire.
 *
 * `POST /posts/engagement/batch` est la plus mûre des six portes — débit par
 * COMPTE, corps typé riche (dwell, watch, actions, échantillons) — et le
 * critère 1 demande de s'en inspirer, pas de la dégrader. L'extension n'ajoute
 * que le discriminant.
 */
const DwellEventSchema = EngagementSessionSchema.extend({
  type: z.literal('dwell'),
  eventId: EventEnvelopeFields.eventId,
  occurredAt: EventEnvelopeFields.occurredAt,
});

/**
 * `dwell-start` (#10764) : le premier contact d'une session — le MÊME corps
 * qu'un `dwell`, sous la même clé de session. La passerelle fusionne les deux
 * réceptions (`recordEngagementBatch`) et ne crédite que ce que chacune ajoute.
 */
const DwellStartEventSchema = DwellEventSchema.extend({ type: z.literal('dwell-start') });

export const SocialEventSchema = z.discriminatedUnion('type', [
  ViewEventSchema,
  OpenEventSchema,
  ImpressionEventSchema,
  DownloadEventSchema,
  DwellEventSchema,
  DwellStartEventSchema,
]);

export const SocialEventsBatchSchema = z.object({
  /**
   * PAS de `min(1)` : un lot VIDE est un succès à zéro enregistrement. Un
   * client qui n'a rien observé ne doit pas avoir à le vérifier avant
   * d'appeler — c'est le serveur qui sait répondre « rien à faire ».
   */
  events: z.array(SocialEventSchema).max(SOCIAL_EVENTS_BATCH_CAP).default([]),
});

export type SocialEvent = z.infer<typeof SocialEventSchema>;
export type SocialEventsBatch = z.infer<typeof SocialEventsBatchSchema>;
