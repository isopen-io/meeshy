import * as usersEndpoints from '@meeshy/shared/api/endpoints/users';
import { DEFAULT_ADDRESS_GLYPH, isAddressGlyph, normalizeAddressUrl, type AddressGlyph } from '@meeshy/shared/utils/profile-addresses';

import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **MES ADRESSES** (#18880, chantier #18857) — `GET /users/me/addresses`, ce que le propriétaire
 * déclare sur sa fiche : un titre, un site, un glyphe. Un serveur qui ne les sert pas encore (404)
 * rend une liste VIDE, jamais une erreur : la face Liens n'affiche alors aucune section, et le
 * reste part (champ absent ⇒ ancien comportement).
 *
 * L'URL servie repasse par la règle d'écriture (`normalizeAddressUrl`) avant de devenir un
 * `href` : seul un site `http(s)` public se dessine en lien — jamais `javascript:`, `data:`,
 * un nom interne, ni une adresse sans schéma que le navigateur lirait comme un chemin de l'app.
 */
export type MyAddress = {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly glyph: AddressGlyph;
  readonly position: number;
  readonly isShown: boolean;
  readonly clicks: number;
};

export type MyAddressesDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const MY_ADDRESSES_QUERY_KEY = ['profile-addresses', 'mine'] as const;
export const MY_ADDRESSES_STALE_TIME = 5 * 60_000;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0);

export function decodeMyAddress(raw: unknown): MyAddress | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const id = text(row.id);
  const title = text(row.title);
  const url = normalizeAddressUrl(text(row.url));
  if (id === '' || title === '' || url === null) return null;
  return { id, title, url, glyph: isAddressGlyph(row.glyph) ? row.glyph : DEFAULT_ADDRESS_GLYPH, position: count(row.position), isShown: row.isShown !== false, clicks: count(row.clicks) };
}

export async function loadMyAddresses(params: MyAddressesDeps & { readonly signal?: AbortSignal }): Promise<ApiResult<readonly MyAddress[]>> {
  if (params.source === 'fixtures') return { ok: true, data: [] };
  const result = await params.transport.request<unknown>({ method: 'GET', path: usersEndpoints.meAddresses, ...(params.signal === undefined ? {} : { signal: params.signal }) });
  if (!result.ok) return result.status === 404 ? { ok: true, data: [] } : result;
  const rows = (result.data as { readonly addresses?: unknown } | null)?.addresses;
  const addresses = Array.isArray(rows) ? rows.flatMap((raw) => decodeMyAddress(raw) ?? []) : [];
  return { ok: true, data: [...addresses].sort((left, right) => left.position - right.position) };
}

export function myAddressesQueryOptions(deps: MyAddressesDeps) {
  return {
    queryKey: MY_ADDRESSES_QUERY_KEY,
    staleTime: MY_ADDRESSES_STALE_TIME,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) => unwrap(await loadMyAddresses({ ...deps, ...(signal === undefined ? {} : { signal }) })),
  };
}
