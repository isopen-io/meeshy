import { credentialHeaders, type Credential } from '@/lib/api/http';

/**
 * **LE TÉLÉCHARGEMENT D'UN FICHIER PROTÉGÉ, AVEC PROGRESSION** (#7116) —
 * miroir web des DEUX passes d'AVFoundation d'iOS (`StoryPhotoSaveService`,
 * `StoryVideoExportService`) : ici, une seule passe réseau, lue chunk par
 * chunk pour nourrir l'anneau (`lib/stories/save-progress.ts`).
 *
 * **UNE BALISE `<a href>` N'ENVOIE AUCUN `Authorization`** — même défaut que
 * `protected-media.ts` (#7015) : le téléchargement passe par `fetch` +
 * `credentialHeaders(credential)`, jamais par une URL nue.
 *
 * `EXTENSION_BY_MIME` est le miroir EXACT de la carte serveur
 * (`services/gateway/src/routes/posts/media-export.ts:39-46`), plus UNE
 * entrée : le stand-in SVG des fixtures (`STORY_PHOTO_STAND_IN`,
 * `fixtures-stories.ts`), que la passerelle réelle ne sert jamais — sans
 * elle, la recette sur fixtures n'aurait aucun nom de repli à vérifier.
 */
export const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'image/svg+xml': '.svg',
};

const CONTENT_DISPOSITION_FILENAME = /filename="([^"]+)"/i;

/** Le nom de fichier — celui que la passerelle a nommé
 * (`Content-Disposition`, `media-export.ts:181`), ou un repli composé depuis
 * l'identifiant du média et son type — jamais un nom opaque de blob. */
export function fileNameOf(params: {
  readonly contentDisposition: string | null;
  readonly fallbackMediaId: string;
  readonly mimeType: string | null;
}): string {
  const match = params.contentDisposition === null ? null : CONTENT_DISPOSITION_FILENAME.exec(params.contentDisposition);
  if (match?.[1] !== undefined) return match[1];
  const ext = params.mimeType === null ? undefined : EXTENSION_BY_MIME[params.mimeType];
  return `meeshy-${params.fallbackMediaId}${ext ?? ''}`;
}

export type DownloadFileResult =
  | { readonly status: 'ready'; readonly blob: Blob; readonly fileName: string }
  | { readonly status: 'unavailable'; readonly reason: 'refused' | 'missing' }
  | { readonly status: 'offline' }
  | { readonly status: 'cancelled' };

export type DownloadFileDeps = {
  readonly fetchImpl: typeof fetch;
  readonly credential: () => Credential | null;
};

/**
 * **AUCUNE PROMESSE REJETÉE NON RATTRAPÉE** (même invariant que
 * `fetchProtectedObjectUrl`, `protected-media.ts`) : chaque issue rend sa
 * propre raison, jamais un `null` muet.
 *
 * `onProgress(null)` — flux SANS `Content-Length` (chunké) : la barre passe
 * en INDÉTERMINÉ, exactement le cas que `media-export.ts:178-181` documente
 * (`createReadStream`, pas de longueur garantie).
 */
export async function downloadFile(params: {
  readonly url: string;
  readonly fallbackMediaId: string;
  readonly deps: DownloadFileDeps;
  readonly signal?: AbortSignal;
  readonly onProgress: (ratio: number | null) => void;
}): Promise<DownloadFileResult> {
  const credential = params.deps.credential();
  if (credential === null) return { status: 'unavailable', reason: 'refused' };

  let response: Response;
  try {
    response = await params.deps.fetchImpl(params.url, {
      headers: credentialHeaders(credential),
      ...(params.signal !== undefined ? { signal: params.signal } : {}),
    });
  } catch {
    if (params.signal?.aborted === true) return { status: 'cancelled' };
    return { status: 'offline' };
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) return { status: 'unavailable', reason: 'refused' };
    return { status: 'unavailable', reason: 'missing' };
  }

  const contentType = response.headers.get('content-type');
  const fileName = fileNameOf({
    contentDisposition: response.headers.get('content-disposition'),
    fallbackMediaId: params.fallbackMediaId,
    mimeType: contentType,
  });
  const contentLengthHeader = response.headers.get('content-length');
  const total = contentLengthHeader === null ? null : Number(contentLengthHeader);

  if (response.body === null || total === null || !Number.isFinite(total) || total <= 0) {
    params.onProgress(null);
    try {
      const blob = await response.blob();
      return { status: 'ready', blob, fileName };
    } catch {
      if (params.signal?.aborted === true) return { status: 'cancelled' };
      return { status: 'unavailable', reason: 'missing' };
    }
  }

  const reader = response.body.getReader();
  const abortListener = (): void => {
    void reader.cancel().catch(() => {});
  };
  params.signal?.addEventListener('abort', abortListener);
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      if (params.signal?.aborted === true) {
        await reader.cancel().catch(() => {});
        return { status: 'cancelled' };
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value !== undefined) {
        chunks.push(value);
        received += value.byteLength;
        params.onProgress(Math.min(1, received / total));
      }
    }
  } catch {
    if (params.signal?.aborted === true) return { status: 'cancelled' };
    return { status: 'unavailable', reason: 'missing' };
  } finally {
    params.signal?.removeEventListener('abort', abortListener);
  }

  return {
    status: 'ready',
    blob: contentType === null ? new Blob(chunks as BlobPart[]) : new Blob(chunks as BlobPart[], { type: contentType }),
    fileName,
  };
}
