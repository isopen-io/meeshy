import { uploadAttachments } from '@/lib/api/attachments';
import type { DataSource } from '@/lib/api/config';
import type { HttpTransport } from '@/lib/api/http';
import type { ProfileImageKind } from '@/lib/api/profile';

import { recompressImage } from './image-recompress';

/** Les formats qu'un sélecteur de fichier propose pour une photo ou une bannière. */
export const PROFILE_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

/**
 * **TÉLÉVERSER UNE IMAGE DE PROFIL** — la moitié de `performImageUpdate` qui
 * ne dépend pas de QUI la pose : recompresser, puis monter par
 * `POST /api/v1/attachments/upload`. Le membre la pose ensuite sur lui-même
 * (`PATCH /users/me/avatar`), l'administrateur sur un membre
 * (`PUT /admin/users/:userId/profile-images/:kind`, #8217) — un seul chemin de
 * recompression et de montage pour les deux, jamais une jumelle.
 *
 * `bytesSent` est la taille RÉELLEMENT montée — la preuve que la
 * recompression a eu lieu, pas une estimation.
 */
export type ProfileImageUploadDeps = {
  readonly source: DataSource;
  readonly transport: HttpTransport;
  readonly isOnline: () => boolean;
  readonly recompress?: (file: Blob, kind: ProfileImageKind) => Promise<Blob>;
};

export type ProfileImageUploadOutcome =
  | { readonly status: 'uploaded'; readonly url: string; readonly bytesSent: number }
  | { readonly status: 'offline' }
  | { readonly status: 'cancelled' }
  | { readonly status: 'unreadable' }
  | { readonly status: 'refused'; readonly error: string };

const EXTENSIONS: Readonly<Record<string, string>> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

const cancelled = (signal: AbortSignal | undefined, code: string | undefined): boolean =>
  signal?.aborted === true || code === 'ABORTED';

async function readableImage(
  file: Blob,
  kind: ProfileImageKind,
  recompress: (file: Blob, kind: ProfileImageKind) => Promise<Blob>,
): Promise<Blob | null> {
  try {
    return await recompress(file, kind);
  } catch {
    return null;
  }
}

export async function uploadProfileImage(params: {
  readonly kind: ProfileImageKind;
  readonly file: Blob;
  readonly signal?: AbortSignal;
  readonly deps: ProfileImageUploadDeps;
}): Promise<ProfileImageUploadOutcome> {
  const { kind, file, signal, deps } = params;
  if (!deps.isOnline()) return { status: 'offline' };

  const image = await readableImage(file, kind, deps.recompress ?? recompressImage);
  if (image === null) return { status: 'unreadable' };
  if (signal?.aborted === true) return { status: 'cancelled' };

  const upload = await uploadAttachments({
    source: deps.source,
    transport: deps.transport,
    pending: [{ file: new File([image], `${kind}.${EXTENSIONS[image.type] ?? 'jpg'}`, { type: image.type }) }],
    ...(signal === undefined ? {} : { signal }),
  });
  if (!upload.ok) return cancelled(signal, upload.code) ? { status: 'cancelled' } : { status: 'refused', error: upload.error };

  const url = upload.data.attachments[0]?.fileUrl;
  if (url === undefined || url === '') return { status: 'refused', error: 'Téléversement sans adresse' };
  if (cancelled(signal, undefined)) return { status: 'cancelled' };

  return { status: 'uploaded', url, bytesSent: image.size };
}
