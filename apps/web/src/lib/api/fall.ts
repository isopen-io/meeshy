import * as relationsEndpoints from '@meeshy/shared/api/endpoints/relations';
import type { FallAnnouncement, FallClearedEventData, FallClearedReason, FallDetectedEventData, FallState } from '@meeshy/shared/types/fall-detection';

import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';
import { decodeLastBattery, decodeLastPosition } from './inactivity';
import { HORS_DISQUE_PREFIXE } from './souverain';

/**
 * **LA CHUTE DÉTECTÉE DE MES SANGS, TELLE QUE LA PASSERELLE LA SERT** (#18748, SAN-01 ; contrat
 * `packages/shared/types/fall-detection.ts`). Même forme que la vérification d'inactivité (`inactivity.ts`), dont elle
 * partage le décodage de la dernière position et de la dernière batterie.
 *
 * Le web LIT et AFFICHE : un navigateur ne voit pas HealthKit, il ne rapporte donc jamais `POST /me/health/fall` et
 * ne recueille aucun accord. Le contrat importe `zod` classique : ce client ne le lit qu'en TYPE, et écrit en LITTÉRAL
 * les raisons de `fall:cleared`, tenues égales au contrat par un témoin. Le serveur a déjà jugé (Sang, accord, ce qui
 * est déjà partagé) : ce décodeur ne garde que les champs du contrat.
 *
 * Production rétrocompatible : une position ou une batterie illisible se tait sans perdre l'état, une annonce d'un
 * genre inconnu est ignorée, une raison inconnue vaut `withdrawn` (l'état ne m'est plus servi), un champ en trop ne
 * traverse pas.
 */

export type FallDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const FALL_CLEARED_REASONS_WEB = ['responded', 'expired', 'withdrawn'] as const satisfies readonly FallClearedReason[];

type Wire = Readonly<Record<string, unknown>>;

const objectOf = (raw: unknown): Wire | null => (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Wire) : null);
const textOf = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
const instantOf = (value: unknown): string | null => {
  const text = textOf(value);
  return text !== null && Number.isFinite(Date.parse(text)) ? text : null;
};
const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

export function decodeFallState(raw: unknown): FallState | null {
  const wire = objectOf(raw);
  const userId = textOf(wire?.userId);
  const detectedAt = instantOf(wire?.detectedAt);
  const expiresAt = instantOf(wire?.expiresAt);
  if (userId === null || detectedAt === null || expiresAt === null) return null;
  const lastPosition = decodeLastPosition(wire?.lastPosition);
  const lastBattery = decodeLastBattery(wire?.lastBattery);
  return { userId, detectedAt, expiresAt, ...(lastPosition === null ? {} : { lastPosition }), ...(lastBattery === null ? {} : { lastBattery }) };
}

function decodeAnnouncement(raw: unknown): FallAnnouncement | null {
  const wire = objectOf(raw);
  const at = instantOf(wire?.at);
  return wire?.kind !== 'detected' || at === null ? null : { kind: 'detected', at };
}

/** `fall:detected` — à un Sang : une chute a été détectée ; sans annonce, une mise à jour silencieuse. */
export function decodeFallDetected(raw: unknown): FallDetectedEventData | null {
  const wire = objectOf(raw);
  const userId = textOf(wire?.userId);
  const state = decodeFallState(wire?.state);
  if (userId === null || state === null || state.userId !== userId) return null;
  const announcement = decodeAnnouncement(wire?.announcement);
  return { userId, state, ...(announcement === null ? {} : { announcement }) };
}

/** `fall:cleared` — la personne a répondu, l'épisode a expiré, ou il ne m'est plus servi. */
export function decodeFallCleared(raw: unknown): FallClearedEventData | null {
  const wire = objectOf(raw);
  const userId = textOf(wire?.userId);
  if (userId === null) return null;
  return { userId, reason: FALL_CLEARED_REASONS_WEB.find((candidate) => candidate === wire?.reason) ?? 'withdrawn' };
}

/** `GET /relations/falls` — le rattrapage des alertes en cours, à chaque socket accrochée. */
export async function loadFallSnapshot(deps: FallDeps): Promise<ApiResult<readonly FallState[]>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: [] };
  const result = await deps.transport.request<unknown>({ method: 'GET', path: relationsEndpoints.falls });
  if (!result.ok) return result;
  const items = objectOf(result.data)?.items;
  return { ok: true, data: (Array.isArray(items) ? items : []).flatMap((item) => decodeFallState(item) ?? []) };
}

/** Mon réglage pour une personne : est-elle prévenue si ma montre détecte une chute ? Faux tant que le serveur ne dit pas vrai. */
export type FallPersonShare = { readonly shared: boolean };

const decodePersonSettings = (raw: unknown): FallPersonShare => ({ shared: objectOf(raw)?.shared === true });

/** Hors disque (#16984) : ce réglage dit à qui part une donnée de santé — il ne survit pas à la session dans `localStorage`. */
export const fallPersonSettingsQueryKey = (userId: string) => [HORS_DISQUE_PREFIXE, 'relations', 'fall-settings', userId] as const;

export async function loadFallPersonSettings(deps: FallDeps, userId: string, signal?: AbortSignal): Promise<ApiResult<FallPersonShare>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: { shared: false } };
  const result = await deps.transport.request<unknown>({ method: 'GET', path: relationsEndpoints.byUserIdFallSettings(userId), ...withSignal(signal) });
  return result.ok ? { ok: true, data: decodePersonSettings(result.data) } : result;
}

export async function saveFallPersonSettings(deps: FallDeps, userId: string, shared: boolean): Promise<ApiResult<FallPersonShare>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: false, status: 0, error: 'Indisponible en démonstration' };
  const result = await deps.transport.request<unknown>({ method: 'PUT', path: relationsEndpoints.byUserIdFallSettings(userId), body: { shared } });
  return result.ok ? { ok: true, data: decodePersonSettings(result.data) } : result;
}
