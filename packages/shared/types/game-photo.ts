/**
 * LES RÉGLAGES ET LE REGISTRE DES MOMENTS PHOTO (#10162, L10a — chantier « Cadres de gloire »,
 * `docs/product/cadres-de-gloire/PROMPT-developpement.md` § 5.12, § 5.16.2).
 *
 * Trois préférences de COMPTE, pour qu'une alerte reçue sur un autre appareil montre le bon décor :
 *  - l'atmosphère des cadres (`null` = pas encore choisie ; liste FERMÉE `GLORY_ATMOSPHERES`) ;
 *  - « Me proposer d'immortaliser » (chaque étape — le défaut —, les grands moments, jamais) ;
 *  - la ligne de base des alertes (date et situation `PhotoCatchUpStanding` à cette date).
 *
 * Et un registre DURABLE, une ligne par (compte, étape) : quand l'étape a été détectée, présentée,
 * notifiée, immortalisée (`keptAt`, D22 b — #10182 : la photo reste sur l'appareil, seul l'identifiant
 * d'étape voyage, pour que les autres appareils la sortent de « À rattraper »). Lu par l'extension
 * `game.photo` du bloc `game` (`GET /me/engagement`), bornée aux
 * `PHOTO_MOMENTS_SERVED_MAX` lignes les plus récentes ; un client qui ne sait pas la lire la perd
 * SEULE (`.optional().catch(undefined)` dans `gameBlockExtensionShape`).
 *
 * Les adresses vivent dans `game-routes.ts` (`GAME_PHOTO_ROUTES`).
 */

import { z } from 'zod';

import { GLORY_ATMOSPHERES } from './glory-atmospheres.js';
import { TREASURY_TIERS } from '../utils/game/treasury.js';
import { PHOTO_INVITATIONS, PHOTO_KEPT_MAX, PHOTO_MOMENTS_SERVED_MAX, PHOTO_PRESENTED_MAX, PHOTO_STEP_ID_PATTERN } from './game-photo-settings.js';
import { enumOf, isoDate, nonNegativeInt, writeRequest } from './game-schema-kit.js';

/** Les constantes vivent SANS schéma dans `game-photo-settings.ts` (les clients en `zod/mini` les lisent sans ce module) ; ré-exportées ici telles quelles. */
export {
  DEFAULT_PHOTO_INVITATIONS,
  PHOTO_INVITATIONS,
  PHOTO_KEPT_MAX,
  PHOTO_MOMENTS_SERVED_MAX,
  PHOTO_PRESENTED_MAX,
  PHOTO_STEP_ID_PATTERN,
  isPhotoInvitations,
  type PhotoInvitations,
} from './game-photo-settings.js';

const stepIdSchema = z.string().regex(new RegExp(PHOTO_STEP_ID_PATTERN));

const treasuryTierKeys = enumOf(TREASURY_TIERS.map((tier) => tier.key));
const atmosphereKeys = enumOf(GLORY_ATMOSPHERES);

/** La situation `PhotoCatchUpStanding` gardée à la ligne de base : les étapes passées s'en déduisent. */
export const photoCatchUpStandingSchema = z.object({
  rank: z.string().min(1),
  division: z.number().int().min(1).max(5).nullable(),
  levelRecord: nonNegativeInt,
  prestige: nonNegativeInt,
  minted: nonNegativeInt,
  treasuryTier: treasuryTierKeys.nullable(),
  flameRecord: nonNegativeInt,
  /** Le record de chaque cycle clos par un Prestige (#10911) — absent d'une ligne de base d'avant. */
  pastCycleRecords: z.array(nonNegativeInt).optional(),
});

export const gamePhotoMomentSchema = z.object({
  stepId: stepIdSchema,
  detectedAt: isoDate.nullable(),
  presentedAt: isoDate.nullable(),
  notifiedAt: isoDate.nullable(),
  /** Immortalisée sur un appareil (D22 b) ; absent d'un serveur d'avant le signal ⇒ `null`. */
  keptAt: isoDate.nullable().default(null),
});

export const gamePhotoBlockSchema = z.object({
  atmosphere: atmosphereKeys.nullable(),
  invitations: enumOf(PHOTO_INVITATIONS),
  baselineAt: isoDate.nullable(),
  /** Une ligne de base illisible se lit « aucune » : elle n'emporte pas le reste du bloc. */
  baseline: photoCatchUpStandingSchema.nullable().catch(null),
  /** Le plus haut palier du trésor jamais atteint (D14) ; `null` sans Meesh gardée. */
  treasuryPeakTier: treasuryTierKeys.nullable().catch(null),
  moments: z.array(gamePhotoMomentSchema).max(PHOTO_MOMENTS_SERVED_MAX),
});

export type GamePhotoBlock = z.infer<typeof gamePhotoBlockSchema>;
export type GamePhotoMoment = z.infer<typeof gamePhotoMomentSchema>;
export type PhotoCatchUpStandingPayload = z.infer<typeof photoCatchUpStandingSchema>;

// --- Les écritures (`GAME_PHOTO_ROUTES`) ---

export const frameAtmosphereRequestSchema = writeRequest.extend({ atmosphere: atmosphereKeys });
/** `packInstalled` : le pack de l'atmosphère est installé ; `false` tant que le registre ne le connaît pas. */
export const frameAtmosphereResponseSchema = z.object({ atmosphere: atmosphereKeys, packInstalled: z.boolean() });

export const photoInvitationsRequestSchema = writeRequest.extend({ invitations: enumOf(PHOTO_INVITATIONS) });
export const photoInvitationsResponseSchema = z.object({ invitations: enumOf(PHOTO_INVITATIONS) });

export const photoMomentsPresentedRequestSchema = writeRequest.extend({
  stepIds: z.array(stepIdSchema).min(1).max(PHOTO_PRESENTED_MAX),
});
/** Les étapes accusées, chacune avec la date de sa PREMIÈRE présentation (un rejeu ne la déplace pas). */
export const photoMomentsPresentedResponseSchema = z.object({
  presented: z.array(z.object({ stepId: stepIdSchema, presentedAt: isoDate })),
});

/**
 * Le signal « immortalisée » (D22 b, #10182) : des identifiants d'étape, RIEN d'autre — ni image, ni date de prise,
 * ni recette (`.strict()` : une clé de plus est refusée, pas ignorée). Une étape immortalisée vaut présentée.
 */
export const photoMomentsKeptRequestSchema = writeRequest
  .extend({ stepIds: z.array(stepIdSchema).min(1).max(PHOTO_KEPT_MAX) })
  .strict();
/** Les étapes gardées, chacune avec la date de sa PREMIÈRE immortalisation (un rejeu ne la déplace pas). */
export const photoMomentsKeptResponseSchema = z.object({
  kept: z.array(z.object({ stepId: stepIdSchema, keptAt: isoDate })),
});
