import * as meEndpoints from '@meeshy/shared/api/endpoints/me';
import * as relationsEndpoints from '@meeshy/shared/api/endpoints/relations';
import type {
  InactivityAlertEventData,
  InactivityAlertState,
  InactivityAnnouncement,
  InactivityAnnouncementKind,
  InactivityCheckSettings,
  InactivityClearedEventData,
  InactivityDelayHours,
  InactivityLastBattery,
  InactivityLastPosition,
  WellnessOkAck,
} from '@meeshy/shared/types/inactivity-check';

import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LA VÉRIFICATION D'INACTIVITÉ, TELLE QUE LA PASSERELLE LA SERT** (#18738, TEL-02 ; contrat
 * `packages/shared/types/inactivity-check.ts`). Même forme que le téléphone injoignable (`phone-reachability.ts`).
 *
 * Le contrat importe `zod` classique : ce client ne le lit qu'en TYPE (`no-classic-zod.test.ts`), et écrit en
 * LITTÉRAL les trois valeurs qu'il lui faut, tenues égales au contrat par un témoin. Le serveur a déjà jugé (Sang,
 * consentement, ce qui est déjà partagé) : ce décodeur ne garde que les champs du contrat.
 *
 * Production rétrocompatible : une position ou une batterie illisible se tait sans perdre l'état, une annonce d'un
 * genre inconnu est ignorée, un champ en trop ne traverse pas.
 */

export type InactivityDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const INACTIVITY_DELAY_CHOICES = [6, 12, 24] as const satisfies readonly InactivityDelayHours[];
export const INACTIVITY_DEFAULT_DELAY_HOURS: InactivityDelayHours = 12;
export const INACTIVITY_ANNOUNCEMENT_KINDS_WEB = ['alert', 'responded'] as const satisfies readonly InactivityAnnouncementKind[];

type Wire = Readonly<Record<string, unknown>>;

const objectOf = (raw: unknown): Wire | null => (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Wire) : null);
const textOf = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
const instantOf = (value: unknown): string | null => {
  const text = textOf(value);
  return text !== null && Number.isFinite(Date.parse(text)) ? text : null;
};
const numberIn = (value: unknown, min: number, max: number): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;

function decodePosition(raw: unknown): InactivityLastPosition | null {
  const wire = objectOf(raw);
  const latitude = numberIn(wire?.latitude, -90, 90);
  const longitude = numberIn(wire?.longitude, -180, 180);
  const recordedAt = instantOf(wire?.recordedAt);
  if (latitude === null || longitude === null || recordedAt === null) return null;
  const accuracy = numberIn(wire?.accuracy, 0, Number.MAX_VALUE);
  return { latitude, longitude, ...(accuracy === null ? {} : { accuracy }), recordedAt };
}

function decodeBattery(raw: unknown): InactivityLastBattery | null {
  const wire = objectOf(raw);
  const level = numberIn(wire?.level, 0, 100);
  const measuredAt = instantOf(wire?.measuredAt);
  return level === null || !Number.isInteger(level) || measuredAt === null ? null : { level, measuredAt };
}

export function decodeInactivityState(raw: unknown): InactivityAlertState | null {
  const wire = objectOf(raw);
  const userId = textOf(wire?.userId);
  const inactiveSince = instantOf(wire?.inactiveSince);
  const alertedAt = instantOf(wire?.alertedAt);
  if (userId === null || inactiveSince === null || alertedAt === null) return null;
  const lastPosition = decodePosition(wire?.lastPosition);
  const lastBattery = decodeBattery(wire?.lastBattery);
  return { userId, inactiveSince, alertedAt, ...(lastPosition === null ? {} : { lastPosition }), ...(lastBattery === null ? {} : { lastBattery }) };
}

function decodeAnnouncement(raw: unknown): InactivityAnnouncement | null {
  const wire = objectOf(raw);
  const kind = INACTIVITY_ANNOUNCEMENT_KINDS_WEB.find((candidate) => candidate === wire?.kind);
  const inactiveSince = instantOf(wire?.inactiveSince);
  const at = instantOf(wire?.at);
  return kind === undefined || inactiveSince === null || at === null ? null : { kind, inactiveSince, at };
}

/** `inactivity:alert` — à un Sang : la personne n'a pas répondu à « Tout va bien ? ». */
export function decodeInactivityAlert(raw: unknown): InactivityAlertEventData | null {
  const wire = objectOf(raw);
  const userId = textOf(wire?.userId);
  const state = decodeInactivityState(wire?.state);
  if (userId === null || state === null || state.userId !== userId) return null;
  const announcement = decodeAnnouncement(wire?.announcement);
  return { userId, state, ...(announcement === null ? {} : { announcement }) };
}

/** `inactivity:cleared` — la personne a répondu, ou l'alerte ne m'est plus servie. */
export function decodeInactivityCleared(raw: unknown): InactivityClearedEventData | null {
  const wire = objectOf(raw);
  const userId = textOf(wire?.userId);
  if (userId === null) return null;
  const announcement = decodeAnnouncement(wire?.announcement);
  return { userId, ...(announcement === null ? {} : { announcement }) };
}

/** `GET /relations/inactivity` — le rattrapage des alertes en cours, à chaque socket accrochée. */
export async function loadInactivitySnapshot(deps: InactivityDeps): Promise<ApiResult<readonly InactivityAlertState[]>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: [] };
  const result = await deps.transport.request<unknown>({ method: 'GET', path: relationsEndpoints.inactivity });
  if (!result.ok) return result;
  const items = objectOf(result.data)?.items;
  return { ok: true, data: (Array.isArray(items) ? items : []).flatMap((item) => decodeInactivityState(item) ?? []) };
}

/** `POST /me/wellness/ok` — « Je vais bien », de n'importe lequel de mes appareils. */
export async function sendWellnessOk(deps: InactivityDeps): Promise<ApiResult<WellnessOkAck>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: { tracked: false } };
  const result = await deps.transport.request<unknown>({ method: 'POST', path: meEndpoints.wellnessOk, body: {} });
  return result.ok ? { ok: true, data: { tracked: objectOf(result.data)?.tracked === true } } : result;
}

const decodeWellnessSettings = (raw: unknown): InactivityCheckSettings => {
  const delay = objectOf(raw)?.delayHours;
  if (delay === null) return { delayHours: null };
  return { delayHours: INACTIVITY_DELAY_CHOICES.find((candidate) => candidate === delay) ?? INACTIVITY_DEFAULT_DELAY_HOURS };
};

export const WELLNESS_SETTINGS_QUERY_KEY = ['me', 'wellness-settings'] as const;

export async function loadWellnessSettings(deps: InactivityDeps, signal?: AbortSignal): Promise<ApiResult<InactivityCheckSettings>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: { delayHours: INACTIVITY_DEFAULT_DELAY_HOURS } };
  const result = await deps.transport.request<unknown>({ method: 'GET', path: meEndpoints.wellnessSettings, ...(signal === undefined ? {} : { signal }) });
  return result.ok ? { ok: true, data: decodeWellnessSettings(result.data) } : result;
}

export async function saveWellnessSettings(deps: InactivityDeps, delayHours: InactivityDelayHours | null): Promise<ApiResult<InactivityCheckSettings>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: false, status: 0, error: 'Indisponible en démonstration' };
  const result = await deps.transport.request<unknown>({ method: 'PUT', path: meEndpoints.wellnessSettings, body: { delayHours } });
  return result.ok ? { ok: true, data: decodeWellnessSettings(result.data) } : result;
}

/** Mon réglage pour une personne : est-elle prévenue si je ne réponds pas ? Faux tant que le serveur ne dit pas vrai. */
export type InactivityPersonSettings = { readonly shared: boolean };

const decodePersonSettings = (raw: unknown): InactivityPersonSettings => ({ shared: objectOf(raw)?.shared === true });

export const inactivityPersonSettingsQueryKey = (userId: string) => ['relations', 'inactivity-settings', userId] as const;

export async function loadInactivityPersonSettings(deps: InactivityDeps, userId: string, signal?: AbortSignal): Promise<ApiResult<InactivityPersonSettings>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: { shared: false } };
  const result = await deps.transport.request<unknown>({ method: 'GET', path: relationsEndpoints.byUserIdInactivitySettings(userId), ...(signal === undefined ? {} : { signal }) });
  return result.ok ? { ok: true, data: decodePersonSettings(result.data) } : result;
}

export async function saveInactivityPersonSettings(deps: InactivityDeps, userId: string, shared: boolean): Promise<ApiResult<InactivityPersonSettings>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: false, status: 0, error: 'Indisponible en démonstration' };
  const result = await deps.transport.request<unknown>({ method: 'PUT', path: relationsEndpoints.byUserIdInactivitySettings(userId), body: { shared } });
  return result.ok ? { ok: true, data: decodePersonSettings(result.data) } : result;
}
