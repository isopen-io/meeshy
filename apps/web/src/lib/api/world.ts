import * as z from 'zod/mini';
import type { WorldEntry } from '@meeshy/shared/types/world';
import * as worldEndpoints from '@meeshy/shared/api/endpoints/world';

import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * L'ENTRÉE PUBLIQUE DE WORLD WIDE (#10000) — `GET /api/v1/world`, sans
 * identité, identique pour tous : la clé de jonction (`shareLinkIdentifier`),
 * jamais écrite en dur, et l'effectif. Un 404 `WORLD_UNAVAILABLE` dit qu'il n'y
 * a pas d'entrée ouverte.
 *
 * `WireWorldEntry` est la JUMELLE `zod/mini` de `worldEntrySchema`
 * (`@meeshy/shared/types/world`), que ce module ne charge pas pour ne pas
 * faire entrer `zod` complet dans le chunk de l'écran ; `world.test.ts` les
 * confronte sur les mêmes charges.
 */
export type WorldDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const WORLD_UNAVAILABLE = 'WORLD_UNAVAILABLE';

/** Le titre montré avant que l'entrée servie ne le dise — jumelle gardée de
 * `WORLD_CONVERSATION_TITLE`. Le titre affiché est TOUJOURS celui servi dès
 * qu'il est lu. */
export const WORLD_FALLBACK_TITLE = 'World Wide';

const WireWorldEntry = z.object({
  identifier: z.string().check(z.minLength(1)),
  title: z.string().check(z.minLength(1)),
  shareLinkIdentifier: z.string().check(z.minLength(1)),
  memberCount: z.number().check(z.int(), z.nonnegative()),
  memberCountCapped: z.optional(z.literal(true)),
});

export function decodeWorldEntry(raw: unknown): WorldEntry | null {
  const parsed = WireWorldEntry.safeParse(raw);
  if (!parsed.success) return null;
  const { memberCountCapped, ...entry } = parsed.data;
  return memberCountCapped === true ? { ...entry, memberCountCapped } : entry;
}

/** La conversation que les fixtures font jouer à World Wide : un lien ouvert aux invités du corpus. */
const FIXTURE_WORLD: WorldEntry = {
  identifier: 'world',
  title: 'World Wide',
  shareLinkIdentifier: 'mshy_equipe-deploiement_7f3a',
  memberCount: 42,
};

export async function loadWorldEntry(params: WorldDeps & { readonly signal?: AbortSignal }): Promise<ApiResult<WorldEntry>> {
  if (__FIXTURES__ && params.source === 'fixtures') return { ok: true, data: FIXTURE_WORLD };
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: worldEndpoints.root,
    credential: null,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  const entry = decodeWorldEntry(result.data);
  return entry === null ? { ok: false, status: 0, error: 'Entrée World Wide illisible', code: 'UNREADABLE_WORLD_ENTRY' } : { ok: true, data: entry };
}
