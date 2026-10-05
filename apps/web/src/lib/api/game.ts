import { GAME_ROUTES, gameMissionRerollPath } from '@meeshy/shared/types/game-routes';
import type {
  ChestClaimResponse,
  FlameFreezeResponse,
  FlameRelightResponse,
  GameBlock,
  GameMission,
  GuideSeenResponse,
  MissionRerollResponse,
} from '@meeshy/shared/types/game';
import { GLORY_RANKS } from '@meeshy/shared/utils/game/glory';
import { LEVEL_TIER_KEYS } from '@meeshy/shared/utils/game/levels';
import { FLAME_FORMS } from '@meeshy/shared/utils/game/flame';
import { MISSION_DIFFICULTIES } from '@meeshy/shared/utils/game/missions';
import { TREASURY_TIERS } from '@meeshy/shared/utils/game/treasury';

import { isBool, isFraction, isInt, isOneOf, isText, orNull, shape } from './game-guards';
import { readGameExtensions, withoutExtensions, type GameBlockV2 } from './game-v2';
import type { ApiResult, HttpTransport } from './http';

/**
 * LE PORT DU JEU MEESHY (#9383) — le bloc `game` de `GET /me/engagement` et les
 * cinq écritures `POST /me/game/*` (`@meeshy/shared/types/game-routes`).
 *
 * LA FRONTIÈRE EST MANUSCRITE, SANS ZOD : le contrat Zod (`types/game.ts`) sert
 * la passerelle ; le web importe les routes sans Zod pour ne pas alourdir le
 * chunk d'écran. Le prix est la discipline `isEngagementProgressPayload` : un
 * bloc partiel est refusé ENTIER (`readGameBlock` → `null`), jamais lu à moitié
 * — l'écran retombe alors sur l'état actuel, comme devant un ancien serveur.
 *
 * LA FORME EST STRICTE, LES BORNES SONT TOLÉRANTES : un serveur qui relèverait
 * un plafond (le bonus de Flamme au-delà de 50 %, un sixième Prestige) ne doit
 * pas faire retomber l'écran sur l'ancien en silence. Une borne se pose à
 * l'AFFICHAGE (`boundedPercent`, `game-copy.ts`), jamais à la frontière.
 *
 * Les chaînes OUVERTES (`templateKey`, `signal`) restent libres à dessein : un
 * gabarit ajouté au serveur avant la mise à jour du client ne casse rien. Les
 * clés FERMÉES (palier, rang, forme, trésor) sont vérifiées contre le catalogue
 * partagé — ce sont celles que le client habille.
 *
 * Chaque écriture porte un `requestId` fourni par l'APPELANT (une fois par
 * intention, jamais par requête — même règle que la frappe, `engagement.ts`).
 */

const isTier = isOneOf(LEVEL_TIER_KEYS);
const isRank = isOneOf([...GLORY_RANKS.map((rank) => rank.key), 'mythe']);
const isTreasuryKey = isOneOf(TREASURY_TIERS.map((tier) => tier.key));
const isFlameForm = isOneOf(FLAME_FORMS.map((form) => form.key));
const isDivision = (value: unknown): boolean => value === 1 || value === 2 || value === 3;
const isEdition = isOneOf(['silver', 'gold', 'prism']);

const isLevel = (value: unknown): boolean =>
  shape(value, {
    level: (v) => isInt(v, 1, 100),
    tier: isTier,
    score: (v) => isInt(v),
    floorScore: (v) => isInt(v),
    nextThreshold: orNull((v) => isInt(v)),
    pointsToNext: (v) => isInt(v),
    progress: isFraction,
    record: (v) => isInt(v, 1, 100),
    prestige: (v) => isInt(v),
    canPrestige: isBool,
  });

const isGloryStep = (value: unknown): boolean =>
  shape(value, { rank: isRank, division: isDivision, minGlory: (v) => isInt(v) });

const isGlory = (value: unknown): boolean =>
  shape(value, {
    glory: (v) => isInt(v),
    rank: isRank,
    division: orNull(isDivision),
    next: orNull(isGloryStep),
    gloryMissing: orNull((v) => isInt(v)),
    progress: isFraction,
  });

const isTreasury = (value: unknown): boolean =>
  shape(value, {
    held: (v) => isInt(v),
    tier: orNull(isTreasuryKey),
    next: orNull((v) => shape(v, { key: isTreasuryKey, minHeld: (n) => isInt(n), missing: (n) => isInt(n) })),
  });

const isMint = (value: unknown): boolean =>
  shape(value, {
    number: (v) => isInt(v, 1),
    price: (v) => isInt(v, 1),
    edition: isEdition,
    canMint: isBool,
    missingPoints: (v) => isInt(v),
    levelBefore: (v) => isInt(v, 1, 100),
    levelAfter: (v) => isInt(v, 1, 100),
    levelsLost: (v) => isInt(v),
    gloryGained: (v) => isInt(v),
  });

export const isGameMission = (value: unknown): value is GameMission =>
  shape(value, {
    id: isText,
    templateKey: isText,
    difficulty: isOneOf(MISSION_DIFFICULTIES),
    signal: isText,
    prism: isBool,
    target: (v) => isInt(v, 1),
    progress: (v) => isInt(v),
    reward: (v) => isInt(v),
    glory: (v) => isInt(v),
    completedAt: orNull(isText),
  });

const isMissions = (value: unknown): boolean =>
  shape(value, {
    dayKey: (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v),
    prismDay: isBool,
    unlocked: isBool,
    items: (v) => Array.isArray(v) && v.length <= 4 && v.every(isGameMission),
    rerollAvailable: isBool,
  });

const isChestReward = (value: unknown): boolean =>
  shape(value, { points: (v) => isInt(v), fragment: isBool, freeze: isBool });

const isChest = (value: unknown): boolean =>
  shape(value, {
    status: isOneOf(['locked', 'ready', 'claimed']),
    odds: (v) =>
      shape(v, {
        minPoints: (n) => isInt(n),
        maxPoints: (n) => isInt(n),
        fragment: isFraction,
        freeze: isFraction,
      }),
    reward: orNull(isChestReward),
  });

const isFlame = (value: unknown): boolean =>
  shape(value, {
    days: (v) => isInt(v),
    form: orNull(isFlameForm),
    bonusPercent: (v) => isInt(v),
    freezes: (v) => isInt(v),
    maxFreezes: (v) => isInt(v),
    freezePrice: (v) => isInt(v),
    relightPrice: (v) => isInt(v),
    status: isOneOf(['none', 'lit', 'at-risk', 'covered', 'out']),
    canRelight: isBool,
  });

const isBoosts = (value: unknown): boolean =>
  shape(value, {
    tailwind: (v) => typeof v === 'number' && v >= 1,
    prismHour: orNull((v) =>
      shape(v, {
        startMinute: (n) => isInt(n),
        endMinute: (n) => isInt(n),
        multiplier: (n) => typeof n === 'number' && n >= 1,
      }),
    ),
  });

const isGameBlock = (value: unknown): value is GameBlock =>
  shape(value, {
    level: isLevel,
    glory: isGlory,
    treasury: isTreasury,
    mint: isMint,
    missions: isMissions,
    chest: isChest,
    flame: isFlame,
    boosts: isBoosts,
    guideSeen: (v) => Array.isArray(v) && v.length <= 200 && v.every((key) => isText(key) && key.length <= 64),
  });

/** Le bloc `game`, ou `null` s'il est absent ou partiel — jamais à moitié lu. */
export const readGameBlock = (value: unknown): GameBlockV2 | null =>
  isGameBlock(value) ? { ...withoutExtensions(value), ...readGameExtensions(value) } : null;

const API_PREFIX = '/api/v1';

const malformed = <T>(what: string): ApiResult<T> => ({
  ok: false,
  status: 502,
  error: `La réponse du jeu est illisible — ${what}`,
  code: 'MALFORMED_PAYLOAD',
});

async function write<T>(params: {
  readonly transport: HttpTransport;
  readonly route: string;
  readonly body: unknown;
  readonly decode: (data: unknown) => data is T;
  readonly what: string;
  readonly signal?: AbortSignal | undefined;
}): Promise<ApiResult<T>> {
  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: `${API_PREFIX}${params.route}`,
    body: params.body,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  return params.decode(result.data) ? { ok: true, data: result.data } : malformed(params.what);
}

const isRerollResponse = (data: unknown): data is MissionRerollResponse =>
  shape(data, { mission: isGameMission, balance: (v) => isInt(v) });

const isChestResponse = (data: unknown): data is ChestClaimResponse =>
  shape(data, {
    status: isOneOf(['claimed', 'already-claimed']),
    reward: isChestReward,
    score: (v) => isInt(v),
  });

const isFreezeResponse = (data: unknown): data is FlameFreezeResponse =>
  shape(data, { status: isOneOf(['bought', 'already-bought']), freezes: (v) => isInt(v), balance: (v) => isInt(v) });

const isRelightResponse = (data: unknown): data is FlameRelightResponse =>
  shape(data, { status: isOneOf(['relit', 'already-relit']), streak: (v) => isInt(v), balance: (v) => isInt(v) });

const isGuideSeenResponse = (data: unknown): data is GuideSeenResponse =>
  shape(data, { guideSeen: (v) => Array.isArray(v) && v.every(isText) });

/** Changer une mission du jour — 1 Meesh, une fois par jour, même difficulté. */
export const rerollMission = (transport: HttpTransport, missionId: string, requestId: string, signal?: AbortSignal) =>
  write({
    transport,
    route: gameMissionRerollPath(missionId),
    body: { requestId },
    decode: isRerollResponse,
    what: 'changement de mission',
    signal,
  });

export const claimChest = (transport: HttpTransport, requestId: string, signal?: AbortSignal) =>
  write({ transport, route: GAME_ROUTES.chestClaim, body: { requestId }, decode: isChestResponse, what: 'coffre', signal });

export const buyFlameFreeze = (transport: HttpTransport, requestId: string, signal?: AbortSignal) =>
  write({ transport, route: GAME_ROUTES.flameFreezes, body: { requestId }, decode: isFreezeResponse, what: 'gel', signal });

export const relightFlame = (transport: HttpTransport, requestId: string, signal?: AbortSignal) =>
  write({ transport, route: GAME_ROUTES.flameRelight, body: { requestId }, decode: isRelightResponse, what: 'rallumage', signal });

export const markGuideSeen = (transport: HttpTransport, requestId: string, keys: readonly string[], signal?: AbortSignal) =>
  write({
    transport,
    route: GAME_ROUTES.guideSeen,
    body: { requestId, keys },
    decode: isGuideSeenResponse,
    what: 'moments vus',
    signal,
  });
