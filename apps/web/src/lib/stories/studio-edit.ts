import type { PostVisibility } from '@meeshy/shared/types/post';
import { clampMediaCrop, type MediaCropRect } from '@meeshy/shared/utils/media-crop';

import type { FeedMedia, FeedPost } from '@/lib/api/feed-pages';
import { parseCanvasDocument, type CanvasObject, type CanvasScene } from '@/lib/canvas/document';
import { MOSAIC_LAYOUT_MODES, type MosaicLayoutMode } from '@/lib/feed/mosaic-layout';

import { isRememberableAudience } from './publication-audience';
import type { PublicationKind } from './publication-kind';
import type { StudioMediaKind } from './story-document';
import { studioDraftFromSnapshot, withPage, type StudioDraft } from './studio';
import type { StudioDraftSnapshot, StudioPageSnapshot, StudioTextLayerSnapshot } from './studio-draft-store';
import type { StudioMediaTrim, StudioPage, StudioVisualAsset } from './studio-page';

/**
 * **MODIFIER UNE PUBLICATION ROUVRE LE STUDIO** (#9317) — la loi PURE qui relit
 * une publication SERVIE (`Post.storyEffects` + `Post.media`) en brouillon de
 * studio, miroir de `ComposerHydration.swift` : chaque SCÈNE redevient une
 * PAGE, chaque média déjà monté revient PRÊT sous son identité serveur
 * (`postMediaId` + `fileUrl`) — rien ne se remonte —, et le texte du post,
 * l'audience et le format sont repris.
 *
 * **CE QUE LE STUDIO NE SAIT PAS PORTER N'EST JAMAIS DÉTRUIT** : un objet
 * qu'aucune porte du studio ne pose (autocollant, dessin, lieu, mention), un
 * second calque, un média dont l'identité est introuvable, une piste de
 * bibliothèque au niveau du document, une image clé — tout cela REFUSE
 * l'hydratation (`unsupported`), et l'hôte rend la feuille de texte. Hydraté
 * puis enregistré, le document aurait été réécrit SANS eux, en silence.
 *
 * La NORMALISATION des champs (styles, couleurs, poses, cadres, fenêtres)
 * passe par `studioDraftFromSnapshot`, le site unique de relecture d'un
 * brouillon : une publication relue n'est qu'un brouillon de plus, jamais une
 * seconde table de validation.
 */
export type StudioEditOrigin = {
  readonly postId: string;
  readonly kind: PublicationKind;
  /** Les médias que la publication porte À L'OUVERTURE — ce qu'aucune page ne
   * référence plus à l'enregistrement part en `removeMediaIds`. */
  readonly mediaIds: readonly string[];
  readonly layout: MosaicLayoutMode | null;
  /** `Post.content` tel que servi — l'enregistrement ne le renvoie que changé. */
  readonly content: string;
  readonly originalLanguage: string | null;
  readonly visibility: PostVisibility | null;
};

export type StudioEditRefusal = 'kind' | 'repost' | 'not-author' | 'text-only' | 'object';

export type StudioEditHydration =
  | { readonly kind: 'studio'; readonly draft: StudioDraft; readonly origin: StudioEditOrigin }
  | { readonly kind: 'unsupported'; readonly reason: StudioEditRefusal };

const EDITABLE_KINDS: readonly PublicationKind[] = ['STORY', 'POST', 'REEL'];

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;
const stringOf = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);
const numberOf = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const positiveOf = (value: unknown): number | undefined => {
  const n = numberOf(value);
  return n !== undefined && n > 0 ? n : undefined;
};

const isEditableKind = (type: string): type is PublicationKind => (EDITABLE_KINDS as readonly string[]).includes(type);
const isLayout = (value: unknown): value is MosaicLayoutMode => typeof value === 'string' && (MOSAIC_LAYOUT_MODES as readonly string[]).includes(value);

/** Les médias du post, adressables par identité ET par URL — un document iOS
 * adresse parfois un média par sa seule `mediaURL`. */
type MediaIndex = { readonly byId: ReadonlyMap<string, FeedMedia>; readonly byUrl: ReadonlyMap<string, FeedMedia> };

const mediaIndexOf = (media: readonly FeedMedia[]): MediaIndex => ({
  byId: new Map(media.map((item) => [item.id, item])),
  byUrl: new Map(media.map((item) => [item.fileUrl, item])),
});

/** L'ADRESSE d'un objet média — `null` quand aucune identité serveur n'est
 * retrouvable : il ne pourrait plus être référencé à l'enregistrement. */
type Address = { readonly postMediaId: string; readonly fileUrl: string; readonly thumbHash?: string; readonly media: FeedMedia | undefined };

function addressOf(payload: Readonly<Record<string, unknown>>, index: MediaIndex): Address | null {
  const url = stringOf(payload.mediaURL);
  const declared = stringOf(payload.postMediaId) ?? stringOf(payload.mediaId);
  const media = (declared !== undefined ? index.byId.get(declared) : undefined) ?? (url !== undefined ? index.byUrl.get(url) : undefined);
  const postMediaId = declared ?? media?.id;
  const fileUrl = url ?? media?.fileUrl;
  if (postMediaId === undefined || fileUrl === undefined) return null;
  const thumbHash = stringOf(payload.thumbHash) ?? stringOf(media?.thumbHash);
  return { postMediaId, fileUrl, ...(thumbHash !== undefined ? { thumbHash } : {}), media };
}

const hasAddress = (payload: Readonly<Record<string, unknown>>): boolean =>
  stringOf(payload.mediaURL) !== undefined || stringOf(payload.postMediaId) !== undefined || stringOf(payload.mediaId) !== undefined;

const mediaKindOf = (payload: Readonly<Record<string, unknown>>, media: FeedMedia | undefined): StudioMediaKind =>
  payload.mediaType === 'video' || (payload.mediaType === undefined && (media?.mimeType ?? '').startsWith('video')) ? 'video' : 'image';

/** Ce que l'objet porte de plus que le brouillon persisté — le texte
 * alternatif et les éditions de base (#8518, #9136). */
type VisualExtras = { readonly alt?: string; readonly trim?: StudioMediaTrim; readonly muted?: true; readonly crop?: MediaCropRect };

type Piece =
  | { readonly role: 'plain' }
  | { readonly role: 'background'; readonly ref: NonNullable<StudioPageSnapshot['background']>; readonly extras: VisualExtras }
  | { readonly role: 'overlay'; readonly ref: NonNullable<StudioPageSnapshot['overlay']>; readonly extras: VisualExtras }
  | { readonly role: 'sound'; readonly ref: NonNullable<StudioPageSnapshot['sound']> }
  | { readonly role: 'text'; readonly layer: StudioTextLayerSnapshot };

const assetRefOf = (address: Address) => ({
  postMediaId: address.postMediaId,
  fileUrl: address.fileUrl,
  ...(address.thumbHash !== undefined ? { thumbHash: address.thumbHash } : {}),
  ...(positiveOf(address.media?.duration) !== undefined ? { durationMs: positiveOf(address.media?.duration)! } : {}),
});

const timingOf = (object: CanvasObject): { readonly timing?: { readonly start: number; readonly end: number } } =>
  object.timing?.start !== undefined && object.timing.end !== undefined ? { timing: { start: object.timing.start, end: object.timing.end } } : {};

const poseOf = (object: CanvasObject) =>
  object.anchor.t === 'free' ? { x: object.anchor.x, y: object.anchor.y, scale: object.transform.scale, rotation: object.transform.rotation } : null;

function cropOf(payload: Readonly<Record<string, unknown>>): MediaCropRect | undefined {
  const [x, y, width, height] = [payload.cropX, payload.cropY, payload.cropW, payload.cropH].map(numberOf);
  return x === undefined || y === undefined || width === undefined || height === undefined ? undefined : clampMediaCrop({ x, y, width, height });
}

function extrasOf(payload: Readonly<Record<string, unknown>>, media: FeedMedia | undefined, sceneHasSound: boolean): VisualExtras {
  const alt = stringOf(media?.alt);
  const start = numberOf(payload.sourceStart);
  const end = numberOf(payload.sourceEnd);
  const crop = cropOf(payload);
  return {
    ...(alt !== undefined ? { alt } : {}),
    ...(start !== undefined && end !== undefined && end > start ? { trim: { start, end } } : {}),
    // Un fond vidéo est rendu MUET par le composeur dès qu'un son l'accompagne
    // (`mutesVideo`) : ce silence-là n'est pas un choix de l'auteur.
    ...(payload.muted === true && !sceneHasSound ? { muted: true as const } : {}),
    ...(crop !== undefined ? { crop } : {}),
  };
}

function visualRefOf(object: CanvasObject, address: Address) {
  const { payload } = object;
  const caption = stringOf(address.media?.caption);
  const aspectRatio = positiveOf(payload.aspectRatio);
  return {
    ...assetRefOf(address),
    mediaType: mediaKindOf(payload, address.media),
    ...(aspectRatio !== undefined ? { aspectRatio } : {}),
    ...(caption !== undefined ? { caption } : {}),
    ...(payload.filter !== undefined ? { filter: payload.filter } : {}),
  };
}

/** Le CADRE d'un fond (#8414) — LÂCHE, normalisé par la relecture. */
function frameRefOf(object: CanvasObject) {
  const transform = isRecord(object.payload.transform) ? object.payload.transform : {};
  return { frame: { fitMode: transform.videoFitMode, backdrop: transform.backdrop } };
}

/** UN objet du document, rangé dans la porte du studio qui le pose — `null`
 * pour tout ce qu'aucune porte ne sait porter. */
function pieceOf(object: CanvasObject, index: MediaIndex, sceneHasSound: boolean): Piece | null {
  const { payload } = object;
  if (object.timing?.keyframes !== undefined) return null;
  if (object.kind === 'text') {
    const pose = poseOf(object);
    if (pose === null || typeof payload.text !== 'string') return null;
    const background = isRecord(payload.backgroundStyle) ? payload.backgroundStyle.hex : undefined;
    return {
      role: 'text',
      layer: {
        id: object.id,
        text: payload.text,
        ...(object.locale !== undefined ? { language: object.locale } : {}),
        style: payload.textStyle,
        effect: payload.textEffect,
        color: payload.textColor,
        align: payload.textAlign,
        background,
        pose,
        ...timingOf(object),
      },
    };
  }
  if (object.kind === 'audio') {
    const address = addressOf(payload, index);
    return address === null ? null : { role: 'sound', ref: { ...assetRefOf(address), plane: payload.isBackground === true ? 'background' : 'foreground' } };
  }
  if (object.kind !== 'media') return null;
  if (!hasAddress(payload)) return object.plane === 'bg' ? { role: 'plain' } : null;
  const address = addressOf(payload, index);
  if (address === null) return null;
  const extras = extrasOf(payload, address.media, sceneHasSound);
  if (payload.isBackground === true || object.plane === 'bg') return { role: 'background', ref: { ...visualRefOf(object, address), ...frameRefOf(object) }, extras };
  const pose = poseOf(object);
  return pose === null ? null : { role: 'overlay', ref: { ...visualRefOf(object, address), pose, ...timingOf(object) }, extras };
}

/** Une scène, relue en page — `null` dès qu'une seule de ses pièces ne
 * trouve pas de porte, ou qu'une porte serait occupée deux fois. */
type HydratedPage = { readonly snapshot: StudioPageSnapshot; readonly background: VisualExtras; readonly overlay: VisualExtras };

function pageOf(scene: CanvasScene, id: string, index: MediaIndex): HydratedPage | null {
  if (scene.clipTransitions !== undefined && scene.clipTransitions.length > 0) return null;
  const sceneHasSound = scene.objects.some((object) => object.kind === 'audio');
  const pieces = [...scene.objects].sort((a, b) => a.z - b.z).map((object) => pieceOf(object, index, sceneHasSound));
  if (pieces.some((piece) => piece === null)) return null;
  const present = pieces.filter((piece): piece is Piece => piece !== null);
  const only = <R extends Piece['role']>(role: R) => present.filter((piece): piece is Extract<Piece, { role: R }> => piece.role === role);
  const [background, ...extraBackgrounds] = only('background');
  const [overlay, ...extraOverlays] = only('overlay');
  const [sound, ...extraSounds] = only('sound');
  if (extraBackgrounds.length + extraOverlays.length + extraSounds.length > 0) return null;
  const opening = isRecord(scene.opening) ? scene.opening.type : undefined;
  const closing = isRecord(scene.closing) ? scene.closing.type : undefined;
  return {
    snapshot: {
      id,
      texts: only('text').map((piece) => piece.layer),
      ...(background !== undefined ? { background: background.ref } : {}),
      ...(overlay !== undefined ? { overlay: overlay.ref } : {}),
      ...(sound !== undefined ? { sound: sound.ref } : {}),
      ...(scene.timelineDuration !== undefined ? { duration: scene.timelineDuration } : {}),
      ...(opening !== undefined ? { opening } : {}),
      ...(closing !== undefined ? { closing } : {}),
    },
    background: background?.extras ?? {},
    overlay: overlay?.extras ?? {},
  };
}

/** UNE PUBLICATION SANS CANVAS (média seul, la forme d'avant le studio) — un
 * visuel par page, le premier son sur la première. Tout autre fichier
 * (document, archive) n'a pas de porte : refus. */
function pagesFromMedia(media: readonly FeedMedia[]): readonly HydratedPage[] | null {
  const kindOf = (item: FeedMedia) => (item.mimeType ?? '').split('/')[0];
  if (media.some((item) => !['image', 'video', 'audio'].includes(kindOf(item) ?? ''))) return null;
  const visuals = media.filter((item) => kindOf(item) !== 'audio');
  const [sound] = media.filter((item) => kindOf(item) === 'audio');
  const soundRef = sound === undefined ? undefined : { ...assetRefOf({ postMediaId: sound.id, fileUrl: sound.fileUrl, media: sound }), plane: 'background' };
  const slots = visuals.length === 0 ? [undefined] : visuals;
  return slots.map((item, at) => {
    const ratio = item?.width != null && item.height != null && item.width > 0 && item.height > 0 ? item.width / item.height : undefined;
    const caption = stringOf(item?.caption);
    const thumbHash = stringOf(item?.thumbHash);
    return {
      snapshot: {
        id: `page-${at + 1}`,
        texts: [],
        ...(item !== undefined
          ? {
              background: {
                ...assetRefOf({ postMediaId: item.id, fileUrl: item.fileUrl, ...(thumbHash !== undefined ? { thumbHash } : {}), media: item }),
                mediaType: kindOf(item) === 'video' ? 'video' : 'image',
                ...(ratio !== undefined ? { aspectRatio: ratio } : {}),
                ...(caption !== undefined ? { caption } : {}),
              },
            }
          : {}),
        ...(at === 0 && soundRef !== undefined ? { sound: soundRef } : {}),
      },
      background: stringOf(item?.alt) !== undefined ? { alt: stringOf(item?.alt)! } : {},
      overlay: {},
    };
  });
}

/** Les pages relues, en `null` si quelque chose se perdrait — `text-only`
 * quand il n'y a rien à poser sur une scène (la feuille de texte suffit). */
function hydratedPages(post: FeedPost, media: readonly FeedMedia[]): readonly HydratedPage[] | StudioEditRefusal {
  const effects = post.storyEffects;
  const document = parseCanvasDocument(effects);
  if (document === null) {
    const blank = effects === null || effects === undefined || (isRecord(effects) && Object.keys(effects).length === 0);
    if (!blank) return 'object';
    if (media.length === 0) return 'text-only';
    return pagesFromMedia(media) ?? 'object';
  }
  if (document.sound !== undefined) return 'object';
  const index = mediaIndexOf(media);
  const pages = document.scenes.map((scene, at) => pageOf(scene, `page-${at + 1}`, index));
  return pages.some((page) => page === null) ? 'object' : pages.filter((page): page is HydratedPage => page !== null);
}

const TEXT_ID = /^text-(\d+)$/;

/** Des identifiants de texte UNIQUES dans le brouillon (`translationSetPath`
 * prend le PREMIER objet d'un `id`) — un doublon entre deux scènes iOS est
 * suffixé de sa page ; une page sans texte reçoit une graine neuve, jamais
 * le `text-1` qu'une autre page porte déjà. */
function withUniqueTexts(pages: readonly HydratedPage[]): readonly HydratedPage[] {
  const all = pages.flatMap((page) => page.snapshot.texts.map((layer) => layer.id));
  const seed = Math.max(0, ...all.map((id) => Number.parseInt(TEXT_ID.exec(id)?.[1] ?? '0', 10)));
  const seen = new Set<string>();
  return pages.map((page, at) => {
    const texts = page.snapshot.texts.map((layer) => {
      const id = seen.has(layer.id) ? `${layer.id}-${at + 1}` : layer.id;
      seen.add(id);
      return { ...layer, id };
    });
    return { ...page, snapshot: { ...page.snapshot, texts: texts.length > 0 ? texts : [{ id: `text-${seed + at + 1}`, text: '' }] } };
  });
}

const withExtras = (asset: StudioVisualAsset | null, extras: VisualExtras): StudioVisualAsset | null => (asset === null ? null : { ...asset, ...extras });

export function studioEditHydration(params: {
  readonly post: FeedPost;
  readonly viewerId: string | null;
  readonly resolveUrl: (fileUrl: string) => string;
  readonly language: string;
}): StudioEditHydration {
  const { post } = params;
  if (!isEditableKind(post.type)) return { kind: 'unsupported', reason: 'kind' };
  if (post.repostOfId !== undefined && post.repostOfId !== null) return { kind: 'unsupported', reason: 'repost' };
  if (params.viewerId === null || post.author?.id !== params.viewerId) return { kind: 'unsupported', reason: 'not-author' };
  const media = post.media ?? [];
  const read = hydratedPages(post, media);
  if (typeof read === 'string') return { kind: 'unsupported', reason: read };
  const pages = withUniqueTexts(read);
  const content = post.content ?? '';
  const snapshot: StudioDraftSnapshot = {
    schema: 2,
    pages: pages.map((page) => page.snapshot),
    ...(stringOf(post.originalLanguage) !== undefined ? { language: post.originalLanguage! } : {}),
    ...(post.visibility !== undefined && post.visibility !== null ? { visibility: post.visibility } : {}),
    ...(content !== '' ? { postText: content } : {}),
  };
  const relu = studioDraftFromSnapshot(snapshot, params.resolveUrl, params.language);
  const draft = pages.reduce<StudioDraft>(
    (current, page) =>
      withPage(current, page.snapshot.id, (studioPage: StudioPage) => ({
        ...studioPage,
        background: withExtras(studioPage.background, page.background),
        overlay: withExtras(studioPage.overlay, page.overlay),
      })),
    relu,
  );
  const layout = isRecord(post.storyEffects) && isLayout(post.storyEffects.layout) ? post.storyEffects.layout : null;
  return {
    kind: 'studio',
    draft: { ...draft, visibility: isRememberableAudience(post.visibility) ? post.visibility : null },
    origin: {
      postId: post.id,
      kind: post.type,
      mediaIds: media.map((item) => item.id),
      layout,
      content,
      originalLanguage: stringOf(post.originalLanguage) ?? null,
      visibility: post.visibility ?? null,
    },
  };
}
