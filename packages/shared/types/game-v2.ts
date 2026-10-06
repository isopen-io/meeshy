/**
 * LE CONTRAT D'API DE LA VAGUE 2 DU JEU MEESHY (#9384 à #9392) — ligues, duo,
 * saison, trophées, Atlas, Prestige, visibilité.
 *
 * Le bloc `game` de `GET /me/engagement` reçoit SEPT champs de plus
 * (`gameBlockExtensionShape`), tous OPTIONNELS à la lecture et tous TOLÉRANTS :
 * un serveur antérieur ne les sert pas, et une extension que ce client ne sait
 * pas lire tombe SEULE (`undefined`) — elle n'emporte pas le bloc entier, que
 * `parseGameBlock` rendrait sinon `null`. Un ancien client, lui, ignore les
 * clés qu'il ne connaît pas (Zod retire l'inconnu).
 *
 * Les écritures portent toutes un `requestId` (idempotence, 8 à 64 caractères) ;
 * rejouer une écriture rend son résultat, jamais une seconde écriture. Les
 * routes et les codes d'erreur vivent dans `game-routes.ts`.
 *
 * **Confidentialité par construction.** La ligue PUBLIQUE ne sert aucun
 * identifiant de joueur : un pseudonyme, un rang, le total de la semaine — rien
 * d'une heure d'activité (loi de présence). La ligue AMIS, restreinte aux amis
 * acceptés, sert des identifiants : ils se connaissent déjà.
 */

import { z } from 'zod';

import { DUO_STATUSES } from '../utils/game/duo.js';
import { FLAME_FORMS } from '../utils/game/flame.js';
import { ACHIEVEMENT_RARITIES, GLORY_RANKS } from '../utils/game/glory.js';
import { LEVEL_TIER_KEYS } from '../utils/game/levels.js';
import { TREASURY_TIERS } from '../utils/game/treasury.js';
import { LEAGUE_KEYS, isValidLeaguePseudonym } from '../utils/game/league.js';
import { SEASON_STEPS } from '../utils/game/season.js';
import { SHOWCASE_VISIBILITIES } from '../utils/game/trophies.js';
import { dayKey, enumOf, fraction, isoDate, nonNegativeInt, writeRequest } from './game-schema-kit.js';

const leagueKeys = enumOf(LEAGUE_KEYS);
const cupKeys = z.enum(['gold', 'silver', 'bronze']);
const zoneKeys = z.enum(['promotion', 'safe', 'relegation']);
const showcaseVisibilityKeys = enumOf(SHOWCASE_VISIBILITIES);
const rank = z.number().int().min(1);
const trophyKeySchema = z.string().min(1).max(96);
const missionSignal = z.string().min(1);

export const leaguePseudonymSchema = z.string().refine(isValidLeaguePseudonym, { message: 'invalid league pseudonym' });

// --- Le bloc `game` : sept extensions ---

export const gameLeagueBlockSchema = z.object({
  /** Niveau record de 10 atteint. */
  unlocked: z.boolean(),
  access: z.enum(['locked', 'minor', 'consent-required', 'open']),
  /** Le pseudonyme que les autres voient ; `null` tant que le joueur n'est pas dans la ligue publique. */
  pseudonym: z.string().nullable(),
  weekKey: dayKey,
  /** Dimanche 20 h, heure locale. */
  closes: z.object({ dayKey, minuteOfDay: nonNegativeInt }),
  /** `null` : pas (encore) placé dans un groupe de la ligue publique. */
  current: z
    .object({
      league: leagueKeys,
      groupId: z.string().min(1),
      groupSize: z.number().int().min(1).max(30),
      rank,
      weekPoints: nonNegativeInt,
      zone: zoneKeys,
      cup: cupKeys.nullable(),
      /** `0` dans la zone de montée, `null` au sommet. */
      pointsToPromotion: nonNegativeInt.nullable(),
    })
    .nullable(),
  /** La ligue Amis, toujours disponible. */
  friends: z.object({ rank, size: z.number().int().min(1), weekPoints: nonNegativeInt }),
});

export const gameDuoBlockSchema = z.object({
  /** Niveau record de 20 atteint. */
  unlocked: z.boolean(),
  status: z.enum(['none', ...DUO_STATUSES]),
  duoId: z.string().min(1).nullable(),
  weekKey: dayKey,
  role: z.enum(['inviter', 'invitee']).nullable(),
  partner: z.object({ userId: z.string().min(1), displayName: z.string() }).nullable(),
  mission: z
    .object({
      templateKey: z.string().min(1),
      signal: missionSignal,
      prism: z.boolean(),
      /** Ce que CHACUN doit faire. */
      partTarget: z.number().int().min(1),
      commonTarget: z.number().int().min(2),
    })
    .nullable(),
  progress: z
    .object({
      mine: nonNegativeInt,
      partner: nonNegativeInt,
      common: nonNegativeInt,
      mineDone: z.boolean(),
      partnerDone: z.boolean(),
      bothDone: z.boolean(),
    })
    .nullable(),
  /** Ce que MA part vaut au total : doublé quand les deux ont fini. */
  reward: z.object({ points: nonNegativeInt, doubled: z.boolean() }).nullable(),
});

const seasonRewardSchema = z.object({
  kind: z.enum(['points', 'fragment', 'freeze', 'season-cup']),
  amount: z.number().int().min(1),
});

export const gameSeasonBlockSchema = z.object({
  number: z.number().int().min(1),
  /** Ouverte : le catalogue des thèmes est une donnée de produit, il grandit sans casser un client. */
  themeKey: z.string().min(1),
  startDay: dayKey,
  endDay: dayKey,
  /** De 1 à 8. */
  week: z.number().int().min(1).max(8),
  stars: nonNegativeInt,
  steps: z.number().int().min(0).max(SEASON_STEPS),
  stepsTotal: z.number().int().min(1),
  starsToNext: nonNegativeInt,
  progress: fraction,
  completed: z.boolean(),
  /** Les étapes déjà réclamées. */
  claimedSteps: z.array(z.number().int().min(1).max(SEASON_STEPS)).max(SEASON_STEPS),
  /** La prochaine récompense gratuite à réclamer, `null` quand tout est réclamé. */
  nextReward: z.object({ step: z.number().int().min(1).max(SEASON_STEPS), reward: seasonRewardSchema }).nullable(),
  sealOwned: z.boolean(),
  sealPrice: nonNegativeInt,
});

export const gameTrophyItemSchema = z.object({ key: trophyKeySchema, awardedAt: isoDate });

export const gameTrophiesBlockSchema = z.object({
  items: z.array(gameTrophyItemSchema).max(500),
  /** La vitrine, dans l'ordre : les clés RANGÉES d'abord, puis le reste du plus précieux au moins précieux. */
  order: z.array(trophyKeySchema).max(500),
});

export const gameAtlasBlockSchema = z.object({
  stamped: nonNegativeInt,
  total: z.number().int().min(1),
  stamps: z.array(z.object({ language: z.string().min(2).max(8), stampedOn: dayKey })).max(400),
  pending: z.array(z.object({ language: z.string().min(2).max(8), sent: z.boolean(), received: z.boolean() })).max(400),
});

export const gamePrestigeBlockSchema = z.object({
  /** Les étoiles posées, de 0 à 5. */
  stars: z.number().int().min(0).max(5),
  max: z.number().int().min(1),
  canPrestige: z.boolean(),
  gloryOnPass: nonNegativeInt,
});

export const gameVisibilitySchema = z.object({
  showcase: showcaseVisibilityKeys,
  rank: showcaseVisibilityKeys,
  treasury: showcaseVisibilityKeys,
  /** Privé par défaut (`ATLAS_DEFAULT_VISIBILITY`) : une langue peut révéler une origine ou une conviction. */
  atlas: showcaseVisibilityKeys,
});

/**
 * La rareté MESURÉE de chaque succès (#9489, #9390) : `milestoneKey` → `{ rarity, holders,
 * population }`. FAIL-CLOSED côté serveur : un succès sous `RARITY_MIN_DISPLAY_HOLDERS`
 * titulaires (ou sous `RARITY_MIN_POPULATION` comptes) est ABSENT de la carte — jamais servi
 * avec une rareté nulle. Le client ne compte rien : il lit cette carte, et un succès absent
 * dit « rareté en cours de mesure ».
 */
export const gameAchievementRarityEntrySchema = z.object({
  rarity: enumOf(ACHIEVEMENT_RARITIES),
  holders: nonNegativeInt,
  population: nonNegativeInt,
});
export const gameAchievementRaritiesSchema = z.record(z.string().min(1).max(96), gameAchievementRarityEntrySchema);

/**
 * Les extensions du bloc `game` : les sept de la vague 2 et la carte des raretés.
 * Chacune est optionnelle ET tolérante : `optional().catch(undefined)` — une
 * extension illisible tombe seule.
 */
export const gameBlockExtensionShape = {
  league: gameLeagueBlockSchema.optional().catch(undefined),
  duo: gameDuoBlockSchema.optional().catch(undefined),
  season: gameSeasonBlockSchema.nullable().optional().catch(undefined),
  trophies: gameTrophiesBlockSchema.optional().catch(undefined),
  atlas: gameAtlasBlockSchema.optional().catch(undefined),
  prestige: gamePrestigeBlockSchema.optional().catch(undefined),
  visibility: gameVisibilitySchema.optional().catch(undefined),
  achievementRarities: gameAchievementRaritiesSchema.optional().catch(undefined),
};

// --- La ligue ---

export const leagueConsentRequestSchema = writeRequest.extend({
  consent: z.boolean(),
  /** Choisi au consentement, sinon le pseudonyme par défaut s'applique. */
  pseudonym: leaguePseudonymSchema.optional(),
});
export const leagueConsentResponseSchema = z.object({ consent: z.boolean(), pseudonym: z.string().nullable() });

export const leaguePseudonymRequestSchema = writeRequest.extend({ pseudonym: leaguePseudonymSchema });
export const leaguePseudonymResponseSchema = z.object({ pseudonym: z.string() });

/** Un joueur de la ligue PUBLIQUE : aucun identifiant, aucune présence — un pseudonyme et le total de la semaine. */
export const leagueWeekEntrySchema = z.object({
  rank,
  displayName: z.string(),
  weekPoints: nonNegativeInt,
  zone: zoneKeys,
  cup: cupKeys.nullable(),
  isMe: z.boolean(),
});

export const leagueWeekResponseSchema = z.object({
  weekKey: dayKey,
  /**
   * Le jour de l'instantané : les AUTRES membres sont servis figés (4 h locales,
   * `leagueSnapshotDay`) — un total qui bougerait au fil des minutes révélerait
   * l'activité. Seule la ligne `isMe` est en direct.
   */
  snapshotDay: dayKey,
  closes: z.object({ dayKey, minuteOfDay: nonNegativeInt }),
  /** `false` : consenti, mais pas encore placé dans un groupe. */
  placed: z.boolean(),
  league: leagueKeys.nullable(),
  groupId: z.string().min(1).nullable(),
  entries: z.array(leagueWeekEntrySchema).max(30),
});

export const leagueFriendsEntrySchema = z.object({
  rank,
  userId: z.string().min(1),
  weekPoints: nonNegativeInt,
  isMe: z.boolean(),
});

export const leagueFriendsResponseSchema = z.object({
  weekKey: dayKey,
  closes: z.object({ dayKey, minuteOfDay: nonNegativeInt }),
  entries: z.array(leagueFriendsEntrySchema).max(1000),
});

// --- Le duo ---

export const duoInviteRequestSchema = writeRequest.extend({ friendId: z.string().min(1).max(64) });
export const duoInviteResponseSchema = z.object({
  status: z.enum(['invited', 'already-invited']),
  duoId: z.string().min(1),
  weekKey: dayKey,
});
export const duoAcceptRequestSchema = writeRequest;
export const duoAcceptResponseSchema = z.object({ status: z.enum(['active', 'already-active']), duoId: z.string().min(1) });
export const duoAbandonRequestSchema = writeRequest;
export const duoAbandonResponseSchema = z.object({ status: z.enum(['abandoned', 'already-abandoned']), duoId: z.string().min(1) });

// --- La saison ---

export const seasonClaimRequestSchema = writeRequest;
export const seasonClaimResponseSchema = z.object({
  status: z.enum(['claimed', 'already-claimed']),
  step: z.number().int().min(1).max(SEASON_STEPS),
  reward: seasonRewardSchema,
  /** Le cosmétique de la rangée Sceau, quand elle est possédée et que l'étape en porte un. */
  seal: z.object({ cosmeticKey: z.string().min(1) }).nullable(),
  /** `true` quand cette étape termine le parcours (coupe, badge daté, +500 de Gloire). */
  completed: z.boolean(),
  gloryGained: nonNegativeInt,
  /** Le score en poche après le crédit. */
  score: nonNegativeInt,
});

export const seasonSealRequestSchema = writeRequest;
export const seasonSealResponseSchema = z.object({ status: z.enum(['bought', 'already-bought']), balance: nonNegativeInt });

// --- La vitrine et la visibilité ---

export const showcaseOrderRequestSchema = writeRequest.extend({ order: z.array(trophyKeySchema).max(200) });
export const showcaseOrderResponseSchema = z.object({ order: z.array(trophyKeySchema).max(500) });

/** Au moins un des quatre réglages. */
export const showcaseVisibilityRequestSchema = writeRequest
  .extend({
    showcase: showcaseVisibilityKeys.optional(),
    rank: showcaseVisibilityKeys.optional(),
    treasury: showcaseVisibilityKeys.optional(),
    atlas: showcaseVisibilityKeys.optional(),
  })
  .refine(
    (body) => body.showcase !== undefined || body.rank !== undefined || body.treasury !== undefined || body.atlas !== undefined,
    { message: 'at least one visibility' },
  );
export const showcaseVisibilityResponseSchema = z.object({ visibility: gameVisibilitySchema });

/**
 * Un trophée vu par un VISITEUR : sa clé projetée (`visitorTrophyKey` — une coupe
 * de ligue y porte le mois, jamais la semaine) et le mois d'obtention, jamais
 * l'horodatage (`visitorAwardedMonth`). `count` (≥ 2, absent pour un trophée
 * unique) dit combien de coupes identiques ce mois réunit (`visitorShowcase`).
 */
export const gameVisitorTrophyItemSchema = z.object({
  key: trophyKeySchema,
  awardedMonth: z.string().regex(/^\d{4}-\d{2}$/),
  count: z.number().int().min(2).max(500).optional(),
});

export const userShowcaseResponseSchema = z.object({
  /** `false` : le réglage du membre ferme la vitrine à ce lecteur — jamais une erreur, qui dirait qu'elle existe. */
  visible: z.boolean(),
  items: z.array(gameVisitorTrophyItemSchema).max(500),
  order: z.array(trophyKeySchema).max(500),
});

// --- « Jeu masqué » et l'opposition à la ligue Amis ---

export const gamePrivacyRequestSchema = writeRequest
  .extend({ gameHidden: z.boolean().optional(), friendsLeagueOptOut: z.boolean().optional() })
  .refine((body) => body.gameHidden !== undefined || body.friendsLeagueOptOut !== undefined, { message: 'at least one switch' });
export const gamePrivacyResponseSchema = z.object({ gameHidden: z.boolean(), friendsLeagueOptOut: z.boolean() });

/**
 * `GET /me/game/privacy` (#9481) : l'ÉTAT des réglages du jeu, servi par le serveur. Les clients
 * ne gardent plus l'état de la dernière réponse `PUT` : ils relisent. Le nom de la route est
 * celui de l'écriture ; la lecture porte aussi les quatre visibilités.
 */
export const gameSettingsResponseSchema = z.object({
  gameHidden: z.boolean(),
  friendsLeagueOptOut: z.boolean(),
  visibility: gameVisibilitySchema,
});

// --- Le profil de jeu d'un AUTRE membre ---

/**
 * Ce qu'un lecteur apprend du jeu d'un autre (#9481) — jamais un compte exact : le niveau et son
 * palier, les étoiles de Prestige, la FORME de la Flamme (jamais ses jours), le rang de Gloire et sa
 * division (jamais la Gloire), le PALIER du trésor (jamais les Meeshes). Aucune présence, aucune
 * date. `standing` suit le réglage `rank`, `treasury` le réglage `treasury` : un refus (réglage,
 * blocage, « Jeu masqué », caché de la recherche, compte inconnu) rend `visible: false` et deux
 * blocs nuls — la MÊME réponse pour un compte qui n'existe pas.
 */
export const gameStandingSchema = z.object({
  level: z.number().int().min(1).max(100),
  tier: enumOf(LEVEL_TIER_KEYS),
  prestige: z.number().int().min(0).max(5),
  /** `null` : pas de Flamme allumée — ou celle-ci n'est pas à montrer. */
  flame: enumOf(FLAME_FORMS.map((form) => form.key)).nullable(),
  rank: enumOf<(typeof GLORY_RANKS)[number]['key'] | 'mythe'>([...GLORY_RANKS.map((r) => r.key), 'mythe']),
  /** `null` pour Mythe. */
  division: z.union([z.literal(3), z.literal(2), z.literal(1)]).nullable(),
});

export const gameShownTreasurySchema = z.object({ tier: enumOf(TREASURY_TIERS.map((tier) => tier.key)).nullable() });

export const userGameProfileResponseSchema = z.object({
  visible: z.boolean(),
  standing: gameStandingSchema.nullable(),
  treasury: gameShownTreasurySchema.nullable(),
});

// --- Le Prestige ---

export const prestigeRequestSchema = writeRequest;
export const prestigeResponseSchema = z.object({
  status: z.enum(['passed', 'already-passed']),
  prestige: z.number().int().min(1).max(5),
  /** Le score en poche et le niveau repartent de zéro et de 1. */
  score: z.literal(0),
  level: z.literal(1),
  gloryGained: nonNegativeInt,
  trophyKey: trophyKeySchema,
});

export type GameLeagueBlock = z.infer<typeof gameLeagueBlockSchema>;
export type GameDuoBlock = z.infer<typeof gameDuoBlockSchema>;
export type GameSeasonBlock = z.infer<typeof gameSeasonBlockSchema>;
export type GameTrophyItem = z.infer<typeof gameTrophyItemSchema>;
export type GameVisitorTrophyItem = z.infer<typeof gameVisitorTrophyItemSchema>;
export type GameTrophiesBlock = z.infer<typeof gameTrophiesBlockSchema>;
export type GameAtlasBlock = z.infer<typeof gameAtlasBlockSchema>;
export type GamePrestigeBlock = z.infer<typeof gamePrestigeBlockSchema>;
export type GameVisibility = z.infer<typeof gameVisibilitySchema>;
export type LeagueConsentRequest = z.infer<typeof leagueConsentRequestSchema>;
export type LeagueConsentResponse = z.infer<typeof leagueConsentResponseSchema>;
export type LeaguePseudonymRequest = z.infer<typeof leaguePseudonymRequestSchema>;
export type LeaguePseudonymResponse = z.infer<typeof leaguePseudonymResponseSchema>;
export type LeagueWeekEntry = z.infer<typeof leagueWeekEntrySchema>;
export type LeagueWeekResponse = z.infer<typeof leagueWeekResponseSchema>;
export type LeagueFriendsEntry = z.infer<typeof leagueFriendsEntrySchema>;
export type LeagueFriendsResponse = z.infer<typeof leagueFriendsResponseSchema>;
export type DuoInviteRequest = z.infer<typeof duoInviteRequestSchema>;
export type DuoInviteResponse = z.infer<typeof duoInviteResponseSchema>;
export type DuoAcceptResponse = z.infer<typeof duoAcceptResponseSchema>;
export type DuoAbandonResponse = z.infer<typeof duoAbandonResponseSchema>;
export type SeasonClaimResponse = z.infer<typeof seasonClaimResponseSchema>;
export type SeasonSealResponse = z.infer<typeof seasonSealResponseSchema>;
export type ShowcaseOrderRequest = z.infer<typeof showcaseOrderRequestSchema>;
export type ShowcaseOrderResponse = z.infer<typeof showcaseOrderResponseSchema>;
export type ShowcaseVisibilityRequest = z.infer<typeof showcaseVisibilityRequestSchema>;
export type ShowcaseVisibilityResponse = z.infer<typeof showcaseVisibilityResponseSchema>;
export type UserShowcaseResponse = z.infer<typeof userShowcaseResponseSchema>;
export type GamePrivacyRequest = z.infer<typeof gamePrivacyRequestSchema>;
export type GamePrivacyResponse = z.infer<typeof gamePrivacyResponseSchema>;
export type GameAchievementRarityEntry = z.infer<typeof gameAchievementRarityEntrySchema>;
export type GameAchievementRarities = z.infer<typeof gameAchievementRaritiesSchema>;
export type GameSettingsResponse = z.infer<typeof gameSettingsResponseSchema>;
export type GameStanding = z.infer<typeof gameStandingSchema>;
export type UserGameProfileResponse = z.infer<typeof userGameProfileResponseSchema>;
export type PrestigeRequest = z.infer<typeof prestigeRequestSchema>;
export type PrestigeResponse = z.infer<typeof prestigeResponseSchema>;
