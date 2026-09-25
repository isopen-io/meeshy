import { type AdminDeps, asCount, asRecord, asText, pageServie, type PageServie } from './admin';
import type { ApiResult } from './http';
import { ADMIN_SOUVERAIN_PREFIXE } from './souverain';

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

/**
 * Sous {@link ADMIN_SOUVERAIN_PREFIXE}, donc jamais écrite sur le disque : une
 * page porte le nom, l'URL et la vignette de chaque fichier, et l'identifiant
 * du message qui le porte — pièces jointes de conversations privées comprises.
 * Le carrousel de la fiche la lit à CHAQUE ouverture d'un membre : persistée,
 * elle laisserait dans `localStorage` une copie des médias de tous les membres
 * consultés, que ni la trace d'audit ni la déconnexion ne révoquent.
 */
export const adminUserMediaQueryKey = (userId: string, offset: number) =>
  [ADMIN_SOUVERAIN_PREFIXE, 'user', userId, 'media', offset] as const;

const asTextOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

export function decodeAdminMediaPage(page: PageServie, offset: number): AdminMediaPage {
  const medias = page.lignes
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

  const total = asCount(page.meta.total);
  const hasMore = typeof page.meta.hasMore === 'boolean' ? page.meta.hasMore : offset + medias.length < total;

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

  return { ok: true, data: decodeAdminMediaPage(pageServie(result), params.offset) };
}

/**
 * LA REQUÊTE D'UNE PAGE DE MÉDIAS, écrite UNE fois (#7845) — le carrousel de la
 * fiche et l'onglet Médias lisent la MÊME clé, donc doivent la remplir avec la
 * MÊME fonction : deux `queryFn` sous une clé commune, c'est le cache qui
 * décide laquelle a gagné, selon l'ordre de montage. Une seule, et le carrousel
 * ne coûte aucune requête de plus que l'onglet.
 */
export function adminUserMediaQueryOptions(deps: AdminDeps, userId: string, offset: number) {
  return {
    queryKey: adminUserMediaQueryKey(userId, offset),
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }): Promise<AdminMediaPage> => {
      const resultat = await loadAdminUserMedia({ ...deps, userId, offset, ...(signal === undefined ? {} : { signal }) });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    retry: false,
  };
}
