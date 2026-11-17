import * as directoryEndpoints from '@meeshy/shared/api/endpoints/directory';
import { isRelationLevel, type RelationLevel } from '@meeshy/shared/types/relation';
import {
  PROFILE_CAPABILITIES,
  type ProfileCapabilityKey,
  type ProfileCapabilityState,
  type ProfileCircleView,
} from '@meeshy/shared/utils/profile-circle-view';

import { unwrap } from './client';
import type { ApiResult } from './http';
import type { PublicProfileDeps } from './public-profile';

/**
 * **LA FICHE PAR CERCLE** (#18861, #18878) — `GET directory.peopleByHandle?as=<cercle>&expand=circle`,
 * le « Voir comme » du PROPRIÉTAIRE : ce qu'un lecteur ordinaire de ce cercle reçoit de sa vitrine,
 * jugé par la passerelle avec SON âge déclaré, SON rôle et SES préférences de présence — ce que
 * l'écran ne sait pas. Tout autre lecteur reçoit un 403 : l'écran ne la demande que sur sa propre fiche.
 *
 * **CE QUI EST DÉCODÉ EST CE QUI SE PEINT, ET RIEN NE S'OUVRE PAR DÉFAUT.** Un état que l'écran ne
 * connaît pas se lit FERMÉ (fail-closed) ; une capacité dont le cercle est illisible est écartée —
 * une rangée qui ne dit pas ce qui l'ouvre n'aurait rien à montrer ; une clé que ce client ne sait
 * pas nommer (une capacité servie après lui) est écartée, jamais rendue sous son nom brut. Une
 * passerelle plus ancienne ne sert pas `circle` : le décodeur rend `null`, et l'écran garde son
 * verdict local — la MÊME loi (`resolveProfileCircleViewAs`), sans l'âge ni le rôle du propriétaire.
 */

const KNOWN: ReadonlySet<string> = new Set<string>(PROFILE_CAPABILITIES);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => value !== null && typeof value === 'object';

const stateOf = (raw: unknown): ProfileCapabilityState | null => {
  if (!isRecord(raw) || !isRelationLevel(raw.circle)) return null;
  return { state: raw.state === 'open' ? 'open' : 'locked', circle: raw.circle, consentRequired: raw.consentRequired === true };
};

const capabilitiesOf = (raw: Readonly<Record<string, unknown>>): ProfileCircleView['capabilities'] =>
  Object.fromEntries(
    Object.entries(raw).flatMap(([key, value]) => {
      const state = KNOWN.has(key) ? stateOf(value) : null;
      return state === null ? [] : [[key as ProfileCapabilityKey, state] as const];
    }),
  );

/** `null` quand la charge n'a pas la forme attendue : l'écran n'invente aucun verdict. */
export function decodeProfileCircleView(raw: unknown): ProfileCircleView | null {
  if (!isRecord(raw) || !isRelationLevel(raw.level) || !isRecord(raw.capabilities)) return null;
  return {
    isSelf: raw.isSelf === true,
    level: raw.level,
    sharesCommunity: raw.sharesCommunity === true,
    capabilities: capabilitiesOf(raw.capabilities),
  };
}

export type ProfileViewAsParams = PublicProfileDeps & { readonly handle: string; readonly level: RelationLevel; readonly signal?: AbortSignal };

export async function loadProfileViewAs(params: ProfileViewAsParams): Promise<ApiResult<ProfileCircleView | null>> {
  if (__FIXTURES__ && params.source === 'fixtures') return { ok: true, data: null };
  const query = new URLSearchParams({ as: params.level, expand: 'circle' });
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${directoryEndpoints.peopleByHandle(params.handle)}?${query.toString()}`,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  return { ...result, data: isRecord(result.data) ? decodeProfileCircleView(result.data.circle) : null };
}

/**
 * Une famille À PART (`people-view-as`), jamais sous `['directory', 'people']` :
 * `friend-actions.ts` lit chaque entrée de ce préfixe comme une `PublicProfileView`.
 */
export const PROFILE_VIEW_AS_QUERY_PREFIX = ['directory', 'people-view-as'] as const;

export const profileViewAsQueryKey = (handle: string, level: RelationLevel) =>
  [...PROFILE_VIEW_AS_QUERY_PREFIX, handle.toLowerCase(), level] as const;

/** La vitrine d'un propriétaire change quand il change un réglage : une minute, comme sa fiche. */
export const PROFILE_VIEW_AS_STALE_TIME = 60_000;

export function profileViewAsQueryOptions(deps: PublicProfileDeps & { readonly handle: string; readonly level: RelationLevel }) {
  return {
    queryKey: profileViewAsQueryKey(deps.handle, deps.level),
    staleTime: PROFILE_VIEW_AS_STALE_TIME,
    retry: false,
    queryFn: ({ signal }: { readonly signal: AbortSignal }) => loadProfileViewAs({ ...deps, signal }).then(unwrap),
  };
}

/**
 * **LA FICHE PAR CERCLE DU LECTEUR RÉEL** (#18879) — `?expand=circle` sans `as` : la passerelle juge la
 * PAIRE (accords des deux côtés, blocage, communauté, âge, rôle) et sert le verdict. `null` quand le
 * champ n'est pas servi (passerelle plus ancienne, lecteur sans compte) : l'écran garde son
 * comportement d'avant, il n'invente pas de cercle.
 */
export async function loadProfileCircle(params: PublicProfileDeps & { readonly handle: string; readonly signal?: AbortSignal }): Promise<ApiResult<ProfileCircleView | null>> {
  if (__FIXTURES__ && params.source === 'fixtures') return { ok: true, data: null };
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${directoryEndpoints.peopleByHandle(params.handle)}?expand=circle`,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  return { ...result, data: isRecord(result.data) ? decodeProfileCircleView(result.data.circle) : null };
}

/** Une famille À PART (`people-circle`) ET par lecteur : le verdict d'une paire ne sert jamais un autre compte. */
export const PROFILE_CIRCLE_QUERY_PREFIX = ['directory', 'people-circle'] as const;

export const profileCircleQueryKey = (handle: string, viewerId: string) =>
  [...PROFILE_CIRCLE_QUERY_PREFIX, handle.toLowerCase(), viewerId] as const;

/** Les accords bougent par un geste de l'un ou de l'autre : une minute, et le geste local l'invalide. */
export const PROFILE_CIRCLE_STALE_TIME = 60_000;

export function profileCircleQueryOptions(deps: PublicProfileDeps & { readonly handle: string; readonly viewerId: string }) {
  return {
    queryKey: profileCircleQueryKey(deps.handle, deps.viewerId),
    staleTime: PROFILE_CIRCLE_STALE_TIME,
    retry: false,
    queryFn: ({ signal }: { readonly signal: AbortSignal }) => loadProfileCircle({ ...deps, signal }).then(unwrap),
  };
}
