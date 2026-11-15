import * as meEndpoints from '@meeshy/shared/api/endpoints/me';
import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { DEFAULT_SEASON_SCHEDULE, normalizeSeasonSchedule, type SeasonSchedule } from '@meeshy/shared/utils/game/season-schedule';

import { apiDeps } from './deps';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';
import { SEASON_CALENDAR_QUERY_KEY } from './game-v2-queries';

/**
 * LE CALENDRIER DES SAISONS SERVI (#10232, #10016) — `GET /me/game/seasons/calendar`,
 * la même donnée pour tous : une définition par saison programmée (lundi de
 * début, statut, thème, points d'étape, textes). Ce que le calendrier ne définit
 * pas se DÉRIVE (`season-schedule.ts`) ; le repli est donc `DEFAULT_SEASON_SCHEDULE`,
 * qui rend exactement la constante de `season.ts`.
 *
 * CONDITIONNEL. La passerelle sert l'ETag `"season-schedule-<révision>"` ; le
 * client renvoie la révision gardée en `If-None-Match` et lit le 304 comme
 * « inchangé » — la plupart des relectures ne coûtent aucun corps.
 *
 * CACHE-FIRST, HORS LIGNE. La dernière révision lue est gardée dans le
 * stockage local (une clé, une révision) : au démarrage, le calendrier gardé
 * sert tout de suite, sans attendre le réseau. Un stockage qui refuse (quota,
 * navigation privée, bloqué) ne casse rien — la mémoire du processus suffit, et
 * à défaut le repli. Une révision plus ancienne ne remplace jamais une plus
 * récente : une réponse en retard ne fait pas reculer le calendrier.
 *
 * Aucune identité dans ce cache : ce n'est la donnée de personne, c'est le
 * calendrier. Rien de la présence d'autrui n'y passe.
 */

export const SEASON_CALENDAR_STORAGE_KEY = 'meeshy.game.season-calendar.v1';
export const seasonCalendarQueryKey = SEASON_CALENDAR_QUERY_KEY;

/** L'ETag que la passerelle sert pour une révision — celui qu'on renvoie en `If-None-Match`. */
export const seasonScheduleEtag = (revision: number): string => `"season-schedule-${revision}"`;

export type SeasonCalendarRead = { readonly kind: 'fresh'; readonly schedule: SeasonSchedule } | { readonly kind: 'unchanged' };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** La forme minimale d'un calendrier servi : une révision entière et une liste. Le reste, la loi partagée le juge. */
const isServedShape = (value: unknown): boolean =>
  isRecord(value) && typeof value['revision'] === 'number' && Number.isInteger(value['revision']) && value['revision'] >= 0 && Array.isArray(value['seasons']);

export async function fetchSeasonCalendar(
  transport: HttpTransport,
  params: { readonly knownRevision: number | null; readonly signal?: AbortSignal | undefined },
): Promise<ApiResult<SeasonCalendarRead>> {
  const result = await transport.request<unknown>({
    method: 'GET',
    path: meEndpoints.gameSeasonsCalendar,
    ...(params.knownRevision === null ? {} : { headers: { 'If-None-Match': seasonScheduleEtag(params.knownRevision) } }),
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) {
    return result.status === 304 ? { ok: true, data: { kind: 'unchanged' } } : result;
  }
  if (!isServedShape(result.data)) {
    return { ok: false, status: 502, error: 'Le calendrier des saisons est illisible — forme inattendue', code: 'MALFORMED_PAYLOAD' };
  }
  return { ok: true, data: { kind: 'fresh', schedule: normalizeSeasonSchedule(result.data) } };
}

type StorageProvider = () => Storage | null;

const browserStorage: StorageProvider = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export type SeasonCalendarStore = {
  /** Le calendrier courant : la mémoire, sinon la copie gardée, sinon le repli. */
  readonly get: () => SeasonSchedule;
  readonly subscribe: (listener: () => void) => () => void;
  /** Relit le calendrier (conditionnel) ; un échec laisse la copie en place. */
  readonly refresh: (transport: HttpTransport, signal?: AbortSignal) => Promise<SeasonSchedule>;
};

function readStored(storage: StorageProvider): SeasonSchedule | null {
  try {
    const raw = storage()?.getItem(SEASON_CALENDAR_STORAGE_KEY);
    if (raw === null || raw === undefined) return null;
    const parsed: unknown = JSON.parse(raw);
    return isServedShape(parsed) ? normalizeSeasonSchedule(parsed) : null;
  } catch {
    return null;
  }
}

function writeStored(storage: StorageProvider, schedule: SeasonSchedule): void {
  try {
    storage()?.setItem(SEASON_CALENDAR_STORAGE_KEY, JSON.stringify(schedule));
  } catch {
    /* quota, navigation privée : la mémoire du processus suffit */
  }
}

export function createSeasonCalendarStore(storage: StorageProvider = browserStorage): SeasonCalendarStore {
  let current: SeasonSchedule | null = null;
  const listeners = new Set<() => void>();

  const get = (): SeasonSchedule => {
    current ??= readStored(storage) ?? DEFAULT_SEASON_SCHEDULE;
    return current;
  };

  const adopt = (schedule: SeasonSchedule): void => {
    if (schedule.revision < get().revision) return;
    if (schedule.revision === get().revision && JSON.stringify(schedule) === JSON.stringify(get())) return;
    current = schedule;
    writeStored(storage, schedule);
    for (const listener of [...listeners]) listener();
  };

  return {
    get,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    refresh: async (transport, signal) => {
      const held = get();
      const read = await fetchSeasonCalendar(transport, { knownRevision: held === DEFAULT_SEASON_SCHEDULE ? null : held.revision, signal });
      if (read.ok && read.data.kind === 'fresh') adopt(read.data.schedule);
      return get();
    },
  };
}

/** Le calendrier de l'application — une seule copie, partagée par tous les écrans du Jeu. */
export const seasonCalendarStore = createSeasonCalendarStore();

/** Le calendrier COURANT, hors composant : les vues pures le lisent ici. */
export const currentSeasonSchedule = (): SeasonSchedule => seasonCalendarStore.get();

/**
 * Le calendrier pour un écran : la copie gardée d'abord (aucun spinner), relue
 * au montage et au retour du réseau. Le banc (`fixtures`) ne parle à personne.
 */
export function useSeasonSchedule(deps: { readonly source: DataSource; readonly transport: HttpTransport } = apiDeps): SeasonSchedule {
  useQuery({
    queryKey: seasonCalendarQueryKey,
    enabled: !(__FIXTURES__ && deps.source === 'fixtures'),
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnReconnect: 'always',
    queryFn: ({ signal }) => seasonCalendarStore.refresh(deps.transport, signal),
  });
  return useSyncExternalStore(seasonCalendarStore.subscribe, seasonCalendarStore.get, seasonCalendarStore.get);
}
