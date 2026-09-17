import { carrierMediaIdentity, documentAddressesAnyMedia, type SceneCarrier, type SceneCarrierMedia } from '@/lib/canvas/carrier';
import type { CanvasDocument } from '@/lib/canvas/document';

/** La légende PROPRE d'un média, jamais celle que `resolveMedia` lui PRÊTE
 * depuis le contenu du post (`captionOrigin: 'post'`, #6864) : ce prêt ne vaut
 * que pour `FeedMediaCarousel`, et une carte à scène rend déjà ce texte
 * au-dessus (`carrierFallback: false`, `SceneCaption.swift:65-85`). */
function ownCaptionOf(media: SceneCarrierMedia | undefined): ResolvedSceneCaption | undefined {
  if (media === undefined || media.caption === undefined || media.captionOrigin === 'post') return undefined;
  return { text: media.caption, origin: 'media', ...(media.captionLanguage !== undefined ? { language: media.captionLanguage } : {}) };
}

/**
 * LA LÉGENDE D'UNE SCÈNE — la légende PROPRE du média qu'elle montre, JAMAIS
 * le texte du post (déjà rendu au-dessus, `FeedPostCard.swift:378-382`,
 * #6898 § 1.2). Miroir de `SceneCaption.resolve(sceneIndex:in:post:
 * carrierFallback: false)`.
 */
export type ResolvedSceneCaption = {
  readonly text: string;
  readonly language?: string;
  readonly origin: 'media';
};

export function resolveSceneCaption(params: {
  readonly sceneIndex: number;
  readonly document: CanvasDocument;
  readonly carrier: SceneCarrier;
}): ResolvedSceneCaption | undefined {
  const { sceneIndex, document, carrier } = params;
  const scene = document.scenes[sceneIndex];
  if (scene === undefined) return undefined;

  const identity = carrierMediaIdentity(scene);
  if (identity !== null) return ownCaptionOf(carrier.media.find((m) => m.id === identity));

  // Cette scène n'adresse aucun média : le repli « premier visuel du post »
  // ne joue QUE si AUCUNE scène du document n'en adresse — sinon une scène
  // sans image adopterait la légende d'une pièce qu'elle ne montre pas.
  if (documentAddressesAnyMedia(document.scenes)) return undefined;
  return ownCaptionOf(carrier.media[0]);
}
