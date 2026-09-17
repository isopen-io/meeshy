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
 * #6898 § 1.2) — SAUF quand l'appelant fournit `carrierFallback` (#6902) :
 * miroir de `SceneCaption.resolve(sceneIndex:in:post:carrierFallback:)`,
 * dont le doc-comment (`SceneCaption.swift:65-85`) tranche « le texte de la
 * publication peut-il tenir lieu de légende ici ? `true` en plein écran,
 * `false` là où il est déjà rendu ». Ici le texte du post est déjà rendu
 * AU-DESSUS de la carte du fil (`false`, comportement INCHANGÉ, défaut) —
 * la visionneuse plein écran (`gallery-lot.ts`) est le seul appelant à poser
 * `carrierFallback` (`true`), puisque rien d'autre n'y montre ce texte.
 *
 * `origin: 'post'` distingue ce repli de la légende PROPRE d'un média
 * (`'media'`) — même vocabulaire que `FeedCardMedia.captionOrigin` (#6864) :
 * les deux provenances ne portent pas les mêmes traductions (cycle 128 du
 * CLAUDE.md racine), un consommateur qui les confond répète #4904.
 */
export type ResolvedSceneCaption = {
  readonly text: string;
  readonly language?: string;
  readonly origin: 'media' | 'post';
};

export function resolveSceneCaption(params: {
  readonly sceneIndex: number;
  readonly document: CanvasDocument;
  readonly carrier: SceneCarrier;
  /** Le texte du post, DÉJÀ résolu par le Prisme (`FeedCardModel.text`,
   * jamais recalculé ici, D-14) — servi SEULEMENT si la scène n'a AUCUNE
   * légende propre. `undefined`/texte vide ⇒ aucun repli, comme avant #6902. */
  readonly carrierFallback?: { readonly text: string; readonly language?: string };
}): ResolvedSceneCaption | undefined {
  const { sceneIndex, document, carrier, carrierFallback } = params;
  const scene = document.scenes[sceneIndex];
  if (scene === undefined) return undefined;

  const ownOrPostFallback = (): ResolvedSceneCaption | undefined => {
    if (carrierFallback === undefined || carrierFallback.text === '') return undefined;
    return { text: carrierFallback.text, origin: 'post', ...(carrierFallback.language !== undefined ? { language: carrierFallback.language } : {}) };
  };

  const identity = carrierMediaIdentity(scene);
  if (identity !== null) return ownCaptionOf(carrier.media.find((m) => m.id === identity)) ?? ownOrPostFallback();

  // Cette scène n'adresse aucun média : le repli « premier visuel du post »
  // ne joue QUE si AUCUNE scène du document n'en adresse — sinon une scène
  // sans image adopterait la légende d'une pièce qu'elle ne montre pas.
  if (documentAddressesAnyMedia(document.scenes)) return ownOrPostFallback();
  return ownCaptionOf(carrier.media[0]) ?? ownOrPostFallback();
}
