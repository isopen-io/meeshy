/**
 * LE CONTRAT D'API DU JEU MEESHY (#9378) — schémas Zod, types dérivés.
 *
 * Le bloc `game` s'AJOUTE à côté des champs actuels de `GET /me/engagement` :
 * un ancien client l'ignore, un ancien serveur ne le sert pas, et la garde de
 * frontière `isEngagementProgressPayload` accepte les deux. Les écritures
 * portent toutes un `requestId` (idempotence, même borne que la frappe : 8 à 64
 * caractères) ; rejouer une écriture rend son résultat, jamais une seconde
 * écriture.
 *
 * Les chaînes ouvertes (`templateKey`, `signal`, clés de guide) restent libres
 * à dessein : un gabarit ajouté au serveur avant la mise à jour d'un client ne
 * doit jamais casser l'écran. Les clés FERMÉES (palier, rang, forme de Flamme)
 * sont des énumérations : ce sont des clés stables que chaque client habille.
 *
 * Les routes et codes d'erreur vivent dans `game-routes.ts` (sans Zod).
 */

import { z } from 'zod';

import { LEVEL_TIER_KEYS } from '../utils/game/levels.js';
import { GLORY_RANKS, type GloryRankOrMythic } from '../utils/game/glory.js';
import { TREASURY_TIERS } from '../utils/game/treasury.js';
import { FLAME_FORMS } from '../utils/game/flame.js';
import { MISSION_DIFFICULTIES } from '../utils/game/missions.js';
import type { EngagementProgressPayload } from './engagement.js';
import { dayKey, enumOf, fraction, isoDate, nonNegativeInt, requestIdSchema, writeRequest } from './game-schema-kit.js';
import { gameBlockExtensionShape } from './game-v2.js';

export * from './game-routes.js';
export * from './game-v2.js';

export { requestIdSchema };

const rankKeys = enumOf<GloryRankOrMythic>([...GLORY_RANKS.map((r) => r.key), 'mythe']);
const tierKeys = enumOf(LEVEL_TIER_KEYS);
const treasuryKeys = enumOf(TREASURY_TIERS.map((t) => t.key));
const formKeys = enumOf(FLAME_FORMS.map((f) => f.key));

export const gameLevelSchema = z.object({
  level: z.number().int().min(1).max(100),
  tier: tierKeys,
  score: nonNegativeInt,
  floorScore: nonNegativeInt,
  nextThreshold: nonNegativeInt.nullable(),
  pointsToNext: nonNegativeInt,
  progress: fraction,
  /** Le plus haut niveau atteint — il règle le Vent arrière. */
  record: z.number().int().min(1).max(100),
  prestige: z.number().int().min(0).max(5),
  canPrestige: z.boolean(),
});

const gloryStepSchema = z.object({
  rank: rankKeys,
  division: z.union([z.literal(3), z.literal(2), z.literal(1)]),
  minGlory: nonNegativeInt,
});

export const gameGlorySchema = z.object({
  glory: nonNegativeInt,
  rank: rankKeys,
  /** `null` pour Mythe. */
  division: z.union([z.literal(3), z.literal(2), z.literal(1)]).nullable(),
  next: gloryStepSchema.nullable(),
  gloryMissing: nonNegativeInt.nullable(),
  progress: fraction,
});

export const gameTreasurySchema = z.object({
  held: nonNegativeInt,
  tier: treasuryKeys.nullable(),
  next: z.object({ key: treasuryKeys, minHeld: nonNegativeInt, missing: nonNegativeInt }).nullable(),
});

export const mintPreviewSchema = z.object({
  number: z.number().int().min(1),
  price: z.number().int().min(1),
  edition: z.enum(['silver', 'gold', 'prism']),
  canMint: z.boolean(),
  missingPoints: nonNegativeInt,
  levelBefore: z.number().int().min(1).max(100),
  levelAfter: z.number().int().min(1).max(100),
  levelsLost: nonNegativeInt,
  gloryGained: nonNegativeInt,
});

export const gameMissionSchema = z.object({
  id: z.string().min(1),
  templateKey: z.string().min(1),
  difficulty: z.enum(MISSION_DIFFICULTIES),
  signal: z.string().min(1),
  prism: z.boolean(),
  target: z.number().int().min(1),
  progress: nonNegativeInt,
  reward: nonNegativeInt,
  glory: nonNegativeInt,
  completedAt: isoDate.nullable(),
});

export const gameMissionsSchema = z.object({
  dayKey,
  prismDay: z.boolean(),
  /** Niveau 5 atteint. */
  unlocked: z.boolean(),
  items: z.array(gameMissionSchema).max(4),
  rerollAvailable: z.boolean(),
});

const chestRewardSchema = z.object({ points: nonNegativeInt, fragment: z.boolean(), freeze: z.boolean() });

export const gameChestSchema = z.object({
  status: z.enum(['locked', 'ready', 'claimed']),
  /** Contenu et probabilités, affichés AVANT l'ouverture. */
  odds: z.object({
    minPoints: nonNegativeInt,
    maxPoints: nonNegativeInt,
    fragment: fraction,
    freeze: fraction,
  }),
  /** Révélé une fois ouvert ; `null` avant. */
  reward: chestRewardSchema.nullable(),
});

export const gameFlameSchema = z.object({
  days: nonNegativeInt,
  form: formKeys.nullable(),
  bonusPercent: z.number().int().min(0).max(50),
  freezes: nonNegativeInt,
  maxFreezes: nonNegativeInt,
  freezePrice: nonNegativeInt,
  relightPrice: nonNegativeInt,
  status: z.enum(['none', 'lit', 'at-risk', 'covered', 'out']),
  canRelight: z.boolean(),
});

export const gameBoostsSchema = z.object({
  /** `1` ou `1,25`. */
  tailwind: z.number().min(1),
  prismHour: z.object({ startMinute: nonNegativeInt, endMinute: nonNegativeInt, multiplier: z.number().min(1) }).nullable(),
});

export const gameBlockSchema = z.object({
  level: gameLevelSchema,
  glory: gameGlorySchema,
  treasury: gameTreasurySchema,
  mint: mintPreviewSchema,
  missions: gameMissionsSchema,
  chest: gameChestSchema,
  flame: gameFlameSchema,
  boosts: gameBoostsSchema,
  /** Clés de guide déjà vues (moments et étapes d'intégration). */
  guideSeen: z.array(z.string().min(1).max(64)).max(200),
  /**
   * La vague 2 (ligues, duo, saison, trophées, Atlas, Prestige, visibilité) : chaque
   * extension est OPTIONNELLE et TOLÉRANTE — un serveur antérieur ne la sert pas, et une
   * extension que ce client ne sait pas lire tombe seule (`undefined`) sans emporter le bloc.
   */
  ...gameBlockExtensionShape,
});

export type GameLevel = z.infer<typeof gameLevelSchema>;
export type GameGlory = z.infer<typeof gameGlorySchema>;
export type GameTreasury = z.infer<typeof gameTreasurySchema>;
export type GameMintPreview = z.infer<typeof mintPreviewSchema>;
export type GameMission = z.infer<typeof gameMissionSchema>;
export type GameMissions = z.infer<typeof gameMissionsSchema>;
export type GameChest = z.infer<typeof gameChestSchema>;
export type GameChestReward = z.infer<typeof chestRewardSchema>;
export type GameFlame = z.infer<typeof gameFlameSchema>;
export type GameBoosts = z.infer<typeof gameBoostsSchema>;
export type GameBlock = z.infer<typeof gameBlockSchema>;

/** La charge de `GET /me/engagement` avec le bloc `game` À CÔTÉ des champs actuels. */
export type EngagementPayloadWithGame = EngagementProgressPayload & { readonly game?: GameBlock };

/** Le bloc `game`, ou `null` s'il est absent ou partiel — jamais à moitié lu. */
export const parseGameBlock = (value: unknown): GameBlock | null => {
  const parsed = gameBlockSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

export const missionRerollRequestSchema = writeRequest;
export const missionRerollResponseSchema = z.object({ mission: gameMissionSchema, balance: nonNegativeInt });

export const chestClaimRequestSchema = writeRequest;
export const chestClaimResponseSchema = z.object({
  status: z.enum(['claimed', 'already-claimed']),
  reward: chestRewardSchema,
  /** Le score en poche après le crédit. */
  score: nonNegativeInt,
});

export const flameFreezeRequestSchema = writeRequest;
export const flameFreezeResponseSchema = z.object({
  status: z.enum(['bought', 'already-bought']),
  freezes: nonNegativeInt,
  balance: nonNegativeInt,
});

export const flameRelightRequestSchema = writeRequest;
export const flameRelightResponseSchema = z.object({
  status: z.enum(['relit', 'already-relit']),
  streak: nonNegativeInt,
  balance: nonNegativeInt,
});

export const guideSeenRequestSchema = writeRequest.extend({
  keys: z.array(z.string().min(1).max(64)).min(1).max(32),
});
export const guideSeenResponseSchema = z.object({ guideSeen: z.array(z.string().min(1).max(64)).max(200) });

/**
 * La réponse de `POST /me/meesh/mint`, ÉTENDUE : `status`, `balance` et
 * `mintedLifetime` sont l'ancienne forme, que les anciens clients lisent
 * toujours ; les champs ajoutés sont optionnels côté lecture (un serveur
 * antérieur ne les sert pas) et toujours servis par le nouveau.
 */
export const meeshMintResponseSchema = z.object({
  status: z.enum(['minted', 'already-minted']),
  balance: nonNegativeInt,
  mintedLifetime: nonNegativeInt,
  /** Le numéro gravé sur la pièce. */
  number: z.number().int().min(1).optional(),
  edition: z.enum(['silver', 'gold', 'prism']).optional(),
  price: z.number().int().min(1).optional(),
  gloryGained: nonNegativeInt.optional(),
  levelBefore: z.number().int().min(1).max(100).optional(),
  levelAfter: z.number().int().min(1).max(100).optional(),
});

export type MissionRerollRequest = z.infer<typeof missionRerollRequestSchema>;
export type MissionRerollResponse = z.infer<typeof missionRerollResponseSchema>;
export type ChestClaimRequest = z.infer<typeof chestClaimRequestSchema>;
export type ChestClaimResponse = z.infer<typeof chestClaimResponseSchema>;
export type FlameFreezeRequest = z.infer<typeof flameFreezeRequestSchema>;
export type FlameFreezeResponse = z.infer<typeof flameFreezeResponseSchema>;
export type FlameRelightRequest = z.infer<typeof flameRelightRequestSchema>;
export type FlameRelightResponse = z.infer<typeof flameRelightResponseSchema>;
export type GuideSeenRequest = z.infer<typeof guideSeenRequestSchema>;
export type GuideSeenResponse = z.infer<typeof guideSeenResponseSchema>;
export type MeeshMintResponse = z.infer<typeof meeshMintResponseSchema>;
