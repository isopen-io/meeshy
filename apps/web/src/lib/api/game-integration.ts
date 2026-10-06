import { GAME_INTEGRATION_ROUTES, GAME_ROUTES, gameUserGamePath } from '@meeshy/shared/types/game-routes';
import type { GamePrivacyResponse, GameSettingsResponse, UserGameProfileResponse } from '@meeshy/shared/types/game';
import { FLAME_FORMS } from '@meeshy/shared/utils/game/flame';
import { GLORY_RANKS } from '@meeshy/shared/utils/game/glory';
import { LEVEL_TIER_KEYS } from '@meeshy/shared/utils/game/levels';
import { TREASURY_TIERS } from '@meeshy/shared/utils/game/treasury';
import { SHOWCASE_VISIBILITIES } from '@meeshy/shared/utils/game/trophies';

import { isBool, isInt, isOneOf, orNull, shape } from './game-guards';
import type { ApiResult, HttpTransport } from './http';

/**
 * L'INTÉGRATION DU JEU (#9481) — ce que les clients gardaient en mémoire se RELIT du serveur :
 *
 *  - `GET /me/game/privacy` : « Jeu masqué », l'opposition à la ligue Amis et les quatre
 *    visibilités. Les clients ne gardent plus l'état de leur dernière écriture ; hors ligne,
 *    la copie locale tient lieu de dernier état connu ;
 *  - `PUT /me/game/privacy` : « Jeu masqué » et l'opposition à la ligue Amis (iOS l'écrit déjà) ;
 *  - `GET /users/:userId/game` : ce que le réglage d'un AUTRE membre laisse voir de son jeu — le
 *    niveau et son palier, les étoiles de Prestige, la FORME de la Flamme, le rang de Gloire et sa
 *    division, le PALIER du trésor. Jamais un compte exact. Un refus (réglage, blocage, « Jeu
 *    masqué », compte inconnu) est une VALEUR — `visible: false` et deux blocs nuls — jamais une
 *    erreur, qui dirait que le compte existe.
 *
 * Une réponse illisible est refusée ENTIÈRE : le web ne devine ni un réglage ni le niveau de quelqu'un.
 */

const API_PREFIX = '/api/v1';

const malformed = <T>(what: string): ApiResult<T> => ({
  ok: false,
  status: 502,
  error: `La réponse du jeu est illisible — ${what}`,
  code: 'MALFORMED_PAYLOAD',
});

const isVisibility = isOneOf(SHOWCASE_VISIBILITIES);

const isSettings = (value: unknown): value is GameSettingsResponse =>
  shape(value, {
    gameHidden: isBool,
    friendsLeagueOptOut: isBool,
    visibility: (v) => shape(v, { showcase: isVisibility, rank: isVisibility, treasury: isVisibility, atlas: isVisibility }),
  });

const isPrivacy = (value: unknown): value is GamePrivacyResponse => shape(value, { gameHidden: isBool, friendsLeagueOptOut: isBool });

const isStanding = (value: unknown): boolean =>
  shape(value, {
    level: (n) => isInt(n, 1, 100),
    tier: isOneOf(LEVEL_TIER_KEYS),
    prestige: (n) => isInt(n, 0, 5),
    flame: orNull(isOneOf(FLAME_FORMS.map((form) => form.key))),
    rank: isOneOf([...GLORY_RANKS.map((rank) => rank.key), 'mythe']),
    division: orNull((n) => n === 1 || n === 2 || n === 3),
  });

const isUserGame = (value: unknown): value is UserGameProfileResponse =>
  shape(value, {
    visible: isBool,
    standing: orNull(isStanding),
    treasury: orNull((v) => shape(v, { tier: orNull(isOneOf(TREASURY_TIERS.map((tier) => tier.key))) })),
  });

async function call<T>(params: {
  readonly transport: HttpTransport;
  readonly method: 'GET' | 'PUT';
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

export const fetchGameSettings = (transport: HttpTransport, signal?: AbortSignal) =>
  call({ transport, method: 'GET', route: GAME_INTEGRATION_ROUTES.settings, decode: isSettings, what: 'réglages du jeu', signal });

export const setGamePrivacy = (
  transport: HttpTransport,
  requestId: string,
  patch: { readonly gameHidden?: boolean; readonly friendsLeagueOptOut?: boolean },
  signal?: AbortSignal,
) => call({ transport, method: 'PUT', route: GAME_ROUTES.privacy, body: { requestId, ...patch }, decode: isPrivacy, what: 'réglage « Jeu masqué »', signal });

export const fetchUserGame = (transport: HttpTransport, userId: string, signal?: AbortSignal) =>
  call({ transport, method: 'GET', route: gameUserGamePath(encodeURIComponent(userId)), decode: isUserGame, what: 'jeu d’un autre', signal });
