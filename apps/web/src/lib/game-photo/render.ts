import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

import { formatCount, gameText } from '@/lib/view/game-copy';

import { paintPhoto, type PaintContext, type PhotoArt, type PhotoBanner, type PhotoPalette, type PhotoSource } from './compose';
import { PHOTO_FORMATS, photoLayout, type PhotoFormat } from './layout';
import type { PhotoMoment } from './moments';
import type { PhotoReferral } from './referral';

/**
 * LES DEUX IMAGES (#9382) — la story en 9:16 et le profil en 1:1, rendues d'un
 * coup à la prise de vue : l'utilisateur choisit ensuite ce qu'il partage, sans
 * rien recalculer. Le `canvas` est INJECTÉ (`createCanvas`) : un faux canvas
 * garde sa taille et ses textes en test, `document.createElement('canvas')` en
 * production.
 *
 * Rien ne part nulle part : le résultat est un couple de `File` en mémoire.
 */

export type PhotoFiles = { readonly story: File; readonly square: File };

/** Le calendrier de la langue de l'interface (chiffres latins en arabe, comme le reste du produit). */
const DATE_LOCALES: Readonly<Record<InterfaceLanguage, string>> = {
  fr: 'fr-FR',
  en: 'en-US',
  es: 'es-ES',
  pt: 'pt-BR',
  de: 'de-DE',
  it: 'it-IT',
  ar: 'ar-u-nu-latn',
};

/** La date de la prise, dans le fuseau de l'appareil (`timeZone` ne sert qu'aux témoins). */
export const dateLabelOf = (date: Date, timeZone?: string, language: InterfaceLanguage = currentInterfaceLanguage()): string =>
  new Intl.DateTimeFormat(DATE_LOCALES[language], { day: 'numeric', month: 'long', year: 'numeric', ...(timeZone === undefined ? {} : { timeZone }) }).format(date);

const SUFFIX: Readonly<Record<PhotoFormat, string>> = { story: 'story', square: 'profil' };

export const fileNameOf = (momentId: string, format: PhotoFormat): string =>
  `meeshy-${momentId.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}-${SUFFIX[format]}.png`;

const toBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

/** Les textes du bandeau, dans la langue de l'interface : la phrase, le lien court, les jours de Flamme. */
const bannerOf = (referral: PhotoReferral): PhotoBanner => ({
  headline: gameText('game.photo.referral.headline'),
  link: referral.display,
  flameLabel: referral.flameDays === null ? null : gameText('game.photo.referral.flame_days', { days: formatCount(referral.flameDays) }),
  ...(referral.placeholder === true ? { placeholder: true as const } : {}),
});

async function renderOne(
  params: RenderParams,
  format: PhotoFormat,
): Promise<File | null> {
  const { width, height } = PHOTO_FORMATS[format];
  const canvas = params.createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;
  const referral = params.referral ?? null;
  paintPhoto(ctx as unknown as PaintContext, {
    layout: photoLayout(format, { banner: referral !== null }),
    ...(referral === null ? {} : { banner: bannerOf(referral) }),
    moment: params.moment,
    dateLabel: dateLabelOf(params.now, params.timeZone),
    photo: params.photo,
    art: params.art,
    palette: params.palette,
    fontFamily: params.fontFamily,
  });
  const blob = await toBlob(canvas);
  return blob === null ? null : new File([blob], fileNameOf(params.moment.id, format), { type: 'image/png' });
}

type RenderParams = {
  readonly moment: PhotoMoment;
  readonly photo: PhotoSource | null;
  readonly art: PhotoArt;
  readonly palette: PhotoPalette;
  readonly fontFamily: string;
  readonly now: Date;
  readonly timeZone?: string;
  /** Le lien de parrainage de l'utilisateur et sa Flamme (#7742) ; `null` ou absent : la carte part sans bandeau. */
  readonly referral?: PhotoReferral | null;
  readonly createCanvas: (width: number, height: number) => HTMLCanvasElement;
};

/** Les deux fichiers, ou `null` quand le navigateur ne sait pas peindre (pas de contexte 2D, pas de Blob). */
export async function renderPhotoFiles(params: RenderParams): Promise<PhotoFiles | null> {
  try {
    const [story, square] = await Promise.all([renderOne(params, 'story'), renderOne(params, 'square')]);
    return story === null || square === null ? null : { story, square };
  } catch {
    return null;
  }
}
