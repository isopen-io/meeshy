import * as meEndpoints from '@meeshy/shared/api/endpoints/me';
import * as relationsEndpoints from '@meeshy/shared/api/endpoints/relations';
import { PHONE_REACHABILITY_ANNOUNCEMENT_KINDS, PHONE_UNREACHABLE_CAUSES } from '@meeshy/shared/types/phone-reachability-constants';
import type {
  PhoneReachabilityAnnouncement,
  PhoneReachabilityChangedEventData,
  PhoneReachabilityClearedEventData,
  PhoneReachabilityState,
} from '@meeshy/shared/types/phone-reachability';

import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE TÉLÉPHONE INJOIGNABLE DE MES PROCHES ET DE MES SANGS, TEL QUE LA PASSERELLE LE SERT** (#18737, TEL-01 ;
 * contrat `packages/shared/types/phone-reachability.ts`). Même forme que la batterie (`battery.ts`, #14147).
 *
 * Le web REÇOIT et AFFICHE ; il ne répond à aucune sonde (un navigateur n'est pas le téléphone suivi) : jamais de
 * `POST /me/device/alive` d'ici. Le serveur a déjà jugé (niveau, consentement, blocage, cause probable). Ce
 * décodeur ne garde que les champs du contrat, sans Zod : le schéma vit dans `phone-reachability.ts`, que ce client
 * ne lit qu'en TYPE ; les valeurs viennent de `phone-reachability-constants.ts`, écrit pour un client léger.
 *
 * Production rétrocompatible : une cause ajoutée après ce client se lit `unknown`, une annonce d'un genre inconnu
 * est ignorée sans perdre l'état, un champ en trop ne traverse pas.
 */

export type PhoneReachabilityDeps = { readonly source: DataSource; readonly transport: HttpTransport };

type Wire = Readonly<Record<string, unknown>>;

const objectOf = (raw: unknown): Wire | null => (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Wire) : null);
const textOf = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
const instantOf = (value: unknown): string | null => {
  const text = textOf(value);
  return text !== null && Number.isFinite(Date.parse(text)) ? text : null;
};

export function decodePhoneReachabilityState(raw: unknown): PhoneReachabilityState | null {
  const wire = objectOf(raw);
  const userId = textOf(wire?.userId);
  const unreachableSince = instantOf(wire?.unreachableSince);
  if (userId === null || unreachableSince === null) return null;
  const cause = PHONE_UNREACHABLE_CAUSES.find((candidate) => candidate === wire?.cause) ?? 'unknown';
  return { userId, unreachableSince, cause };
}

function decodeAnnouncement(raw: unknown): PhoneReachabilityAnnouncement | null {
  const wire = objectOf(raw);
  const kind = PHONE_REACHABILITY_ANNOUNCEMENT_KINDS.find((candidate) => candidate === wire?.kind);
  const at = instantOf(wire?.at);
  return kind === undefined || at === null ? null : { kind, at };
}

export function decodePhoneReachabilityChanged(raw: unknown): PhoneReachabilityChangedEventData | null {
  const wire = objectOf(raw);
  const userId = textOf(wire?.userId);
  const state = decodePhoneReachabilityState(wire?.state);
  if (userId === null || state === null || state.userId !== userId) return null;
  const announcement = decodeAnnouncement(wire?.announcement);
  return { userId, state, ...(announcement === null ? {} : { announcement }) };
}

export function decodePhoneReachabilityCleared(raw: unknown): PhoneReachabilityClearedEventData | null {
  const wire = objectOf(raw);
  const userId = textOf(wire?.userId);
  if (userId === null) return null;
  const announcement = decodeAnnouncement(wire?.announcement);
  return { userId, ...(announcement === null ? {} : { announcement }) };
}

/** `GET /relations/phone-reachability` — le rattrapage des téléphones injoignables, à chaque socket accrochée. */
export async function loadPhoneReachabilitySnapshot(deps: PhoneReachabilityDeps): Promise<ApiResult<readonly PhoneReachabilityState[]>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: [] };
  const result = await deps.transport.request<unknown>({ method: 'GET', path: relationsEndpoints.phoneReachability });
  if (!result.ok) return result;
  const items = objectOf(result.data)?.items;
  return { ok: true, data: (Array.isArray(items) ? items : []).flatMap((item) => decodePhoneReachabilityState(item) ?? []) };
}

/** Mon réglage pour une personne : ce que JE lui partage. Faux tant que le serveur ne dit pas vrai. */
export type PhoneReachabilityPersonSettings = { readonly shared: boolean };

const decodePersonSettings = (raw: unknown): PhoneReachabilityPersonSettings => ({ shared: objectOf(raw)?.shared === true });

export const phoneReachabilityPersonSettingsQueryKey = (userId: string) => ['relations', 'phone-reachability-settings', userId] as const;

export async function loadPhoneReachabilityPersonSettings(
  deps: PhoneReachabilityDeps,
  userId: string,
  signal?: AbortSignal,
): Promise<ApiResult<PhoneReachabilityPersonSettings>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: { shared: false } };
  const result = await deps.transport.request<unknown>({
    method: 'GET',
    path: relationsEndpoints.byUserIdPhoneReachabilitySettings(userId),
    ...(signal === undefined ? {} : { signal }),
  });
  return result.ok ? { ok: true, data: decodePersonSettings(result.data) } : result;
}

export async function savePhoneReachabilityPersonSettings(deps: PhoneReachabilityDeps, userId: string, shared: boolean): Promise<ApiResult<PhoneReachabilityPersonSettings>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: false, status: 0, error: 'Indisponible en démonstration' };
  const result = await deps.transport.request<unknown>({ method: 'PUT', path: relationsEndpoints.byUserIdPhoneReachabilitySettings(userId), body: { shared } });
  return result.ok ? { ok: true, data: decodePersonSettings(result.data) } : result;
}

/** Le réglage GLOBAL (le fantôme) — vrai par défaut : un champ absent ne le coupe pas. */
export type PhoneReachabilityEmitterSettings = { readonly sharingEnabled: boolean };

const decodeEmitterSettings = (raw: unknown): PhoneReachabilityEmitterSettings => ({ sharingEnabled: objectOf(raw)?.sharingEnabled !== false });

export const PHONE_REACHABILITY_EMITTER_SETTINGS_QUERY_KEY = ['me', 'phone-reachability-settings'] as const;

export async function loadPhoneReachabilityEmitterSettings(deps: PhoneReachabilityDeps, signal?: AbortSignal): Promise<ApiResult<PhoneReachabilityEmitterSettings>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: { sharingEnabled: true } };
  const result = await deps.transport.request<unknown>({ method: 'GET', path: meEndpoints.deviceReachabilitySettings, ...(signal === undefined ? {} : { signal }) });
  return result.ok ? { ok: true, data: decodeEmitterSettings(result.data) } : result;
}

export async function savePhoneReachabilityEmitterSettings(deps: PhoneReachabilityDeps, sharingEnabled: boolean): Promise<ApiResult<PhoneReachabilityEmitterSettings>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: false, status: 0, error: 'Indisponible en démonstration' };
  const result = await deps.transport.request<unknown>({ method: 'PUT', path: meEndpoints.deviceReachabilitySettings, body: { sharingEnabled } });
  return result.ok ? { ok: true, data: decodeEmitterSettings(result.data) } : result;
}
