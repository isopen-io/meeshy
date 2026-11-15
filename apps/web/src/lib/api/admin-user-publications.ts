import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { type AdminDeps, asCount, asRecord, asText, pageServie, type PageServie } from './admin';
import type { ApiResult } from './http';

/**
 * **LES PUBLICATIONS D'UN MEMBRE, ET LES TROIS GESTES QUI LES RETIRENT** (#10315) —
 * `GET admin.usersByUserIdPublications` et `POST admin.usersByUserIdPublicationsModeration`,
 * sous `canModerateContent` (BIGBOSS, ADMIN, MODERATOR).
 *
 * Le porteur a dû passer par la base de production pour mettre hors ligne des
 * publications d'une utilisatrice : la fiche du membre les liste désormais, et un
 * geste en retire plusieurs à la fois, réversiblement.
 *
 * La pagination voyage À CÔTÉ de `data` (`sendPaginatedSuccess`) : elle se lit par
 * `pageServie`, comme les médias du membre.
 */
export type AdminPublicationType = 'POST' | 'REEL' | 'STORY' | 'STATUS';
export type AdminPublicationState = 'online' | 'private' | 'offline' | 'expired' | 'deleted';
export type AdminPublicationGesture = 'make-private' | 'take-offline' | 'restore';

export type AdminPublication = {
  readonly id: string;
  readonly type: AdminPublicationType;
  readonly visibility: string;
  readonly state: AdminPublicationState;
  readonly contentPreview: string | null;
  readonly createdAt: string | null;
  readonly expiresAt: string | null;
  readonly moderationHiddenAt: string | null;
  /** L'audience que l'auteur avait choisie, rendue par « Remettre en ligne ». */
  readonly priorVisibility: string | null;
  readonly mediaCount: number;
  readonly thumbnail: { readonly url: string; readonly mimeType: string } | null;
};

export type AdminPublicationPage = {
  readonly publications: readonly AdminPublication[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
};

export const ADMIN_PUBLICATIONS_PAGE_SIZE = 24;

/** Le lot qu'un geste porte au plus — le plafond de la passerelle. */
export const ADMIN_PUBLICATIONS_BATCH_MAX = 50;

export const adminUserPublicationsQueryKey = (userId: string, offset: number) => ['admin', 'user', userId, 'publications', offset] as const;

const TYPES: readonly AdminPublicationType[] = ['POST', 'REEL', 'STORY', 'STATUS'];
const STATES: readonly AdminPublicationState[] = ['online', 'private', 'offline', 'expired', 'deleted'];

const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

function thumbnailOf(value: unknown): AdminPublication['thumbnail'] {
  const record = asRecord(value);
  const url = textOrNull(record?.url);
  return record === null || url === null ? null : { url, mimeType: asText(record.mimeType) };
}

function decodePublication(entry: unknown): AdminPublication | null {
  const row = asRecord(entry);
  if (row === null || typeof row.id !== 'string' || row.id === '') return null;
  const type = TYPES.find((candidate) => candidate === row.type);
  if (type === undefined) return null;
  /* Fail-closed sur l'ÉTAT : un état inconnu ne se dit pas « en ligne » — il se dit
     « supprimée », le seul sur lequel aucun geste n'est offert. */
  const state = STATES.find((candidate) => candidate === row.state) ?? 'deleted';
  return {
    id: row.id,
    type,
    visibility: asText(row.visibility),
    state,
    contentPreview: textOrNull(row.contentPreview),
    createdAt: textOrNull(row.createdAt),
    expiresAt: textOrNull(row.expiresAt),
    moderationHiddenAt: textOrNull(row.moderationHiddenAt),
    priorVisibility: textOrNull(row.moderationPriorVisibility),
    mediaCount: asCount(row.mediaCount),
    thumbnail: thumbnailOf(row.thumbnail),
  };
}

export function decodeAdminPublicationPage(page: PageServie, offset: number): AdminPublicationPage {
  const publications = page.lignes.map(decodePublication).filter((publication): publication is AdminPublication => publication !== null);
  const total = asCount(page.meta.total);
  const hasMore = typeof page.meta.hasMore === 'boolean' ? page.meta.hasMore : offset + publications.length < total;
  return { publications, total: total || publications.length, offset, hasMore };
}

export async function loadAdminUserPublications(
  params: AdminDeps & { readonly userId: string; readonly offset: number; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminPublicationPage>> {
  const query = new URLSearchParams({ offset: String(params.offset), limit: String(ADMIN_PUBLICATIONS_PAGE_SIZE) });
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.usersByUserIdPublications(params.userId)}?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  return { ok: true, data: decodeAdminPublicationPage(pageServie(result), params.offset) };
}

/** Ce que le geste a fait : combien de publications ont changé, et combien n'avaient rien à changer. */
export type AdminPublicationModeration = { readonly updated: number; readonly unchanged: number; readonly skipped: number };

/**
 * **UN GESTE SUR UNE SÉLECTION** — le motif part dans `reason` ; ABSENT, il ne part
 * pas, ce que la passerelle n'admet que du rang souverain (spec 2026-10-04 § 4).
 */
export async function moderateAdminUserPublications(
  params: AdminDeps & {
    readonly userId: string;
    readonly gesture: AdminPublicationGesture;
    readonly postIds: readonly string[];
    readonly reason?: string | null;
  },
): Promise<ApiResult<AdminPublicationModeration>> {
  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: adminEndpoints.usersByUserIdPublicationsModeration(params.userId),
    body: {
      action: params.gesture,
      postIds: params.postIds,
      ...(params.reason === null || params.reason === undefined ? {} : { reason: params.reason }),
    },
  });
  if (!result.ok) return result;
  const data = asRecord(result.data);
  return { ok: true, data: { updated: asCount(data?.updated), unchanged: asCount(data?.unchanged), skipped: asCount(data?.skipped) } };
}
