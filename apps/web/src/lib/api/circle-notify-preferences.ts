import type { QueryClient } from '@tanstack/react-query';
import * as meEndpoints from '@meeshy/shared/api/endpoints/me';
import {
  CIRCLE_NOTIFY_DEFAULTS,
  CIRCLE_NOTIFY_KEYS,
  isRelationAudienceChoice,
  type CircleNotifyKey,
  type RelationAudienceChoice,
} from '@meeshy/shared/utils/relation-levels';

import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **« QUI EST PRÉVENU »** (#14063) — les dix-neuf crans d'entourage que
 * #13929 sert sous `notification.circle*` (ADR gateway
 * `2026-10-31-l-entourage-prevenu-se-regle-action-par-action-13929`). Les
 * clés, les familles et les défauts viennent de `@meeshy/shared`
 * (`CIRCLE_NOTIFY_FAMILIES`, `CIRCLE_NOTIFY_DEFAULTS`) : rien n'est redéclaré
 * ici.
 *
 * **Une clé absente vaut le défaut de sa famille** (Proche, Proche, Sang) :
 * c'est ce que la passerelle applique à un document antérieur, et c'est ce
 * que l'écran montre sans configuration préalable. **Un cran INCONNU rend la
 * lecture illisible** : afficher un défaut à la place ferait croire au lecteur
 * qu'il prévient moins de monde qu'il ne le fait.
 *
 * **Une écriture ne touche qu'UNE clé plate** — un `PATCH` partiel n'écrase
 * jamais les autres crans. Optimiste, et le retour arrière ne défait que la
 * clé du geste refusé ; hors ligne, rien ne part (le web n'a pas de file
 * d'écriture, motif `app-preferences-actions.ts`).
 */

export const CIRCLE_NOTIFY_QUERY_KEY = ['me', 'circle-notify'] as const;

export type CircleNotifyPreferences = Readonly<Record<CircleNotifyKey, RelationAudienceChoice>>;

export type CircleNotifyDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export type CircleNotifyEdit = { readonly key: CircleNotifyKey; readonly value: RelationAudienceChoice };

const FIELDS_QUERY = CIRCLE_NOTIFY_KEYS.map((key) => `notification.${key}`).join(',');

const UNREADABLE = { ok: false, status: 0, error: 'Réglages illisibles' } as const;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const notificationOf = (raw: unknown): Readonly<Record<string, unknown>> | null => {
  if (!isRecord(raw)) return null;
  const notification = raw.notification ?? {};
  return isRecord(notification) ? notification : null;
};

export function decodeCircleNotify(raw: unknown): CircleNotifyPreferences | null {
  const notification = notificationOf(raw);
  if (notification === null) return null;
  const entries = CIRCLE_NOTIFY_KEYS.map((key) => [key, notification[key] ?? CIRCLE_NOTIFY_DEFAULTS[key]] as const);
  if (!entries.every(([, value]) => isRelationAudienceChoice(value))) return null;
  return Object.fromEntries(entries) as CircleNotifyPreferences;
}

export async function loadCircleNotify(
  params: CircleNotifyDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<CircleNotifyPreferences>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureCircleNotify } = await import('./fixtures-circle-notify');
    return { ok: true, data: fixtureCircleNotify() };
  }
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${meEndpoints.preferences}?fields=${FIELDS_QUERY}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  const preferences = decodeCircleNotify(result.data);
  return preferences === null ? UNREADABLE : { ok: true, data: preferences };
}

/** Rend le cran que la passerelle a RETENU pour la clé du geste. */
export async function patchCircleNotify(deps: CircleNotifyDeps, edit: CircleNotifyEdit): Promise<ApiResult<RelationAudienceChoice>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixturePatchCircleNotify } = await import('./fixtures-circle-notify');
    return { ok: true, data: fixturePatchCircleNotify(edit) };
  }
  const result = await deps.transport.request<unknown>({
    method: 'PATCH',
    path: meEndpoints.preferences,
    body: { notification: { [edit.key]: edit.value } },
  });
  if (!result.ok) return result;
  const served = decodeCircleNotify(result.data);
  return served === null ? UNREADABLE : { ok: true, data: served[edit.key] };
}

export function circleNotifyQueryOptions(deps: CircleNotifyDeps) {
  return {
    queryKey: CIRCLE_NOTIFY_QUERY_KEY,
    staleTime: 30 * 60_000,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) =>
      unwrap(await loadCircleNotify({ ...deps, ...(signal === undefined ? {} : { signal }) })),
  };
}

export type CircleNotifyActionDeps = CircleNotifyDeps & {
  readonly queryClient: QueryClient;
  readonly isOnline: () => boolean;
};

export type CircleNotifyEditOutcome =
  | { readonly status: 'saved' }
  | { readonly status: 'offline' }
  | { readonly status: 'refused'; readonly error: string };

export async function performCircleNotifyEdit(
  params: CircleNotifyEdit & { readonly deps: CircleNotifyActionDeps },
): Promise<CircleNotifyEditOutcome> {
  const { key, value, deps } = params;
  if (!deps.isOnline()) return { status: 'offline' };

  const write = (next: RelationAudienceChoice) => {
    const current = deps.queryClient.getQueryData<CircleNotifyPreferences>(CIRCLE_NOTIFY_QUERY_KEY);
    if (current !== undefined) deps.queryClient.setQueryData<CircleNotifyPreferences>(CIRCLE_NOTIFY_QUERY_KEY, { ...current, [key]: next });
  };

  await deps.queryClient.cancelQueries({ queryKey: CIRCLE_NOTIFY_QUERY_KEY });
  const previous = deps.queryClient.getQueryData<CircleNotifyPreferences>(CIRCLE_NOTIFY_QUERY_KEY)?.[key];
  write(value);

  const result = await patchCircleNotify(deps, { key, value });
  if (!result.ok) {
    if (previous !== undefined) write(previous);
    return { status: 'refused', error: result.error };
  }
  write(result.data);
  return { status: 'saved' };
}
