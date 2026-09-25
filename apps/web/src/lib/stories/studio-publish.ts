import type { CanvasV3 } from '@meeshy/shared/types/canvas-v3';

import type { ApiResult } from '@/lib/api/http';
import type { PostMediaUploadResult } from '@/lib/api/post-media-upload';
import type { MosaicLayoutMode } from '@/lib/feed/mosaic-layout';

import { storyMediaCaptionPayload } from './media-caption';
import { PUBLICATION_CHANNEL } from './publication-kind';
import type { PublishChoice } from './publication-layout';
import { buildStoryCanvasEffectsPages, studioMediaIds, type StudioReadyAsset } from './story-document';
import { studioFailureKey, type StudioDoor, type StudioPage, type StudioUploadState } from './studio-page';

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

/** Le règlement des TROIS montées de CHAQUE page, extrait de l'écran
 * (#7707) — `pendingFor` adresse la montée en vol d'une porte, `pendingRef`
 * restant l'affaire du composant (une `ref`, jamais une valeur pure). */
export async function settlePages(
  pages: readonly StudioPage[],
  pendingFor: (pageId: string, door: StudioDoor) => PendingUpload | null,
): Promise<ReadonlyMap<string, SettledPage>> {
  const entries = await Promise.all(
    pages.map(
      async (page): Promise<readonly [string, SettledPage]> => [
        page.id,
        await Promise.all([
          settle(page.background?.upload, pendingFor(page.id, 'visual')),
          settle(page.overlay?.upload, pendingFor(page.id, 'overlay')),
          settle(page.sound?.upload, pendingFor(page.id, 'sound')),
        ]),
      ],
    ),
  );
  return new Map(entries);
}

const UNSETTLED: SettledPage = [{ kind: 'none' }, { kind: 'none' }, { kind: 'none' }];

const readyOf = (settled: SettledAsset, present: boolean): StudioReadyAsset | undefined =>
  present && settled.kind === 'ready' ? settled.ready : undefined;

/** Une page RÉGLÉE — ses trois assets tels que `settle()` les a rendus,
 * appariés à la page qui les porte. */
type ResolvedPage = {
  readonly page: StudioPage;
  readonly background: StudioReadyAsset | undefined;
  readonly overlay: StudioReadyAsset | undefined;
  readonly sound: StudioReadyAsset | undefined;
};

/** `null` ⇒ au moins un média posé n'a pas d'identité serveur (échec, ou page
 * ajoutée pendant le règlement). Calculé sur TOUTES les pages, AVANT la
 * première requête : jamais une story partie puis une story qui manque son
 * média. */
function resolvePages(pages: readonly StudioPage[], settled: ReadonlyMap<string, SettledPage>): readonly ResolvedPage[] | null {
  const resolved = pages.map((page) => {
    const [background, overlay, sound] = settled.get(page.id) ?? UNSETTLED;
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
  return unresolved ? null : resolved;
}

/** Une page RÉGLÉE, telle que `buildStoryCanvasEffectsPages` la lit — l'ADRESSE
 * (identité serveur) est le seul point qui varie d'une page à l'autre. */
function pageCompositionInput({ page, background, overlay, sound }: ResolvedPage) {
  return {
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
  };
}

/**
 * **CE QU'UNE PUBLICATION PORTE** (#7707) — le canal `scene` en émet
 * PLUSIEURS pour une story (une par page publiable), le canal `document` une
 * SEULE (post, réel). `hasText` dit si CETTE publication porte du texte —
 * l'envoi (`studio-publish-flow.ts`) en tire `originalLanguage`, jamais un
 * défaut recopié. **AUCUN `content`** (défaut 4, revue-correction #6900) : le
 * texte vit dans `storyEffects` — l'envoyer en `content` le ferait rendre
 * DEUX FOIS chez le lecteur, miroir du `content: nil` iOS
 * (`StoryViewModel+PublicationUpload.swift:378-391`). `mediaCaption`, LUI,
 * part (#6944) : `PostMedia.caption` est le contenu du MÉDIA.
 */
export type StudioPublication = {
  readonly pageIds: readonly string[];
  readonly hasText: boolean;
  readonly storyEffects: CanvasV3;
  readonly mediaIds: readonly string[];
  readonly mediaCaption?: Record<string, string>;
};

/** `unresolved` ⇒ un média posé n'a pas d'identité serveur : rien ne part,
 * jamais un document qui adresserait une URL locale. `empty` ⇒ aucune page n'a
 * de matière. */
export type StudioPublishPlan =
  | { readonly kind: 'unresolved' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'ready'; readonly publications: readonly StudioPublication[] };

/** LA PROJECTION UNIQUE d'un groupe de pages réglées en UNE publication —
 * les deux canaux la partagent, seul le GROUPEMENT diffère. `[]` ⇒ le groupe
 * n'a aucune matière (même loi que `composeStoryCanvasPages` : une page sans
 * matière ne produit aucune scène). Les légendes partent PAGE PAR PAGE, chacune
 * adressée par SON `postMediaId` (#6944). */
function publicationOf(group: readonly ResolvedPage[], layout: MosaicLayoutMode | null): readonly StudioPublication[] {
  const storyEffects = buildStoryCanvasEffectsPages(group.map(pageCompositionInput), layout);
  if (storyEffects === null) return [];
  const mediaCaption = storyMediaCaptionPayload(
    group.flatMap(({ page, background, overlay }) => [
      { postMediaId: background?.postMediaId, caption: page.background?.caption },
      { postMediaId: overlay?.postMediaId, caption: page.overlay?.caption },
    ]),
  );
  return [
    {
      pageIds: group.map(({ page }) => page.id),
      hasText: group.some(({ page }) => page.texts.some((layer) => layer.text.trim() !== '')),
      storyEffects,
      mediaIds: studioMediaIds(group),
      ...(mediaCaption !== undefined ? { mediaCaption } : {}),
    },
  ];
}

/**
 * **CE QUI PART, ET EN COMBIEN D'ENVOIS** (#7684, canal par format #7707) —
 * une loi PURE : les pages telles qu'elles sont au moment de l'envoi, ce que
 * chaque montée a RENDU, et le geste choisi (`PublishChoice`). Le NOMBRE de
 * publications se lit dans `PUBLICATION_CHANNEL` (miroir
 * `ComposerPublishChannel.swift:79-104`) : `scene` groupe les pages une par
 * une (une story par page publiable), `document` les groupe toutes (un post,
 * un réel) — une DONNÉE par format, jamais un `if (kind === 'STORY')` recopié
 * par consommateur (directive porteur 2026-09-10 § 3.a).
 *
 * Le sous-menu n'offre une disposition QUE pour Post (`layoutIsServed`) : un
 * autre format part sans `layout`, même choisi plus tôt sur un Post — et une
 * page seule n'en porte jamais (`canvas-v3.ts:212-214`).
 */
export function studioPublishPlan(params: {
  readonly pages: readonly StudioPage[];
  readonly settled: ReadonlyMap<string, SettledPage>;
  readonly choice: PublishChoice;
}): StudioPublishPlan {
  const resolved = resolvePages(params.pages, params.settled);
  if (resolved === null) return { kind: 'unresolved' };
  const layout = params.choice.kind === 'POST' ? params.choice.layout : null;
  const groups = PUBLICATION_CHANNEL[params.choice.kind] === 'scene' ? resolved.map((entry) => [entry]) : [resolved];
  const publications = groups.flatMap((group) => publicationOf(group, layout));
  return publications.length === 0 ? { kind: 'empty' } : { kind: 'ready', publications };
}
