/**
 * LE PARTAGE TEMPORAIRE DE POSITION À DES PERSONNES (#14109, #16980 ; spec cercles
 * § 1.3, § 1.5, § 4).
 *
 * Il s'ajoute au partage DANS UNE CONVERSATION (`location:live-*`, `LocationHandler`),
 * qui ne change pas. Ici l'audience est une liste de personnes choisies, et chacune
 * reçoit la position à la précision que l'émetteur lui a donnée :
 *
 * 1. `location:share-start` {@link SharedLocationStartPayload} : l'émetteur choisit ses
 *    destinataires, leur précision et la durée, et envoie sa position COMPLÈTE. Le
 *    serveur la garde, scellée au repos, jusqu'au terme ; démarrer de nouveau remplace
 *    le partage (un destinataire retiré n'en voit plus rien) ;
 * 2. `location:share-update` {@link SharedLocationUpdatePayload} : une nouvelle position ;
 * 3. chaque destinataire reçoit `location:share-changed` ({@link SharedLocationChangedEventData}),
 *    TRONQUÉ : la loi d'accès (`location.temporary`, dès Ami, sans blocage) ET le choix
 *    de l'émetteur. Une position floutée est posée au centre de sa maille, avec le rayon
 *    du flou ; la précision réelle de l'appareil ne part que pour `exact` ;
 * 4. `location:share-stop` → `location:share-ended` chez qui voyait le partage. Une
 *    baisse sous Ami, un blocage ou un retrait l'envoient aussi ; une remontée fait
 *    revenir la dernière position conservée, sans nouvel envoi ;
 * 5. le terme n'émet rien : chaque client cache le partage à `expiresAt` ;
 * 6. `GET /relations/locations` rattrape, à la connexion, les partages servis au lecteur.
 */
import { z } from 'zod';

import {
  SHARED_LOCATION_DURATIONS_MINUTES,
  SHARED_LOCATION_PRECISIONS,
  SHARED_LOCATION_RECIPIENTS_MAX,
  type SharedLocationCircle,
  type SharedLocationErrorCode,
  type SharedLocationPrecision,
} from './shared-location-constants.js';

export * from './shared-location-constants.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);

export const sharedLocationPositionSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().nonnegative().max(100_000).optional(),
  })
  .strict();
export type SharedLocationPosition = z.infer<typeof sharedLocationPositionSchema>;

export const sharedLocationStartPayloadSchema = z
  .object({
    recipients: z
      .array(z.object({ userId: objectId, precision: z.enum(SHARED_LOCATION_PRECISIONS).optional() }).strict())
      .min(1)
      .max(SHARED_LOCATION_RECIPIENTS_MAX)
      .refine((list) => new Set(list.map((r) => r.userId.toLowerCase())).size === list.length),
    durationMinutes: z.union([z.literal(SHARED_LOCATION_DURATIONS_MINUTES[0]), z.literal(SHARED_LOCATION_DURATIONS_MINUTES[1])]),
    position: sharedLocationPositionSchema,
  })
  .strict();
export type SharedLocationStartPayload = z.infer<typeof sharedLocationStartPayloadSchema>;

export const sharedLocationUpdatePayloadSchema = sharedLocationPositionSchema;
export type SharedLocationUpdatePayload = SharedLocationPosition;

export type SharedLocationAck =
  | { readonly success: true; readonly data: { readonly expiresAt: string } }
  | { readonly success: false; readonly error: string; readonly code: SharedLocationErrorCode };

export type SharedLocationStopAck =
  | { readonly success: true }
  | { readonly success: false; readonly error: string; readonly code: SharedLocationErrorCode };

/**
 * Ce qu'UN destinataire reçoit : la position à SA précision, le rayon de son flou et
 * le cercle d'où vient l'émetteur POUR LUI. Ni la position exacte d'un flou, ni la
 * précision réelle de l'appareil, ni les autres destinataires ne voyagent à côté.
 *
 * `circle` est ADDITIF (#17966) : le serveur le pose toujours, et il est redit quand
 * le cercle change, même à précision égale. Un client le lit comme optionnel (un
 * serveur antérieur ne le servait pas) et dessine alors un marqueur neutre.
 */
export type SharedLocationChangedEventData = {
  readonly userId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly precision: SharedLocationPrecision;
  readonly radiusMeters: number;
  readonly circle?: SharedLocationCircle;
  readonly updatedAt: string;
  readonly expiresAt: string;
};

export type SharedLocationEndedEventData = { readonly userId: string };

/** `GET /relations/locations` : les partages servis au lecteur, déjà tronqués. */
export type SharedLocationSnapshot = { readonly items: readonly SharedLocationChangedEventData[] };
