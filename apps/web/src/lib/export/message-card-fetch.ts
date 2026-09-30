import { currentCredential } from '@/lib/api/client';
import { apiConfig } from '@/lib/api/config';
import type { Credential } from '@/lib/api/http';
import { attachmentSrc } from '@/lib/api/media-url';

/**
 * UN MÉDIA DE CARTE, EN BLOB (#8693, #8901) — un blob se peint sans « salir »
 * le canvas. `null` : hors ligne, refusé, introuvable — l'atelier le DIT
 * (`MediaFailure`), jamais un cadre neutre muet.
 *
 * L'IDENTITÉ NE VOYAGE QUE VERS LA PASSERELLE. Une pièce servie par la
 * passerelle passe par la porte de téléchargement (`download-file.ts`), qui
 * porte le jeton et la reprise d'une adresse périmée. Une pièce d'un AUTRE
 * hôte (le magasin statique, un CDN) part en requête CORS simple, sans le
 * jeton : l'envoyer serait remettre le secret du lecteur à un tiers, et
 * l'en-tête `Authorization` déclenche un pré-vol que ces hôtes refusent
 * (mesuré le 2026-09-30 : `OPTIONS static.meeshy.me` → 405) — la pièce que la
 * bulle montre ne se peignait alors jamais sur la carte.
 */
export type CardMediaFetchDeps = {
  readonly fetchImpl: typeof fetch;
  readonly credential: () => Credential | null;
  /** L'origine de la passerelle — `''` derrière le proxy de développement. */
  readonly apiBase: string;
  readonly documentOrigin: string;
  /** L'adresse d'une pièce résolue contre la bonne origine — `attachmentSrc`. */
  readonly resolve?: (url: string) => string;
};

const originOf = (url: string, base: string): string | null => {
  try {
    return new URL(url, base).origin;
  } catch {
    return null;
  }
};

export function cardMediaBlobFetcher(deps: CardMediaFetchDeps): (url: string, id: string) => Promise<Blob | null> {
  const gateway = originOf(deps.apiBase === '' ? deps.documentOrigin : deps.apiBase, deps.documentOrigin);
  const resolve = deps.resolve ?? attachmentSrc;
  return async (url, id) => {
    const resolved = resolve(url);
    const absolute = originOf(resolved, deps.documentOrigin) === null ? resolved : new URL(resolved, deps.documentOrigin).href;
    if (originOf(absolute, deps.documentOrigin) !== gateway) {
      const response = await deps.fetchImpl(absolute, { mode: 'cors', credentials: 'omit' }).catch(() => null);
      return response?.ok === true ? response.blob().catch(() => null) : null;
    }
    const { downloadFile } = await import('@/lib/media/download-file');
    const result = await downloadFile({
      url: resolved,
      fallbackMediaId: id,
      deps: { fetchImpl: deps.fetchImpl, credential: deps.credential },
      onProgress: () => undefined,
    });
    return result.status === 'ready' ? result.blob : null;
  };
}

export async function fetchCardMediaBlob(url: string, id: string): Promise<Blob | null> {
  return cardMediaBlobFetcher({
    fetchImpl: (input, init) => fetch(input, init),
    credential: currentCredential,
    apiBase: apiConfig.base,
    documentOrigin: window.location.origin,
  })(url, id);
}
