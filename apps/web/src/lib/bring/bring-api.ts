import * as bringEndpoints from '@meeshy/shared/api/endpoints/bring';
import type { BringErrorCode, BringSent } from '@meeshy/shared/types/bring';

import type { DataSource } from '@/lib/api/config';
import type { ApiResult, HttpTransport } from '@/lib/api/http';

/**
 * **LE BRING, CÔTÉ PORT** (#13936, sous-lot `proche-bring@web`) — le contrat de
 * `packages/shared/types/bring.ts` : `GET|POST /bring/:userId`,
 * `DELETE /bring/:bringId`. Le blocage par personne (`bringBlocked`) vit avec
 * les autres préférences de réception, `lib/relations/person-settings.ts`.
 *
 * Décodé à la main (le web n'embarque pas Zod sur ce chemin), TOLÉRANT et FERMÉ :
 * une disponibilité illisible se lit « indisponible » — le bouton disparaît,
 * il n'apparaît jamais par défaut. Les règles (niveau, quota du jour, blocage)
 * sont celles du serveur : ce client n'en recalcule aucune.
 */

export type BringDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export type BringAvailabilityView = {
  readonly available: boolean;
  /** `null` = illimité (Atome). */
  readonly perDay: number | null;
  readonly remainingToday: number | null;
  readonly resetsAt: string | null;
};

const CLOSED: BringAvailabilityView = { available: false, perDay: 0, remainingToday: 0, resetsAt: null };

type Wire = Readonly<Record<string, unknown>>;

const objectOf = (raw: unknown): Wire | null => (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Wire) : null);
const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const countOf = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null);

export function decodeBringAvailability(raw: unknown, userId: string): BringAvailabilityView {
  const wire = objectOf(raw);
  if (wire === null || wire.available !== true || wire.userId !== userId) return CLOSED;
  return { available: true, perDay: countOf(wire.perDay), remainingToday: countOf(wire.remainingToday), resetsAt: textOf(wire.resetsAt) };
}

export function decodeBringSent(raw: unknown): BringSent | null {
  const wire = objectOf(raw);
  const bringId = textOf(wire?.bringId);
  const toUserId = textOf(wire?.toUserId);
  const sentAt = textOf(wire?.sentAt);
  const expiresAt = textOf(wire?.expiresAt);
  if (wire === null || bringId === null || toUserId === null || sentAt === null || expiresAt === null) return null;
  return { bringId, toUserId, sentAt, expiresAt, perDay: countOf(wire.perDay), remainingToday: countOf(wire.remainingToday) };
}

export const bringAvailabilityQueryKey = (userId: string) => ['bring', 'availability', userId] as const;

export async function loadBringAvailability(deps: BringDeps, userId: string, signal?: AbortSignal): Promise<ApiResult<BringAvailabilityView>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: CLOSED };
  const result = await deps.transport.request<unknown>({ method: 'GET', path: bringEndpoints.byUserId(userId), ...(signal === undefined ? {} : { signal }) });
  return result.ok ? { ok: true, data: decodeBringAvailability(result.data, userId) } : result;
}

export async function sendBring(deps: BringDeps, userId: string): Promise<ApiResult<BringSent | null>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: false, status: 0, error: 'Indisponible en démonstration' };
  const result = await deps.transport.request<unknown>({ method: 'POST', path: bringEndpoints.byUserId(userId) });
  return result.ok ? { ok: true, data: decodeBringSent(result.data) } : result;
}

export async function stopBring(deps: BringDeps, bringId: string): Promise<ApiResult<boolean>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: true };
  const result = await deps.transport.request<unknown>({ method: 'DELETE', path: bringEndpoints.byBringId(bringId) });
  return result.ok ? { ok: true, data: objectOf(result.data)?.stopped === true } : result;
}

/**
 * Ce que l'écran fait d'un envoi : `gone` fait DISPARAÎTRE le bouton sans dire
 * pourquoi (blocage, niveau, service coupé — indistincts, comme le serveur les
 * veut), `quota` dit « plus de Bring aujourd'hui », `retry` et `offline` gardent
 * le bouton.
 */
export type BringSendOutcome =
  | { readonly kind: 'sent'; readonly sent: BringSent }
  | { readonly kind: 'quota' }
  | { readonly kind: 'gone' }
  | { readonly kind: 'retry' }
  | { readonly kind: 'offline' };

const GONE: readonly BringErrorCode[] = ['BRING_BLOCKED', 'BRING_NOT_ALLOWED', 'BRING_DISABLED'];
const QUOTA: BringErrorCode = 'BRING_QUOTA_EXCEEDED';

export function bringSendOutcomeOf(result: ApiResult<BringSent | null>): BringSendOutcome {
  if (result.ok) return result.data === null ? { kind: 'retry' } : { kind: 'sent', sent: result.data };
  if (result.code === QUOTA) return { kind: 'quota' };
  if (GONE.some((code) => code === result.code)) return { kind: 'gone' };
  return result.status === 0 ? { kind: 'offline' } : { kind: 'retry' };
}
