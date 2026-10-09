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

import { LEGACY_LEVEL_MAX, LEGACY_LEVEL_TIER_KEYS, LEVEL_TIER_KEYS } from '../utils/game/levels.js';
import { GLORY_RANKS, type GloryRankOrMythic } from '../utils/game/glory.js';
import { TREASURY_TIERS } from '../utils/game/treasury.js';
import { LEVEL_STEP_KINDS } from '../utils/game/level-steps.js';
import { FLAME_FORMS } from '../utils/game/flame.js';
import { MISSION_DIFFICULTIES } from '../utils/game/missions.js';
import { PERSONAL_MISSION_STATES } from '../utils/game/personal-mission.js';
import type { EngagementProgressPayload } from './engagement.js';
import {
  dayKey,
  division5Schema,
  enumOf,
  fraction,
  isoDate,
  legacyDivisionSchema,
  mythicSeatSchema,
  nonNegativeInt,
  requestIdSchema,
  writeRequest,
} from './game-schema-kit.js';
import { gameBlockExtensionShape } from './game-v2.js';

export * from './game-routes.js';
export * from './game-v2.js';

export { requestIdSchema };

const rankKeys = enumOf<GloryRankOrMythic>([...GLORY_RANKS.map((r) => r.key), 'mythe']);
const tierKeys = enumOf(LEVEL_TIER_KEYS);
const legacyTierKeys = enumOf(LEGACY_LEVEL_TIER_KEYS);
/** Un niveau des champs d'HIER : borné à 100, la seule forme que les clients publiés décodent (#9688). */
const legacyLevel = z.number().int().min(1).max(LEGACY_LEVEL_MAX);
const level = z.number().int().min(1);
const treasuryKeys = enumOf(TREASURY_TIERS.map((t) => t.key));
const formKeys = enumOf(FLAME_FORMS.map((f) => f.key));

/** Une étape des niveaux (#9706) : ce qu'elle demande, où en est le compte, et si elle est faite. */
export const gameLevelStepSchema = z.object({
  level,
  kind: z.enum(LEVEL_STEP_KINDS),
  /** Meeshes, missions, jours de Flamme — ou, pour un rang, la Gloire où il commence. */
  target: nonNegativeInt,
  current: nonNegativeInt,
  met: z.boolean(),
  /** Le rang demandé, `null` hors des étapes de rang. */
  rank: enumOf(GLORY_RANKS.map((r) => r.key)).nullable(),
});

/**
 * LA LECTURE DES NIVEAUX OUVERTS PAR LE RANG (#9688) — la vérité que lisent les clients à jour.
 * Les champs voisins de `gameLevelSchema` restent sous l'ANCIENNE loi (niveau borné à 100, dix
 * paliers) pour les clients publiés, qui les décodent strictement.
 */
export const gameLevelLadderSchema = z.object({
  level,
  tier: tierKeys,
  floorScore: nonNegativeInt,
  /** `null` au plafond que le rang ouvre. */
  nextThreshold: nonNegativeInt.nullable(),
  pointsToNext: nonNegativeInt,
  progress: fraction,
  record: level,
  /** Le plafond que le rang ouvre : 499 sous Ambassadeur, 1000 pour Ambassadeur et Orateur, `null` à partir d'Oracle. */
  cap: level.nullable(),
  /** Le niveau est au plafond : il monte dès que le rang l'ouvre, sans rien regagner. */
  isMax: z.boolean(),
  /** Les points sont là, une étape manque : le niveau attend au palier précédent (#9706). Absent devant un serveur antérieur. */
  held: z.boolean().optional(),
  /** La prochaine étape au-dessus du niveau, faite ou à faire — `null` au-delà de 100 (#9706). */
  step: gameLevelStepSchema.nullable().optional(),
  /** Les compteurs que jugent les étapes, pour que l'optimiste rejoue la loi (#9706). */
  steps: z.object({ minted: nonNegativeInt, missionsDone: nonNegativeInt, flameRecord: nonNegativeInt }).nullable().optional(),
});

export const gameLevelSchema = z.object({
  /** Ancienne loi : borné à 100 — la vraie valeur est `ladder.level`. */
  level: legacyLevel,
  /** Ancienne loi : l'un des dix premiers paliers — le vrai palier est `ladder.tier`. */
  tier: legacyTierKeys,
  score: nonNegativeInt,
  floorScore: nonNegativeInt,
  nextThreshold: nonNegativeInt.nullable(),
  pointsToNext: nonNegativeInt,
  progress: fraction,
  /** Le plus haut niveau atteint — il règle le Vent arrière. Ancienne loi : borné à 100. */
  record: legacyLevel,
  prestige: z.number().int().min(0).max(5),
  canPrestige: z.boolean(),
  /** La lecture à jour (#9688) — absente devant un serveur antérieur. */
  ladder: gameLevelLadderSchema.optional(),
});

const gloryStepSchema = z.object({
  rank: rankKeys,
  /** Projection héritée (III, II, I) — la seule que les clients publiés décodent. */
  division: legacyDivisionSchema,
  /** V (5) à I (1) — #9636. */
  division5: division5Schema.optional(),
  minGlory: nonNegativeInt,
});

export const gameGlorySchema = z.object({
  glory: nonNegativeInt,
  rank: rankKeys,
  /** Projection héritée (III, II, I), `null` pour Mythe. */
  division: legacyDivisionSchema.nullable(),
  /** V (5) à I (1), `null` pour Mythe — #9636. */
  division5: division5Schema.nullable().optional(),
  next: gloryStepSchema.nullable(),
  gloryMissing: nonNegativeInt.nullable(),
  progress: fraction,
  /** La place du Mythe et son numéro, `null` hors du Mythe — #9636. */
  mythic: mythicSeatSchema.nullable().optional(),
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
  /** Ancienne loi : borné à 100 — la vraie valeur est dans `ladder`. */
  levelBefore: legacyLevel,
  levelAfter: legacyLevel,
  levelsLost: nonNegativeInt,
  gloryGained: nonNegativeInt,
  /** Les niveaux ouverts par le rang (#9688) — absents devant un serveur antérieur. */
  ladder: z.object({ levelBefore: level, levelAfter: level, levelsLost: nonNegativeInt }).optional(),
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

/**
 * La mission PERSONNELLE du jour (#9539) : une mission de plus, avec sa plage (`startsAt`, `endsAt`) et son
 * état — à venir, en cours, réussie, manquée. Servie à CÔTÉ des trois missions du jour (`missions.personal`),
 * jamais dans `items` : un ancien client lit exactement ce qu'il lisait.
 */
export const gamePersonalMissionSchema = gameMissionSchema.extend({
  startsAt: isoDate,
  endsAt: isoDate,
  state: z.enum(PERSONAL_MISSION_STATES),
});

export const gameMissionsSchema = z.object({
  dayKey,
  prismDay: z.boolean(),
  /** Niveau 5 atteint. */
  unlocked: z.boolean(),
  items: z.array(gameMissionSchema).max(4),
  rerollAvailable: z.boolean(),
  /** Tolérante : une mission personnelle illisible tombe seule, sans emporter le bloc. */
  personal: gamePersonalMissionSchema.nullable().optional().catch(undefined),
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
export type GameLevelLadder = z.infer<typeof gameLevelLadderSchema>;
export type GameLevelStep = z.infer<typeof gameLevelStepSchema>;
export type GameGlory = z.infer<typeof gameGlorySchema>;
export type GameTreasury = z.infer<typeof gameTreasurySchema>;
export type GameMintPreview = z.infer<typeof mintPreviewSchema>;
export type GameMission = z.infer<typeof gameMissionSchema>;
export type GamePersonalMission = z.infer<typeof gamePersonalMissionSchema>;
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
  levelBefore: legacyLevel.optional(),
  levelAfter: legacyLevel.optional(),
  /** Les niveaux ouverts par le rang (#9688) : les deux champs voisins restent bornés à 100. */
  ladder: z.object({ levelBefore: level, levelAfter: level }).optional(),
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
