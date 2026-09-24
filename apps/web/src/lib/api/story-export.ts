import { EXPORT_EXTENSION_BY_MIME } from '@/lib/media/export-extensions';
import { storyMediaUrl, type StoryPlaybackMedia } from '@/lib/stories/playback';

import type { DataSource } from './config';
import { resolveAttachmentSrc } from './media-url';

/**
 * **CE QU'« ENREGISTRER » TÉLÉCHARGE** (#7116, revue) — le port de l'export
 * d'un média de story, séparé de la vue qui l'offre.
 *
 * iOS BAKE la story entière (`StoryPhotoSaveService`, filigrane
 * `MeeshyExportWatermark`) ; le web ne sait pas baker, et télécharge le MÉDIA
 * de la story par la route d'export FILIGRANÉE de la passerelle —
 * `GET /api/v1/posts/:postId/media/:mediaId/export`
 * (`services/gateway/src/routes/posts/media-export.ts:112-190`,
 * `preValidation: [requiredAuth]`, `mayConsumePost` sinon 404, filigrane
 * `@<username>` `:149-152`, `Content-Disposition: attachment` `:178-181`).
 *
 * **UNE STORY SANS MÉDIA EXPORTABLE N'OFFRE PAS LE GESTE** (spécification
 * #7116 Q1) : `storyDownloadableMedia` rend `null`, et l'hôte ne remet alors
 * ni « Enregistrer » ni sa face jumelle « Partager » — les deux faces de
 * `showsExport` apparaissent et disparaissent ENSEMBLE
 * (`StoryExportRailButtons`, `StoryViewerView+Sidebar.swift:81-105`).
 */
export function storyDownloadableMedia(
  story: { readonly media?: readonly StoryPlaybackMedia[] | undefined } | undefined,
): StoryPlaybackMedia | null {
  const media = story?.media ?? [];
  return (
    media.find(
      (candidate) =>
        storyMediaUrl(candidate) !== '' &&
        typeof candidate.mimeType === 'string' &&
        EXPORT_EXTENSION_BY_MIME[candidate.mimeType] !== undefined,
    ) ?? null
  );
}

/**
 * La passerelle ⇒ sa route d'export (le filigrane est SON travail). Les
 * fixtures ⇒ le média servi lui-même, résolu comme le lecteur le peint
 * (`resolveAttachmentSrc`) : aucun serveur ne répond sous fixtures, et un
 * geste qui y viserait la passerelle échouerait sur la seule story que la
 * recette peut enregistrer.
 */
export function storyExportUrl(params: {
  readonly source: DataSource;
  readonly base: string;
  readonly postId: string;
  readonly media: StoryPlaybackMedia;
}): string {
  if (params.source === 'fixtures') return resolveAttachmentSrc(storyMediaUrl(params.media), params.base);
  return `${params.base}/api/v1/posts/${encodeURIComponent(params.postId)}/media/${encodeURIComponent(params.media.id)}/export`;
}
