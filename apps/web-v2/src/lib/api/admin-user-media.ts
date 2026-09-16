import { type AdminDeps, asCount, asRecord, asText } from './admin';
import type { ApiResult } from './http';

/**
 * **LES MÉDIAS D'UN MEMBRE** (#6819) —
 * `GET /api/v1/admin/users/:userId/media`, sous `canViewUsers` (jusqu'à
 * AUDIT). La route fusionne `PostMedia` (par `post.authorId`) et
 * `MessageAttachment` (par `uploadedBy`), triés par récence.
 *
 * ## La pagination voyage À CÔTÉ de `data`, pas dedans
 *
 * Cette route passe par `sendPaginatedSuccess(reply, data, pagination)`, qui
 * pose `pagination` au niveau de l'ENVELOPPE. `GET /admin/users`, elle, sert
 * la sienne **dans** `data` (cf. `decodeAdminUsers`). Deux routes voisines,
 * deux niveaux : lire au mauvais endroit rendrait `total: 0` et
 * `hasMore: false` — une liste qui s'arrête à la première page **sans que rien
 * n'échoue**, donc un défaut qu'aucune erreur ne signale.
 *
 * ## Un média protégé reste LISTÉ
 *
 * `isProtected` est calculé par le serveur (protection lue aux DEUX niveaux,
 * message et pièce jointe). Quand il est vrai, `fileUrl` et `thumbnailUrl`
 * tombent à `null` **et l'entrée demeure**. Ce décodeur ne l'écarte donc pas :
 * l'écran doit pouvoir dire « ce média existe et ne se montre pas », qui n'est
 * ni une absence ni une erreur de chargement.
 */
export type AdminMediaSource = 'post' | 'message';

export type AdminMedia = {
  readonly id: string;
  readonly originalName: string;
  readonly mimeType: string;
  /** `null` quand le média est protégé — jamais une URL à essayer quand même. */
  readonly fileUrl: string | null;
  readonly thumbnailUrl: string | null;
  readonly fileSize: number;
  readonly duration: number | null;
  readonly createdAt: string | null;
  readonly source: AdminMediaSource;
  /** Le post ou le message qui le porte. */
  readonly contextId: string | null;
  readonly isProtected: boolean;
};

export type AdminMediaPage = {
  readonly medias: readonly AdminMedia[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
};

export const ADMIN_MEDIA_PAGE_SIZE = 20;

export const adminUserMediaQueryKey = (userId: string, offset: number) =>
  ['admin', 'user', userId, 'media', offset] as const;

const asTextOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

export function decodeAdminMediaPage(raw: unknown, offset: number): AdminMediaPage {
  const charge = asRecord(raw) ?? {};
  const brut = Array.isArray(charge.data) ? charge.data : Array.isArray(raw) ? raw : [];

  const medias = brut
    .map((entree): AdminMedia | null => {
      const ligne = asRecord(entree);
      if (ligne === null || typeof ligne.id !== 'string' || ligne.id === '') return null;

      return {
        id: ligne.id,
        originalName: asText(ligne.originalName),
        mimeType: asText(ligne.mimeType),
        fileUrl: asTextOrNull(ligne.fileUrl),
        thumbnailUrl: asTextOrNull(ligne.thumbnailUrl),
        fileSize: asCount(ligne.fileSize),
        duration: typeof ligne.duration === 'number' ? ligne.duration : null,
        createdAt: asTextOrNull(ligne.createdAt),
        // Une source inconnue retombe sur `post` plutôt que d'écarter
        // l'entrée : le média EXISTE, et le perdre pour un libellé inattendu
        // serait pire que l'afficher sous la mauvaise famille.
        source: ligne.source === 'message' ? 'message' : 'post',
        contextId: asTextOrNull(ligne.contextId),
        // Fail-closed sur la PROTECTION : une charge qui ne dit pas qu'un
        // média est protégé ne le dit pas non plus libre — mais ici le drapeau
        // gouverne seulement l'affichage, et les URL sont déjà nulles côté
        // serveur quand il compte.
        isProtected: ligne.isProtected === true,
      };
    })
    .filter((media): media is AdminMedia => media !== null);

  const meta = asRecord(charge.pagination) ?? {};
  const total = asCount(meta.total);
  const hasMore = typeof meta.hasMore === 'boolean' ? meta.hasMore : offset + medias.length < total;

  return { medias, total: total || medias.length, offset, hasMore };
}

export async function loadAdminUserMedia(
  params: AdminDeps & { readonly userId: string; readonly offset: number; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminMediaPage>> {
  const query = new URLSearchParams({
    offset: String(params.offset),
    limit: String(ADMIN_MEDIA_PAGE_SIZE),
  });

  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/admin/users/${encodeURIComponent(params.userId)}/media?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  return { ok: true, data: decodeAdminMediaPage(result.data, params.offset) };
}
