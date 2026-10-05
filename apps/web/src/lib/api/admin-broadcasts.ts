import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { type AdminDeps, asCount, asRecord, asText } from './admin';
import { adminPageOf, type AdminPage } from './admin-page';
import type { ApiResult } from './http';

/**
 * **LES DIFFUSIONS** (#8876, #6731) — `GET|POST /admin/broadcasts`,
 * `GET|PUT|DELETE /admin/broadcasts/:id`, `…/preview`, `…/send`, `…/send-inapp`,
 * gardées par `canManageNotifications` côté passerelle.
 *
 * ## Ce que la passerelle sert, et ce que ce décodeur en garde
 *
 * La LISTE sert une projection étroite (nom, objet, statut, compteurs, dates) ;
 * la FICHE sert la ligne ENTIÈRE — corps, ciblage, traductions — plus les trois
 * personnes NOMMÉES qui l'ont créée, envoyée et publiée dans l'application.
 * Le décodeur lit champ par champ, **aucun spread** : une colonne future de la
 * ligne `AdminBroadcast` n'entre pas dans un cache qui porte, par construction,
 * le texte d'un courrier destiné à tous les comptes.
 *
 * Les identifiants des acteurs (`createdById`, `sentById`, `inAppSentById`) ne
 * sont PAS gardés : la passerelle sert les personnes nommées, et un identifiant
 * voisin d'un nom est la pente qui mène à le peindre.
 *
 * ## Ce qu'un geste rend
 *
 * Créer rend la ligne brute (on n'en garde que l'identifiant, pour ouvrir la
 * fiche) ; modifier, envoyer, publier, supprimer rendent un simple accusé ;
 * préparer rend le rapport de préparation (destinataires par langue et par pays),
 * qui n'existe nulle part ailleurs : la ligne ne porte que le total. La vérité de
 * la fiche se relit par invalidation.
 */
export type AdminBroadcastPerson = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
};

export const BROADCAST_ACTIVITIES = ['all', 'active', 'inactive', 'new'] as const;
export type AdminBroadcastActivity = (typeof BROADCAST_ACTIVITIES)[number];

/** L'audience telle que la passerelle la garde : activité, fenêtre d'inactivité, langues, pays. */
export type AdminBroadcastTargeting = {
  readonly activity: AdminBroadcastActivity;
  readonly inactiveDays: number | null;
  readonly languages: readonly string[];
  readonly countries: readonly string[];
};

export type AdminBroadcastRow = {
  readonly id: string;
  readonly name: string;
  readonly subject: string;
  readonly status: string;
  readonly totalRecipients: number;
  readonly sentCount: number;
  readonly failedCount: number;
  readonly inAppSentCount: number;
  readonly inAppSentAt: string | null;
  readonly createdAt: string;
  readonly sentAt: string | null;
};

export type AdminBroadcastTranslation = {
  readonly language: string;
  readonly subject: string | null;
  readonly body: string | null;
};

export type AdminBroadcast = {
  readonly id: string;
  readonly name: string;
  readonly subject: string;
  readonly body: string;
  readonly sourceLanguage: string;
  readonly targeting: AdminBroadcastTargeting;
  readonly translations: readonly AdminBroadcastTranslation[];
  readonly targetLanguages: readonly string[];
  readonly status: string;
  readonly totalRecipients: number;
  readonly sentCount: number;
  readonly failedCount: number;
  readonly errorMessage: string | null;
  readonly sentAt: string | null;
  readonly completedAt: string | null;
  readonly inAppSentAt: string | null;
  readonly inAppCompletedAt: string | null;
  readonly inAppSentCount: number;
  readonly inAppFailedCount: number;
  readonly createdAt: string;
  readonly updatedAt: string | null;
  readonly createdBy: AdminBroadcastPerson | null;
  readonly sentBy: AdminBroadcastPerson | null;
  readonly inAppSentBy: AdminBroadcastPerson | null;
};

export type AdminBroadcastPreview = {
  readonly recipientCount: number;
  readonly byLanguage: readonly { readonly language: string; readonly count: number }[];
  /** `country: null` = pays d'inscription inconnu (absent ou vide côté compte). */
  readonly byCountry: readonly { readonly country: string | null; readonly count: number }[];
};

/** Le corps d'une création ou d'une modification — exactement ce que `CreateBroadcastBodySchema` lit. */
export type AdminBroadcastBody = {
  readonly name: string;
  readonly subject: string;
  readonly body: string;
  readonly sourceLanguage: string;
  readonly targeting: {
    readonly activityStatus: AdminBroadcastActivity;
    readonly inactiveDays?: number;
    readonly languages?: readonly string[];
    readonly countries?: readonly string[];
  };
};

/** L'accusé d'un geste : « c'est fait ». Non nul — `useAdminAction` rend `null` pour un refus. */
export type AdminBroadcastAck = { readonly acknowledged: true };

/**
 * La préparation TRADUIT l'objet et le corps vers toutes les langues des
 * destinataires (un appel au traducteur par langue) avant de répondre : les
 * quinze secondes du transport ne suffisent pas, et l'abandonner côté client
 * laisserait croire à un échec pendant que la passerelle finit le travail.
 */
export const ADMIN_BROADCAST_PREPARE_TIMEOUT_MS = 120_000;

const UNREADABLE = { ok: false, status: 502, error: 'Charge illisible' } as const;

const textOrNull = (value: unknown): string | null => {
  const text = asText(value).trim();
  return text === '' ? null : text;
};

const instantOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

const distinctTexts = (value: unknown, normalize: (text: string) => string): readonly string[] => {
  if (!Array.isArray(value)) return [];
  const texts = value.flatMap((entry) => (typeof entry === 'string' && entry.trim() !== '' ? [normalize(entry.trim())] : []));
  return [...new Set(texts)];
};

function decodePerson(raw: unknown): AdminBroadcastPerson | null {
  const person = asRecord(raw);
  if (person === null || typeof person.id !== 'string' || person.id === '') return null;
  return {
    id: person.id,
    username: asText(person.username),
    displayName: textOrNull(person.displayName),
    avatar: textOrNull(person.avatar),
  };
}

const isActivity = (value: unknown): value is AdminBroadcastActivity => BROADCAST_ACTIVITIES.some((activity) => activity === value);

export function decodeBroadcastTargeting(raw: unknown): AdminBroadcastTargeting {
  const targeting = asRecord(raw) ?? {};
  const days = targeting.inactiveDays;
  return {
    activity: isActivity(targeting.activityStatus) ? targeting.activityStatus : 'all',
    inactiveDays: typeof days === 'number' && Number.isInteger(days) && days > 0 ? days : null,
    languages: distinctTexts(targeting.languages, (code) => code),
    countries: distinctTexts(targeting.countries, (code) => code.toUpperCase()),
  };
}

export function decodeAdminBroadcastRow(raw: unknown): AdminBroadcastRow | null {
  const row = asRecord(raw);
  if (row === null) return null;
  const { id, status, createdAt } = row;
  if (typeof id !== 'string' || id === '' || typeof status !== 'string' || typeof createdAt !== 'string') return null;
  return {
    id,
    name: asText(row.name),
    subject: asText(row.subject),
    status,
    totalRecipients: asCount(row.totalRecipients),
    sentCount: asCount(row.sentCount),
    failedCount: asCount(row.failedCount),
    inAppSentCount: asCount(row.inAppSentCount),
    inAppSentAt: instantOrNull(row.inAppSentAt),
    createdAt,
    sentAt: instantOrNull(row.sentAt),
  };
}

const textsByLanguage = (raw: unknown): ReadonlyMap<string, string> => {
  const record = asRecord(raw) ?? {};
  return new Map(Object.entries(record).flatMap(([language, text]) => (typeof text === 'string' && text.trim() !== '' ? [[language, text] as const] : [])));
};

/**
 * Les traductions, UNE entrée par langue : l'objet et le corps viennent de deux
 * cartes séparées (`translatedSubjects`, `translatedBodies`). L'ordre est celui
 * des langues cibles posées à la préparation, puis le code pour le reste — il est
 * donc stable d'une lecture à l'autre, et ne dépend pas de l'ordre des clés du JSON.
 */
function decodeTranslations(subjects: unknown, bodies: unknown, targetLanguages: readonly string[]): readonly AdminBroadcastTranslation[] {
  const subjectOf = textsByLanguage(subjects);
  const bodyOf = textsByLanguage(bodies);
  const languages = [...new Set([...subjectOf.keys(), ...bodyOf.keys()])];
  const rank = (language: string): number => {
    const index = targetLanguages.indexOf(language);
    return index === -1 ? targetLanguages.length : index;
  };
  return [...languages]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((language) => ({ language, subject: subjectOf.get(language) ?? null, body: bodyOf.get(language) ?? null }));
}

export function decodeAdminBroadcast(raw: unknown): AdminBroadcast | null {
  const row = asRecord(raw);
  if (row === null) return null;
  const { id, status, createdAt } = row;
  if (typeof id !== 'string' || id === '' || typeof status !== 'string' || typeof createdAt !== 'string') return null;
  const targetLanguages = distinctTexts(row.targetLanguages, (code) => code);
  return {
    id,
    name: asText(row.name),
    subject: asText(row.subject),
    body: asText(row.body),
    sourceLanguage: asText(row.sourceLanguage),
    targeting: decodeBroadcastTargeting(row.targeting),
    translations: decodeTranslations(row.translatedSubjects, row.translatedBodies, targetLanguages),
    targetLanguages,
    status,
    totalRecipients: asCount(row.totalRecipients),
    sentCount: asCount(row.sentCount),
    failedCount: asCount(row.failedCount),
    errorMessage: textOrNull(row.errorMessage),
    sentAt: instantOrNull(row.sentAt),
    completedAt: instantOrNull(row.completedAt),
    inAppSentAt: instantOrNull(row.inAppSentAt),
    inAppCompletedAt: instantOrNull(row.inAppCompletedAt),
    inAppSentCount: asCount(row.inAppSentCount),
    inAppFailedCount: asCount(row.inAppFailedCount),
    createdAt,
    updatedAt: instantOrNull(row.updatedAt),
    createdBy: decodePerson(row.createdBy),
    sentBy: decodePerson(row.sentBy),
    inAppSentBy: decodePerson(row.inAppSentBy),
  };
}

const byCountDescending = <Entry extends { readonly count: number }>(entries: readonly Entry[]): readonly Entry[] =>
  [...entries].sort((a, b) => b.count - a.count);

export function decodeBroadcastPreview(raw: unknown): AdminBroadcastPreview | null {
  const preview = asRecord(raw);
  if (preview === null || typeof preview.recipientCount !== 'number' || !Number.isFinite(preview.recipientCount) || preview.recipientCount < 0) return null;

  const languages = (Array.isArray(preview.recipientsByLanguage) ? preview.recipientsByLanguage : []).flatMap((entry: unknown) => {
    const line = asRecord(entry);
    if (line === null || typeof line.language !== 'string' || line.language === '') return [];
    if (typeof line.count !== 'number' || !Number.isFinite(line.count) || line.count < 0) return [];
    return [{ language: line.language, count: line.count }];
  });

  const countries = new Map<string | null, number>();
  (Array.isArray(preview.recipientsByCountry) ? preview.recipientsByCountry : []).forEach((entry: unknown) => {
    const line = asRecord(entry);
    if (line === null || typeof line.count !== 'number' || !Number.isFinite(line.count) || line.count < 0) return;
    const country = typeof line.country === 'string' && line.country.trim() !== '' ? line.country.trim().toUpperCase() : null;
    countries.set(country, (countries.get(country) ?? 0) + line.count);
  });

  return {
    recipientCount: preview.recipientCount,
    byLanguage: byCountDescending(languages),
    byCountry: byCountDescending([...countries].map(([country, count]) => ({ country, count }))),
  };
}

const withStatus = (result: { readonly status?: number }) => (result.status === undefined ? {} : { status: result.status });

const acknowledged = (result: ApiResult<unknown>): ApiResult<AdminBroadcastAck> =>
  result.ok ? { ok: true, data: { acknowledged: true }, ...withStatus(result) } : result;

export async function loadAdminBroadcasts(
  params: AdminDeps & { readonly query: URLSearchParams; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminPage<AdminBroadcastRow>>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.broadcasts}?${params.query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  return adminPageOf(result, decodeAdminBroadcastRow, { kind: 'nested', key: 'broadcasts' });
}

export async function loadAdminBroadcast(
  params: AdminDeps & { readonly broadcastId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminBroadcast>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: adminEndpoints.broadcastsById(params.broadcastId),
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  const broadcast = decodeAdminBroadcast(result.data);
  if (broadcast === null) return UNREADABLE;
  return { ok: true, data: broadcast, ...withStatus(result) };
}

export async function createAdminBroadcast(params: AdminDeps & { readonly body: AdminBroadcastBody }): Promise<ApiResult<{ readonly id: string }>> {
  const result = await params.transport.request<unknown>({ method: 'POST', path: adminEndpoints.broadcasts, body: params.body });
  if (!result.ok) return result;
  const id = asRecord(result.data)?.id;
  if (typeof id !== 'string' || id === '') return UNREADABLE;
  return { ok: true, data: { id }, ...withStatus(result) };
}

export async function updateAdminBroadcast(
  params: AdminDeps & { readonly broadcastId: string; readonly body: AdminBroadcastBody },
): Promise<ApiResult<AdminBroadcastAck>> {
  return acknowledged(
    await params.transport.request<unknown>({ method: 'PUT', path: adminEndpoints.broadcastsById(params.broadcastId), body: params.body }),
  );
}

export async function deleteAdminBroadcast(params: AdminDeps & { readonly broadcastId: string }): Promise<ApiResult<AdminBroadcastAck>> {
  return acknowledged(await params.transport.request<unknown>({ method: 'DELETE', path: adminEndpoints.broadcastsById(params.broadcastId) }));
}

export async function prepareAdminBroadcast(params: AdminDeps & { readonly broadcastId: string }): Promise<ApiResult<AdminBroadcastPreview>> {
  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: adminEndpoints.broadcastsByIdPreview(params.broadcastId),
    timeoutMs: ADMIN_BROADCAST_PREPARE_TIMEOUT_MS,
  });
  if (!result.ok) return result;
  const preview = decodeBroadcastPreview(result.data);
  if (preview === null) return UNREADABLE;
  return { ok: true, data: preview, ...withStatus(result) };
}

export async function sendAdminBroadcast(params: AdminDeps & { readonly broadcastId: string }): Promise<ApiResult<AdminBroadcastAck>> {
  return acknowledged(await params.transport.request<unknown>({ method: 'POST', path: adminEndpoints.broadcastsByIdSend(params.broadcastId) }));
}

export async function publishAdminBroadcastInApp(params: AdminDeps & { readonly broadcastId: string }): Promise<ApiResult<AdminBroadcastAck>> {
  return acknowledged(await params.transport.request<unknown>({ method: 'POST', path: adminEndpoints.broadcastsByIdSendInapp(params.broadcastId) }));
}

/**
 * LES CLÉS DE REQUÊTE — sous `['admin', 'broadcast']` : jamais écrites sur le
 * disque (`estClefNonPersistable`), le corps d'un courrier en préparation
 * n'ayant pas à survivre à la session de l'administrateur. L'aperçu de
 * préparation a SON sous-arbre : il n'est pas relu du serveur, il est posé dans
 * le cache par le geste qui le produit.
 */
export const ADMIN_BROADCASTS_KEY = ['admin', 'broadcast'] as const;
export const ADMIN_BROADCASTS_LISTS_KEY = ['admin', 'broadcast', 'list'] as const;
export const adminBroadcastsListKey = (address: string) => ['admin', 'broadcast', 'list', address] as const;
export const adminBroadcastKey = (broadcastId: string) => ['admin', 'broadcast', 'fiche', broadcastId] as const;
export const adminBroadcastPreviewKey = (broadcastId: string) => ['admin', 'broadcast', 'preview', broadcastId] as const;
