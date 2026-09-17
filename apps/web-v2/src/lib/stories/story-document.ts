import type { CanvasV3, ObjectV3 } from '@meeshy/shared/types/canvas-v3';

import { parseCanvasDocument, type CanvasDocument } from '@/lib/canvas/document';

import type { StudioPose } from './studio-pose';
import { textLayerPayload, type StudioTextLayer } from './studio-text';

/**
 * LE DOCUMENT D'UNE STORY COMPOSÉE (#6900, élargi au PLATEAU par #6943) — le
 * studio pose désormais **plusieurs objets texte** (chacun avec sa pose, sa
 * langue et son style), **un fond**, **un calque d'avant-plan** et **un son**
 * qui se place en fond OU sur la scène. `composeStoryCanvas` en écrit la
 * forme EXACTE que
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
  /** L'empreinte de l'ACCUSÉ TUS (`tus-handler.ts:457-472`) — placeholder que
   * les quatre surfaces du fil affichent avant l'arrivée du média (§ 0 de la
   * spécification, défaut 7). Absente : la passerelle en génère une, mais un
   * document publié SANS elle n'en profite jamais. */
  readonly thumbHash?: string;
};

/** Où un média se LIT : `mediaURL` toujours, `postMediaId` une fois monté,
 * `thumbHash` dès que l'accusé TUS en porte une — les trois clés que
 * `SceneFraming.declaredAspect`/`scene-framing.ts#declaredAspect` et les
 * quatre surfaces de placeholder relisent SANS rien télécharger. */
export type StoryMediaAddress = {
  readonly mediaURL: string;
  readonly postMediaId?: string;
  readonly thumbHash?: string;
};

/** LE PLAN D'UN MÉDIA — le vocabulaire du modèle (`meeshy-composer-modele.md`
 * § « Les trois plans ») : `background` est le FOND (un visuel, un son),
 * `foreground` ce qui se POSE dessus. Le fil abrège en `bg | content | fg`,
 * mais un fond IMAGE voyage en `content` avec `payload.isBackground`, jamais
 * en `bg` — `CanvasV3Migration.swift:776-780` ne lit un objet `bg` que comme
 * une COULEUR. */
export type StudioPlane = 'background' | 'foreground';

export type StoryVisual = {
  readonly address: StoryMediaAddress;
  readonly mediaType: StudioMediaKind;
  /** Largeur / hauteur du FICHIER LOCAL (§ 0, défaut 7) — connu dès la
   * sélection, IDENTIQUE dans l'aperçu et la publication (contrairement à
   * `thumbHash`, qui n'existe qu'une fois l'accusé TUS reçu). Sans lui, un
   * fond paysage n'est plus cadré sur sa bande côté lecteur
   * (`declaredAspect`, `scene-framing.ts:57-61`). */
  readonly aspectRatio?: number;
};

export type StoryComposition = {
  /** Les objets TEXTE, dans leur ordre de pose — leur `z` en découle, comme
   * `zIndex = 0` signifie « ordre d'insertion » côté iOS. Un texte VIDE ne
   * devient jamais un objet : il n'aurait rien à peindre ni à traduire. */
  readonly texts: readonly StudioTextLayer[];
  readonly background?: StoryVisual;
  /** LE CALQUE D'AVANT-PLAN — un second visuel, posé SUR le fond, avec sa
   * propre pose. C'est lui qui répond à « ajouter des images en fond **ou
   * front** » (directive porteur 2026-09-17). */
  readonly overlay?: StoryVisual & { readonly pose: StudioPose };
  /** LE SON — `background` : la bande-son de la scène, élue par
   * `electBackgroundTrack` (`payload.isBackground === true`) ; `foreground` :
   * un son POSÉ, que cette élection ignore. Deux rôles, un seul fichier. */
  readonly sound?: { readonly address: StoryMediaAddress; readonly plane: StudioPlane };
};

export function studioMediaKindOf(mimeType: string): StudioMediaKind {
  return mimeType.startsWith('video') ? 'video' : 'image';
}

/**
 * LE FOND D'UNE STORY SANS VISUEL — le texte du studio naît BLANC
 * (`newTextLayer`, le défaut du composer iOS) ; sans fond, le lecteur web peint
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
  return {
    ...(address.postMediaId !== undefined ? { postMediaId: address.postMediaId } : {}),
    mediaURL: address.mediaURL,
    ...(address.thumbHash !== undefined ? { thumbHash: address.thumbHash } : {}),
  };
}

/** L'ANCRE et le TRANSFORM d'un objet POSÉ — la pose du studio, telle que
 * `CanvasV3` la porte : l'ancre sur l'enveloppe, l'échelle et la rotation à
 * côté. Une seule conversion, partagée par les textes et le calque : deux
 * copies auraient divergé dès le premier ajustement de bornes. */
function posed(pose: StudioPose): Pick<ObjectV3, 'anchor' | 'transform'> {
  return {
    anchor: { t: 'free', x: pose.x, y: pose.y },
    transform: { scale: pose.scale, rotation: pose.rotation, opacity: 1 },
  };
}

/** UN objet TEXTE du studio — l'éditeur posé sur la carte en relit la couleur
 * et la taille par le MÊME résolveur que le player (`resolveSceneText` sur un
 * document composé ici), jamais par une seconde règle de dimensionnement.
 *
 * La LANGUE part en `locale` sur l'ENVELOPPE, jamais dans le `payload` : c'est
 * la place que `CanvasV3Migration.swift:273` lui donne pour `sourceLanguage`,
 * et celle que `resolveSceneText` relit (`object.locale`). */
function storyTextObject(layer: StudioTextLayer, z: number): ObjectV3 {
  return {
    id: layer.id,
    kind: 'text',
    ...posed(layer.pose),
    plane: 'fg',
    z,
    locale: layer.language,
    payload: textLayerPayload(layer),
  };
}

function composeObjects(input: StoryComposition): ObjectV3[] {
  const { background, overlay, sound } = input;
  const texts = input.texts.filter((layer) => layer.text.trim() !== '');
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
              ...(background.aspectRatio !== undefined ? { aspectRatio: background.aspectRatio } : {}),
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
            // Le PLAN suit le rôle : un son de fond reste sur le porteur
            // (`content`), un son POSÉ monte en `fg` comme tout ce qui se pose.
            plane: sound.plane === 'background' ? 'content' : 'fg',
            z: 1,
            transform: IDENTITY,
            payload: {
              ...addressPayload(sound.address),
              // **LE SEUL DISCRIMINANT QUI COMPTE** : `electBackgroundTrack`
              // (`lib/canvas/background-sound.ts:59`) élit l'audio dont
              // `payload.isBackground === true`, et `placement` est déclaré
              // legacy côté iOS (« kept for backward compat; no longer drives
              // rendering », `StoryModels.swift:141`). On l'écrit quand même,
              // à la valeur COHÉRENTE — un corpus qui se contredirait sur deux
              // clés est pire qu'un corpus qui n'en porte qu'une.
              isBackground: sound.plane === 'background',
              placement: sound.plane,
              volume: 1,
            },
          } satisfies ObjectV3,
        ]
      : []),
    ...(overlay !== undefined
      ? [
          {
            id: 'overlay',
            kind: 'media',
            ...posed(overlay.pose),
            // `fg` SANS `isBackground` : `isBackground()`
            // (`lib/feed/scene-framing.ts:51-52`) rend alors faux, donc ce
            // visuel ne vole ni le cadrage ni la bande du fond.
            plane: 'fg',
            z: 2,
            payload: {
              ...addressPayload(overlay.address),
              mediaType: overlay.mediaType,
              ...(overlay.aspectRatio !== undefined ? { aspectRatio: overlay.aspectRatio } : {}),
            },
          } satisfies ObjectV3,
        ]
      : []),
    // Les textes PAR-DESSUS tout le reste, dans leur ordre de pose.
    ...texts.map((layer, index) => storyTextObject(layer, 3 + index)),
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
/** Un emplacement du studio, tel que les DEUX constructeurs le décrivent —
 * seule l'ADRESSE change entre eux (identité serveur ou URL locale), d'où le
 * paramètre. C'est la loi 6 relue « le PLAYER est l'aperçu » : une seconde
 * description aurait divergé, et ce que l'auteur voit ne serait plus ce qui
 * part (le texte d'aperçu y avait déjà perdu `textStyle` et `fontFamily`). */
type VisualSlot<A> = { readonly source: A; readonly mediaType: StudioMediaKind; readonly aspectRatio?: number };
type OverlaySlot<A> = VisualSlot<A> & { readonly pose: StudioPose };
type SoundSlot<A> = { readonly source: A; readonly plane: StudioPlane };

function compose<A>(
  params: {
    readonly texts: readonly StudioTextLayer[];
    readonly background?: VisualSlot<A>;
    readonly overlay?: OverlaySlot<A>;
    readonly sound?: SoundSlot<A>;
  },
  addressOf: (source: A) => StoryMediaAddress,
): CanvasV3 | null {
  const visual = (slot: VisualSlot<A>): StoryVisual => ({
    address: addressOf(slot.source),
    mediaType: slot.mediaType,
    ...(slot.aspectRatio !== undefined ? { aspectRatio: slot.aspectRatio } : {}),
  });
  return composeStoryCanvas({
    texts: params.texts,
    ...(params.background !== undefined ? { background: visual(params.background) } : {}),
    ...(params.overlay !== undefined ? { overlay: { ...visual(params.overlay), pose: params.overlay.pose } } : {}),
    ...(params.sound !== undefined ? { sound: { address: addressOf(params.sound.source), plane: params.sound.plane } } : {}),
  });
}

export function buildStoryCanvasEffects(params: {
  readonly texts: readonly StudioTextLayer[];
  readonly background?: VisualSlot<StudioReadyAsset>;
  readonly overlay?: OverlaySlot<StudioReadyAsset>;
  readonly sound?: SoundSlot<StudioReadyAsset>;
}): CanvasV3 | null {
  return compose(params, (ready) => ({
    postMediaId: ready.postMediaId,
    mediaURL: ready.fileUrl,
    ...(ready.thumbHash !== undefined ? { thumbHash: ready.thumbHash } : {}),
  }));
}

/**
 * L'APERÇU — le MÊME composeur, sur des URL LOCALES : l'aperçu ne dépend
 * jamais de la montée (§1.4, « adapté »), et se RELIT par le parseur du
 * player (`parseCanvasDocument`), jamais par une troisième forme.
 */
export function buildPreviewCanvasDocument(params: {
  readonly texts: readonly StudioTextLayer[];
  readonly background?: VisualSlot<string>;
  readonly overlay?: OverlaySlot<string>;
  readonly sound?: SoundSlot<string>;
}): CanvasDocument | null {
  const composed = compose(params, (previewUrl) => ({ mediaURL: previewUrl }));
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

/** L'ORDRE que `POST /posts` attend — le fond D'ABORD, puis ce qui se pose
 * dessus (miroir `mediaIds: [uploadResult.id] + foregroundMediaIds`,
 * `StoryViewModel+PublicationUpload.swift:336-338`).
 *
 * **Le calque d'avant-plan DOIT y figurer** : un objet qui adresse un
 * `postMediaId` absent de cette liste fait refuser la publication entière
 * (`MEDIA_NOT_CLAIMED`, `core.ts:146-158`, rejouée par `publishStory`). */
export function studioMediaIds(params: {
  readonly background?: StudioReadyAsset | undefined;
  readonly overlay?: StudioReadyAsset | undefined;
  readonly sound?: StudioReadyAsset | undefined;
}): readonly string[] {
  return [params.background?.postMediaId, params.overlay?.postMediaId, params.sound?.postMediaId].filter(
    (id): id is string => id !== undefined,
  );
}
