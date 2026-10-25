import * as z from 'zod/mini';

import * as packsEndpoints from '@meeshy/shared/api/endpoints/packs';

import type { PackDeps } from './packs';

/**
 * **L'ÉTAGÈRE DES AMBIANCES DE CAPTURE** (#10169, LC) — les ambiances de cadres
 * INSTALLÉES (`/packs/capture-frame/installed`), dont les puces se proposent au
 * mode Montage. Les cadres eux-mêmes sont embarqués (`frame-catalogue.ts`) :
 * cette étagère ne décide que de ce qui se PROPOSE, jamais de ce qui se résout
 * — un cadre choisi par un pair ou mémorisé se rend toujours.
 *
 * `null` = INCONNU (ancien serveur 404, invité 403, panne, démonstration) : les
 * défauts du registre embarqué valent, qui installent tout — aucune puce ne se
 * cache sur une absence de réponse. `[]` = tout a été retiré.
 */
export type CaptureFrameShelf = readonly string[] | null;

const WireInstalled = z.object({ slug: z.string(), installed: z.boolean() });

const slugsOf = (raw: unknown): readonly string[] =>
  (Array.isArray(raw) ? raw : []).flatMap((row) => {
    const parsed = WireInstalled.safeParse(row);
    return parsed.success && parsed.data.installed ? [parsed.data.slug] : [];
  });

export async function loadCaptureFrameShelf(deps: PackDeps): Promise<CaptureFrameShelf> {
  if (__FIXTURES__ && deps.source === 'fixtures') return null;
  const result = await deps.transport.request<unknown>({ method: 'GET', path: packsEndpoints.captureFrameInstalled, ...(deps.signal === undefined ? {} : { signal: deps.signal }) });
  return result.ok ? slugsOf(result.data) : null;
}
