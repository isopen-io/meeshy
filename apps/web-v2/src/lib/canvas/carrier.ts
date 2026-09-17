import { attachmentSrc } from '@/lib/api/media-url';

import type { CanvasObject, CanvasScene } from './document';

/**
 * LE PORTEUR D'UNE SCÈNE — les médias RÉELS de la publication (déjà résolus
 * par le Prisme, `FeedCardMedia`), que `carrierMediaIdentity` relie aux objets
 * `media` d'un document canvas (#6898, § 3.3.2 et § 5.0).
 *
 * `SceneCarrier` ne CONNAÎT rien du canvas — c'est la liste des médias que le
 * post porte, dans l'ordre servi. `carrierMediaIdentity` est la seule
 * fonction qui les met en relation.
 */
export type SceneCarrierMedia = {
  readonly id: string;
  readonly src: string;
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly caption?: string;
  readonly captionLanguage?: string;
  readonly captionOrigin?: 'media' | 'post';
  /** La vignette du média RÉEL (`FeedCardMedia.thumbnailSrc` ?? `.placeholder`,
   * même repli que `FeedMediaSurface`) — jamais dérivée du canvas, qui n'en
   * porte aucune. Un fond `kind: media` de type vidéo la reporte en `poster`
   * (revue-correction #6898) : sans elle, `preload="none"` peint une boîte
   * transparente tant que rien n'a joué, indiscernable de l'absence de scène. */
  readonly poster?: string;
};

export type SceneCarrier = {
  readonly postId: string;
  readonly media: readonly SceneCarrierMedia[];
};

const nonEmptyString = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** L'identité de `PostMedia` qu'un objet adresse — `postMediaId ?? mediaId`.
 * SITE UNIQUE de la lecture des deux clés : le cadrage, la légende et le
 * moteur la lisent ici, jamais chacun à sa façon. */
export function objectMediaIdentity(object: CanvasObject): string | null {
  // §3.3.2 — la passerelle lit les DEUX clés (`storyEffectsV3.ts`,
  // `CLAIM_BEARING_KINDS`) ; iOS ne lit que `postMediaId`, ce qui est le
  // défaut à rapporter (§ 9.6), pas à reproduire ici.
  return nonEmptyString(object.payload.postMediaId) ?? nonEmptyString(object.payload.mediaId);
}

/**
 * **L'ADRESSE DES PIXELS D'UN OBJET** — la pièce du porteur qu'il désigne,
 * sinon son propre `mediaURL` résolu par `attachmentSrc` (`lib/api/media-url.ts`,
 * le site unique : un `mediaURL` hérité porte souvent une clé NUE, #5668).
 * SITE UNIQUE partagé par le moteur (`scene-player.tsx`) et l'image seule du
 * lecteur de story (`story-scene-layer.tsx`).
 *
 * Une entrée de porteur SANS adresse ne masque jamais celle que l'objet porte
 * lui-même (#6899, corpus réel de staging) : elle rendait un `<img src="">`.
 */
export function objectMediaSrc(object: CanvasObject, carrier: SceneCarrier): string | undefined {
  const identity = objectMediaIdentity(object);
  const carried = identity === null ? undefined : carrier.media.find((m) => m.id === identity)?.src;
  if (carried !== undefined && carried !== '') return carried;
  const url = object.payload.mediaURL;
  return typeof url === 'string' && url !== '' ? attachmentSrc(url) : undefined;
}

/**
 * **L'IDENTITÉ DU MÉDIA QUE LA SCÈNE ADRESSE** — `postMediaId ?? mediaId`
 * d'un objet `media` de plan `content` OU `bg` (§ 5.0, ÉLARGI aux deux plans
 * par rapport à `MeeshyScenePlayer.carrierMediaIdentity`, qui ne lit que
 * `content` — c'est ce qui manque à `RECETTE C` côté iOS). Le z le plus bas
 * gagne : plusieurs objets `media` dans une scène désignent le PREMIER posé.
 */
export function carrierMediaIdentity(scene: CanvasScene): string | null {
  const candidates = scene.objects.filter((o) => o.kind === 'media' && (o.plane === 'content' || o.plane === 'bg'));
  if (candidates.length === 0) return null;
  const lowest = candidates.reduce((a, b) => (b.z < a.z ? b : a));
  return objectMediaIdentity(lowest);
}

/** Vrai si AU MOINS une scène du document adresse un média — gouverne le
 * repli « premier visuel du post » de `resolveSceneCaption` (§ 5.2). */
export function documentAddressesAnyMedia(scenes: readonly CanvasScene[]): boolean {
  return scenes.some((scene) => carrierMediaIdentity(scene) !== null);
}
