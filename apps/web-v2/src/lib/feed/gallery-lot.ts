import type { Attachment } from '@/lib/api/types';
import { carrierMediaIdentity, type SceneCarrierMedia } from '@/lib/canvas/carrier';
import { letterboxHashes } from '@/lib/stories/letterbox';

import type { FeedCardModel, FeedCardScene } from './card-model';
import type { FeedMediaKind } from './layout';
import { isSceneCinematic } from './scene-motion';
import { resolveSceneCaption } from './scene-caption';

/**
 * `composeSceneGalleryLot` (#6902, § C de la spécification `scenes-plein-
 * ecran`) — LE LOT D'UNE PUBLICATION À SCÈNES, miroir de `PostGalleryLot`
 * (`PostGalleryLot.swift`) : une entrée SYNTHÉTIQUE par scène du document —
 * `mimeType` = `SCENE_MIME`, INERTE pour tout chemin écrit pour un média RÉEL
 * (`kindOf` ⇒ `'file'`, `maskedAttachment` ⇒ `false`, aucun octet à
 * télécharger) — et la carte `scenes` que la visionneuse consulte pour
 * peindre `ScenePlayer` plutôt que le repli image/vidéo. `undefined` sans
 * scène (D-78, `model.scene` absent ⇒ repli média, hors périmètre de ce lot).
 *
 * **LA NATURE D'UNE PAGE SE LIT SUR LA CARTE `scenes`, JAMAIS SUR LE MIME**
 * (`PostGalleryLot.swift:16-20`) : `SCENE_MIME` n'est qu'un MARQUEUR pour les
 * chemins qui ignorent `scenes` (pellicule, `kindOf`) — `MediaViewer` lui
 * regarde `scenes.get(id)`, jamais `attachment.mimeType`.
 *
 * `sceneItemId` — L'IDENTITÉ PAR INDEX, jamais par `scene.id` (miroir
 * `PostGalleryLot.swift:303-309` : `"s1"` est gravé en dur sur tout le corpus
 * legacy, une seule scène ne le porterait pas forcément deux fois).
 */
export const SCENE_MIME = 'application/x-meeshy-scene';

export function sceneItemId(postId: string, sceneIndex: number): string {
  return `scene:${postId}#${sceneIndex}`;
}

/** CE QUE LA VISIONNEUSE LIT POUR PEINDRE `ScenePlayer` À LA PLACE DU MÉDIA —
 * miroir `GallerySceneItem` (`PostGalleryLot.swift:35-67`). */
export type SceneGalleryEntry = {
  readonly postId: string;
  readonly sceneIndex: number;
  readonly document: FeedCardScene['document'];
  readonly carrier: FeedCardScene['carrier'];
  /** La scène BOUGE — vidéo/audio/sticker animé/fenêtre temporelle
   * (`isSceneCinematic`), OU un son de FOND fait jouer chaque scène du
   * document (`document.sound`, miroir `PostGalleryLot.swift:358-407`). */
  readonly moves: boolean;
  readonly caption?: string;
  readonly captionLanguage?: string;
};

export type SceneGalleryLot = {
  readonly items: readonly Attachment[];
  readonly scenes: ReadonlyMap<string, SceneGalleryEntry>;
};

const EPOCH_ISO = new Date(0).toISOString();

/** Une pièce SYNTHÉTIQUE, INERTE — jamais un fichier à télécharger. Les
 * champs requis d'`Attachment` reçoivent leur valeur la plus neutre ; aucun
 * consommateur des médias RÉELS (masque, pellicule) ne les lit pour une
 * pièce dont `scenes.get(id)` existe. */
function syntheticSceneAttachment(params: {
  readonly id: string;
  readonly postId: string;
  readonly thumbnailUrl?: string;
  readonly thumbHash?: string;
}): Attachment {
  const { id, postId, thumbnailUrl, thumbHash } = params;
  return {
    id,
    messageId: postId,
    fileName: id,
    originalName: id,
    mimeType: SCENE_MIME,
    fileSize: 0,
    fileUrl: '',
    ...(thumbnailUrl !== undefined ? { thumbnailUrl } : {}),
    ...(thumbHash !== undefined ? { thumbHash } : {}),
    uploadedBy: '',
    isAnonymous: false,
    createdAt: EPOCH_ISO,
    isForwarded: false,
    capturedInApp: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    viewedCount: 0,
    downloadedCount: 0,
    consumedCount: 0,
    isEncrypted: false,
  };
}

/**
 * LA VIGNETTE D'UNE PAGE SCÈNE — miroir `PostGalleryLot.swift:358-407` :
 * « vignette du média montré sinon son URL (image) ». La première forme de
 * #6902 ne lisait que `poster` (`thumbnailSrc ?? placeholder`, souvent ABSENT
 * sur une image de fixture comme de passerelle) : la pellicule d'un lot de
 * scènes rendait alors trois carrés NOIRS identiques, sur une publication qui
 * porte deux vraies images (mesuré au navigateur, `filmstripWithImage: 0`).
 * L'URL du média N'EST un repli que pour une IMAGE — la poser pour une vidéo
 * mettrait un fichier vidéo dans un `<img>`.
 */
function sceneThumbnail(params: {
  readonly media: SceneCarrierMedia | undefined;
  readonly kinds: ReadonlyMap<string, FeedMediaKind>;
}): string | undefined {
  const { media, kinds } = params;
  if (media === undefined) return undefined;
  if (media.poster !== undefined) return media.poster;
  return kinds.get(media.id) === 'image' && media.src !== '' ? media.src : undefined;
}

export function composeSceneGalleryLot(model: Pick<FeedCardModel, 'id' | 'scene' | 'text' | 'media'>): SceneGalleryLot | undefined {
  const scene = model.scene;
  if (scene === undefined) return undefined;
  const { document, carrier } = scene;
  const carrierFallback = model.text !== undefined ? { text: model.text.full, language: model.text.language } : undefined;

  const items: Attachment[] = [];
  const scenes = new Map<string, SceneGalleryEntry>();
  // La NATURE d'un média du porteur ne voyage pas dans `SceneCarrierMedia`
  // (`card-model.ts:302-308` : « `mimeType` n'est PAS reporté ici ») — elle se
  // relit sur le modèle, seul site qui la porte, jamais devinée d'une URL.
  const kinds = new Map<string, FeedMediaKind>(model.media.map((m) => [m.id, m.kind]));

  document.scenes.forEach((s, sceneIndex) => {
    const id = sceneItemId(model.id, sceneIndex);
    const identity = carrierMediaIdentity(s);
    const media = identity === null ? undefined : carrier.media.find((m) => m.id === identity);
    const thumbnailUrl = sceneThumbnail({ media, kinds });
    const caption = resolveSceneCaption({ sceneIndex, document, carrier, ...(carrierFallback !== undefined ? { carrierFallback } : {}) });
    const moves = isSceneCinematic(s) || document.sound !== undefined;

    items.push(
      syntheticSceneAttachment({
        id,
        postId: model.id,
        ...(thumbnailUrl !== undefined ? { thumbnailUrl } : {}),
        ...(thumbnailUrl === undefined ? { thumbHash: letterboxHashes(s)[0] } : {}),
      }),
    );

    scenes.set(id, {
      postId: model.id,
      sceneIndex,
      document,
      carrier,
      moves,
      ...(caption !== undefined ? { caption: caption.text } : {}),
      ...(caption?.language !== undefined ? { captionLanguage: caption.language } : {}),
    });
  });

  return { items, scenes };
}

/** L'ENTRÉE, BORNÉE au nombre de scènes (§ C de la spécification, miroir
 * `PostGalleryLot.entryId`) — un index hors bornes (lien profond périmé,
 * pellicule d'un lot plus court) tombe sur la DERNIÈRE scène plutôt que de
 * planter ou d'ouvrir une page vide. */
export function boundedSceneIndex(count: number, requested: number): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, requested));
}
