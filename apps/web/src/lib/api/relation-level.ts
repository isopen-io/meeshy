import * as relationsEndpoints from '@meeshy/shared/api/endpoints/relations';
import { RELATION_LEVELS, type RelationLevel } from '@meeshy/shared/types/relation';

import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE NIVEAU EFFECTIF DE MON LIEN AVEC UNE PERSONNE** (#13998, #13997) —
 * `GET relations.byUserId` : `{ userId, effectiveLevel }`, et rien de plus.
 * `PUBLIC` dit aussi « bloqué » et « inconnu » ; le client n'apprend jamais
 * plus que l'absence de lien.
 *
 * Il alimente le logo de cercle de l'intro d'une story exportée (le port
 * `RelationLevelProvider`). Toute lecture qui doute — charge illisible, niveau
 * réservé ou inconnu, échec réseau, fixtures — rend `null` : le logo se ferme
 * sur le doute (`relationExportBadge`).
 *
 * La lecture est tolérante comme le schéma partagé
 * (`relationLevelResponseSchema`) : les champs inconnus ajoutés plus tard par
 * la passerelle (#13938) sont ignorés.
 */

export type RelationLevelDeps = { readonly source: DataSource; readonly transport: HttpTransport };

const isRelationLevel = (value: unknown): value is RelationLevel => RELATION_LEVELS.some((level) => level === value);

export function decodeRelationLevel(raw: unknown): RelationLevel | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const level: unknown = (raw as { readonly effectiveLevel?: unknown }).effectiveLevel;
  return isRelationLevel(level) ? level : null;
}

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

export async function loadRelationLevel(
  params: RelationLevelDeps & { readonly userId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<RelationLevel | null>> {
  if (__FIXTURES__ && params.source === 'fixtures') return { ok: true, data: null };
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: relationsEndpoints.byUserId(params.userId),
    ...withSignal(params.signal),
  });
  return result.ok ? { ok: true, data: decodeRelationLevel(result.data) } : result;
}

/** Le fournisseur du port de l'export : le niveau servi, ou `null` au moindre doute. */
export const relationLevelProvider =
  (deps: RelationLevelDeps) =>
  async (params: { readonly authorId: string; readonly signal: AbortSignal }): Promise<RelationLevel | null> => {
    const result = await loadRelationLevel({ ...deps, userId: params.authorId, signal: params.signal });
    return result.ok ? result.data : null;
  };
