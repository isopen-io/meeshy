import { GAME_ROUTES, gameDuoAbandonPath, gameDuoAcceptPath, gameSeasonClaimPath, gameUserShowcasePath } from '@meeshy/shared/types/game-routes';
import type {
  DuoAbandonResponse,
  DuoAcceptResponse,
  DuoInviteResponse,
  GameAtlasBlock,
  GameDuoBlock,
  GameLeagueBlock,
  GamePrestigeBlock,
  GameSeasonBlock,
  GameTrophiesBlock,
  GameVisibility,
  LeagueConsentResponse,
  LeagueFriendsResponse,
  LeaguePseudonymResponse,
  LeagueWeekResponse,
  PrestigeResponse,
  SeasonClaimResponse,
  SeasonSealResponse,
  ShowcaseOrderResponse,
  ShowcaseVisibilityResponse,
  UserShowcaseResponse,
} from '@meeshy/shared/types/game';
import { DUO_STATUSES } from '@meeshy/shared/utils/game/duo';
import { LEAGUE_KEYS } from '@meeshy/shared/utils/game/league';
import { SEASON_STEPS } from '@meeshy/shared/utils/game/season';
import { SHOWCASE_VISIBILITIES } from '@meeshy/shared/utils/game/trophies';

import { isBool, isFraction, isInt, isOneOf, isText, orNull, shape, type Rec } from './game-guards';
import type { ApiResult, HttpTransport } from './http';

/**
 * LE PORT DE LA VAGUE 2 DU JEU (#9384 à #9392, #9481) — les SEPT extensions du
 * bloc `game` et les treize routes nouvelles (`game-routes.ts`).
 *
 * UNE EXTENSION ILLISIBLE TOMBE SEULE. Le contrat l'exige (`gameBlockExtensionShape` :
 * `optional().catch(undefined)`) et l'écran en dépend : un serveur qui sert une
 * ligue d'une forme que ce client ne sait pas lire ne doit pas emporter le bloc
 * entier (`readGameBlock` rendrait `null`, et le héros, les missions, la Flamme
 * disparaîtraient avec elle). Chaque lecteur rend donc `undefined` devant ce
 * qu'il ne comprend pas, et `readGameExtensions` ne pose que les extensions lues.
 *
 * Un bloc ABSENT (ancien serveur) laisse l'écran d'avant intact : aucun écran de
 * la vague 2 ne se peint sans sa donnée, il ne la devine jamais.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (value: unknown): boolean => typeof value === 'string' && DAY.test(value);
const isIsoDate = (value: unknown): boolean => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const isLeague = isOneOf(LEAGUE_KEYS);
const isZone = isOneOf(['promotion', 'safe', 'relegation']);
const isCup = isOneOf(['gold', 'silver', 'bronze']);
const isVisibility = isOneOf(SHOWCASE_VISIBILITIES);
const isClose = (value: unknown): boolean => shape(value, { dayKey: isDay, minuteOfDay: (v) => isInt(v) });
const arrayOf = (check: (value: unknown) => boolean, max: number) => (value: unknown): boolean =>
  Array.isArray(value) && value.length <= max && value.every(check);

const isLeagueBlock = (value: unknown): value is GameLeagueBlock =>
  shape(value, {
    unlocked: isBool,
    access: isOneOf(['locked', 'minor', 'consent-required', 'open']),
    pseudonym: orNull(isText),
    weekKey: isDay,
    closes: isClose,
    current: orNull((v) =>
      shape(v, {
        league: isLeague,
        groupId: isText,
        groupSize: (n) => isInt(n, 1, 30),
        rank: (n) => isInt(n, 1),
        weekPoints: (n) => isInt(n),
        zone: isZone,
        cup: orNull(isCup),
        pointsToPromotion: orNull((n) => isInt(n)),
      }),
    ),
    friends: (v) => shape(v, { rank: (n) => isInt(n, 1), size: (n) => isInt(n, 1), weekPoints: (n) => isInt(n) }),
  });

const isDuoBlock = (value: unknown): value is GameDuoBlock =>
  shape(value, {
    unlocked: isBool,
    status: isOneOf(['none', ...DUO_STATUSES]),
    duoId: orNull(isText),
    weekKey: isDay,
    role: orNull(isOneOf(['inviter', 'invitee'])),
    partner: orNull((v) => shape(v, { userId: isText, displayName: (n) => typeof n === 'string' })),
    mission: orNull((v) =>
      shape(v, { templateKey: isText, signal: isText, prism: isBool, partTarget: (n) => isInt(n, 1), commonTarget: (n) => isInt(n, 2) }),
    ),
    progress: orNull((v) =>
      shape(v, {
        mine: (n) => isInt(n),
        partner: (n) => isInt(n),
        common: (n) => isInt(n),
        mineDone: isBool,
        partnerDone: isBool,
        bothDone: isBool,
      }),
    ),
    reward: orNull((v) => shape(v, { points: (n) => isInt(n), doubled: isBool })),
  });

const isSeasonReward = (value: unknown): boolean =>
  shape(value, { kind: isOneOf(['points', 'fragment', 'freeze', 'season-cup']), amount: (n) => isInt(n, 1) });

const isStep = (value: unknown): boolean => isInt(value, 1, SEASON_STEPS);

const isSeasonBlock = (value: unknown): value is GameSeasonBlock =>
  shape(value, {
    number: (v) => isInt(v, 1),
    themeKey: isText,
    startDay: isDay,
    endDay: isDay,
    week: (v) => isInt(v, 1, 8),
    stars: (v) => isInt(v),
    steps: (v) => isInt(v, 0, SEASON_STEPS),
    stepsTotal: (v) => isInt(v, 1),
    starsToNext: (v) => isInt(v),
    progress: isFraction,
    completed: isBool,
    claimedSteps: arrayOf(isStep, SEASON_STEPS),
    nextReward: orNull((v) => shape(v, { step: isStep, reward: isSeasonReward })),
    sealOwned: isBool,
    sealPrice: (v) => isInt(v),
  });

const isTrophyKey = (value: unknown): boolean => typeof value === 'string' && value.length > 0 && value.length <= 96;

const isTrophiesBlock = (value: unknown): value is GameTrophiesBlock =>
  shape(value, {
    items: arrayOf((v) => shape(v, { key: isTrophyKey, awardedAt: isIsoDate }), 500),
    order: arrayOf(isTrophyKey, 500),
  });

const isLanguage = (value: unknown): boolean => typeof value === 'string' && value.length >= 2 && value.length <= 8;

const isAtlasBlock = (value: unknown): value is GameAtlasBlock =>
  shape(value, {
    stamped: (v) => isInt(v),
    total: (v) => isInt(v, 1),
    stamps: arrayOf((v) => shape(v, { language: isLanguage, stampedOn: isDay }), 400),
    pending: arrayOf((v) => shape(v, { language: isLanguage, sent: isBool, received: isBool }), 400),
  });

const isPrestigeBlock = (value: unknown): value is GamePrestigeBlock =>
  shape(value, { stars: (v) => isInt(v, 0, 5), max: (v) => isInt(v, 1), canPrestige: isBool, gloryOnPass: (v) => isInt(v) });

const isVisibilityBlock = (value: unknown): value is GameVisibility =>
  shape(value, { showcase: isVisibility, rank: isVisibility, treasury: isVisibility, atlas: isVisibility });

/** Les sept extensions que le bloc `game` peut porter. */
export type GameExtensions = {
  readonly league?: GameLeagueBlock;
  readonly duo?: GameDuoBlock;
  readonly season?: GameSeasonBlock | null;
  readonly trophies?: GameTrophiesBlock;
  readonly atlas?: GameAtlasBlock;
  readonly prestige?: GamePrestigeBlock;
  readonly visibility?: GameVisibility;
};

/** Les extensions de ce bloc, chacune lue SEULE : une extension illisible n'est pas posée, les autres le sont. */
export function readGameExtensions(block: Rec): GameExtensions {
  const season = block['season'];
  return {
    ...(isLeagueBlock(block['league']) ? { league: block['league'] } : {}),
    ...(isDuoBlock(block['duo']) ? { duo: block['duo'] } : {}),
    ...(season === null ? { season: null } : isSeasonBlock(season) ? { season } : {}),
    ...(isTrophiesBlock(block['trophies']) ? { trophies: block['trophies'] } : {}),
    ...(isAtlasBlock(block['atlas']) ? { atlas: block['atlas'] } : {}),
    ...(isPrestigeBlock(block['prestige']) ? { prestige: block['prestige'] } : {}),
    ...(isVisibilityBlock(block['visibility']) ? { visibility: block['visibility'] } : {}),
  };
}

export const GAME_EXTENSION_KEYS = ['league', 'duo', 'season', 'trophies', 'atlas', 'prestige', 'visibility'] as const;

/** Le bloc SANS ses extensions brutes : `readGameBlock` y repose les extensions LUES. */
export function withoutExtensions<T extends Rec>(block: T): Omit<T, (typeof GAME_EXTENSION_KEYS)[number]> {
  const kept = Object.fromEntries(Object.entries(block).filter(([key]) => !(GAME_EXTENSION_KEYS as readonly string[]).includes(key)));
  return kept as Omit<T, (typeof GAME_EXTENSION_KEYS)[number]>;
}

// --- Les lectures (GET) et les écritures (POST, PUT) ---

const API_PREFIX = '/api/v1';

const malformed = <T>(what: string): ApiResult<T> => ({
  ok: false,
  status: 502,
  error: `La réponse du jeu est illisible — ${what}`,
  code: 'MALFORMED_PAYLOAD',
});

async function call<T>(params: {
  readonly transport: HttpTransport;
  readonly method: 'GET' | 'POST' | 'PUT';
  readonly route: string;
  readonly body?: unknown;
  readonly decode: (data: unknown) => data is T;
  readonly what: string;
  readonly signal?: AbortSignal | undefined;
}): Promise<ApiResult<T>> {
  const result = await params.transport.request<unknown>({
    method: params.method,
    path: `${API_PREFIX}${params.route}`,
    ...(params.body !== undefined ? { body: params.body } : {}),
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  return params.decode(result.data) ? { ok: true, data: result.data } : malformed(params.what);
}

const isWeekEntry = (value: unknown): boolean =>
  shape(value, {
    rank: (n) => isInt(n, 1),
    displayName: (n) => typeof n === 'string',
    weekPoints: (n) => isInt(n),
    zone: isZone,
    cup: orNull(isCup),
    isMe: isBool,
  });

const isLeagueWeek = (value: unknown): value is LeagueWeekResponse =>
  shape(value, {
    weekKey: isDay,
    snapshotDay: isDay,
    closes: isClose,
    placed: isBool,
    league: orNull(isLeague),
    groupId: orNull(isText),
    entries: arrayOf(isWeekEntry, 30),
  });

const isLeagueFriends = (value: unknown): value is LeagueFriendsResponse =>
  shape(value, {
    weekKey: isDay,
    closes: isClose,
    entries: arrayOf((v) => shape(v, { rank: (n) => isInt(n, 1), userId: isText, weekPoints: (n) => isInt(n), isMe: isBool }), 1000),
  });

const isConsent = (value: unknown): value is LeagueConsentResponse => shape(value, { consent: isBool, pseudonym: orNull(isText) });
const isPseudonym = (value: unknown): value is LeaguePseudonymResponse => shape(value, { pseudonym: isText });
const isInvite = (value: unknown): value is DuoInviteResponse =>
  shape(value, { status: isOneOf(['invited', 'already-invited']), duoId: isText, weekKey: isDay });
const isAccept = (value: unknown): value is DuoAcceptResponse =>
  shape(value, { status: isOneOf(['active', 'already-active']), duoId: isText });
const isAbandon = (value: unknown): value is DuoAbandonResponse =>
  shape(value, { status: isOneOf(['abandoned', 'already-abandoned']), duoId: isText });
const isClaim = (value: unknown): value is SeasonClaimResponse =>
  shape(value, {
    status: isOneOf(['claimed', 'already-claimed']),
    step: isStep,
    reward: isSeasonReward,
    seal: orNull((v) => shape(v, { cosmeticKey: isText })),
    completed: isBool,
    gloryGained: (n) => isInt(n),
    score: (n) => isInt(n),
  });
const isSeal = (value: unknown): value is SeasonSealResponse =>
  shape(value, { status: isOneOf(['bought', 'already-bought']), balance: (n) => isInt(n) });
const isOrder = (value: unknown): value is ShowcaseOrderResponse => shape(value, { order: arrayOf(isTrophyKey, 500) });
const isVisibilityResponse = (value: unknown): value is ShowcaseVisibilityResponse =>
  shape(value, { visibility: isVisibilityBlock });
const isUserShowcase = (value: unknown): value is UserShowcaseResponse =>
  shape(value, {
    visible: isBool,
    items: arrayOf((v) => shape(v, { key: isTrophyKey, awardedMonth: (n) => typeof n === 'string' && /^\d{4}-\d{2}$/.test(n) }), 500),
    order: arrayOf(isTrophyKey, 500),
  });
const isPrestigeResponse = (value: unknown): value is PrestigeResponse =>
  shape(value, {
    status: isOneOf(['passed', 'already-passed']),
    prestige: (n) => isInt(n, 1, 5),
    score: (n) => n === 0,
    level: (n) => n === 1,
    gloryGained: (n) => isInt(n),
    trophyKey: isTrophyKey,
  });

export const fetchLeagueWeek = (transport: HttpTransport, signal?: AbortSignal) =>
  call({ transport, method: 'GET', route: GAME_ROUTES.leagueWeek, decode: isLeagueWeek, what: 'classement de la semaine', signal });

export const fetchLeagueFriends = (transport: HttpTransport, signal?: AbortSignal) =>
  call({ transport, method: 'GET', route: GAME_ROUTES.leagueFriends, decode: isLeagueFriends, what: 'ligue Amis', signal });

export const fetchUserShowcase = (transport: HttpTransport, userId: string, signal?: AbortSignal) =>
  call({ transport, method: 'GET', route: gameUserShowcasePath(encodeURIComponent(userId)), decode: isUserShowcase, what: 'vitrine', signal });

export const setLeagueConsent = (
  transport: HttpTransport,
  params: { readonly requestId: string; readonly consent: boolean; readonly pseudonym?: string },
  signal?: AbortSignal,
) =>
  call({
    transport,
    method: 'POST',
    route: GAME_ROUTES.leagueConsent,
    body: { requestId: params.requestId, consent: params.consent, ...(params.pseudonym === undefined ? {} : { pseudonym: params.pseudonym }) },
    decode: isConsent,
    what: 'consentement de ligue',
    signal,
  });

export const setLeaguePseudonym = (transport: HttpTransport, requestId: string, pseudonym: string, signal?: AbortSignal) =>
  call({ transport, method: 'PUT', route: GAME_ROUTES.leaguePseudonym, body: { requestId, pseudonym }, decode: isPseudonym, what: 'pseudonyme', signal });

export const inviteToDuo = (transport: HttpTransport, requestId: string, friendId: string, signal?: AbortSignal) =>
  call({ transport, method: 'POST', route: GAME_ROUTES.duoInvite, body: { requestId, friendId }, decode: isInvite, what: 'invitation au duo', signal });

export const acceptDuo = (transport: HttpTransport, requestId: string, duoId: string, signal?: AbortSignal) =>
  call({ transport, method: 'POST', route: gameDuoAcceptPath(encodeURIComponent(duoId)), body: { requestId }, decode: isAccept, what: 'acceptation du duo', signal });

export const abandonDuo = (transport: HttpTransport, requestId: string, duoId: string, signal?: AbortSignal) =>
  call({ transport, method: 'POST', route: gameDuoAbandonPath(encodeURIComponent(duoId)), body: { requestId }, decode: isAbandon, what: 'abandon du duo', signal });

export const claimSeasonStep = (transport: HttpTransport, requestId: string, step: number, signal?: AbortSignal) =>
  call({ transport, method: 'POST', route: gameSeasonClaimPath(step), body: { requestId }, decode: isClaim, what: 'étape de saison', signal });

export const buySeasonSeal = (transport: HttpTransport, requestId: string, signal?: AbortSignal) =>
  call({ transport, method: 'POST', route: GAME_ROUTES.seasonSeal, body: { requestId }, decode: isSeal, what: 'Sceau', signal });

export const setShowcaseOrder = (transport: HttpTransport, requestId: string, order: readonly string[], signal?: AbortSignal) =>
  call({ transport, method: 'PUT', route: GAME_ROUTES.showcaseOrder, body: { requestId, order }, decode: isOrder, what: 'ordre de la vitrine', signal });

export const setGameVisibility = (
  transport: HttpTransport,
  requestId: string,
  patch: Partial<GameVisibility>,
  signal?: AbortSignal,
) =>
  call({
    transport,
    method: 'PUT',
    route: GAME_ROUTES.showcaseVisibility,
    body: { requestId, ...patch },
    decode: isVisibilityResponse,
    what: 'visibilité du jeu',
    signal,
  });

export const passToPrestige = (transport: HttpTransport, requestId: string, signal?: AbortSignal) =>
  call({ transport, method: 'POST', route: GAME_ROUTES.prestige, body: { requestId }, decode: isPrestigeResponse, what: 'Prestige', signal });
