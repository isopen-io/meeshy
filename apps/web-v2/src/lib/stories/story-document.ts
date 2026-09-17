import type { CanvasV3, ObjectV3 } from '@meeshy/shared/types/canvas-v3';

import type { CanvasDocument, CanvasObject } from '@/lib/canvas/document';

/**
 * LE DOCUMENT D'UNE STORY COMPOSÉE (#6900, § 0 et § 1.6 de la spécification)
 * — le studio n'a qu'UN fond (image/vidéo), UN son de fond et UN texte
 * (P1, « un début, pas les 31 vues ») : trois objets au plus, une seule
 * scène. `buildStoryCanvasEffects` en écrit la forme EXACTE que
 * `StoryViewModel+PublicationUpload.swift:330-391` publie, corrigée des deux
 * faits mesurés au § 0 de la spécification :
 *
 *  - le fond voyage en `plane: 'content'` + `payload.isBackground: true`,
 *    JAMAIS `plane: 'bg'` — `CanvasV3Migration.swift:776-780` ne lit un objet
 *    `bg` que comme une COULEUR, jamais un média ; écrit en `bg`, ce fond
 *    serait invisible sur iOS (miroir web : `isBackground()`,
 *    `lib/feed/scene-framing.ts:51-52`) ;
 *  - `payload.mediaType` est `"image"` / `"video"` (le mot), jamais un MIME
 *    (`StoryModels.swift:129-132`).
 */
export type StudioMediaKind = 'image' | 'video';

export type StudioReadyAsset = {
  readonly postMediaId: string;
  readonly fileUrl: string;
};

export function studioMediaKindOf(mimeType: string): StudioMediaKind {
  return mimeType.startsWith('video') ? 'video' : 'image';
}

/**
 * Le TEXTE hex SANS dièse (`StoryTextObject.swift:114`) — `resolveSceneText`
 * (`lib/canvas/text.ts:59`) le relit par `hexColorCss`, qui accepte les deux
 * formes ; on écrit celle que le corpus réel porte, jamais une jumelle.
 */
const TEXT_COLOR = 'FFFFFF';
const TEXT_FONT_SIZE = 96;

function buildObjects(params: {
  readonly text: string;
  readonly locale: string;
  readonly background?: { readonly ready: StudioReadyAsset; readonly mediaType: StudioMediaKind };
  readonly sound?: { readonly ready: StudioReadyAsset };
}): ObjectV3[] {
  const objects: ObjectV3[] = [];
  const flatAnchor = { t: 'free' as const, x: 0.5, y: 0.5 };
  const identityTransform = { scale: 1, rotation: 0, opacity: 1 };

  if (params.background !== undefined) {
    objects.push({
      id: 'background',
      kind: 'media',
      anchor: flatAnchor,
      plane: 'content',
      z: 0,
      transform: identityTransform,
      payload: {
        postMediaId: params.background.ready.postMediaId,
        mediaURL: params.background.ready.fileUrl,
        mediaType: params.background.mediaType,
        isBackground: true,
      },
    });
  }

  if (params.sound !== undefined) {
    objects.push({
      id: 'sound',
      kind: 'audio',
      anchor: flatAnchor,
      plane: 'content',
      z: 1,
      transform: identityTransform,
      payload: {
        postMediaId: params.sound.ready.postMediaId,
        mediaURL: params.sound.ready.fileUrl,
        isBackground: true,
        placement: 'background',
        volume: 1,
      },
    });
  }

  const text = params.text.trim();
  if (text !== '') {
    objects.push({
      id: 'text',
      kind: 'text',
      anchor: flatAnchor,
      plane: 'fg',
      z: 2,
      transform: identityTransform,
      locale: params.locale,
      payload: {
        text,
        textStyle: 'classic',
        textColor: TEXT_COLOR,
        fontSize: TEXT_FONT_SIZE,
        fontFamily: 'system',
        textAlign: 'center',
      },
    });
  }

  return objects;
}

/**
 * LE DOCUMENT À PUBLIER — `CanvasV3` (le type de FIL, `@meeshy/shared`),
 * validé par l'appelant via `CanvasV3Schema.safeParse` (`lib/api/stories-publish.ts`)
 * AVANT tout envoi, drapeau serveur armé ou non (§3.3 de la spécification :
 * « le client valide lui-même »). `null` quand rien n'a de contenu — un post
 * ne se publie jamais sans texte NI médias (règle serveur, `core.ts:327-365`).
 */
export function buildStoryCanvasEffects(params: {
  readonly text: string;
  readonly locale: string;
  readonly background?: { readonly ready: StudioReadyAsset; readonly mediaType: StudioMediaKind };
  readonly sound?: { readonly ready: StudioReadyAsset };
}): CanvasV3 | null {
  const objects = buildObjects(params);
  if (objects.length === 0) return null;
  return { v: 3, scenes: [{ id: 'scene-0', objects }] };
}

/** Les `postMediaId` que le document RÉFÉRENCE — miroir minimal côté client
 * de `unclaimedCanvasMediaIds` (`services/gateway/.../storyEffectsV3.ts`) :
 * `postMediaId` d'abord, `mediaId` en alias (§ note de `canvas-v3.ts:60-75`). */
export function referencedStoryMediaIds(effects: CanvasV3): readonly string[] {
  const ids = new Set<string>();
  for (const scene of effects.scenes ?? []) {
    for (const object of scene.objects) {
      const payload = object.payload as Record<string, unknown>;
      const id = payload.postMediaId ?? payload.mediaId;
      if (typeof id === 'string' && id !== '') ids.add(id);
    }
  }
  return [...ids];
}

/** Ce que le document adresse et que `mediaIds` ne PORTE PAS — un post publié
 * avec cette liste non vide pointerait dans le vide (§3.3 : `MEDIA_NOT_CLAIMED`). */
export function unclaimedStoryMediaIds(effects: CanvasV3, mediaIds: readonly string[]): readonly string[] {
  return referencedStoryMediaIds(effects).filter((id) => !mediaIds.includes(id));
}

/** L'ORDRE que `POST /posts` attend — le fond D'ABORD, le son ENSUITE
 * (miroir `mediaIds: [uploadResult.id] + foregroundMediaIds`,
 * `StoryViewModel+PublicationUpload.swift:336-338`). */
export function studioMediaIds(params: {
  readonly background?: StudioReadyAsset | undefined;
  readonly sound?: StudioReadyAsset | undefined;
}): readonly string[] {
  return [params.background?.postMediaId, params.sound?.postMediaId].filter(
    (id): id is string => id !== undefined,
  );
}

/**
 * L'APERÇU — le MÊME moteur que le fil (`ScenePlayer`, D-79), sur des URL
 * LOCALES : l'aperçu ne dépend jamais de la montée (§1.4, « adapté »),
 * `previewUrl` reste la source tout au long de la composition, y compris une
 * fois l'objet ADOPTÉ (identité serveur). `null` quand rien n'est encore posé.
 */
export function buildPreviewCanvasDocument(params: {
  readonly text: string;
  readonly locale: string;
  readonly background?: { readonly previewUrl: string; readonly mediaType: StudioMediaKind };
  readonly sound?: { readonly previewUrl: string };
}): CanvasDocument | null {
  const objects: CanvasObject[] = [];
  const flatAnchor = { t: 'free' as const, x: 0.5, y: 0.5 };
  const identityTransform = { scale: 1, rotation: 0, opacity: 1 };

  if (params.background !== undefined) {
    objects.push({
      id: 'background',
      kind: 'media',
      anchor: flatAnchor,
      plane: 'content',
      z: 0,
      transform: identityTransform,
      payload: { mediaURL: params.background.previewUrl, mediaType: params.background.mediaType, isBackground: true },
    });
  }
  if (params.sound !== undefined) {
    objects.push({
      id: 'sound',
      kind: 'audio',
      anchor: flatAnchor,
      plane: 'content',
      z: 1,
      transform: identityTransform,
      payload: { mediaURL: params.sound.previewUrl, isBackground: true, placement: 'background', volume: 1 },
    });
  }
  const text = params.text.trim();
  if (text !== '') {
    objects.push({
      id: 'text',
      kind: 'text',
      anchor: flatAnchor,
      plane: 'fg',
      z: 2,
      transform: identityTransform,
      locale: params.locale,
      payload: { text, textColor: TEXT_COLOR, fontSize: TEXT_FONT_SIZE, textAlign: 'center' },
    });
  }

  if (objects.length === 0) return null;
  return { v: 3, scenes: [{ id: 'scene-0', objects }] };
}
