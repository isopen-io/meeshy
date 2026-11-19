import * as meEndpoints from '@meeshy/shared/api/endpoints/me';
import * as relationsEndpoints from '@meeshy/shared/api/endpoints/relations';
import type {
  PhoneCallAnnouncement,
  PhoneCallAnnouncementKind,
  PhoneCallEmitterSettings,
  PhoneCallEndedEventData,
  PhoneCallStartedEventData,
  PhoneCallState,
} from '@meeshy/shared/types/phone-call';

import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **« EN APPEL » DE MES SANGS, TEL QUE LA PASSERELLE LE SERT** (#18753, ACT-01 ; contrat
 * `packages/shared/types/phone-call.ts`). Même forme que le téléphone injoignable (`phone-reachability.ts`).
 *
 * Le web LIT et AFFICHE : un navigateur ne voit pas les appels, il ne rapporte donc jamais `POST /me/device/call`.
 * Le contrat importe `zod` classique : ce client ne le lit qu'en TYPE, et écrit en LITTÉRAL les genres d'annonce,
 * tenus égaux au contrat par un témoin. Le décodeur ne garde que `userId`, `since` et `expiresAt` : aucun
 * interlocuteur ne traverse, même si un champ en trop arrivait.
 *
 * Production rétrocompatible : une annonce d'un genre inconnu est ignorée sans perdre l'état.
 */

export type PhoneCallDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const PHONE_CALL_ANNOUNCEMENT_KINDS_WEB = ['started', 'ended'] as const satisfies readonly PhoneCallAnnouncementKind[];

type Wire = Readonly<Record<string, unknown>>;

const objectOf = (raw: unknown): Wire | null => (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Wire) : null);
const textOf = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
const instantOf = (value: unknown): string | null => {
  const text = textOf(value);
  return text !== null && Number.isFinite(Date.parse(text)) ? text : null;
};
const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

export function decodePhoneCallState(raw: unknown): PhoneCallState | null {
  const wire = objectOf(raw);
  const userId = textOf(wire?.userId);
  const since = instantOf(wire?.since);
  const expiresAt = instantOf(wire?.expiresAt);
  return userId === null || since === null || expiresAt === null ? null : { userId, since, expiresAt };
}

function decodeAnnouncement(raw: unknown): PhoneCallAnnouncement | null {
  const wire = objectOf(raw);
  const kind = PHONE_CALL_ANNOUNCEMENT_KINDS_WEB.find((candidate) => candidate === wire?.kind);
  const at = instantOf(wire?.at);
  return kind === undefined || at === null ? null : { kind, at };
}

/** `phone-call:started` — à un Sang : l'émetteur est en appel depuis… ; sans annonce, une mise à jour silencieuse. */
export function decodePhoneCallStarted(raw: unknown): PhoneCallStartedEventData | null {
  const wire = objectOf(raw);
  const userId = textOf(wire?.userId);
  const state = decodePhoneCallState(wire?.state);
  if (userId === null || state === null || state.userId !== userId) return null;
  const announcement = decodeAnnouncement(wire?.announcement);
  return { userId, state, ...(announcement === null ? {} : { announcement }) };
}

/** `phone-call:ended` — l'appel est fini, ou ne m'est plus servi. */
export function decodePhoneCallEnded(raw: unknown): PhoneCallEndedEventData | null {
  const wire = objectOf(raw);
  const userId = textOf(wire?.userId);
  if (userId === null) return null;
  const announcement = decodeAnnouncement(wire?.announcement);
  return { userId, ...(announcement === null ? {} : { announcement }) };
}

/** `GET /relations/phone-calls` — le rattrapage des appels en cours, à chaque socket accrochée. */
export async function loadPhoneCallSnapshot(deps: PhoneCallDeps): Promise<ApiResult<readonly PhoneCallState[]>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: [] };
  const result = await deps.transport.request<unknown>({ method: 'GET', path: relationsEndpoints.phoneCalls });
  if (!result.ok) return result;
  const items = objectOf(result.data)?.items;
  return { ok: true, data: (Array.isArray(items) ? items : []).flatMap((item) => decodePhoneCallState(item) ?? []) };
}

/** Le réglage GLOBAL — vrai par défaut : un champ absent ne le coupe pas. */
const decodeEmitterSettings = (raw: unknown): PhoneCallEmitterSettings => ({ sharingEnabled: objectOf(raw)?.sharingEnabled !== false });

export const PHONE_CALL_EMITTER_SETTINGS_QUERY_KEY = ['me', 'phone-call-settings'] as const;

export async function loadPhoneCallEmitterSettings(deps: PhoneCallDeps, signal?: AbortSignal): Promise<ApiResult<PhoneCallEmitterSettings>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: { sharingEnabled: true } };
  const result = await deps.transport.request<unknown>({ method: 'GET', path: meEndpoints.deviceCallSettings, ...withSignal(signal) });
  return result.ok ? { ok: true, data: decodeEmitterSettings(result.data) } : result;
}

export async function savePhoneCallEmitterSettings(deps: PhoneCallDeps, sharingEnabled: boolean): Promise<ApiResult<PhoneCallEmitterSettings>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: false, status: 0, error: 'Indisponible en démonstration' };
  const result = await deps.transport.request<unknown>({ method: 'PUT', path: meEndpoints.deviceCallSettings, body: { sharingEnabled } });
  return result.ok ? { ok: true, data: decodeEmitterSettings(result.data) } : result;
}

/** Mon réglage pour une personne : voit-elle que je suis en appel ? Faux tant que le serveur ne dit pas vrai. */
export type PhoneCallPersonShare = { readonly shared: boolean };

const decodePersonSettings = (raw: unknown): PhoneCallPersonShare => ({ shared: objectOf(raw)?.shared === true });

export const phoneCallPersonSettingsQueryKey = (userId: string) => ['relations', 'phone-call-settings', userId] as const;

export async function loadPhoneCallPersonSettings(deps: PhoneCallDeps, userId: string, signal?: AbortSignal): Promise<ApiResult<PhoneCallPersonShare>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: { shared: false } };
  const result = await deps.transport.request<unknown>({ method: 'GET', path: relationsEndpoints.byUserIdPhoneCallSettings(userId), ...withSignal(signal) });
  return result.ok ? { ok: true, data: decodePersonSettings(result.data) } : result;
}

export async function savePhoneCallPersonSettings(deps: PhoneCallDeps, userId: string, shared: boolean): Promise<ApiResult<PhoneCallPersonShare>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: false, status: 0, error: 'Indisponible en démonstration' };
  const result = await deps.transport.request<unknown>({ method: 'PUT', path: relationsEndpoints.byUserIdPhoneCallSettings(userId), body: { shared } });
  return result.ok ? { ok: true, data: decodePersonSettings(result.data) } : result;
}
