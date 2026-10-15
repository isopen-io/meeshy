import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { SEASON_COPY_LOCALES, type SeasonCopy, type SeasonCopyByLocale, type SeasonDefinitionStatus, type SeasonEditRefusal } from '@meeshy/shared/utils/game/season-schedule';
import type { SeasonAppEvent } from '@meeshy/shared/utils/game/season-app-events';

import { type AdminDeps, asRecord } from './admin';
import type { ApiFailure, ApiResult } from './http';

/**
 * **LE CALENDRIER DES SAISONS, CÔTÉ ADMINISTRATION** (#10232, #10233) — `/admin/game/seasons*`, gardé par
 * `canManageGame` (BIGBOSS et ADMIN). Programmer, décaler ou mettre en pause une saison FUTURE ; demander une
 * proposition à l'IA (elle reste EN ATTENTE : un humain la valide ou la rejette) ; exporter le bloc App Store
 * `store.app_events`.
 *
 * | adresse | ce qu'elle fait |
 * |---|---|
 * | `GET /admin/game/seasons?from=&count=` | les saisons, leur état (passée, en cours, à venir), la révision et l'instant du serveur |
 * | `PUT /admin/game/seasons/:number` | modifie les champs ENVOYÉS d'une saison future (`expectedRevision` obligatoire) |
 * | `POST /admin/game/seasons/:number/proposals` | demande une proposition à l'IA (consigne ≤ 500) |
 * | `GET /admin/game/seasons/proposals?status=` | les propositions |
 * | `POST …/proposals/:id/approve` | l'humain valide, avec ses corrections éventuelles |
 * | `POST …/proposals/:id/reject` | l'humain rejette (raison ≤ 280) |
 * | `GET /admin/game/seasons/app-events?count=` | les événements App Store, leurs défauts et le YAML `store.app_events` |
 *
 * Les adresses viennent du catalogue généré depuis le manifeste de la passerelle
 * (`packages/shared/api/endpoints/admin.ts`). `GET …/app-events.yaml` (téléchargement direct, pour un script) n'a pas
 * d'appelant web : l'écran télécharge le champ `yaml` de la réponse JSON.
 *
 * ## Les refus sont des CODES
 *
 * La passerelle répond `409 { error: 'revision-conflict' | 'proposal-not-pending' }`,
 * `422 { error: <SeasonEditRefusal> }`, `503 { error: 'agent-unavailable' }`, `502 { error: 'proposal-invalid' }`.
 * Le transport les rend tels quels dans `ApiFailure.error` ; `seasonRefusalOf` les nomme, et l'écran les traduit.
 *
 * ## Une charge est lue champ par champ
 *
 * Aucun spread : un champ voisin qu'une version future de la passerelle ajouterait n'entre pas dans le cache.
 * Une ligne ou une proposition illisible est écartée, jamais devinée.
 */

export const ADMIN_GAME_SEASONS_QUERY_KEY = ['admin', 'game-seasons'] as const;
export const adminSeasonsQueryKey = () => [...ADMIN_GAME_SEASONS_QUERY_KEY, 'list'] as const;
export const adminSeasonProposalsQueryKey = (status: ProposalStatusFilter) => [...ADMIN_GAME_SEASONS_QUERY_KEY, 'proposals', status] as const;

export type SeasonTenseName = 'past' | 'current' | 'upcoming';

export type AdminSeasonRow = {
  readonly number: number;
  readonly startDay: string;
  /** `null` pour une saison en pause : elle n'a pas de dates. */
  readonly endDay: string | null;
  readonly status: SeasonDefinitionStatus;
  readonly tense: SeasonTenseName;
  /** `true` quand la saison a une définition en base (sinon elle est dérivée par la loi). */
  readonly explicit: boolean;
  /** `false` : en cours ou passée, elle ne se réécrit pas. */
  readonly editable: boolean;
  readonly themeKey: string;
  readonly stepPoints: number;
  readonly copy: SeasonCopyByLocale | null;
};

export type AdminSeasonList = {
  readonly revision: number;
  readonly now: { readonly dayKey: string; readonly minuteOfDay: number };
  readonly seasons: readonly AdminSeasonRow[];
};

export type ProposalStatus = 'pending' | 'approved' | 'rejected';
export type ProposalStatusFilter = ProposalStatus | 'all';

export type SeasonProposal = {
  readonly id: string;
  readonly number: number;
  readonly status: ProposalStatus;
  readonly startDay: string;
  readonly themeKey: string;
  readonly stepPoints: number;
  readonly copy: SeasonCopyByLocale;
  readonly appEvent: SeasonAppEvent | null;
  readonly appEventFaults: readonly string[];
  readonly brief: string | null;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
  readonly model: string | null;
};

/** Ce qu'un `PUT` ou une validation envoie : la révision lue, et les seuls champs changés. */
export type SeasonEditBody = {
  readonly expectedRevision: number;
  readonly startDay?: string;
  readonly status?: SeasonDefinitionStatus;
  readonly themeKey?: string;
  readonly stepPoints?: number;
  readonly copy?: SeasonCopyByLocale | null;
};

export type SeasonApprovalBody = Omit<SeasonEditBody, 'status'>;

const MALFORMED = (what: string): ApiFailure => ({ ok: false, status: 502, error: `La réponse du calendrier est illisible — ${what}`, code: 'MALFORMED_PAYLOAD' });

const textOf = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const intOf = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) ? value : null);
const isTense = (value: unknown): value is SeasonTenseName => value === 'past' || value === 'current' || value === 'upcoming';
const isStatus = (value: unknown): value is SeasonDefinitionStatus => value === 'scheduled' || value === 'paused';
const isProposalStatus = (value: unknown): value is ProposalStatus => value === 'pending' || value === 'approved' || value === 'rejected';

/** Les textes d'une saison, à la forme près (sept langues, trois textes) : les LIMITES se jugent à l'écran, pas ici. */
export function decodeSeasonCopy(raw: unknown): SeasonCopyByLocale | null {
  const record = asRecord(raw);
  if (record === null) return null;
  const entries: Array<readonly [string, SeasonCopy]> = [];
  for (const locale of SEASON_COPY_LOCALES) {
    const copy = asRecord(record[locale]);
    const title = textOf(copy?.['title']);
    const tagline = textOf(copy?.['tagline']);
    const description = textOf(copy?.['description']);
    if (title === null || tagline === null || description === null) return null;
    entries.push([locale, { title, tagline, description }]);
  }
  return Object.fromEntries(entries) as SeasonCopyByLocale;
}

export function decodeSeasonRow(raw: unknown): AdminSeasonRow | null {
  const r = asRecord(raw);
  if (r === null) return null;
  const number = intOf(r['number']);
  const startDay = textOf(r['startDay']);
  const stepPoints = intOf(r['stepPoints']);
  const themeKey = textOf(r['themeKey']);
  if (number === null || number < 1 || startDay === null || stepPoints === null || themeKey === null) return null;
  if (!isStatus(r['status']) || !isTense(r['tense'])) return null;
  const copy = r['copy'] === null || r['copy'] === undefined ? null : decodeSeasonCopy(r['copy']);
  if (r['copy'] !== null && r['copy'] !== undefined && copy === null) return null;
  return {
    number,
    startDay,
    endDay: textOrNull(r['endDay']),
    status: r['status'],
    tense: r['tense'],
    explicit: r['explicit'] === true,
    editable: r['editable'] === true,
    themeKey,
    stepPoints,
    copy,
  };
}

function decodeAppEvent(raw: unknown): SeasonAppEvent | null {
  const r = asRecord(raw);
  const localizations = asRecord(r?.['localizations']);
  if (r === null || localizations === null) return null;
  for (const key of ['key', 'reference_name', 'badge', 'purpose', 'priority', 'purchase_requirement', 'deep_link', 'primary_locale', 'territories', 'publish_start', 'event_start', 'event_end']) {
    if (typeof r[key] !== 'string') return null;
  }
  const decoded: Record<string, { name: string; short_description: string; long_description: string }> = {};
  for (const [locale, value] of Object.entries(localizations)) {
    const l = asRecord(value);
    const name = textOf(l?.['name']);
    const short = textOf(l?.['short_description']);
    const long = textOf(l?.['long_description']);
    if (name === null || short === null || long === null) return null;
    decoded[locale] = { name, short_description: short, long_description: long };
  }
  return {
    key: r['key'] as string,
    reference_name: r['reference_name'] as string,
    badge: 'NEW_SEASON',
    purpose: 'KEEP_ACTIVE_USERS_INFORMED',
    priority: r['priority'] === 'HIGH' ? 'HIGH' : 'NORMAL',
    purchase_requirement: 'NO_COST_ASSOCIATED',
    deep_link: r['deep_link'] as string,
    primary_locale: 'fr-FR',
    territories: 'all',
    publish_start: r['publish_start'] as string,
    event_start: r['event_start'] as string,
    event_end: r['event_end'] as string,
    localizations: decoded,
  };
}

export function decodeProposal(raw: unknown): SeasonProposal | null {
  const r = asRecord(raw);
  if (r === null) return null;
  const id = textOf(r['id']);
  const number = intOf(r['number']);
  const startDay = textOf(r['startDay']);
  const themeKey = textOf(r['themeKey']);
  const stepPoints = intOf(r['stepPoints']);
  const copy = decodeSeasonCopy(r['copy']);
  const createdAt = textOf(r['createdAt']);
  if (id === null || id === '' || number === null || startDay === null || themeKey === null || stepPoints === null || copy === null || createdAt === null) return null;
  if (!isProposalStatus(r['status'])) return null;
  return {
    id,
    number,
    status: r['status'],
    startDay,
    themeKey,
    stepPoints,
    copy,
    appEvent: decodeAppEvent(r['appEvent']),
    appEventFaults: (Array.isArray(r['appEventFaults']) ? r['appEventFaults'] : []).filter((fault): fault is string => typeof fault === 'string'),
    brief: textOrNull(r['brief']),
    createdAt,
    reviewedAt: textOrNull(r['reviewedAt']),
    model: textOrNull(r['model']),
  };
}

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

export async function loadAdminSeasons(params: AdminDeps & { readonly from?: number; readonly count?: number; readonly signal?: AbortSignal }): Promise<ApiResult<AdminSeasonList>> {
  const query = [params.from === undefined ? null : `from=${params.from}`, params.count === undefined ? null : `count=${params.count}`].filter((part) => part !== null).join('&');
  const result = await params.transport.request<unknown>({ method: 'GET', path: query === '' ? adminEndpoints.gameSeasons : `${adminEndpoints.gameSeasons}?${query}`, ...withSignal(params.signal) });
  if (!result.ok) return result;
  const data = asRecord(result.data);
  const now = asRecord(data?.['now']);
  const revision = intOf(data?.['revision']);
  const dayKey = textOf(now?.['dayKey']);
  const minuteOfDay = intOf(now?.['minuteOfDay']);
  if (revision === null || dayKey === null || minuteOfDay === null || !Array.isArray(data?.['seasons'])) return MALFORMED('liste des saisons');
  const seasons = (data['seasons'] as unknown[]).map(decodeSeasonRow).filter((row): row is AdminSeasonRow => row !== null);
  return { ok: true, data: { revision, now: { dayKey, minuteOfDay }, seasons } };
}

export type SavedSeason = { readonly revision: number; readonly season: AdminSeasonRow };

export async function saveAdminSeason(params: AdminDeps & { readonly number: number; readonly body: SeasonEditBody }): Promise<ApiResult<SavedSeason>> {
  const result = await params.transport.request<unknown>({ method: 'PUT', path: adminEndpoints.gameSeasonsByNumber(String(params.number)), body: params.body });
  if (!result.ok) return result;
  const data = asRecord(result.data);
  const revision = intOf(data?.['revision']);
  const season = decodeSeasonRow(data?.['season']);
  return revision === null || season === null ? MALFORMED('saison enregistrée') : { ok: true, data: { revision, season } };
}

/** Demande une proposition à l'IA. Elle revient EN ATTENTE : rien n'est appliqué avant la validation d'un humain. */
export async function proposeSeason(params: AdminDeps & { readonly number: number; readonly brief?: string }): Promise<ApiResult<SeasonProposal>> {
  const brief = params.brief?.trim() ?? '';
  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: adminEndpoints.gameSeasonsByNumberProposals(String(params.number)),
    body: brief === '' ? {} : { brief },
  });
  if (!result.ok) return result;
  const proposal = decodeProposal(result.data);
  return proposal === null ? MALFORMED('proposition') : { ok: true, data: proposal };
}

export async function loadSeasonProposals(params: AdminDeps & { readonly status: ProposalStatusFilter; readonly signal?: AbortSignal }): Promise<ApiResult<readonly SeasonProposal[]>> {
  const result = await params.transport.request<unknown>({ method: 'GET', path: `${adminEndpoints.gameSeasonsProposals}?status=${params.status}`, ...withSignal(params.signal) });
  if (!result.ok) return result;
  const items = asRecord(result.data)?.['items'];
  if (!Array.isArray(items)) return MALFORMED('liste des propositions');
  return { ok: true, data: items.map(decodeProposal).filter((proposal): proposal is SeasonProposal => proposal !== null) };
}

export async function approveSeasonProposal(
  params: AdminDeps & { readonly id: string; readonly body: SeasonApprovalBody },
): Promise<ApiResult<{ readonly revision: number; readonly season: AdminSeasonRow; readonly proposal: SeasonProposal }>> {
  const result = await params.transport.request<unknown>({ method: 'POST', path: adminEndpoints.gameSeasonsProposalsByIdApprove(params.id), body: params.body });
  if (!result.ok) return result;
  const data = asRecord(result.data);
  const revision = intOf(data?.['revision']);
  const season = decodeSeasonRow(data?.['season']);
  const proposal = decodeProposal(data?.['proposal']);
  return revision === null || season === null || proposal === null ? MALFORMED('validation') : { ok: true, data: { revision, season, proposal } };
}

export async function rejectSeasonProposal(params: AdminDeps & { readonly id: string; readonly reason?: string }): Promise<ApiResult<SeasonProposal>> {
  const reason = params.reason?.trim() ?? '';
  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: adminEndpoints.gameSeasonsProposalsByIdReject(params.id),
    body: reason === '' ? {} : { reason },
  });
  if (!result.ok) return result;
  const proposal = decodeProposal(asRecord(result.data)?.['proposal']);
  return proposal === null ? MALFORMED('rejet') : { ok: true, data: proposal };
}

export type SeasonAppEventsExport = {
  /** La révision du calendrier dont l'export est tiré (nomme le fichier) ; `null` d'un ancien serveur. */
  readonly revision: number | null;
  readonly events: readonly SeasonAppEvent[];
  /** Les défauts de chaque événement, par clé : un événement fautif ne part pas à Apple. */
  readonly faults: Readonly<Record<string, readonly string[]>>;
  /** Le bloc `store.app_events` prêt à coller dans `apps/ios/andp.yml`. */
  readonly yaml: string;
};

export async function exportSeasonAppEvents(params: AdminDeps & { readonly count?: number; readonly signal?: AbortSignal }): Promise<ApiResult<SeasonAppEventsExport>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: params.count === undefined ? adminEndpoints.gameSeasonsAppEvents : `${adminEndpoints.gameSeasonsAppEvents}?count=${params.count}`,
    ...withSignal(params.signal),
  });
  if (!result.ok) return result;
  const data = asRecord(result.data);
  const yaml = textOf(data?.['yaml']);
  const events = data?.['events'];
  if (yaml === null || !Array.isArray(events)) return MALFORMED('export App Store');
  const faults: Record<string, readonly string[]> = {};
  for (const [key, list] of Object.entries(asRecord(data?.['faults']) ?? {})) {
    faults[key] = (Array.isArray(list) ? list : []).filter((fault): fault is string => typeof fault === 'string');
  }
  return { ok: true, data: { revision: intOf(data?.['revision']), events: events.map(decodeAppEvent).filter((event): event is SeasonAppEvent => event !== null), faults, yaml } };
}

/** Les refus que la passerelle nomme — l'écran traduit chacun, et un code inconnu retombe sur le texte générique. */
export type SeasonGatewayRefusal =
  | SeasonEditRefusal
  | 'revision-conflict'
  | 'schedule-indexes-unavailable'
  | 'proposal-not-pending'
  | 'proposal-not-found'
  | 'audit-unavailable'
  | 'agent-unavailable'
  | 'proposal-invalid';

export const SEASON_REFUSALS: readonly SeasonGatewayRefusal[] = [
  'invalid-number',
  'invalid-status',
  'season-not-future',
  'season-announced',
  'invalid-day',
  'not-monday',
  'start-not-future',
  'start-too-soon',
  'overlaps-previous',
  'overlaps-next',
  'invalid-theme',
  'rewards-out-of-bounds',
  'copy-invalid',
  'revision-conflict',
  'schedule-indexes-unavailable',
  'proposal-not-pending',
  'proposal-not-found',
  'audit-unavailable',
  'agent-unavailable',
  'proposal-invalid',
];

export function seasonRefusalOf(failure: Pick<ApiFailure, 'error'>): SeasonGatewayRefusal | null {
  return SEASON_REFUSALS.find((code) => code === failure.error) ?? null;
}
