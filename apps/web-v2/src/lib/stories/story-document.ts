import type { CanvasV3, ObjectV3 } from '@meeshy/shared/types/canvas-v3';

import { parseCanvasDocument, type CanvasDocument } from '@/lib/canvas/document';

/**
 * LE DOCUMENT D'UNE STORY COMPOSÉE (#6900, § 0 et § 1.6 de la spécification)
 * — le studio n'a qu'UN fond (image/vidéo), UN son de fond et UN texte
 * (P1, « un début, pas les 31 vues ») : trois objets au plus, une seule
 * scène. `composeStoryCanvas` en écrit la forme EXACTE que
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
 *
 * **UN SEUL composeur pour l'aperçu et la publication** (loi 6 relue « le
 * PLAYER est l'aperçu », `meeshy-reader-modele.md`) : les deux ne diffèrent
 * que par l'ADRESSE d'un média — l'URL locale tant que le fichier est en
 * main, l'identité serveur (`postMediaId` + `fileUrl`) une fois monté. Deux
 * constructions parallèles avaient déjà divergé (le texte d'aperçu perdait
 * `textStyle` et `fontFamily`) : ce que l'auteur voit ne serait plus ce qui
 * part.
 */
export type StudioMediaKind = 'image' | 'video';

export type StudioReadyAsset = {
  readonly postMediaId: string;
  readonly fileUrl: string;
};

/** Où un média se LIT : `mediaURL` toujours, `postMediaId` une fois monté. */
export type StoryMediaAddress = {
  readonly mediaURL: string;
  readonly postMediaId?: string;
};

export type StoryComposition = {
  readonly text: string;
  readonly locale: string;
  readonly background?: { readonly address: StoryMediaAddress; readonly mediaType: StudioMediaKind };
  readonly sound?: { readonly address: StoryMediaAddress };
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
/** Le défaut du COMPOSER iOS (`StoryTextObject.swift:109`), dans le
 * référentiel 1080 — le décodeur, lui, retombe sur 64 quand la clé manque. */
const TEXT_FONT_SIZE = 96;
/**
 * LE FOND D'UNE STORY SANS VISUEL — le texte du studio est BLANC
 * (`TEXT_COLOR`, le défaut du composer iOS) ; sans fond, le lecteur web peint
 * l'aplat de carte (`BlankBackground`, `--color-ios-card`), CLAIR en schéma
 * clair : une story texte seul y devenait illisible. La couleur est la
 * première de la palette de fonds d'iOS (`StoryBackgroundPalette.colors[0]`,
 * `StoryComposerSupportTypes.swift:13`), écrite dans un objet `bg` de
 * couleur — la forme que `CanvasV3Migration.swift:830-833` relit en
 * `background`. Une DONNÉE du document, pas une couleur d'interface.
 */
export const STORY_PLAIN_BACKGROUND = '0F0C29';
const CENTER = { t: 'free', x: 0.5, y: 0.5 } as const;
const IDENTITY = { scale: 1, rotation: 0, opacity: 1 } as const;

function addressPayload(address: StoryMediaAddress): Record<string, string> {
  return { ...(address.postMediaId !== undefined ? { postMediaId: address.postMediaId } : {}), mediaURL: address.mediaURL };
}

/** L'objet TEXTE du studio — l'éditeur posé sur la carte en relit la couleur
 * et la taille par le MÊME résolveur que le player (`resolveSceneText` sur
 * un document composé ici), jamais par une seconde règle de dimensionnement. */
function storyTextObject(text: string, locale: string): ObjectV3 {
  return {
    id: 'text',
    kind: 'text',
    anchor: CENTER,
    plane: 'fg',
    z: 2,
    transform: IDENTITY,
    locale,
    payload: { text, textStyle: 'classic', textColor: TEXT_COLOR, fontSize: TEXT_FONT_SIZE, fontFamily: 'system', textAlign: 'center' },
  };
}

function composeObjects(input: StoryComposition): ObjectV3[] {
  const { background, sound } = input;
  const text = input.text.trim();
  const mutesVideo = background?.mediaType === 'video' && sound !== undefined;
  const content = [
    ...(background !== undefined
      ? [
          {
            id: 'background',
            kind: 'media',
            anchor: CENTER,
            plane: 'content',
            z: 0,
            transform: IDENTITY,
            payload: {
              ...addressPayload(background.address),
              mediaType: background.mediaType,
              isBackground: true,
              ...(mutesVideo ? { muted: true, volume: 0 } : {}),
            },
          } satisfies ObjectV3,
        ]
      : []),
    ...(sound !== undefined
      ? [
          {
            id: 'sound',
            kind: 'audio',
            anchor: CENTER,
            plane: 'content',
            z: 1,
            transform: IDENTITY,
            payload: { ...addressPayload(sound.address), isBackground: true, placement: 'background', volume: 1 },
          } satisfies ObjectV3,
        ]
      : []),
    ...(text !== '' ? [storyTextObject(text, input.locale)] : []),
  ];
  if (content.length === 0 || background !== undefined) return content;
  const plain: ObjectV3 = {
    id: 'bg',
    kind: 'media',
    anchor: CENTER,
    plane: 'bg',
    z: 0,
    transform: IDENTITY,
    payload: { background: STORY_PLAIN_BACKGROUND },
  };
  return [plain, ...content];
}

/** LE composeur — `null` quand rien n'a de contenu (un post ne se publie
 * jamais sans texte NI média, `core.ts:327-365`). */
export function composeStoryCanvas(input: StoryComposition): CanvasV3 | null {
  const objects = composeObjects(input);
  return objects.length === 0 ? null : { v: 3, scenes: [{ id: 'scene-0', objects }] };
}

/**
 * LE DOCUMENT À PUBLIER — chaque média y porte son identité SERVEUR, que le
 * type exige (`StudioReadyAsset`). Validé par `publishStory`
 * (`CanvasV3Schema.safeParse`, `lib/api/stories-publish.ts`) AVANT tout envoi.
 */
export function buildStoryCanvasEffects(params: {
  readonly text: string;
  readonly locale: string;
  readonly background?: { readonly ready: StudioReadyAsset; readonly mediaType: StudioMediaKind };
  readonly sound?: { readonly ready: StudioReadyAsset };
}): CanvasV3 | null {
  const served = (ready: StudioReadyAsset): StoryMediaAddress => ({ postMediaId: ready.postMediaId, mediaURL: ready.fileUrl });
  return composeStoryCanvas({
    text: params.text,
    locale: params.locale,
    ...(params.background !== undefined ? { background: { address: served(params.background.ready), mediaType: params.background.mediaType } } : {}),
    ...(params.sound !== undefined ? { sound: { address: served(params.sound.ready) } } : {}),
  });
}

/**
 * L'APERÇU — le MÊME composeur, sur des URL LOCALES : l'aperçu ne dépend
 * jamais de la montée (§1.4, « adapté »), et se RELIT par le parseur du
 * player (`parseCanvasDocument`), jamais par une troisième forme.
 */
export function buildPreviewCanvasDocument(params: {
  readonly text: string;
  readonly locale: string;
  readonly background?: { readonly previewUrl: string; readonly mediaType: StudioMediaKind };
  readonly sound?: { readonly previewUrl: string };
}): CanvasDocument | null {
  const composed = composeStoryCanvas({
    text: params.text,
    locale: params.locale,
    ...(params.background !== undefined
      ? { background: { address: { mediaURL: params.background.previewUrl }, mediaType: params.background.mediaType } }
      : {}),
    ...(params.sound !== undefined ? { sound: { address: { mediaURL: params.sound.previewUrl } } } : {}),
  });
  return composed === null ? null : parseCanvasDocument(composed);
}

/** Les `postMediaId` que le document RÉFÉRENCE — miroir minimal côté client
 * de `unclaimedCanvasMediaIds` (`services/gateway/.../storyEffectsV3.ts`),
 * élargi à `audio` : la passerelle ne le vérifie pas, mais le claim en a
 * besoin (§ 3.3). `postMediaId` d'abord, `mediaId` en alias. */
export function referencedStoryMediaIds(effects: CanvasV3): readonly string[] {
  const ids = (effects.scenes ?? []).flatMap((scene) =>
    scene.objects.map((object) => object.payload.postMediaId ?? object.payload.mediaId).filter((id): id is string => typeof id === 'string' && id !== ''),
  );
  return [...new Set(ids)];
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
  return [params.background?.postMediaId, params.sound?.postMediaId].filter((id): id is string => id !== undefined);
}
