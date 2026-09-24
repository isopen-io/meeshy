import type { ApiFailure } from '@/lib/api/http';

import { MEDIA_CAPTION_MAX } from './media-caption';
import type { StudioMediaKind, StudioPlane } from './story-document';
import { clampPose, type StudioPose } from './studio-pose';
import { newTextLayer, type StudioTextLayer } from './studio-text';

/**
 * **UNE PAGE DU STUDIO** (#7684) — ce que #6900/#6943/#6944 posaient sur UN
 * seul plateau devient l'unité qui se répète : « une PAGE est une slide, une
 * slide est une SCÈNE du canvas » (`ComposerMediaPlacement.swift:16-21`,
 * spécification §1.1). Une page porte SES objets texte, SON fond, SON calque
 * d'avant-plan et SON son — exactement ce que `StudioDraft` portait seul
 * avant ce lot.
 *
 * Poser un second fichier dans une porte REMPLACE le précédent sur la page
 * COURANTE (question 9.1 de #6900, inchangée) — créer une page est un geste
 * DISTINCT (`withAddedPage`, `studio.ts`), jamais un effet de bord d'un dépôt
 * de fichier.
 *
 * `StudioUploadState` miroir de la pré-montée iOS
 * (`MeeshyComposerHost+PreUpload.swift:1-128`) : `uploading` pendant le
 * transport, `ready` porte l'identité SERVEUR (adoptée), `failed` porte la
 * CLÉ de sa cause — traduite au RENDU, jamais figée dans la langue du moment
 * de l'échec.
 */
export type StudioFailureKey =
  | 'story.studio.failure.network'
  | 'story.studio.failure.timeout'
  | 'story.studio.failure.session'
  | 'story.studio.failure.account'
  | 'story.studio.failure.forbidden'
  | 'story.studio.failure.tooLarge'
  | 'story.studio.failure.fileRefused'
  | 'story.studio.failure.rateLimited'
  | 'story.studio.failure.refused'
  | 'story.studio.failure.unavailable';

export type StudioUploadState =
  | { readonly phase: 'uploading'; readonly progress: number }
  | { readonly phase: 'ready'; readonly postMediaId: string; readonly fileUrl: string; readonly thumbHash?: string }
  | { readonly phase: 'failed'; readonly reasonKey: StudioFailureKey };

export type StudioVisualAsset = {
  readonly file?: File;
  readonly previewUrl: string;
  readonly mediaType: StudioMediaKind;
  readonly upload: StudioUploadState;
  /** Largeur / hauteur du FICHIER LOCAL — mesurée dès la sélection. */
  readonly aspectRatio?: number;
  /** La DURÉE du fichier local (vidéo). */
  readonly durationMs?: number;
  /** LA LÉGENDE de CE média (#6944) — `PostMedia.caption`. */
  readonly caption: string;
  /** La pose du CALQUE. Le FOND n'en a pas d'utile (il remplit la scène). */
  readonly pose: StudioPose;
};

export type StudioSoundAsset = {
  readonly file?: File;
  readonly previewUrl: string;
  readonly upload: StudioUploadState;
  readonly plane: StudioPlane;
  readonly durationMs?: number;
};

/** Les trois PORTES du couloir gauche — le fond, le calque, le son. Elles
 * agissent sur la page COURANTE. */
export type StudioDoor = 'visual' | 'overlay' | 'sound';

/**
 * **UNE PAGE** — un fond (éventuel) + ses objets (calque, textes, son). Elle
 * porte son propre identifiant (`page-1`, `page-2`…), sa propre sélection
 * (l'objet que les gestes et le couloir droit règlent) et sa propre langue de
 * composition graine.
 */
export type StudioPage = {
  readonly id: string;
  readonly texts: readonly StudioTextLayer[];
  readonly selected: string | null;
  readonly background: StudioVisualAsset | null;
  readonly overlay: StudioVisualAsset | null;
  readonly sound: StudioSoundAsset | null;
};

/** Une page NEUVE, avec UN texte vide sélectionné — même loi que
 * `emptyStudioDraft` avant ce lot. `textId` est calculé par l'appelant
 * (`studio.ts`) CONTRE TOUTES LES PAGES du brouillon : deux pages ne
 * partagent jamais un `id` de texte (`translationSetPath`,
 * `storyEffectsV3.ts:635-643`, prend le PREMIER objet d'un `id` donné, toutes
 * scènes confondues). */
export function emptyStudioPage(id: string, textId: string, language: string): StudioPage {
  const seed = newTextLayer({ id: textId, language });
  return { id, texts: [seed], selected: seed.id, background: null, overlay: null, sound: null };
}

export function isStudioPageEmpty(page: StudioPage): boolean {
  return page.texts.every((layer) => layer.text.trim() === '') && page.background === null && page.overlay === null && page.sound === null;
}

/** Une page ne peut pas partir si un de ses trois assets a ÉCHOUÉ — l'auteur
 * le retire ou réessaie d'abord (loi 4). */
export function isStudioPagePublishable(page: StudioPage): boolean {
  if (page.background?.upload.phase === 'failed') return false;
  if (page.overlay?.upload.phase === 'failed') return false;
  if (page.sound?.upload.phase === 'failed') return false;
  return true;
}

/** Le nombre d'assets (fond/calque/son) que CETTE page porte — prêts OU en
 * vol, comptés pour le plafond du DOCUMENT (`studioMediaCount`, `studio.ts`). */
export function pageMediaCount(page: StudioPage): number {
  return [page.background, page.overlay, page.sound].filter((asset) => asset !== null).length;
}

/* ── LES OBJETS TEXTE, sur une page ──────────────────────────────────────── */

export const selectedTextLayerOf = (page: StudioPage): StudioTextLayer | null =>
  page.texts.find((layer) => layer.id === page.selected) ?? null;

/** `textId` est calculé par l'appelant contre TOUTES les pages (même raison
 * que `emptyStudioPage`). */
export function pageWithAddedText(page: StudioPage, textId: string, language: string): StudioPage {
  const layer = newTextLayer({ id: textId, language });
  return { ...page, texts: [...page.texts, layer], selected: layer.id };
}

export function pageWithSelected(page: StudioPage, id: string | null): StudioPage {
  return { ...page, selected: id };
}

/** RETIRER un objet texte. Le dernier ne se retire pas en laissant la page
 * sans cible de frappe : il se VIDE, et la sélection reste sur lui. */
export function pageWithoutText(page: StudioPage, id: string): StudioPage {
  if (page.texts.length <= 1) {
    const cleared = page.texts.map((layer) => (layer.id === id ? { ...layer, text: '' } : layer));
    return { ...page, texts: cleared };
  }
  const texts = page.texts.filter((layer) => layer.id !== id);
  return { ...page, texts, selected: page.selected === id ? (texts[texts.length - 1]?.id ?? null) : page.selected };
}

/** LE site unique de mutation d'un objet texte d'UNE page. */
export function pageWithTextLayer(page: StudioPage, id: string, change: (layer: StudioTextLayer) => StudioTextLayer): StudioPage {
  return { ...page, texts: page.texts.map((layer) => (layer.id === id ? change(layer) : layer)) };
}

export function pageWithText(page: StudioPage, id: string, text: string): StudioPage {
  return pageWithTextLayer(page, id, (layer) => ({ ...layer, text }));
}

/* ── LES TROIS PORTES, sur une page ──────────────────────────────────────── */

const visualSlot = (door: Extract<StudioDoor, 'visual' | 'overlay'>): 'background' | 'overlay' =>
  door === 'visual' ? 'background' : 'overlay';

export function pageWithVisual(page: StudioPage, door: 'visual' | 'overlay', asset: StudioVisualAsset): StudioPage {
  return { ...page, [visualSlot(door)]: asset };
}

export function pageWithoutVisual(page: StudioPage, door: 'visual' | 'overlay'): StudioPage {
  const slot = visualSlot(door);
  return { ...page, [slot]: null, ...(slot === 'overlay' && page.selected === 'overlay' ? { selected: null } : {}) };
}

export function pageWithVisualUpload(page: StudioPage, door: 'visual' | 'overlay', upload: StudioUploadState): StudioPage {
  const slot = visualSlot(door);
  const asset = page[slot];
  return asset === null ? page : { ...page, [slot]: { ...asset, upload } };
}

export function pageWithVisualAspectRatio(page: StudioPage, door: 'visual' | 'overlay', previewUrl: string, aspectRatio: number): StudioPage {
  const slot = visualSlot(door);
  const asset = page[slot];
  if (asset === null || asset.previewUrl !== previewUrl) return page;
  return { ...page, [slot]: { ...asset, aspectRatio } };
}

export function pageWithMediaDuration(page: StudioPage, door: StudioDoor, previewUrl: string, durationMs: number): StudioPage {
  if (door === 'sound') {
    const sound = page.sound;
    if (sound === null || sound.previewUrl !== previewUrl) return page;
    return { ...page, sound: { ...sound, durationMs } };
  }
  const slot = visualSlot(door);
  const asset = page[slot];
  if (asset === null || asset.previewUrl !== previewUrl) return page;
  return { ...page, [slot]: { ...asset, durationMs } };
}

export function pageWithVisualCaption(page: StudioPage, door: 'visual' | 'overlay', caption: string): StudioPage {
  const slot = visualSlot(door);
  const asset = page[slot];
  return asset === null ? page : { ...page, [slot]: { ...asset, caption: caption.slice(0, MEDIA_CAPTION_MAX) } };
}

export function pageWithVisualPose(page: StudioPage, door: 'visual' | 'overlay', pose: StudioPose): StudioPage {
  const slot = visualSlot(door);
  const asset = page[slot];
  return asset === null ? page : { ...page, [slot]: { ...asset, pose: clampPose(pose) } };
}

export function pageWithSound(page: StudioPage, asset: StudioSoundAsset): StudioPage {
  return { ...page, sound: asset };
}

export function pageWithoutSound(page: StudioPage): StudioPage {
  return { ...page, sound: null };
}

export function pageWithSoundUpload(page: StudioPage, upload: StudioUploadState): StudioPage {
  if (page.sound === null) return page;
  return { ...page, sound: { ...page.sound, upload } };
}

export function pageWithSoundPlane(page: StudioPage, plane: StudioPlane): StudioPage {
  if (page.sound === null) return page;
  return { ...page, sound: { ...page.sound, plane } };
}

/** La porte décide du rôle ; `accept` n'est qu'un CONSEIL au sélecteur natif
 * — ce prédicat est la garde. Un MIME vide (inconnu du navigateur) passe : la
 * passerelle juge les octets (`tus-handler.ts:384-400`). */
export function studioDoorAccepts(door: StudioDoor, mimeType: string): boolean {
  if (mimeType === '') return true;
  if (door === 'sound') return mimeType.startsWith('audio/');
  return mimeType.startsWith('image/') || mimeType.startsWith('video/');
}

export function readyAssetOf(
  upload: StudioUploadState,
): { readonly postMediaId: string; readonly fileUrl: string; readonly thumbHash?: string } | null {
  if (upload.phase !== 'ready') return null;
  return { postMediaId: upload.postMediaId, fileUrl: upload.fileUrl, ...(upload.thumbHash !== undefined ? { thumbHash: upload.thumbHash } : {}) };
}

/**
 * LA CAUSE D'UN ÉCHEC, dans le vocabulaire d'une STORY — `null` ⇒ rien à
 * dire : une annulation vient de l'auteur lui-même (retrait, remplacement).
 */
export function studioFailureKey(failure: ApiFailure, stage: 'upload' | 'publish'): StudioFailureKey | null {
  if (failure.code === 'ABORTED') return null;
  if (failure.code === 'CANVAS_INVALID' || failure.code === 'MEDIA_NOT_CLAIMED') return 'story.studio.failure.refused';
  if (failure.code === 'POST_MEDIA_REQUIRES_ACCOUNT') return 'story.studio.failure.account';
  if (failure.status === 0) return failure.code === 'TIMEOUT' ? 'story.studio.failure.timeout' : 'story.studio.failure.network';
  if (failure.status === 401) return 'story.studio.failure.session';
  if (failure.status === 403) return 'story.studio.failure.forbidden';
  if (failure.status === 413) return 'story.studio.failure.tooLarge';
  if (failure.status === 429) return 'story.studio.failure.rateLimited';
  if (failure.status === 400 && stage === 'upload') return 'story.studio.failure.fileRefused';
  if (failure.status >= 400 && failure.status < 500) return 'story.studio.failure.refused';
  return 'story.studio.failure.unavailable';
}
