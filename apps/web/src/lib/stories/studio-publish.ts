import type { CanvasV3 } from '@meeshy/shared/types/canvas-v3';

import type { ApiResult } from '@/lib/api/http';
import type { PostMediaUploadResult } from '@/lib/api/post-media-upload';
import type { MosaicLayoutMode } from '@/lib/feed/mosaic-layout';

import { storyMediaCaptionPayload } from './media-caption';
import type { PublishChoice } from './publication-layout';
import { buildStoryCanvasEffectsPages, studioMediaIds, type StudioReadyAsset } from './story-document';
import { isStudioPageEmpty, studioFailureKey, type StudioDoor, type StudioPage, type StudioUploadState } from './studio-page';

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
 * appariés à la page qui les porte. Partagé par `studioPublishPayload` (un
 * document) et `studioPublishPlan` (#7707, un document PAR page). */
type ResolvedPage = {
  readonly page: StudioPage;
  readonly background: StudioReadyAsset | undefined;
  readonly overlay: StudioReadyAsset | undefined;
  readonly sound: StudioReadyAsset | undefined;
};

/** `null` ⇒ au moins un média posé n'a pas d'identité serveur (échec, ou page
 * ajoutée pendant le règlement) — le SITE UNIQUE de ce calcul, partagé par les
 * deux appelants ci-dessous : deux copies auraient divergé au premier
 * ajustement de la garde. */
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

/** `PostMedia.caption` de CETTE page (ou de ces pages) — PAGE PAR PAGE : deux
 * fonds portent deux légendes, chacune adressée par SON `postMediaId` (#6944). */
const pageMediaCaption = (entries: readonly ResolvedPage[]): Record<string, string> | undefined =>
  storyMediaCaptionPayload(
    entries.flatMap(({ page, background, overlay }) => [
      { postMediaId: background?.postMediaId, caption: page.background?.caption },
      { postMediaId: overlay?.postMediaId, caption: page.overlay?.caption },
    ]),
  );

export function studioPublishPayload(params: {
  readonly pages: readonly StudioPage[];
  readonly settled: ReadonlyMap<string, SettledPage>;
  readonly layout: MosaicLayoutMode | null;
}): StudioPublishPayload {
  const resolved = resolvePages(params.pages, params.settled);
  if (resolved === null) return { kind: 'unresolved' };

  const storyEffects = buildStoryCanvasEffectsPages(resolved.map(pageCompositionInput), params.layout);
  if (storyEffects === null) return { kind: 'empty' };

  const mediaCaption = pageMediaCaption(resolved);
  return {
    kind: 'ready',
    storyEffects,
    mediaIds: studioMediaIds(resolved.map(({ background, overlay, sound }) => ({ background, overlay, sound }))),
    ...(mediaCaption !== undefined ? { mediaCaption } : {}),
  };
}

/**
 * **CE QU'UNE PUBLICATION PORTE** (#7707) — le canal `.scene` en émet
 * PLUSIEURS pour une story (une par page publiable), le canal `.document` une
 * SEULE (post, réel). `hasText` dit si CETTE publication porte du texte —
 * l'orchestrateur (`studio-publish-flow.ts`) en tire `originalLanguage`,
 * jamais un défaut recopié.
 */
export type StudioPublication = {
  readonly pageIds: readonly string[];
  readonly hasText: boolean;
  readonly storyEffects: CanvasV3;
  readonly mediaIds: readonly string[];
  readonly mediaCaption?: Record<string, string>;
};

export type StudioPublishPlan =
  | { readonly kind: 'unresolved' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'ready'; readonly publications: readonly StudioPublication[] };

const hasTextIn = (entries: readonly ResolvedPage[]): boolean =>
  entries.some(({ page }) => page.texts.some((layer) => layer.text.trim() !== ''));

/**
 * **LE CANAL DE PUBLICATION** (#7707, miroir `ComposerPublishChannel.swift:
 * 79-104`) — la STORY publie UNE FOIS PAR PAGE publiable (canal `.scene`,
 * « UN POST PAR SLIDE ») ; POST et RÉEL publient UN document portant toutes
 * les pages (canal `.document`), inchangé depuis #7684. Décidé par DONNÉE
 * (`choice.kind`), jamais un `if (kind === 'STORY')` recopié par consommateur
 * (directive porteur 2026-09-10 § 3.a) — `story-compose.tsx` et le gate lisent
 * tous deux CE plan, jamais une seconde règle.
 *
 * Une page SANS matière ne produit aucune publication (même loi que
 * `composeStoryCanvasPages` pour une scène vide) ; si TOUTES les pages sont
 * ainsi, le plan ENTIER est `empty`.
 */
export function studioPublishPlan(params: {
  readonly pages: readonly StudioPage[];
  readonly settled: ReadonlyMap<string, SettledPage>;
  readonly choice: PublishChoice;
}): StudioPublishPlan {
  if (params.choice.kind !== 'STORY') {
    const payload = studioPublishPayload({
      pages: params.pages,
      settled: params.settled,
      layout: params.choice.kind === 'POST' ? params.choice.layout : null,
    });
    if (payload.kind !== 'ready') return payload;
    const resolved = resolvePages(params.pages, params.settled) ?? [];
    return {
      kind: 'ready',
      publications: [
        {
          pageIds: params.pages.map((page) => page.id),
          hasText: hasTextIn(resolved),
          storyEffects: payload.storyEffects,
          mediaIds: payload.mediaIds,
          ...(payload.mediaCaption !== undefined ? { mediaCaption: payload.mediaCaption } : {}),
        },
      ],
    };
  }

  const resolved = resolvePages(params.pages, params.settled);
  if (resolved === null) return { kind: 'unresolved' };

  const publications = resolved
    .filter(({ page }) => !isStudioPageEmpty(page))
    .flatMap((entry): StudioPublication[] => {
      const storyEffects = buildStoryCanvasEffectsPages([pageCompositionInput(entry)], null);
      // Une page NON vide (filtrée ci-dessus) porte toujours au moins un
      // objet — un texte non blanc, ou un média : `composeStoryCanvasPages`
      // ne peut donc pas rendre `null` ici. Le `flatMap` reste la garde
      // défensive, jamais une assertion de type.
      if (storyEffects === null) return [];
      const mediaCaption = pageMediaCaption([entry]);
      return [
        {
          pageIds: [entry.page.id],
          hasText: hasTextIn([entry]),
          storyEffects,
          mediaIds: studioMediaIds([{ background: entry.background, overlay: entry.overlay, sound: entry.sound }]),
          ...(mediaCaption !== undefined ? { mediaCaption } : {}),
        },
      ];
    });
  return publications.length === 0 ? { kind: 'empty' } : { kind: 'ready', publications };
}
