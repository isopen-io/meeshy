import { uploadAttachments, uploadShortfall } from '@/lib/api/attachments';
import type { DataSource } from '@/lib/api/config';
import type { HttpTransport } from '@/lib/api/http';
import type { ProfileImageKind } from '@/lib/api/profile';
import { isHeifFamily, servableHeif, UPLOAD_FORMAT_REFUSED } from '@/lib/media/heif';

import { recompressImage } from './image-recompress';

/** Les formats qu'un sélecteur de fichier propose pour une photo ou une bannière. */
export const PROFILE_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

/**
 * **TÉLÉVERSER UNE IMAGE DE PROFIL** — la moitié de `performImageUpdate` qui
 * ne dépend pas de QUI la pose : recompresser, puis monter par
 * `POST attachments.upload`. Le membre la pose ensuite sur lui-même
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
  | { readonly status: 'refused'; readonly error: string; readonly code?: typeof UPLOAD_FORMAT_REFUSED };

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
  const sent = image === null ? heifSentAsIs(file) : new File([image], `${kind}.${EXTENSIONS[image.type] ?? 'jpg'}`, { type: image.type });
  if (sent === null) return { status: 'unreadable' };
  if (signal?.aborted === true) return { status: 'cancelled' };

  const upload = await uploadAttachments({
    source: deps.source,
    transport: deps.transport,
    pending: [{ file: sent }],
    ...(signal === undefined ? {} : { signal }),
  });
  if (!upload.ok && cancelled(signal, upload.code)) return { status: 'cancelled' };
  const failure = uploadShortfall([sent], upload);
  if (failure !== null) return { status: 'refused', error: failure.error, ...(failure.code === UPLOAD_FORMAT_REFUSED ? { code: UPLOAD_FORMAT_REFUSED } : {}) };
  if (!upload.ok) return { status: 'refused', error: upload.error };

  const url = upload.data.attachments[0]?.fileUrl;
  if (url === undefined || url === '') return { status: 'refused', error: 'Téléversement sans adresse' };
  if (cancelled(signal, undefined)) return { status: 'cancelled' };

  return { status: 'uploaded', url, bytesSent: sent.size };
}

/**
 * W9 (#11315) — une photo HEIC que ce navigateur ne décode pas (Chrome,
 * Android) part TELLE QUELLE, sous son vrai type : la passerelle la convertit
 * (S8, #11263) et sert un JPEG. Toute autre image illisible reste illisible.
 */
const heifSentAsIs = (file: Blob): File | null => {
  const named = file instanceof File ? file : new File([file], 'photo', { type: file.type });
  return isHeifFamily(named) ? servableHeif(named) : null;
};
