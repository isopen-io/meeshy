import { WORLD_CONVERSATION_TITLE } from '@meeshy/shared/types/world-identity';
import { worldEntrySchema, type WorldEntry } from '@meeshy/shared/types/world';
import * as worldEndpoints from '@meeshy/shared/api/endpoints/world';

import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * L'ENTRÉE PUBLIQUE DE WORLD WIDE (#10000) — `worldEndpoints.root` (GET), sans
 * identité, identique pour tous : la clé de jonction (`shareLinkIdentifier`),
 * jamais écrite en dur, et l'effectif. Un 404 `WORLD_UNAVAILABLE` dit qu'il n'y
 * a pas d'entrée ouverte.
 *
 * La charge se lit par `worldEntrySchema` lui-même (`@meeshy/shared/types/world`,
 * écrit en `zod/mini` depuis #10038) : aucune seconde écriture du contrat.
 */
export type WorldDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const WORLD_UNAVAILABLE = 'WORLD_UNAVAILABLE';

/** Le titre montré avant que l'entrée servie ne le dise. Le titre affiché est
 * TOUJOURS celui servi dès qu'il est lu. */
export const WORLD_FALLBACK_TITLE = WORLD_CONVERSATION_TITLE;

export async function loadWorldEntry(params: WorldDeps & { readonly signal?: AbortSignal }): Promise<ApiResult<WorldEntry>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureWorldEntry } = await import('./fixtures-link-join');
    return fixtureWorldEntry();
  }
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: worldEndpoints.root,
    credential: null,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  const entry = worldEntrySchema.safeParse(result.data);
  return entry.success ? { ok: true, data: entry.data } : { ok: false, status: 0, error: 'Entrée World Wide illisible', code: 'UNREADABLE_WORLD_ENTRY' };
}
