import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { isPackDomain, type PackDomain } from '@meeshy/shared/types/content-pack';
import type { PackAvailability, PackTargeting } from '@meeshy/shared/types/pack-availability';
import type { PackRegistryOverride } from '@meeshy/shared/types/pack-registry-override';

import { type AdminDeps, asRecord } from './admin';
import type { ApiFailure, ApiResult } from './http';

/**
 * **L'ADMINISTRATION DU REGISTRE DES PACKS, SANS DÉPLOIEMENT** (W17, #11323) —
 * le port des routes de S20 (#11275,
 * `services/gateway/src/routes/admin/packs-registry.ts`) :
 *
 *   - `GET    /admin/packs/registry`                 chaque pack du dépôt : sa base, sa surcharge, son entrée servie ;
 *   - `PUT    /admin/packs/registry/:domain/:slug`   publier, retirer, ordonner, mettre à prix, dater, cibler ;
 *   - `DELETE /admin/packs/registry/:domain/:slug`   revenir au registre du dépôt.
 *
 * Garde `canManageGame` (BIGBOSS, ADMIN) côté serveur, fail-closed ; l'écran ne
 * se monte que pour qui la porte. Chaque écriture porte la révision LUE
 * (compare-and-set) : une écriture concurrente rend 409, jamais un écrasement
 * silencieux. La passerelle journalise AVANT d'agir (`AdminAuditLog`) ; un
 * journal indisponible rend 500 `audit-unavailable` et rien n'est écrit.
 */
export type RegistryEditable = {
  readonly hidden: boolean;
  readonly order: number;
  readonly price: number | null;
  readonly availability: PackAvailability | null;
  readonly targeting: PackTargeting | null;
};

export type RegistryRow = {
  readonly domain: PackDomain;
  readonly slug: string;
  readonly origin: string;
  readonly revision: number;
  readonly base: RegistryEditable;
  /** Une surcharge est posée : « Revenir au dépôt » a un effet. */
  readonly overridden: boolean;
  readonly effective: RegistryEditable;
};

export const ADMIN_PACKS_REGISTRY_QUERY_KEY = ['admin', 'packs-registry'] as const;

const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

const texts = (value: unknown): readonly string[] | undefined =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry !== '') : undefined;

function availabilityOf(raw: unknown): PackAvailability | null {
  const record = asRecord(raw);
  if (record === null) return null;
  const startsAt = text(record.startsAt);
  const endsAt = text(record.endsAt);
  return startsAt === undefined && endsAt === undefined ? null : { ...(startsAt !== undefined ? { startsAt } : {}), ...(endsAt !== undefined ? { endsAt } : {}) };
}

function targetingOf(raw: unknown): PackTargeting | null {
  const record = asRecord(raw);
  if (record === null) return null;
  const communities = texts(record.communities);
  const countries = texts(record.countries);
  const languages = texts(record.languages);
  const targeting = {
    ...(communities !== undefined && communities.length > 0 ? { communities } : {}),
    ...(countries !== undefined && countries.length > 0 ? { countries } : {}),
    ...(languages !== undefined && languages.length > 0 ? { languages } : {}),
  };
  return Object.keys(targeting).length === 0 ? null : targeting;
}

function editableOf(raw: unknown): RegistryEditable | null {
  const record = asRecord(raw);
  if (record === null || typeof record.hidden !== 'boolean' || typeof record.order !== 'number') return null;
  return {
    hidden: record.hidden,
    order: record.order,
    price: typeof record.price === 'number' ? record.price : null,
    availability: availabilityOf(record.availability),
    targeting: targetingOf(record.targeting),
  };
}

export function decodeRegistryRow(raw: unknown): RegistryRow | null {
  const record = asRecord(raw);
  if (record === null || !isPackDomain(record.domain) || typeof record.slug !== 'string' || record.slug === '') return null;
  const base = editableOf(record.base);
  const effective = editableOf(record.effective);
  if (base === null || effective === null) return null;
  return {
    domain: record.domain,
    slug: record.slug,
    origin: typeof record.origin === 'string' ? record.origin : '',
    revision: typeof record.revision === 'number' ? record.revision : 0,
    base,
    overridden: asRecord(record.override) !== null,
    effective,
  };
}

const decodeFailure: ApiFailure = { ok: false, status: 0, error: 'Invalid registry', code: 'DECODE' };

export async function loadPacksRegistry(deps: AdminDeps, signal?: AbortSignal): Promise<ApiResult<readonly RegistryRow[]>> {
  const result = await deps.transport.request<unknown>({ method: 'GET', path: adminEndpoints.packsRegistry, ...(signal === undefined ? {} : { signal }) });
  if (!result.ok) return result;
  if (!Array.isArray(result.data)) return decodeFailure;
  return { ok: true, data: result.data.flatMap((entry) => decodeRegistryRow(entry) ?? []) };
}

export async function updatePackRegistry(
  deps: AdminDeps,
  params: { readonly domain: PackDomain; readonly slug: string; readonly expectedRevision: number; readonly patch: PackRegistryOverride },
): Promise<ApiResult<RegistryRow>> {
  const result = await deps.transport.request<unknown>({
    method: 'PUT',
    path: adminEndpoints.packsRegistryByDomainBySlug(params.domain, params.slug),
    body: { expectedRevision: params.expectedRevision, ...params.patch },
  });
  if (!result.ok) return result;
  const row = decodeRegistryRow(result.data);
  return row === null ? decodeFailure : { ok: true, data: row };
}

export async function resetPackRegistry(
  deps: AdminDeps,
  params: { readonly domain: PackDomain; readonly slug: string; readonly expectedRevision: number },
): Promise<ApiResult<unknown>> {
  return deps.transport.request<unknown>({
    method: 'DELETE',
    path: `${adminEndpoints.packsRegistryByDomainBySlug(params.domain, params.slug)}?expectedRevision=${params.expectedRevision}`,
  });
}

export type RegistryFailure = 'conflict' | 'unlawful' | 'audit' | 'forbidden' | 'failed';

/** Le mot d'un refus : la prose de la passerelle n'est jamais servie telle quelle. */
export function registryFailureOf(failure: ApiFailure): RegistryFailure {
  if (failure.status === 409) return 'conflict';
  if (failure.status === 422) return 'unlawful';
  if (failure.status === 500 && failure.error === 'audit-unavailable') return 'audit';
  if (failure.status === 401 || failure.status === 403) return 'forbidden';
  return 'failed';
}
