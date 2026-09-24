import type { CanvasV3 } from '@meeshy/shared/types/canvas-v3';

import type { ApiResult } from '@/lib/api/http';
import type { PostMediaUploadResult } from '@/lib/api/post-media-upload';
import type { MosaicLayoutMode } from '@/lib/feed/mosaic-layout';

import { storyMediaCaptionPayload } from './media-caption';
import { buildStoryCanvasEffectsPages, studioMediaIds, type StudioReadyAsset } from './story-document';
import { studioFailureKey, type StudioPage, type StudioUploadState } from './studio-page';

/**
 * **CE QU'UN ENVOI PORTE, CALCULÉ HORS DE L'ÉCRAN** (#7684, revue-correction) —
 * la composition d'une publication à plusieurs pages vivait INLINE dans
 * `publish()` (`routes/story-compose.tsx`), où rien ne pouvait l'éprouver sans
 * monter l'écran. C'est une loi PURE : les pages telles qu'elles sont au moment
 * de l'envoi, ce que chaque montée a RENDU, et la disposition choisie.
 *
 * `unresolved` ⇒ un média posé n'a pas d'identité serveur (échec, ou page
 * ajoutée pendant le règlement) : rien ne part, jamais un document qui
 * adresserait une URL locale. `empty` ⇒ aucune page n'a de matière.
 */
export type SettledAsset =
  | { readonly kind: 'none' }
  | { readonly kind: 'ready'; readonly ready: StudioReadyAsset }
  | { readonly kind: 'failed' };

/** Le règlement d'UNE page — fond, calque, son, dans cet ordre. */
export type SettledPage = readonly [background: SettledAsset, overlay: SettledAsset, sound: SettledAsset];

export type StudioPublishPayload =
  | { readonly kind: 'unresolved' }
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'ready';
      readonly storyEffects: CanvasV3;
      readonly mediaIds: readonly string[];
      readonly mediaCaption?: Record<string, string>;
    };

/** Une montée EN VOL — l'accusé que la publication attend plutôt que de
 * renvoyer le fichier. */
export type PendingUpload = Promise<ApiResult<PostMediaUploadResult>>;

/** L'accusé d'une montée, tel que le brouillon le porte — `null` pour une
 * annulation voulue par l'auteur (rien à dire). */
export function uploadStateOf(result: ApiResult<PostMediaUploadResult>): StudioUploadState | null {
  if (result.ok) {
    return {
      phase: 'ready',
      postMediaId: result.data.postMediaId,
      fileUrl: result.data.fileUrl,
      ...(result.data.thumbHash !== undefined ? { thumbHash: result.data.thumbHash } : {}),
    };
  }
  const reasonKey = studioFailureKey(result, 'upload');
  return reasonKey === null ? null : { phase: 'failed', reasonKey };
}

function readyAssetFromUpload(upload: Extract<StudioUploadState, { phase: 'ready' }>): StudioReadyAsset {
  return { postMediaId: upload.postMediaId, fileUrl: upload.fileUrl, ...(upload.thumbHash !== undefined ? { thumbHash: upload.thumbHash } : {}) };
}

function readyAssetFromResult(data: PostMediaUploadResult): StudioReadyAsset {
  return { postMediaId: data.postMediaId, fileUrl: data.fileUrl, ...(data.thumbHash !== undefined ? { thumbHash: data.thumbHash } : {}) };
}

/** Un média tel que la publication le LIT : prêt dans le brouillon, sinon
 * l'accusé de SA montée en vol — jamais un second envoi. */
export async function settle(upload: StudioUploadState | undefined, pending: PendingUpload | null): Promise<SettledAsset> {
  if (upload === undefined) return { kind: 'none' };
  if (upload.phase === 'ready') return { kind: 'ready', ready: readyAssetFromUpload(upload) };
  if (upload.phase === 'failed' || pending === null) return { kind: 'failed' };
  const result = await pending;
  return result.ok ? { kind: 'ready', ready: readyAssetFromResult(result.data) } : { kind: 'failed' };
}

const UNSETTLED: SettledPage = [{ kind: 'none' }, { kind: 'none' }, { kind: 'none' }];

const readyOf = (settled: SettledAsset, present: boolean): StudioReadyAsset | undefined =>
  present && settled.kind === 'ready' ? settled.ready : undefined;

export function studioPublishPayload(params: {
  readonly pages: readonly StudioPage[];
  readonly settled: ReadonlyMap<string, SettledPage>;
  readonly layout: MosaicLayoutMode | null;
}): StudioPublishPayload {
  const resolved = params.pages.map((page) => {
    const [background, overlay, sound] = params.settled.get(page.id) ?? UNSETTLED;
    return {
      page,
      background: readyOf(background, page.background !== null),
      overlay: readyOf(overlay, page.overlay !== null),
      sound: readyOf(sound, page.sound !== null),
    };
  });
  const unresolved = resolved.some(
    ({ page, background, overlay, sound }) =>
      (page.background !== null && background === undefined) ||
      (page.overlay !== null && overlay === undefined) ||
      (page.sound !== null && sound === undefined),
  );
  if (unresolved) return { kind: 'unresolved' };

  const storyEffects = buildStoryCanvasEffectsPages(
    resolved.map(({ page, background, overlay, sound }) => ({
      id: page.id,
      texts: page.texts,
      ...(background !== undefined && page.background !== null
        ? {
            background: {
              source: background,
              mediaType: page.background.mediaType,
              ...(page.background.aspectRatio !== undefined ? { aspectRatio: page.background.aspectRatio } : {}),
            },
          }
        : {}),
      ...(overlay !== undefined && page.overlay !== null
        ? {
            overlay: {
              source: overlay,
              mediaType: page.overlay.mediaType,
              ...(page.overlay.aspectRatio !== undefined ? { aspectRatio: page.overlay.aspectRatio } : {}),
              pose: page.overlay.pose,
            },
          }
        : {}),
      ...(sound !== undefined && page.sound !== null ? { sound: { source: sound, plane: page.sound.plane } } : {}),
    })),
    params.layout,
  );
  if (storyEffects === null) return { kind: 'empty' };

  // `PostMedia.caption` — PAGE PAR PAGE : deux fonds de deux pages portent
  // deux légendes, chacune adressée par SON `postMediaId` (#6944).
  const mediaCaption = storyMediaCaptionPayload(
    resolved.flatMap(({ page, background, overlay }) => [
      { postMediaId: background?.postMediaId, caption: page.background?.caption },
      { postMediaId: overlay?.postMediaId, caption: page.overlay?.caption },
    ]),
  );
  return {
    kind: 'ready',
    storyEffects,
    mediaIds: studioMediaIds(resolved.map(({ background, overlay, sound }) => ({ background, overlay, sound }))),
    ...(mediaCaption !== undefined ? { mediaCaption } : {}),
  };
}
