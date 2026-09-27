import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { uploadProfileImage, type ProfileImageUploadDeps } from '@/lib/profile/image-upload';

import { type AdminDeps, asCount, asRecord, pageServie, type PageServie } from './admin';
import { decodeAdminUserDetail, type AdminUserDetail } from './admin-user-detail';
import type { ApiResult } from './http';
import type { ProfileImageKind } from './profile';

/**
 * **LA PHOTO ET LA BANNIÈRE D'UN MEMBRE, POSÉES PAR L'ADMINISTRATION** (#8217)
 * — `PUT admin.usersByUserIdProfileImagesByKind`, sous
 * `canUpdateUsers` + `requireHierarchy`, et sa liste de candidates
 * `GET …/profile-image-candidates`.
 *
 * ## Deux voies, une seule écriture
 *
 * - **Téléverser** : l'image monte par le chemin du profil
 *   (`uploadProfileImage` — recompression, `POST /attachments/upload`), puis
 *   son URL est posée en source `upload`. La passerelle ne l'accepte que si
 *   c'est un téléversement de l'administrateur lui-même.
 * - **Choisir** : une image que le membre a DÉJÀ rendue publique (post ou reel
 *   `PUBLIC`). Une pièce jointe de message ou une story ne sont jamais
 *   proposées — la passerelle tient la règle, par la même requête pour la
 *   liste et pour l'écriture ; ce port n'en rejoue aucune.
 *
 * `PATCH /admin/users/:userId` accepte aussi `avatar`, mais sous `z.url()` :
 * l'adresse RELATIVE qu'un téléversement rend y était refusée en 400. C'est
 * pourquoi l'écran passe par cette adresse-ci.
 */
export type AdminImageChoice =
  | { readonly source: 'upload'; readonly url: string }
  | { readonly source: 'media'; readonly mediaId: string }
  | { readonly source: 'none' };

export type AdminProfileImageCandidate = {
  readonly id: string;
  readonly fileUrl: string;
  readonly thumbnailUrl: string | null;
};

export type AdminProfileImageCandidatesPage = {
  readonly candidates: readonly AdminProfileImageCandidate[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
};

export const ADMIN_IMAGE_CANDIDATES_PAGE_SIZE = 30;

export const adminProfileImageCandidatesQueryKey = (userId: string) =>
  ['admin', 'user', userId, 'profile-image-candidates'] as const;

const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

export function decodeAdminProfileImageCandidates(page: PageServie, offset: number): AdminProfileImageCandidatesPage {
  const candidates = page.lignes.flatMap((entree): AdminProfileImageCandidate[] => {
    const ligne = asRecord(entree);
    const id = textOrNull(ligne?.id);
    const fileUrl = textOrNull(ligne?.fileUrl);
    if (id === null || fileUrl === null) return [];
    return [{ id, fileUrl, thumbnailUrl: textOrNull(ligne?.thumbnailUrl) }];
  });
  const total = asCount(page.meta.total);
  const hasMore = typeof page.meta.hasMore === 'boolean' ? page.meta.hasMore : offset + candidates.length < total;
  return { candidates, total: total || candidates.length, offset, hasMore };
}

export async function loadAdminProfileImageCandidates(
  params: AdminDeps & { readonly userId: string; readonly offset: number; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminProfileImageCandidatesPage>> {
  const query = new URLSearchParams({ offset: String(params.offset), limit: String(ADMIN_IMAGE_CANDIDATES_PAGE_SIZE) });
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.usersByUserIdProfileImageCandidates(params.userId)}?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  return { ok: true, data: decodeAdminProfileImageCandidates(pageServie(result), params.offset) };
}

export async function setAdminUserImage(
  params: AdminDeps & {
    readonly userId: string;
    readonly kind: ProfileImageKind;
    readonly choice: AdminImageChoice;
    readonly reason?: string;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<AdminUserDetail>> {
  const motif = params.reason?.trim() ?? '';
  const result = await params.transport.request<unknown>({
    method: 'PUT',
    path: adminEndpoints.usersByUserIdProfileImagesByKind(params.userId, params.kind),
    body: motif === '' ? params.choice : { ...params.choice, reason: motif },
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  const membre = decodeAdminUserDetail(result.data);
  return membre === null ? { ok: false, status: 0, error: 'Membre illisible' } : { ok: true, data: membre };
}

export type AdminImageUploadOutcome =
  | { readonly status: 'saved'; readonly membre: AdminUserDetail }
  | { readonly status: 'offline' }
  | { readonly status: 'cancelled' }
  | { readonly status: 'unreadable' }
  | { readonly status: 'refused'; readonly error: string; readonly code?: string; readonly httpStatus?: number };

export async function performAdminImageUpload(params: {
  readonly userId: string;
  readonly kind: ProfileImageKind;
  readonly file: Blob;
  readonly reason?: string;
  readonly signal?: AbortSignal;
  readonly deps: ProfileImageUploadDeps;
}): Promise<AdminImageUploadOutcome> {
  const { userId, kind, file, signal, deps } = params;
  const upload = await uploadProfileImage({ kind, file, deps, ...(signal === undefined ? {} : { signal }) });
  if (upload.status !== 'uploaded') return upload;

  const pose = await setAdminUserImage({
    source: deps.source,
    transport: deps.transport,
    userId,
    kind,
    choice: { source: 'upload', url: upload.url },
    ...(params.reason === undefined ? {} : { reason: params.reason }),
    ...(signal === undefined ? {} : { signal }),
  });
  if (!pose.ok) {
    return { status: 'refused', error: pose.error, httpStatus: pose.status, ...(pose.code === undefined ? {} : { code: pose.code }) };
  }
  return { status: 'saved', membre: pose.data };
}
