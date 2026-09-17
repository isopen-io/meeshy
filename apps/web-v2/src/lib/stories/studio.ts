import type { ApiFailure } from '@/lib/api/http';

import { MEDIA_CAPTION_MAX } from './media-caption';
import type { StudioMediaKind, StudioPlane } from './story-document';
import type { StudioDraftSnapshot, StudioTextLayerSnapshot } from './studio-draft-store';
import { IDENTITY_POSE, clampPose, type StudioPose } from './studio-pose';
import {
  STUDIO_TEXT_ALIGNS,
  STUDIO_TEXT_BACKGROUND_VALUES,
  STUDIO_TEXT_COLORS,
  STUDIO_TEXT_EFFECTS,
  STUDIO_TEXT_STYLES,
  newTextLayer,
  nextTextLayerId,
  type StudioTextLayer,
} from './studio-text';

/**
 * **L'ÉTAT DU PLATEAU DE STORY** (#6900, élargi par #6943) — ce que l'auteur
 * pose, et où. Le studio de #6900 avait trois valeurs : un fond, un son de
 * fond, UN texte. Il en a désormais quatre familles :
 *
 *  - **plusieurs objets texte**, chacun avec sa pose, sa langue et son style ;
 *  - **un fond** (image/vidéo) et **un calque d'avant-plan**, qui répondent à
 *    « ajouter des images en fond OU en front » (directive porteur
 *    2026-09-17) ;
 *  - **un son**, qui se place en FOND (la bande-son de la scène) ou POSÉ ;
 *  - **une légende par média** (`PostMedia.caption`, #6944) — le TROISIÈME
 *    contenu du dépôt, ni `Post.content` ni `alt`.
 *
 * Poser un second fichier dans une porte REMPLACE le précédent (question 9.1
 * de #6900 : il n'y a qu'une place par porte, donc rien à demander à
 * l'auteur). Les objets texte, eux, s'ajoutent — c'est tout l'objet du lot.
 *
 * `StudioUploadState` miroir de la pré-montée iOS
 * (`MeeshyComposerHost+PreUpload.swift:1-128`) : `uploading` pendant le
 * transport, `ready` porte l'identité SERVEUR (adoptée), `failed` porte la
 * CLÉ de sa cause — traduite au RENDU, jamais figée dans la langue du moment
 * de l'échec. Un asset RESTAURÉ n'a plus de `File` : il est `ready` ou il
 * n'est pas restauré.
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
  /** Largeur / hauteur du FICHIER LOCAL (§ 0, défaut 7) — mesurée dès la
   * sélection (`measureAspectRatio`). `undefined` tant que la mesure est en
   * vol : un document publié SANS elle laisse le lecteur cadrer sur le
   * rapport 9:16 par défaut, jamais un blocage. */
  readonly aspectRatio?: number;
  /** LA LÉGENDE de CE média (#6944) — `PostMedia.caption`. */
  readonly caption: string;
  /** La pose du CALQUE. Le FOND n'en a pas d'utile (il remplit la scène, et
   * iOS interdit même de le faire tourner) : elle reste à l'identité. */
  readonly pose: StudioPose;
};

export type StudioSoundAsset = {
  readonly file?: File;
  readonly previewUrl: string;
  readonly upload: StudioUploadState;
  readonly plane: StudioPlane;
};

export type StudioDraft = {
  readonly texts: readonly StudioTextLayer[];
  /** L'objet SÉLECTIONNÉ — l'`id` d'un texte, `'overlay'`, ou `null`. C'est
   * lui que l'éditeur du couloir droit règle et que les gestes déplacent :
   * sans sélection explicite, un plateau à plusieurs objets ne saurait pas
   * lequel un geste concerne. */
  readonly selected: string | null;
  readonly language?: string;
  readonly background: StudioVisualAsset | null;
  readonly overlay: StudioVisualAsset | null;
  readonly sound: StudioSoundAsset | null;
};

/** Les trois PORTES du couloir gauche — le fond, le calque, le son. Le
 * vocabulaire du modèle dit « plan » pour bg/content/fg ; ici c'est la PORTE
 * par laquelle un fichier entre, et elle décide de son rôle. */
export type StudioDoor = 'visual' | 'overlay' | 'sound';

export function emptyStudioDraft(language: string): StudioDraft {
  const seed = newTextLayer({ id: 'text-1', language });
  // UN objet texte VIDE dès l'ouverture : c'est lui que la saisie du plateau
  // édite, et il ne devient un objet du document que s'il porte du texte
  // (`composeObjects` filtre les vides). Sans lui, le plateau n'aurait aucune
  // cible de frappe tant que l'auteur n'a pas tapé « ajouter un texte ».
  return { texts: [seed], selected: seed.id, background: null, overlay: null, sound: null };
}

export function isStudioDraftEmpty(draft: StudioDraft): boolean {
  return (
    draft.texts.every((layer) => layer.text.trim() === '') &&
    draft.background === null &&
    draft.overlay === null &&
    draft.sound === null
  );
}

/* ── LES OBJETS TEXTE ─────────────────────────────────────────────────────── */

export const selectedTextLayer = (draft: StudioDraft): StudioTextLayer | null =>
  draft.texts.find((layer) => layer.id === draft.selected) ?? null;

export function withAddedText(draft: StudioDraft, language: string): StudioDraft {
  const layer = newTextLayer({ id: nextTextLayerId(draft.texts), language });
  return { ...draft, texts: [...draft.texts, layer], selected: layer.id };
}

export function withSelected(draft: StudioDraft, id: string | null): StudioDraft {
  return { ...draft, selected: id };
}

/**
 * RETIRER un objet texte. Le dernier ne se retire pas en laissant le plateau
 * sans cible de frappe : il se VIDE, et la sélection reste sur lui — un
 * plateau où plus rien n'est sélectionnable serait un cul-de-sac au clavier.
 */
export function withoutText(draft: StudioDraft, id: string): StudioDraft {
  if (draft.texts.length <= 1) {
    const cleared = draft.texts.map((layer) => (layer.id === id ? { ...layer, text: '' } : layer));
    return { ...draft, texts: cleared };
  }
  const texts = draft.texts.filter((layer) => layer.id !== id);
  return { ...draft, texts, selected: draft.selected === id ? (texts[texts.length - 1]?.id ?? null) : draft.selected };
}

/** LE site unique de mutation d'un objet texte — chaque réglage passe par lui
 * plutôt que d'ouvrir son propre `setDraft`, pour que « quel objet ? » se
 * réponde une fois. */
export function withTextLayer(draft: StudioDraft, id: string, change: (layer: StudioTextLayer) => StudioTextLayer): StudioDraft {
  return { ...draft, texts: draft.texts.map((layer) => (layer.id === id ? change(layer) : layer)) };
}

export function withText(draft: StudioDraft, id: string, text: string): StudioDraft {
  return withTextLayer(draft, id, (layer) => ({ ...layer, text }));
}

/* ── LES TROIS PORTES ─────────────────────────────────────────────────────── */

const visualSlot = (door: Extract<StudioDoor, 'visual' | 'overlay'>): 'background' | 'overlay' =>
  door === 'visual' ? 'background' : 'overlay';

export function withVisual(draft: StudioDraft, door: 'visual' | 'overlay', asset: StudioVisualAsset): StudioDraft {
  return { ...draft, [visualSlot(door)]: asset };
}

export function withoutVisual(draft: StudioDraft, door: 'visual' | 'overlay'): StudioDraft {
  const slot = visualSlot(door);
  return { ...draft, [slot]: null, ...(slot === 'overlay' && draft.selected === 'overlay' ? { selected: null } : {}) };
}

export function withVisualUpload(draft: StudioDraft, door: 'visual' | 'overlay', upload: StudioUploadState): StudioDraft {
  const slot = visualSlot(door);
  const asset = draft[slot];
  return asset === null ? draft : { ...draft, [slot]: { ...asset, upload } };
}

/** Posée dès que la mesure LOCALE du fichier aboutit (§ 0, défaut 7) — sans
 * garde de course : un média déjà RETIRÉ ou REMPLACÉ le temps de la mesure ne
 * doit pas hériter le rapport d'un autre fichier (le remplaçant a déjà posé
 * le sien à sa propre sélection). */
export function withVisualAspectRatio(
  draft: StudioDraft,
  door: 'visual' | 'overlay',
  previewUrl: string,
  aspectRatio: number,
): StudioDraft {
  const slot = visualSlot(door);
  const asset = draft[slot];
  if (asset === null || asset.previewUrl !== previewUrl) return draft;
  return { ...draft, [slot]: { ...asset, aspectRatio } };
}

/** La légende est TAILLÉE à la saisie, pas seulement à l'envoi : l'auteur voit
 * immédiatement la borne du contrat plutôt que de perdre la fin de sa phrase
 * au moment de publier. */
export function withVisualCaption(draft: StudioDraft, door: 'visual' | 'overlay', caption: string): StudioDraft {
  const slot = visualSlot(door);
  const asset = draft[slot];
  return asset === null ? draft : { ...draft, [slot]: { ...asset, caption: caption.slice(0, MEDIA_CAPTION_MAX) } };
}

export function withVisualPose(draft: StudioDraft, door: 'visual' | 'overlay', pose: StudioPose): StudioDraft {
  const slot = visualSlot(door);
  const asset = draft[slot];
  return asset === null ? draft : { ...draft, [slot]: { ...asset, pose: clampPose(pose) } };
}

export function withSound(draft: StudioDraft, asset: StudioSoundAsset): StudioDraft {
  return { ...draft, sound: asset };
}

export function withoutSound(draft: StudioDraft): StudioDraft {
  return { ...draft, sound: null };
}

export function withSoundUpload(draft: StudioDraft, upload: StudioUploadState): StudioDraft {
  if (draft.sound === null) return draft;
  return { ...draft, sound: { ...draft.sound, upload } };
}

export function withSoundPlane(draft: StudioDraft, plane: StudioPlane): StudioDraft {
  if (draft.sound === null) return draft;
  return { ...draft, sound: { ...draft.sound, plane } };
}

/** La porte décide du rôle ; `accept` n'est qu'un CONSEIL au sélecteur natif
 * (« Tous les fichiers » le contourne) — ce prédicat est la garde. Un MIME
 * vide (inconnu du navigateur) passe : la passerelle juge les octets
 * (`tus-handler.ts:384-400`) et son refus se dit (`fileRefused`). */
export function studioDoorAccepts(door: StudioDoor, mimeType: string): boolean {
  if (mimeType === '') return true;
  if (door === 'sound') return mimeType.startsWith('audio/');
  return mimeType.startsWith('image/') || mimeType.startsWith('video/');
}

/**
 * LE BOUTON PUBLIER EST INERTE — loi 4 (« un contrôle existe s'il a un
 * effet »). `false` sur un brouillon VIDE et sur tout asset en ÉCHEC
 * (l'auteur le retire ou réessaie d'abord) — un asset EN VOL n'inhibe PAS le
 * geste : la publication ATTEND son accusé (§1.4), elle ne relance jamais un
 * second envoi.
 */
export function canPublishStudioDraft(draft: StudioDraft): boolean {
  if (isStudioDraftEmpty(draft)) return false;
  if (draft.background?.upload.phase === 'failed') return false;
  if (draft.overlay?.upload.phase === 'failed') return false;
  if (draft.sound?.upload.phase === 'failed') return false;
  return true;
}

export function readyAssetOf(
  upload: StudioUploadState,
): { readonly postMediaId: string; readonly fileUrl: string; readonly thumbHash?: string } | null {
  if (upload.phase !== 'ready') return null;
  return { postMediaId: upload.postMediaId, fileUrl: upload.fileUrl, ...(upload.thumbHash !== undefined ? { thumbHash: upload.thumbHash } : {}) };
}

/**
 * LA CAUSE D'UN ÉCHEC, dans le vocabulaire d'une STORY — `sendFailureReason`
 * (`send/failure-reason.ts`) parle d'une conversation et d'un message, en
 * français quelle que soit la langue de l'interface. `null` ⇒ rien à dire :
 * une annulation vient de l'auteur lui-même (retrait, remplacement).
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

/* ── LE BROUILLON ─────────────────────────────────────────────────────────── */

/** Ce qui se PERSISTE : les objets texte AVEC leur pose, les légendes, et les
 * médias PRÊTS — jamais un `File`, jamais une URL locale (morte au
 * rechargement). */
export function studioSnapshotOf(draft: StudioDraft, language: string): StudioDraftSnapshot {
  const visual = (asset: StudioVisualAsset | null) => {
    const ready = asset === null ? null : readyAssetOf(asset.upload);
    if (asset === null || ready === null) return undefined;
    return {
      ...ready,
      mediaType: asset.mediaType,
      ...(asset.aspectRatio !== undefined ? { aspectRatio: asset.aspectRatio } : {}),
      ...(asset.caption !== '' ? { caption: asset.caption } : {}),
      pose: asset.pose,
    };
  };
  const background = visual(draft.background);
  const overlay = visual(draft.overlay);
  const sound = draft.sound === null ? null : readyAssetOf(draft.sound.upload);
  return {
    texts: draft.texts.map((layer) => ({ ...layer })),
    ...(draft.texts.some((layer) => layer.text.trim() !== '') ? { language } : {}),
    ...(background !== undefined ? { background } : {}),
    ...(overlay !== undefined ? { overlay } : {}),
    ...(sound !== null && draft.sound !== null ? { sound: { ...sound, plane: draft.sound.plane } } : {}),
  };
}

const oneOf = <T extends string>(table: readonly T[], value: unknown, fallback: T): T =>
  typeof value === 'string' && (table as readonly string[]).includes(value) ? (value as T) : fallback;

const poseOf = (value: unknown): StudioPose => {
  if (typeof value !== 'object' || value === null) return IDENTITY_POSE;
  const record = value as Record<string, unknown>;
  const n = (key: string, fallback: number): number => (typeof record[key] === 'number' ? (record[key] as number) : fallback);
  return clampPose({ x: n('x', 0.5), y: n('y', 0.5), scale: n('scale', 1), rotation: n('rotation', 0) });
};

/** UN objet texte relu — chaque champ NORMALISÉ contre la table du studio :
 * un JSON abîmé, ou écrit par une version qui servait d'autres styles, rend
 * un objet valide plutôt qu'une exception ou un style que rien ne peint. */
function textLayerFromSnapshot(snapshot: StudioTextLayerSnapshot, language: string): StudioTextLayer {
  return {
    id: snapshot.id,
    text: snapshot.text,
    language: typeof snapshot.language === 'string' && snapshot.language !== '' ? snapshot.language : language,
    style: oneOf(STUDIO_TEXT_STYLES, snapshot.style, 'bold'),
    effect: oneOf(STUDIO_TEXT_EFFECTS, snapshot.effect, 'none'),
    color: oneOf(STUDIO_TEXT_COLORS, snapshot.color, 'FFFFFF'),
    align: oneOf(STUDIO_TEXT_ALIGNS, snapshot.align, 'center'),
    background:
      typeof snapshot.background === 'string' && (STUDIO_TEXT_BACKGROUND_VALUES as readonly string[]).includes(snapshot.background)
        ? snapshot.background
        : null,
    pose: poseOf(snapshot.pose),
  };
}

/** Le brouillon RELU — chaque média restauré est PRÊT et se prévisualise
 * depuis le SERVEUR (`resolveUrl`, `attachmentSrc` en production) : c'est le
 * seul cas où l'aperçu lit le réseau, le fichier local n'existant plus. */
export function studioDraftFromSnapshot(
  snapshot: StudioDraftSnapshot | null,
  resolveUrl: (fileUrl: string) => string,
  language: string,
): StudioDraft {
  if (snapshot === null) return emptyStudioDraft(language);
  const composeLanguage = snapshot.language ?? language;
  const visual = (
    ref: NonNullable<StudioDraftSnapshot['background'] | StudioDraftSnapshot['overlay']> | undefined,
  ): StudioVisualAsset | null =>
    ref === undefined
      ? null
      : {
          previewUrl: resolveUrl(ref.fileUrl),
          mediaType: ref.mediaType,
          ...(ref.aspectRatio !== undefined ? { aspectRatio: ref.aspectRatio } : {}),
          caption: ref.caption ?? '',
          pose: poseOf('pose' in ref ? ref.pose : undefined),
          upload: {
            phase: 'ready',
            postMediaId: ref.postMediaId,
            fileUrl: ref.fileUrl,
            ...(ref.thumbHash !== undefined ? { thumbHash: ref.thumbHash } : {}),
          },
        };
  const texts =
    snapshot.texts.length === 0
      ? emptyStudioDraft(composeLanguage).texts
      : snapshot.texts.map((layer) => textLayerFromSnapshot(layer, composeLanguage));
  return {
    texts,
    selected: texts[0]?.id ?? null,
    ...(snapshot.language !== undefined ? { language: snapshot.language } : {}),
    background: visual(snapshot.background),
    overlay: visual(snapshot.overlay),
    sound:
      snapshot.sound === undefined
        ? null
        : {
            previewUrl: resolveUrl(snapshot.sound.fileUrl),
            plane: snapshot.sound.plane === 'foreground' ? 'foreground' : 'background',
            upload: {
              phase: 'ready',
              postMediaId: snapshot.sound.postMediaId,
              fileUrl: snapshot.sound.fileUrl,
              ...(snapshot.sound.thumbHash !== undefined ? { thumbHash: snapshot.sound.thumbHash } : {}),
            },
          },
  };
}
