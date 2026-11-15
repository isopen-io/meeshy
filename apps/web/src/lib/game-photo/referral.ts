import { translateGame } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

/**
 * LE LIEN DE PARRAINAGE SUR LA CARTE (#7742) — conception, partie XII.3 : toute
 * image partagée depuis un moment photo porte, en bas de la carte, le lien de
 * parrainage de l'utilisateur et sa Flamme ; le partage redit le lien en texte.
 * Le lien vient du service existant (`loadShareableReferralLink`,
 * `lib/api/referral-link.ts`) ; SANS lien, la carte part sans bandeau — jamais
 * un bandeau vide.
 *
 * La carte ne l'ÉCRIT plus (#9554) : un lien écrit sur une image ne se touche
 * pas et se recopie mal. Elle le porte en carré QR (`referral-qr.ts`) ; seul le
 * texte du partage le dit en toutes lettres.
 *
 * Tout ici est PUR : `referralOf` décide s'il y a un bandeau, `fitBannerLine`
 * fait tenir une ligne dans la place que la mise en page lui laisse (le `canvas`
 * n'a pas de retour à la ligne, et `measureText` n'est pas dans le contexte
 * minimal que la composition emploie — on estime la largeur d'un caractère).
 */

export type PhotoReferral = {
  /** Le lien complet : c'est lui que le carré QR encode et qui voyage dans le texte du partage. */
  readonly url: string;
  /** Les jours de la Flamme ; `null` quand elle est éteinte ou inconnue. */
  readonly flameDays: number | null;
  /**
   * L'EMPLACEMENT du lien, quand l'utilisateur n'a encore aucun jeton : l'APERÇU
   * montre un carré VIDE en pointillé, le jeton ne se crée qu'au toucher de « Partager ».
   * Ce qui sort de l'appareil porte le vrai lien ou rien, jamais l'emplacement.
   */
  readonly placeholder?: true;
};

const days = (value: number | null): number | null => (value !== null && Number.isFinite(value) && value >= 1 ? Math.floor(value) : null);

export function referralOf(url: string | null, flameDays: number | null): PhotoReferral | null {
  const trimmed = url?.trim() ?? '';
  return trimmed === '' ? null : { url: trimmed, flameDays: days(flameDays) };
}

export const referralPlaceholder = (flameDays: number | null): PhotoReferral => ({
  url: '',
  flameDays: days(flameDays),
  placeholder: true,
});

export const referralShareText = (referral: PhotoReferral, language: InterfaceLanguage = currentInterfaceLanguage()): string =>
  translateGame(language, 'game.photo.referral.share_text', { link: referral.url });

export type FittedLine = { readonly text: string; readonly size: number };

const ELLIPSIS = '…';

/**
 * Fait tenir `text` dans `maxWidth` : on rétrécit le corps jusqu'à `minSize`,
 * puis on efface le MILIEU (le début et la fin restent lisibles).
 * `advance` est la largeur d'un caractère en fraction du corps.
 */
export function fitBannerLine(params: {
  readonly text: string;
  readonly size: number;
  readonly maxWidth: number;
  readonly minSize: number;
  readonly advance: number;
}): FittedLine {
  const { text, size, minSize, advance } = params;
  const room = Number.isFinite(params.maxWidth) && params.maxWidth > 0 ? params.maxWidth : 0;
  if (text.length * size * advance <= room) return { text, size };
  const shrunk = room / (text.length * advance);
  if (shrunk >= minSize) return { text, size: shrunk };
  const keep = Math.max(3, Math.floor(room / (minSize * advance)) - 1);
  if (text.length <= keep) return { text, size: minSize };
  const head = Math.ceil(keep * 0.6);
  const tail = Math.max(1, keep - head);
  return { text: `${text.slice(0, head)}${ELLIPSIS}${text.slice(text.length - tail)}`, size: minSize };
}
