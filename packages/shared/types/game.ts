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
export * from './game-photo.js';

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
  /** Le niveau max à vie (#10846) : il survit au prestige. Absent devant un serveur antérieur. */
  levelMaxLifetime: level.optional(),
  /**
   * Le record de niveau de chaque cycle CLOS par un Prestige, le plus ancien d'abord (#10911) : il dit combien de fois
   * un niveau a été atteint, tous cycles confondus. Absent devant un serveur antérieur ; plus court que `prestige` pour
   * un compte passé en Prestige avant qu'on le garde (chaque cycle manquant a atteint au moins le niveau 100).
   */
  pastCycleRecords: z.array(level).max(5).optional(),
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
  /** Le plus haut niveau du CYCLE (il règle l'ancien Vent arrière, éteint avec les étincelles). Ancienne loi : borné à 100. */
  record: legacyLevel,
  prestige: z.number().int().min(0).max(5),
  canPrestige: z.boolean(),
  /** La lecture à jour (#9688) — absente devant un serveur antérieur. */
  ladder: gameLevelLadderSchema.optional(),
  /**
   * LES ÉTINCELLES (#10846) — absentes devant un serveur antérieur. Des NOMBRES JSON entiers (jamais une chaîne ni
   * un BigInt) : la colonne est un `long`, le fil sature à 2^53 − 1. `score` ci-dessus lit désormais le CYCLE, la
   * base du niveau : la frappe ne le fait plus baisser.
   */
  /** La poche : ce que la frappe dépense (`User.engagementScore`). */
  sparks: nonNegativeInt.optional(),
  /** Accumulées depuis le dernier prestige — la base du niveau. */
  sparksCycle: nonNegativeInt.optional(),
  /** Accumulées à vie : ne baisse ni à la frappe ni au prestige (seule la reprise d'un contenu retiré la réduit). */
  sparksLifetime: nonNegativeInt.optional(),
  /** La dette d'étincelles (reprise d'un contenu supprimé non prélevable sur une poche dépensée) : déduite des prochains gains, bloque la frappe. */
  sparksDebt: nonNegativeInt.optional(),
  /** Le niveau max à vie, sans la borne de 100 des champs d'hier : le même nombre que `ladder.levelMaxLifetime`. */
  levelMaxLifetime: level.optional(),
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

/** Le rang de Gloire qu'une réserve exige (#10848) : la division héritée (1–3) ET la division à cinq crans. */
export const treasuryRankRequirementSchema = z.object({
  rank: enumOf(GLORY_RANKS.map((r) => r.key)),
  division: legacyDivisionSchema,
  division5: division5Schema,
});

/** L'état d'une réserve du trésor pour CE compte : fermée ou ouverte par son rang. */
export const treasuryReserveAccessSchema = z.object({
  key: treasuryKeys,
  minHeld: nonNegativeInt,
  locked: z.boolean(),
  /** `null` : ouverte à tous (la Bourse). */
  requires: treasuryRankRequirementSchema.nullable(),
});

export const gameTreasurySchema = z.object({
  held: nonNegativeInt,
  tier: treasuryKeys.nullable(),
  next: z.object({ key: treasuryKeys, minHeld: nonNegativeInt, missing: nonNegativeInt }).nullable(),
  /** Pour chaque réserve, son état et le rang requis (#10848) — absent devant un serveur antérieur. */
  access: z.array(treasuryReserveAccessSchema).optional(),
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
  /**
   * LE COÛT SELON LE NIVEAU ACTUEL (#10847) — absents devant un serveur antérieur. `price` est le coût EFFECTIF :
   * `basePrice` (le prix de rang de la pièce) × `costFactor` (0,5 au niveau 0, 1 dès le niveau 100). Le serveur
   * recalcule toujours le prix. `levelsLost` vaut désormais toujours 0 : la frappe ne fait plus baisser le niveau.
   */
  basePrice: z.number().int().min(1).optional(),
  costFactor: z.number().min(0).max(1).optional(),
  /** Le niveau ACTUEL dont le facteur est lu. */
  costLevel: level.optional(),
  /** Ce qui bloque la frappe hors prix et rang : `debt` tant qu'une dette d'étincelles existe (409 `MINT_BLOCKED_BY_DEBT`). */
  blockedBy: z.enum(['debt']).nullable().optional(),
  sparksDebt: nonNegativeInt.optional(),
  /** La réserve du trésor que le rang n'ouvre pas et qui barre cette pièce (#10848) — `null` : libre. */
  locked: z
    .object({ tier: treasuryKeys, minHeld: nonNegativeInt, requires: treasuryRankRequirementSchema })
    .nullable()
    .optional(),
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

/**
 * Le contenu du coffre (#9373, #10011). `points` (le TOTAL crédité, prime comprise), `fragment` (UN fragment
 * d'étoile, une chance sur six) et `freeze` sont ceux que lisent les clients d'avant #10011 ; la Gloire et la
 * prime S'AJOUTENT, optionnelles à la lecture : un coffre ouvert avant elles n'en porte pas.
 */
const chestRewardSchema = z.object({
  points: nonNegativeInt,
  fragment: z.boolean(),
  freeze: z.boolean(),
  glory: nonNegativeInt.optional(),
  /** La prime tombée, en points au cours de la Meesh du compte — déjà comprise dans `points`. */
  bonus: z.enum(['none', 'fifth', 'whole']).optional().catch(undefined),
  bonusPoints: nonNegativeInt.optional().catch(undefined),
});

/** Le contenu CERTAIN du coffre du jour et ses deux primes possibles, en points, dits avant l'ouverture. */
const chestContentSchema = z.object({
  points: nonNegativeInt,
  glory: nonNegativeInt,
  bonusWhole: nonNegativeInt.optional(),
  bonusFifth: nonNegativeInt.optional(),
});

/** Les fragments d'étoile collectés à vie, toutes sources confondues — le serveur seul les compte. */
const starFragmentsSchema = z.object({ collected: nonNegativeInt });

export const gameChestSchema = z.object({
  status: z.enum(['locked', 'ready', 'claimed']),
  /** Contenu et probabilités, affichés AVANT l'ouverture. Les bornes de Gloire et la prime s'ajoutent (#10011). */
  odds: z.object({
    minPoints: nonNegativeInt,
    maxPoints: nonNegativeInt,
    /** UN fragment d'étoile. */
    fragment: fraction,
    freeze: fraction,
    minGlory: nonNegativeInt.optional(),
    maxGlory: nonNegativeInt.optional(),
    /** La prime entière (le prix de la prochaine Meesh, en points), puis — sinon — celle d'un cinquième. */
    bonusWhole: fraction.optional(),
    bonusFifth: fraction.optional(),
  }),
  /** Révélé une fois ouvert ; `null` avant. */
  reward: chestRewardSchema.nullable(),
  /** Tolérant : un contenu du jour illisible tombe seul, sans emporter le bloc. Absent devant un serveur antérieur. */
  today: chestContentSchema.nullable().optional().catch(undefined),
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
  /** Les fragments d'étoile collectés (#10011). Tolérant : absent devant un serveur antérieur, illisible il tombe seul. */
  starFragments: starFragmentsSchema.optional().catch(undefined),
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
export type GameChestContent = z.infer<typeof chestContentSchema>;
export type GameStarFragments = z.infer<typeof starFragmentsSchema>;
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
  /** Les fragments d'étoile collectés après l'ouverture (#10011) — absent devant un serveur antérieur. */
  starFragments: starFragmentsSchema.optional(),
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
  /** Le prix débité, en points : une frappe se paie toujours en points (#10011). */
  price: nonNegativeInt.optional(),
  gloryGained: nonNegativeInt.optional(),
  levelBefore: legacyLevel.optional(),
  levelAfter: legacyLevel.optional(),
  /** Les niveaux ouverts par le rang (#9688) : les deux champs voisins restent bornés à 100. */
  ladder: z.object({ levelBefore: level, levelAfter: level }).optional(),
  /** Le prix de rang de la pièce, avant le facteur du niveau actuel (#10847) — absent d'un serveur antérieur. */
  basePrice: z.number().int().min(1).optional(),
  /** Le facteur du niveau actuel appliqué, de 0,5 à 1 (#10847). */
  costFactor: z.number().min(0).max(1).optional(),
  /** Le marqueur d'ordre de l'état servi (#10900, `game-sync.ts`) — absent d'un serveur antérieur. */
  gameRevision: nonNegativeInt.optional(),
});

/**
 * Le refus `409 PRICE_CHANGED` de la frappe (#10903) : le prix rejugé dépasse la garde `maxPrice` que l'écran a envoyée.
 * Le prix COURANT part à la racine, à côté de `code`, pour que l'écran le montre et redemande la confirmation.
 */
export const priceChangedResponseSchema = z.object({
  code: z.literal('PRICE_CHANGED'),
  number: z.number().int().min(1),
  price: z.number().int().min(1),
  basePrice: z.number().int().min(1),
  costFactor: z.number().min(0).max(1),
});

/**
 * Le refus `409 TREASURY_LOCKED` de la frappe (#10848) : la réserve du trésor que le rang n'ouvre pas encore. Les champs
 * partent à la RACINE de la réponse, à côté de `code`.
 */
export const treasuryLockedResponseSchema = z.object({
  code: z.literal('TREASURY_LOCKED'),
  tier: treasuryKeys,
  minHeld: nonNegativeInt,
  requires: treasuryRankRequirementSchema,
});

/**
 * Le corps de `POST /me/meesh/mint`. Une frappe ne se paie QU'EN POINTS (porteur, 2026-10-10, #10011) : `payWith`
 * n'admet que `points` — un client qui demanderait un autre moyen est refusé à la lecture, sans aucune écriture.
 */
export const meeshMintRequestSchema = writeRequest.extend({
  payWith: z.literal('points').optional(),
  /**
   * La garde de prix (#10903) : le prix que l'écran a montré. Au-delà, la frappe est refusée en `409 PRICE_CHANGED`
   * avec le prix courant (`priceChangedResponseSchema`), sans rien débiter. Absente : la frappe se comporte comme avant.
   */
  maxPrice: z.number().int().min(1).optional(),
});
export type MeeshMintRequest = z.infer<typeof meeshMintRequestSchema>;

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
